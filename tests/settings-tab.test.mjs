import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/main.ts"], bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{ name: "host", setup(build) {
    build.onResolve({ filter: /^obsidian$|\/csv-view$|\.css$/ }, args => ({ path: args.path, namespace: "host" }));
    build.onLoad({ filter: /.*/, namespace: "host" }, ({ path }) => ({ contents:
      path === "obsidian" ? `
        export class Plugin {}
        export class Modal {}
        export class Notice {}
        export class TAbstractFile {}
        export class TFile {}
        export class TFolder {}
        export const normalizePath = path => path;
        // Pre-1.13 host: no declarative settings methods or renderer.
        export class PluginSettingTab {
          constructor(app, plugin) {
            this.app = app;
            this.containerEl = { rows: [], empty() { this.rows = []; } };
          }
        }
        export class Setting {
          constructor(container) { container.rows.push(this); }
          setName(name) { this.name = name; return this; }
          setDesc(desc) { this.desc = desc; return this; }
          addDropdown(callback) {
            const dropdown = this.dropdown = {
              options: {},
              addOption(value, label) { this.options[value] = label; return this; },
              setValue(value) { this.value = value; return this; },
              onChange(callback) { this.change = callback; return this; },
            };
            callback(dropdown); return this;
          }
        }`
        : path.endsWith("/csv-view") ? `export class CsvView {}; export const CSV_VIEW_TYPE = "test";`
        : "", loader: "js" }));
  } }],
});
const { TabliteSettingTab } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function setup() {
  const saved = [];
  const plugin = {
    app: {}, settings: { defaultEncoding: "gbk" },
    async saveSettings() { saved.push({ ...this.settings }); },
  };
  return { tab: new TabliteSettingTab(plugin), plugin, saved };
}

test("declarative encoding setting is discoverable and binds to the persisted key without rendering", () => {
  const { tab, plugin, saved } = setup();
  const definitions = tab.getSettingDefinitions();
  assert.equal(definitions.length, 1);
  const definition = definitions[0];
  assert.match(definition.name, /encoding/i);
  assert.equal(definition.control.type, "dropdown");
  assert.equal(definition.control.key, "defaultEncoding");
  assert.equal(plugin.settings[definition.control.key], "gbk");
  assert.equal(definition.control.defaultValue, "utf-8");
  assert.equal(definition.control.options["utf-8-bom"], "UTF-8 with BOM");
  assert.equal(definition.control.options.gbk, "GBK");
  assert.deepEqual(tab.containerEl.rows, []);
  assert.deepEqual(saved, []);
});

test("legacy settings render the same choices and persist encoding changes", async () => {
  const { tab, plugin, saved } = setup();
  const definition = tab.getSettingDefinitions()[0];
  tab.display();
  const row = tab.containerEl.rows[0];
  assert.equal(row.name, definition.name);
  assert.equal(row.desc, definition.desc);
  assert.deepEqual(row.dropdown.options, definition.control.options);
  assert.equal(row.dropdown.value, "gbk");
  await row.dropdown.change("utf-8-bom");
  assert.equal(plugin.settings.defaultEncoding, "utf-8-bom");
  assert.deepEqual(saved, [{ defaultEncoding: "utf-8-bom" }]);
  tab.display();
  assert.equal(tab.containerEl.rows.length, 1);
  assert.equal(tab.containerEl.rows[0].dropdown.value, "utf-8-bom");
});
