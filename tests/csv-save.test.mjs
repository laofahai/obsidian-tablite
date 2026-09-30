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
const utf8 = text => new TextEncoder().encode(text);
const bytesOf = (...parts) => Uint8Array.from(parts.flatMap(part => typeof part === "string" ? [...Buffer.from(part, "ascii")] : part));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function setup(t, { text = "Titre;Commentaire\r\nLivre;\r\n", bytes, encoding = "utf-8" } = {}) {
  const timers = new Map(); let id = 0;
  globalThis.window = { setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(id) { timers.delete(id); } };
  globalThis.notices = [];
  const files = new Map([["a.csv", bytes ? Uint8Array.from(bytes) : utf8(text)], ["b.csv", utf8("other file")]]);
  const savedEncodings = [];
  const vault = {
    async readBinary(file) { const bytes = files.get(file.path); return bytes.slice().buffer; },
    async modifyBinary(file, data) { files.set(file.path, Uint8Array.from(new Uint8Array(data))); },
    async read(file) { return new TextDecoder().decode(files.get(file.path)); },
  };
  const view = new CsvView({ app: { vault } }, {
    getFileColumnConfig: () => ({}),
    setFileColumnConfig: async () => {},
    getFileEncoding: () => encoding,
    setFileEncoding: async (path, value) => { savedEncodings.push({ path, encoding: value }); },
  });
  view.file = { path: "a.csv", basename: "a" };
  view.onOpen();
  await view.onLoadFile(view.file);
  const edit = text => view.rootEl.props.onDataChange(text);
  const fire = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); };
  const onDisk = (path = "a.csv") => files.get(path);
  const textOnDisk = (path = "a.csv") => new TextDecoder().decode(files.get(path));
  // The view re-reads the file asynchronously after an external change.
  const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
  t.after(() => { timers.clear(); delete globalThis.window; delete globalThis.notices; });
  return { view, vault, files, edit, fire, timers, settle, savedEncodings, onDisk, textOnDisk, notices: globalThis.notices };
}

test("committed semicolon CSV edit persists when closed before debounce", async t => {
  const { view, textOnDisk, edit } = await setup(t, { text: 'Titre;Commentaire\r\nLivre;\r\n', bytes: bytesOf([0xef, 0xbb, 0xbf], "Titre;Commentaire\r\nLivre;\r\n") });
  edit('Titre;Commentaire\nLivre;test\n');
  await view.onUnloadFile(view.file);
  assert.equal(textOnDisk(), 'Titre;Commentaire\nLivre;test\n');
});

test("a slow save drains edits whose debounce expires during the write", async t => {
  const { view, vault, textOnDisk, edit, fire } = await setup(t);
  const gate = deferred(); const modifyBinary = vault.modifyBinary; let first = true;
  vault.modifyBinary = async (...args) => { if (first) { first = false; await gate.promise; } return modifyBinary(...args); };
  edit("first"); fire(); edit("latest"); fire();
  gate.resolve(); await tick();
  assert.equal(textOnDisk(), "latest");
  await view.flushPendingSave();
});

test("unload waits for the running save and the latest edit", async t => {
  const { view, vault, textOnDisk, edit, fire } = await setup(t);
  const gate = deferred(); const modifyBinary = vault.modifyBinary;
  vault.modifyBinary = async (...args) => { await gate.promise; return modifyBinary(...args); };
  edit("first"); fire(); edit("latest");
  let unloaded = false;
  const unload = view.onUnloadFile(view.file).then(() => { unloaded = true; });
  await tick(); const early = unloaded;
  gate.resolve(); await unload; await tick();
  assert.equal(early, false, "unload must not finish while disk write is pending");
  assert.equal(textOnDisk(), "latest");
  assert.equal(textOnDisk("b.csv"), "other file");
});

test("closing the view flushes a pending edit", async t => {
  const { view, textOnDisk, edit } = await setup(t);
  edit("latest"); await view.onClose();
  assert.equal(textOnDisk(), "latest");
});

test("host save calls use the same persistence queue", async t => {
  const { view, textOnDisk, edit } = await setup(t);
  edit("latest"); await view.save();
  assert.equal(textOnDisk(), "latest");
});

test("failed writes retry, notify, and prevent unload from discarding the edit", async t => {
  const { view, vault, files, edit } = await setup(t);
  const modifyBinary = vault.modifyBinary; let attempts = 0;
  vault.modifyBinary = async () => { attempts++; throw new Error("disk unavailable"); };
  edit("recover me");
  await assert.rejects(view.onUnloadFile(view.file));
  assert.equal(attempts, 3);
  assert.equal(globalThis.notices.length, 1);
  assert.equal(view.getViewData(), "recover me");
  vault.modifyBinary = modifyBinary;
  await view.flushPendingSave();
  assert.equal(new TextDecoder().decode(files.get("a.csv")), "recover me");
});

