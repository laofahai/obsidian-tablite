import { TextFileView, WorkspaceLeaf } from "obsidian";
import { render, h } from "preact";
import { App } from "./components/App";
import TablitePlugin from "./main";
import { parseCSV } from "./parser/csv-engine";
import { detectDelimiter } from "./parser/detect";

export const CSV_VIEW_TYPE = "tablite-csv-view";

export class CsvView extends TextFileView {
  private rootEl: HTMLDivElement | null = null;
  private plugin: TablitePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: TablitePlugin) {
    super(leaf);
    this.plugin = plugin;
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
    this.data = data;
    this.renderApp();
  }

  clear(): void {
    this.data = "";
  }

  onOpen(): void {
    this.rootEl = this.contentEl.createDiv({ cls: "tablite-root" });
  }

  onClose(): void {
    if (this.rootEl) {
      render(null, this.rootEl);
    }
  }

  private renderApp(): void {
    if (!this.rootEl) return;
    const initialText = this.data ?? "";
    const delimiter = initialText.trim().length > 0 ? detectDelimiter(initialText) : ",";
    const parsed = parseCSV(initialText, delimiter);
    const columnCount = parsed.headers.length > 0 ? parsed.headers.length : 1;
    const filePath = this.file?.path ?? "";

    render(
      h(App, {
        key: filePath,
        initialData: this.data,
        filePath,
        initialColumnConfig: this.plugin.getFileColumnConfig(filePath, columnCount),
        onColumnConfigChange: async (config, nextColumnCount) => {
          if (!filePath) return;
          await this.plugin.setFileColumnConfig(filePath, nextColumnCount, config);
        },
        onDataChange: (newData: string) => {
          this.data = newData;
          this.requestSave();
        },
      }),
      this.rootEl,
    );
  }
}
