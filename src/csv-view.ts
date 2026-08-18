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

  // Custom save pipeline — bypasses TextFileView's built-in requestSave()/save(),
  // which was found to silently fail to persist edits in some environments.
  // Instead we write directly via vault.process(), verify the write by reading
  // the file back, and retry once if the content doesn't match.
  private saveDebounceTimer: number | null = null;
  private pendingSaveData: string | null = null;
  private isSaving = false;

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
    this.data = data;
    this.renderRevision += 1;
    this.renderApp();
  }

  clear(): void {
    this.data = "";
  }

  onOpen(): void {
    this.rootEl = this.contentEl.createDiv({ cls: "tablite-root" });
  }

  onClose(): void {
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
    }
    if (this.rootEl) {
      render(null, this.rootEl);
    }
  }

  /** Schedules a verified save, debounced by 1s so rapid edits don't spam disk writes. */
  private scheduleSave(newData: string): void {
    this.pendingSaveData = newData;
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = window.setTimeout(() => {
      this.saveDebounceTimer = null;
      void this.performVerifiedSave();
    }, 1000);
  }

  /** Writes the pending data to disk via vault.process(), verifies it landed, retries once if not. */
  private async performVerifiedSave(attempt = 1): Promise<void> {
    if (this.isSaving) {
      // Another save is already in flight — the debounce will re-trigger once it's done
      // if pendingSaveData is still newer, so just bail out here.
      return;
    }
    if (!this.file || this.pendingSaveData === null) return;

    const dataToWrite = this.pendingSaveData;
    this.isSaving = true;
    try {
      await this.app.vault.process(this.file, () => dataToWrite);

      // Verify: read the file back and compare (ignoring CRLF/LF style differences,
      // which are cosmetic and not a sign of failed persistence).
      const onDisk = await this.app.vault.read(this.file);
      const normalize = (s: string) => s.replace(/\r\n/g, "\n");
      const persisted = normalize(onDisk) === normalize(dataToWrite);

      if (persisted) {
        // Only clear pendingSaveData if nothing newer has queued up in the meantime.
        if (this.pendingSaveData === dataToWrite) {
          this.pendingSaveData = null;
        }
      } else if (attempt < 3) {
        console.warn(`tablite: save did not persist as expected, retrying (attempt ${attempt + 1}/3)`);
        this.isSaving = false;
        await this.performVerifiedSave(attempt + 1);
        return;
      } else {
        console.error("tablite: save failed to persist after 3 attempts.");
        new Notice("Tablite: échec de la sauvegarde du CSV après plusieurs tentatives. Vos dernières modifications n'ont peut-être pas été enregistrées.", 8000);
      }
    } catch (err) {
      console.error("tablite: error while saving CSV", err);
      if (attempt < 3) {
        this.isSaving = false;
        await this.performVerifiedSave(attempt + 1);
        return;
      }
      new Notice("Tablite: erreur lors de la sauvegarde du CSV. Voir la console pour le détail.", 8000);
    } finally {
      this.isSaving = false;
    }
  }

  /** Force an immediate save of any pending changes, bypassing the debounce (e.g. before closing). */
  async flushPendingSave(): Promise<void> {
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    if (this.pendingSaveData !== null) {
      await this.performVerifiedSave();
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