test("a failed verification is retried and then visibly rejected", async t => {
  const { view, vault, files, edit } = await setup(t);
  vault.modifyBinary = async file => { files.set(file.path, utf8("not written")); };
  edit("latest");
  await assert.rejects(view.flushPendingSave());
  assert.equal(globalThis.notices.length, 1);
});

test("reload notifications during a save do not replace a newer edit", async t => {
  const { view, vault, edit, fire } = await setup(t);
  const gate = deferred(); const modifyBinary = vault.modifyBinary;
  vault.modifyBinary = async (...args) => { await gate.promise; return modifyBinary(...args); };
  edit("first"); fire(); edit("latest");
  view.setViewData("first", false);
  const visible = view.getViewData();
  gate.resolve(); await view.flushPendingSave();
  assert.equal(visible, "latest");
});

test("a transient disk error recovers without a failure notice", async t => {
  const { view, vault, textOnDisk, edit } = await setup(t);
  const modifyBinary = vault.modifyBinary; let failed = false;
  vault.modifyBinary = async (...args) => {
    if (!failed) { failed = true; throw new Error("temporarily unavailable"); }
    return modifyBinary(...args);
  };
  edit("recovered"); await view.flushPendingSave();
  assert.equal(textOnDisk(), "recovered");
  assert.equal(globalThis.notices.length, 0);
});

test("an empty edit is saved rather than treated as no pending changes", async t => {
  const { view, textOnDisk, edit } = await setup(t);
  edit(""); await view.flushPendingSave();
  assert.equal(textOnDisk(), "");
});

