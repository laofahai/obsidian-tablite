import { Notice, TextFileView, WorkspaceLeaf, type TFile } from "obsidian";
import { render, h } from "preact";
import { App } from "./components/App";
import TablitePlugin from "./main";
import { parseCSV } from "./parser/csv-engine";
import { detectEncoding, detectDelimiter } from "./parser/detect";
import { ENCODING_LABELS, UTF8, decodeBuffer, encodeText, normalizeEncodingId } from "./parser/encoding";

export const CSV_VIEW_TYPE = "tablite-csv-view";

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export class CsvView extends TextFileView {
  private rootEl: HTMLDivElement | null = null;
  private plugin: TablitePlugin;
  private encoding = UTF8;
  private rawBuffer: ArrayBuffer | null = null;
  private renderRevision = 0;

  // A single queue owns autosave, explicit save, and file unload.
  private saveDebounceTimer: number | null = null;
  private pendingSaveData: string | null = null;
  private savePromise: Promise<void> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TablitePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  async onLoadFile(file: TFile): Promise<void> {
    try {
      const buffer = await this.app.vault.readBinary(file);
      // A remembered choice beats detection: detection can change when the
      // content changes, and the user already told us what this file is.
      const stored = this.plugin.getFileEncoding(file.path);
      const encoding = normalizeEncodingId(stored ?? detectEncoding(buffer));
      this.rawBuffer = buffer;
      this.encoding = encoding;
      this.data = decodeBuffer(buffer, encoding);
    } catch (e) {
      console.error("tablite: encoding detection failed, falling back to UTF-8", e);
      this.rawBuffer = null;
      this.encoding = UTF8;
      this.data = await this.app.vault.read(file);
    }
    this.setViewData(this.data, true);
  }

  async onUnloadFile(file: TFile): Promise<void> {
    await this.flushPendingSave();
    await super.onUnloadFile(file);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "CSV";
  }

  getIcon(): string {
    return "table";
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string, clear: boolean): void {
    if (!clear) {
      // Vault notifications from our own write must not remount the editor and
      // replace an edit that arrived while that write was in flight.
      if (this.pendingSaveData !== null || this.savePromise) return;
      // Obsidian hands external changes over as a UTF-8 string. Re-reading the
      // bytes keeps a legacy-encoded file readable instead of showing mojibake.
      void this.refreshFromDisk(data);
      return;
    }
    this.data = data;
    this.renderRevision += 1;
    this.renderApp();
  }

  clear(): void {
    this.data = "";
  }

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: "tablite-root" });
  }

  async onClose(): Promise<void> {
    await this.flushPendingSave();
    if (this.rootEl) {
      render(null, this.rootEl);
      this.rootEl = null;
    }
  }

  // TextFileView can also save on unload. Route that call through the queue,
  // rather than running a second, independent persistence mechanism.
  async save(clear = false): Promise<void> {
    await this.flushPendingSave();
    if (clear) this.clear();
  }

  private scheduleSave(newData: string): void {
    this.pendingSaveData = newData;
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveDebounceTimer = null;
      // drainSaves reports errors and retains the pending edit for another try.
      void this.performVerifiedSave().catch(() => {});
    }, 1000);
  }

  private performVerifiedSave(): Promise<void> {
    if (this.savePromise) return this.savePromise;
    const file = this.file;
    if (!file || this.pendingSaveData === null) return Promise.resolve();
    this.savePromise = this.drainSaves(file).finally(() => {
      this.savePromise = null;
    });
    return this.savePromise;
  }

  private async drainSaves(file: TFile): Promise<void> {
    while (this.pendingSaveData !== null) {
      const dataToWrite = this.pendingSaveData;
      // Encode with the file's own encoding: writing UTF-8 into a GBK file is
      // what turns Chinese text into mojibake in Excel.
      const bytes = new Uint8Array(encodeText(dataToWrite, this.encoding));
      let persisted = false;
      let failure: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.app.vault.modifyBinary(file, bytes.buffer as ArrayBuffer);
          const onDisk = new Uint8Array(await this.app.vault.readBinary(file));
          if (!bytesEqual(onDisk, bytes)) {
            throw new Error("CSV contents did not match after saving");
          }
          persisted = true;
          break;
        } catch (error) {
          failure = error;
        }
      }
      if (!persisted) {
        new Notice(`Tablite: Could not save ${file.path}. Your edits are still pending. Please retry before closing.`, 8000);
        throw failure;
      }
      if (this.pendingSaveData === dataToWrite) this.pendingSaveData = null;
      // Continue immediately if an edit arrived while the write was pending.
    }
  }

  async flushPendingSave(): Promise<void> {
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await this.performVerifiedSave();
  }

  /** Text as it stands, including edits that have not reached disk yet. */
  private currentText(): string {
    return this.pendingSaveData ?? this.data ?? "";
  }

  /**
   * An external change arrived. Re-read the bytes so the text is decoded with
   * this file's encoding rather than with the UTF-8 string Obsidian passed in.
   */
  private async refreshFromDisk(reported: string): Promise<void> {
    const file = this.file;
    if (!file) {
      this.setViewData(reported, true);
      return;
    }
    try {
      const buffer = await this.app.vault.readBinary(file);
      this.rawBuffer = buffer;
      const text = decodeBuffer(buffer, this.encoding);
      if (text === this.data) return; // the echo of our own write
      this.data = text;
      this.renderRevision += 1;
      this.renderApp();
    } catch (error) {
      console.error("tablite: could not re-read the file after a change notification", error);
    }
  }

  /**
   * Switch the encoding the file is stored in. The text on screen is the source
   * of truth, so it is written back as-is in the new encoding — re-interpreting
   * the existing bytes here would turn a correctly displayed file into mojibake.
   */
  private async transcode(nextEncoding: string): Promise<void> {
    const encoding = normalizeEncodingId(nextEncoding);
    this.encoding = encoding;
    if (this.file) await this.plugin.setFileEncoding(this.file.path, encoding);

    const text = this.currentText();
    if (text.includes("\uFFFD")) {
      new Notice(
        `Tablite: the text shown has undecodable characters, so it was not written back as ${encoding}. Use "Re-read with this encoding" first if the content looks wrong.`,
        10000,
      );
      return;
    }
    if (!this.file) return;
    try {
      // Write immediately: a change that only lives in the settings is what made
      // "UTF-8 with BOM" appear selected while the file stayed UTF-8.
      this.scheduleSave(text);
      await this.flushPendingSave();
      new Notice(`Tablite: ${this.file.basename} saved as ${ENCODING_LABELS[encoding] ?? encoding}`);
    } catch {
      // drainSaves has already reported the failure and kept the edit pending.
    }
  }

  /** Re-read the bytes on disk with the selected encoding (fixes wrong detection). */
  private async reloadWithSelectedEncoding(): Promise<void> {
    const file = this.file;
    if (!file) return;
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    // Unsaved edits came from the old interpretation, so they cannot survive.
    this.pendingSaveData = null;
    try {
      const buffer = await this.app.vault.readBinary(file);
      this.rawBuffer = buffer;
      this.data = decodeBuffer(buffer, this.encoding);
      await this.plugin.setFileEncoding(file.path, this.encoding);
      this.renderRevision += 1;
      this.renderApp();
      if (this.data.includes("\uFFFD")) {
        new Notice(`Tablite: ${file.basename} does not decode cleanly as ${this.encoding}. Try another encoding.`, 8000);
      }
    } catch (error) {
      console.error("tablite: could not re-read the file", error);
      new Notice(`Tablite: could not re-read ${file.path}.`, 8000);
    }
  }

  private renderApp(): void {
    if (!this.rootEl) return;
    const initialText = this.data ?? "";

    // Parse once here — App reuses this result instead of re-parsing
    const delimiter = initialText.trim().length > 0 ? detectDelimiter(initialText) : ",";
    const parsed = parseCSV(initialText, delimiter);
    const columnCount = parsed.headers.length > 0 ? parsed.headers.length : 1;
    const filePath = this.file?.path ?? "";

    render(
      h(App, {
        key: `${filePath}:${this.renderRevision}`,
        initialData: initialText,
        initialParsed: parsed,
        initialDelimiter: delimiter,
        initialEncoding: this.encoding,
        filePath,
        initialColumnConfig: this.plugin.getFileColumnConfig(filePath, columnCount),
        onColumnConfigChange: async (config, nextColumnCount) => {
          if (!filePath) return;
          await this.plugin.setFileColumnConfig(filePath, nextColumnCount, config);
        },
        onEncodingChange: (nextEncoding: string) => this.transcode(nextEncoding),
        onReloadEncoding: () => this.reloadWithSelectedEncoding(),
        onDataChange: (newData: string) => {
          this.data = newData;
          this.scheduleSave(newData);
        },
      }),
      this.rootEl,
    );
  }
}
