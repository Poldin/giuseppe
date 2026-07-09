import fs from "node:fs";
import path from "node:path";

const pkgDir = path.join(process.cwd(), "rust/search-engine/pkg");
const file = path.join(pkgDir, "search_engine.js");

if (!fs.existsSync(file)) {
  console.error("search_engine.js non trovato. Esegui prima: npm run build:wasm");
  process.exit(1);
}

let content = fs.readFileSync(file, "utf8");

const patchedLoader = `const wasmPath = require("path").join(process.cwd(), "rust/search-engine/pkg/search_engine_bg.wasm");
const wasmBytes = require("fs").readFileSync(wasmPath);`;

const originalLoader = `const wasmPath = \`\${__dirname}/search_engine_bg.wasm\`;
const wasmBytes = require('fs').readFileSync(wasmPath);`;

if (content.includes('process.cwd(), "rust/search-engine/pkg/search_engine_bg.wasm"')) {
  console.log("search_engine.js già patchato.");
} else if (content.includes(originalLoader)) {
  content = content.replace(originalLoader, patchedLoader);
  fs.writeFileSync(file, content);
  console.log("Patch applicata a search_engine.js");
} else {
  console.warn(
    "Formato search_engine.js non riconosciuto — patch manuale potrebbe servire."
  );
}
