import { Notice, TextFileView, WorkspaceLeaf, type TFile } from "obsidian";
import { render, h } from "preact";
import { App } from "./components/App";
import TablitePlugin from "./main";
import { parseCSV } from "./parser/csv-engine";
import { detectEncoding, detectDelimiter } from "./parser/detect";

export const CSV_VIEW_TYPE = "tablite-csv-view";

export class CsvView extends TextFileView {
  private rootEl: HTMLDivElement | null = null;
  private plugin: TablitePlugin;
  private detectedEncoding = "utf-8";
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
      const encoding = detectEncoding(buffer);
      this.detectedEncoding = encoding;
      if (encoding !== "utf-8") {
        const decoder = new TextDecoder(encoding);
        this.data = decoder.decode(buffer);
      } else {
        this.data = await this.app.vault.read(file);
      }
    } catch (e) {
      console.error("tablite: encoding detection failed, falling back to UTF-8", e);
      this.data = await this.app.vault.read(file);
      this.detectedEncoding = "utf-8";
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

  setViewData(data: string, _clear: boolean): void {
    // Vault notifications from our own write must not remount the editor and
    // replace an edit that arrived while that write was in flight.
    if (!_clear && (this.pendingSaveData !== null || this.savePromise)) return;
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
      let persisted = false;
      let failure: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.app.vault.process(file, () => dataToWrite);
          const onDisk = await this.app.vault.read(file);
          if (onDisk !== dataToWrite) {
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
        initialEncoding: this.detectedEncoding,
        filePath,
        initialColumnConfig: this.plugin.getFileColumnConfig(filePath, columnCount),
        onColumnConfigChange: async (config, nextColumnCount) => {
          if (!filePath) return;
          await this.plugin.setFileColumnConfig(filePath, nextColumnCount, config);
        },
        onDataChange: (newData: string) => {
          this.data = newData;
          this.scheduleSave(newData);
        },
      }),
      this.rootEl,
    );
  }
}
