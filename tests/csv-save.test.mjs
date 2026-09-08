import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Obsidian and the DOM are host APIs; exercise the actual CsvView against a
// controllable vault so slow writes and unload races are deterministic.
const bundle = await build({
  entryPoints: ["src/csv-view.ts"], bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{ name: "host", setup(build) {
    build.onResolve({ filter: /^(obsidian|preact)$|\/components\/App$/ }, args => ({ path: args.path, namespace: "host" }));
    build.onLoad({ filter: /.*/, namespace: "host" }, ({ path }) => ({ contents:
      path === "obsidian" ? `export class TextFileView {
        constructor(leaf) { this.app = leaf.app; this.contentEl = { createDiv: () => ({}) }; }
        async save() {}
        async onUnloadFile() { await this.save(); this.clear(); }
      }
      export class Notice { constructor(message) { globalThis.notices.push(message); } }`
      : path === "preact" ? `export const h = (type, props) => props;
        export const render = (props, root) => { if (props) root.props = props; };`
      : `export const App = () => null;`, loader: "js" }));
  } }],
});
const { CsvView } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + "\n//# sourceURL=csv-view-test-bundle.mjs").toString("base64")}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function setup(t, initial = 'Titre;Commentaire\r\nLivre;\r\n') {
  const timers = new Map(); let id = 0;
  globalThis.window = { setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  globalThis.notices = [];
  const files = new Map([["a.csv", initial], ["b.csv", "other file"]]);
  const vault = {
    async process(file, fn) { const next = fn(files.get(file.path)); files.set(file.path, next); return next; },
    async read(file) { return files.get(file.path); },
  };
  const view = new CsvView({ app: { vault } }, { getFileColumnConfig: () => ({}), setFileColumnConfig: async () => {} });
  view.file = { path: "a.csv", basename: "a" };
  view.onOpen(); view.setViewData(initial, true);
  const edit = text => view.rootEl.props.onDataChange(text);
  const fire = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  t.after(() => { timers.clear(); delete globalThis.window; delete globalThis.notices; });
  return { view, vault, files, edit, fire, timers };
}

test("committed semicolon CSV edit persists when closed before debounce", async t => {
  const { view, files, edit } = setup(t, '\uFEFFTitre;Commentaire\r\nLivre;\r\n');
  edit('Titre;Commentaire\nLivre;test\n');
  await view.onUnloadFile(view.file);
  assert.equal(files.get("a.csv"), 'Titre;Commentaire\nLivre;test\n');
});

test("a slow save drains edits whose debounce expires during the write", async t => {
  const { view, vault, files, edit, fire } = setup(t);
  const gate = deferred(); const process = vault.process; let first = true;
  vault.process = async (...args) => { if (first) { first = false; await gate.promise; } return process(...args); };
  edit("first"); fire(); edit("latest"); fire();
  gate.resolve(); await tick();
  assert.equal(files.get("a.csv"), "latest");
  await view.flushPendingSave();
});

test("unload waits for the running save and the latest edit", async t => {
  const { view, vault, files, edit, fire } = setup(t);
  const gate = deferred(); const process = vault.process;
  vault.process = async (...args) => { await gate.promise; return process(...args); };
  edit("first"); fire(); edit("latest");
  let unloaded = false;
  const unload = view.onUnloadFile(view.file).then(() => { unloaded = true; });
  await tick(); const early = unloaded;
  gate.resolve(); await unload; await tick();
  assert.equal(early, false, "unload must not finish while disk write is pending");
  assert.equal(files.get("a.csv"), "latest");
  assert.equal(files.get("b.csv"), "other file");
});

test("closing the view flushes a pending edit", async t => {
  const { view, files, edit } = setup(t);
  edit("latest"); await view.onClose();
  assert.equal(files.get("a.csv"), "latest");
});

test("host save calls use the same persistence queue", async t => {
  const { view, files, edit } = setup(t);
  edit("latest"); await view.save();
  assert.equal(files.get("a.csv"), "latest");
});

test("failed writes retry, notify, and prevent unload from discarding the edit", async t => {
  const { view, vault, files, edit } = setup(t);
  const process = vault.process; let attempts = 0;
  vault.process = async () => { attempts++; throw new Error("disk unavailable"); };
  edit("recover me");
  await assert.rejects(view.onUnloadFile(view.file));
  assert.equal(attempts, 3);
  assert.equal(globalThis.notices.length, 1);
  assert.equal(view.getViewData(), "recover me");
  vault.process = process;
  await view.flushPendingSave();
  assert.equal(files.get("a.csv"), "recover me");
});

test("a failed verification is retried and then visibly rejected", async t => {
  const { view, vault, edit } = setup(t);
  vault.process = async () => "not written";
  edit("latest");
  await assert.rejects(view.flushPendingSave());
  assert.equal(globalThis.notices.length, 1);
});

test("reload notifications during a save do not replace a newer edit", async t => {
  const { view, vault, edit, fire } = setup(t);
  const gate = deferred(); const process = vault.process;
  vault.process = async (...args) => { await gate.promise; return process(...args); };
  edit("first"); fire(); edit("latest");
  view.setViewData("first", false);
  const visible = view.getViewData();
  gate.resolve(); await view.flushPendingSave();
  assert.equal(visible, "latest");
});

test("a transient disk error recovers without a failure notice", async t => {
  const { view, vault, files, edit } = setup(t);
  const process = vault.process; let failed = false;
  vault.process = async (...args) => {
    if (!failed) { failed = true; throw new Error("temporarily unavailable"); }
    return process(...args);
  };
  edit("recovered"); await view.flushPendingSave();
  assert.equal(files.get("a.csv"), "recovered");
  assert.equal(globalThis.notices.length, 0);
});

test("an empty edit is saved rather than treated as no pending changes", async t => {
  const { view, files, edit } = setup(t);
  edit(""); await view.flushPendingSave();
  assert.equal(files.get("a.csv"), "");
});

test("the committed edit reaches a real file through the vault adapter boundary", async t => {
  const { mkdtemp, readFile, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "tablite-save-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { view, vault, edit } = setup(t);
  await writeFile(join(directory, "a.csv"), '\uFEFFTitre;Commentaire\r\nLivre;\r\n');
  vault.read = file => readFile(join(directory, file.path), "utf8");
  vault.process = async (file, fn) => {
    const content = fn(await vault.read(file));
    await writeFile(join(directory, file.path), content);
    return content;
  };
  edit('Titre;Commentaire\nLivre;test\n');
  await view.onUnloadFile(view.file);
  assert.equal(await readFile(join(directory, "a.csv"), "utf8"), 'Titre;Commentaire\nLivre;test\n');
});

test("switching files after unload leaves each edit in its own file", async t => {
  const { view, vault, files, edit, fire } = setup(t);
  vault.readBinary = async file => new TextEncoder().encode(files.get(file.path)).buffer;
  const gate = deferred(); const process = vault.process;
  vault.process = async (...args) => { await gate.promise; return process(...args); };
  edit("edit a"); fire();
  const switched = (async () => {
    await view.onUnloadFile(view.file);
    view.file = { path: "b.csv", basename: "b" };
    await view.onLoadFile(view.file);
    edit("edit b");
    await view.flushPendingSave();
  })();
  gate.resolve(); await switched;
  assert.equal(files.get("a.csv"), "edit a");
  assert.equal(files.get("b.csv"), "edit b");
});
