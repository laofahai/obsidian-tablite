import "./styles.css";
import { Plugin } from "obsidian";
import { CsvView, CSV_VIEW_TYPE } from "./csv-view";

export default class TablitePlugin extends Plugin {
  onload(): void {
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf));
    this.registerExtensions(["csv", "tsv"], CSV_VIEW_TYPE);
  }

  onunload(): void {}
}
