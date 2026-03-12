import { TextFileView, WorkspaceLeaf } from "obsidian";
import { render, h } from "preact";
import { App } from "./components/App";

export const CSV_VIEW_TYPE = "tablite-csv-view";

export class CsvView extends TextFileView {
  private rootEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
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

  async onOpen(): Promise<void> {
    this.rootEl = this.contentEl.createDiv({ cls: "tablite-root" });
  }

  async onClose(): Promise<void> {
    if (this.rootEl) {
      render(null, this.rootEl);
    }
  }

  private renderApp(): void {
    if (!this.rootEl) return;
    render(
      h(App, {
        key: this.file?.path ?? "",
        initialData: this.data,
        filePath: this.file?.path ?? "",
        onDataChange: (newData: string) => {
          this.data = newData;
          this.requestSave();
        },
      }),
      this.rootEl,
    );
  }
}