test("the committed edit reaches a real file through the vault adapter boundary", async t => {
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "tablite-save-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { view, vault, edit } = await setup(t);
  await writeFile(join(directory, "a.csv"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Titre;Commentaire\r\nLivre;\r\n")]));
  vault.readBinary = async file => {
    const buffer = await readFile(join(directory, file.path));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  };
  vault.modifyBinary = async (file, data) => {
    await writeFile(join(directory, file.path), Buffer.from(new Uint8Array(data)));
  };
  edit('Titre;Commentaire\nLivre;test\n');
  await view.onUnloadFile(view.file);
  assert.equal(await readFile(join(directory, "a.csv"), "utf8"), 'Titre;Commentaire\nLivre;test\n');
});

test("switching files after unload leaves each edit in its own file", async t => {
  const { view, vault, files, edit, fire } = await setup(t);
  const gate = deferred(); const modifyBinary = vault.modifyBinary;
  vault.modifyBinary = async (...args) => { await gate.promise; return modifyBinary(...args); };
  edit("edit a"); fire();
  const switched = (async () => {
    await view.onUnloadFile(view.file);
    view.file = { path: "b.csv", basename: "b" };
    await view.onLoadFile(view.file);
    edit("edit b");
    await view.flushPendingSave();
  })();
  gate.resolve(); await switched;
  assert.equal(new TextDecoder().decode(files.get("a.csv")), "edit a");
  assert.equal(new TextDecoder().decode(files.get("b.csv")), "edit b");
});

test("a GBK file is read as GBK and written back as GBK", async t => {
  // "中文测试" in GBK: D6D0 CEC4 B2E2 CAD4
  const bytes = bytesOf("Titre;Commentaire\nLivre;", [0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4], "\n");
  const { view, onDisk, edit } = await setup(t, { encoding: "gbk", bytes });
  assert.equal(view.getViewData(), "Titre;Commentaire\nLivre;中文测试\n");

  edit("Titre;Commentaire\nLivre;中文测试\n");
  await view.flushPendingSave();
  assert.deepEqual(Array.from(onDisk()), Array.from(bytes), "unchanged Chinese text must keep its GBK bytes");

  edit("Titre;Commentaire\nLivre;中文\n");
  await view.flushPendingSave();
  assert.deepEqual(
    Array.from(onDisk()),
    Array.from(bytesOf("Titre;Commentaire\nLivre;", [0xd6, 0xd0, 0xce, 0xc4], "\n")),
    "edited Chinese text must be encoded as GBK",
  );
  assert.notEqual(new TextDecoder().decode(onDisk()), "Titre;Commentaire\nLivre;中文\n");
});

test("a remembered encoding wins over detection", async t => {
  const bytes = bytesOf("a,b\n", [0xb1, 0xea, 0xcc, 0xe2], "\n");
  const { view, onDisk, edit } = await setup(t, { encoding: "gbk", bytes });
  assert.equal(view.getViewData(), "a,b\n标题\n");
  edit("a,b\n标题,备注\n");
  await view.flushPendingSave();
  assert.equal(new TextDecoder("gbk").decode(onDisk()), "a,b\n标题,备注\n");
  assert.notEqual(new TextDecoder().decode(onDisk()), "a,b\n标题,备注\n");
});

test("a UTF-8 BOM survives an edit so Excel keeps reading the file", async t => {
  const { view, onDisk, edit } = await setup(t, {
    encoding: "utf-8-bom",
    bytes: bytesOf([0xef, 0xbb, 0xbf], "a,b\n1,2\n"),
  });
  assert.equal(view.getViewData(), "a,b\n1,2\n", "the BOM must not show up as data");
  edit("a,b\n1,3\n");
  await view.flushPendingSave();
  assert.deepEqual(Array.from(onDisk()), Array.from(bytesOf([0xef, 0xbb, 0xbf], "a,b\n1,3\n")));
});

test("choosing an encoding converts the file without touching what is displayed", async t => {
  const { view, savedEncodings, onDisk, textOnDisk } = await setup(t, {
    text: "a,b\n中文\n",
    bytes: utf8("a,b\n中文\n"),
    encoding: "utf-8",
  });

  await view.rootEl.props.onEncodingChange("gbk");

  assert.equal(view.getViewData(), "a,b\n中文\n", "the shown text must survive a conversion");
  assert.deepEqual(savedEncodings, [{ path: "a.csv", encoding: "gbk" }]);
  assert.deepEqual(
    Array.from(onDisk()),
    Array.from(bytesOf("a,b\n", [0xd6, 0xd0, 0xce, 0xc4], "\n")),
    "the file must be rewritten as GBK straight away",
  );
  assert.equal(new TextDecoder("gbk").decode(onDisk()), "a,b\n中文\n");
  assert.notEqual(textOnDisk(), "a,b\n中文\n", "UTF-8 decoding must no longer be what is on disk");
});

test("choosing UTF-8 with BOM writes the BOM even without an edit", async t => {
  const { view, onDisk } = await setup(t, {
    text: "a,b\n中文\n",
    bytes: utf8("a,b\n中文\n"),
    encoding: "utf-8",
  });

  await view.rootEl.props.onEncodingChange("utf-8-bom");

  assert.deepEqual(Array.from(onDisk().slice(0, 3)), [0xef, 0xbb, 0xbf]);
  assert.equal(view.getViewData(), "a,b\n中文\n", "the BOM must not appear in the editor");
  assert.equal(new TextDecoder("utf-8").decode(onDisk()), "a,b\n中文\n");
});

test("a conversion is refused when the shown text could not be decoded", async t => {
  // GBK bytes opened as UTF-8, so the shown text is full of replacement chars.
  const { view, savedEncodings, textOnDisk, notices } = await setup(t, {
    encoding: "utf-8",
    bytes: bytesOf("a,b\n", [0xd6, 0xd0, 0xce, 0xc4], "\n"),
  });
  const before = textOnDisk();

  await view.rootEl.props.onEncodingChange("gbk");

  assert.deepEqual(savedEncodings, [{ path: "a.csv", encoding: "gbk" }], "the choice is still remembered");
  assert.equal(textOnDisk(), before, "a lossy decode must not be written back");
  assert.equal(notices.length, 1);
  assert.match(notices[0], /undecodable/);
});

test("re-reading reinterprets the bytes on disk with the selected encoding", async t => {
  const bytes = bytesOf("a,b\n", [0xd6, 0xd0, 0xce, 0xc4], "\n");
  const { view, textOnDisk } = await setup(t, { encoding: "utf-8", bytes });
  assert.notEqual(view.getViewData(), "a,b\n中文\n", "UTF-8 decoding of GBK bytes is expected to be wrong");
  const before = textOnDisk();

  await view.rootEl.props.onEncodingChange("gbk"); // remembers GBK without converting
  await view.rootEl.props.onReloadEncoding();

  assert.equal(view.getViewData(), "a,b\n中文\n");
  assert.equal(textOnDisk(), before, "re-reading must not rewrite the file");
});

test("a file change reported as UTF-8 does not garble a GBK file", async t => {
  const bytes = bytesOf("a,b\n", [0xd6, 0xd0, 0xce, 0xc4], "\n");
  const { view, settle } = await setup(t, { encoding: "gbk", bytes });

  // Obsidian reports external changes as a UTF-8 string, which is mojibake here.
  view.setViewData("a,b\n\uFFFD\uFFFD\n", false);
  await settle();

  assert.equal(view.getViewData(), "a,b\n中文\n");
});
