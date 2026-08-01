import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/parser/links.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
});
const { splitLinks } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`,
);

test("splitLinks keeps balanced URL parentheses before sentence punctuation", () => {
  assert.deepEqual(splitLinks("See https://host/Foo_(bar)."), [
    { text: "See ", href: null },
    { text: "https://host/Foo_(bar)", href: "https://host/Foo_(bar)" },
    { text: ".", href: null },
  ]);
});
