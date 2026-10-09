import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/types.ts"], bundle: true, format: "esm", write: false,
});
const { parsePluginData, normalizeColumnConfig } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("existing column settings survive loading", () => {
  const stored = { files: { "a.csv": {
    order: [1, 0], hidden: [0], sizing: { 1: 120 }, frozenCount: 1,
  } } };
  assert.deepEqual(parsePluginData(stored), { ...stored, encodings: {}, defaultEncoding: "utf-8" });
});

test("missing and malformed settings cannot crash table initialization", () => {
  for (const value of [null, undefined, [], "invalid", { files: [] }, { files: null }]) {
    assert.deepEqual(parsePluginData(value), { files: {}, encodings: {}, defaultEncoding: "utf-8" });
  }
  const result = parsePluginData({ files: {
    "bad.csv": null,
    "a.csv": { order: [0, "1", -1, null], hidden: "bad", sizing: { 0: 120, 1: "wide" }, frozenCount: NaN },
  } });
  assert.deepEqual(result.files["a.csv"], { order: [0], hidden: [], sizing: { 0: 120 }, frozenCount: 0 });
  assert.equal(result.files["bad.csv"], undefined);
  assert.deepEqual(normalizeColumnConfig(result.files["a.csv"], 2).order, [0, 1]);
});


test("encoding preferences survive even without valid column settings", () => {
  const result = parsePluginData({
    files: null,
    encodings: { "a.csv": "UTF-8-BOM", "b.csv": "GB2312", "bad.csv": 17 },
    defaultEncoding: "GBK",
  });
  assert.deepEqual(result, {
    files: {},
    encodings: { "a.csv": "utf-8-bom", "b.csv": "gbk" },
    defaultEncoding: "gbk",
  });
});
