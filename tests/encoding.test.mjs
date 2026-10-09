import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/parser/encoding.ts"], bundle: true, format: "esm", platform: "node", write: false,
});
const {
  UTF8, UTF8_BOM, GBK, WINDOWS_1252, SHIFT_JIS, UTF16_LE,
  decodeBuffer, detectBomEncoding, encodeText, includesBom, normalizeEncodingId,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text + "\n//# sourceURL=encoding-test-bundle.mjs").toString("base64")}`);

const bytes = text => [...new TextEncoder().encode(text)];
const encoded = (text, encoding) => [...new Uint8Array(encodeText(text, encoding))];

test("UTF-8 text round-trips without a byte order mark", () => {
  assert.deepEqual(encoded("a,b\n中文\n", UTF8), bytes("a,b\n中文\n"));
  assert.equal(decodeBuffer(encodeText("a,b\n中文\n", UTF8), UTF8), "a,b\n中文\n");
});

test("UTF-8 with BOM writes the mark and hides it again when read", () => {
  assert.deepEqual(encoded("a,b\n", UTF8_BOM), [0xef, 0xbb, 0xbf, ...bytes("a,b\n")]);
  assert.equal(includesBom(UTF8_BOM), true);
  assert.equal(decodeBuffer(encodeText("a,b\n", UTF8_BOM), UTF8_BOM), "a,b\n");
});

test("GBK encodes and decodes Chinese with the expected bytes", () => {
  assert.deepEqual(encoded("中文测试", GBK), [0xd6, 0xd0, 0xce, 0xc4, 0xb2, 0xe2, 0xca, 0xd4]);
  const buffer = encodeText("Titre;Commentaire\nLivre;中文测试\n", GBK);
  assert.equal(decodeBuffer(buffer, GBK), "Titre;Commentaire\nLivre;中文测试\n");
});

test("GBK keeps ASCII single byte and quotes untouched", () => {
  assert.deepEqual(encoded('a,"b,c"\nd,"e"\n', GBK), bytes('a,"b,c"\nd,"e"\n'));
});

test("characters the target encoding cannot represent fall back to a question mark", () => {
  assert.deepEqual(encoded("a\u{1F600}", GBK), bytes("a?"));
  assert.equal(decodeBuffer(encodeText("a\u{1F600}", GBK), GBK), "a?");
});

test("Windows-1252 and Shift-JIS round-trip their own characters", () => {
  assert.deepEqual(encoded("café", WINDOWS_1252), [...bytes("caf"), 0xe9]);
  assert.equal(decodeBuffer(encodeText("café", WINDOWS_1252), WINDOWS_1252), "café");
  assert.deepEqual(encoded("あ", SHIFT_JIS), [0x82, 0xa0]);
  assert.equal(decodeBuffer(encodeText("あいう", SHIFT_JIS), SHIFT_JIS), "あいう");
});

test("UTF-16 LE writes its byte order mark", () => {
  assert.deepEqual(encoded("ab", UTF16_LE), [0xff, 0xfe, 0x61, 0x00, 0x62, 0x00]);
  assert.equal(decodeBuffer(encodeText("ab中", UTF16_LE), UTF16_LE), "ab中");
});

test("byte order marks are detected before any other signal", () => {
  assert.equal(detectBomEncoding(encodeText("x", UTF8_BOM)), UTF8_BOM);
  assert.equal(detectBomEncoding(encodeText("x", UTF16_LE)), UTF16_LE);
  assert.equal(detectBomEncoding(encodeText("x", UTF8)), null);
  assert.equal(detectBomEncoding(encodeText("x", GBK)), null);
});

test("jschardet style names normalise to the ids the view stores", () => {
  assert.equal(normalizeEncodingId("GB2312"), GBK);
  assert.equal(normalizeEncodingId("gb18030"), GBK);
  assert.equal(normalizeEncodingId("UTF-8"), UTF8);
  assert.equal(normalizeEncodingId("utf-8-sig"), UTF8_BOM);
  assert.equal(normalizeEncodingId("shift_jis"), SHIFT_JIS);
  assert.equal(normalizeEncodingId("UTF-16"), UTF16_LE);
  assert.equal(normalizeEncodingId(undefined), UTF8);
  assert.equal(normalizeEncodingId("Big5"), "big5");
});

test("an unknown encoding still decodes as UTF-8 instead of throwing", () => {
  const buffer = encodeText("a,b\n中文\n", UTF8);
  assert.equal(decodeBuffer(buffer, "not-a-real-encoding"), "a,b\n中文\n");
});

test("writing with an unusable encoding fails loudly instead of mangling text", () => {
  assert.throws(() => encodeText("a,备注\n", "not-a-real-encoding"), /not supported/);
});
