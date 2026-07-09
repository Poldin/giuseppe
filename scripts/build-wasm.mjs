import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const wasmPackExe = path.join(cargoBin, process.platform === "win32" ? "wasm-pack.exe" : "wasm-pack");
const cargoExe = path.join(cargoBin, process.platform === "win32" ? "cargo.exe" : "cargo");

function withCargoPath(env) {
  const next = { ...env };
  const current = next.PATH ?? next.Path ?? "";
  if (!current.toLowerCase().includes(cargoBin.toLowerCase())) {
    next.PATH = `${cargoBin}${path.delimiter}${current}`;
  }
  return next;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function patchWasmPath() {
  const pkgDir = path.join(root, "rust/search-engine/pkg");
  const file = path.join(pkgDir, "search_engine.js");

  if (!fs.existsSync(file)) {
    console.error("search_engine.js non trovato dopo il build WASM.");
    process.exit(1);
  }

  let content = fs.readFileSync(file, "utf8");

  const patchedLoader = `const wasmPath = require("path").join(process.cwd(), "rust/search-engine/pkg/search_engine_bg.wasm");
const wasmBytes = require("fs").readFileSync(wasmPath);`;

  const originalLoader = `const wasmPath = \`\${__dirname}/search_engine_bg.wasm\`;
const wasmBytes = require('fs').readFileSync(wasmPath);`;

  if (content.includes('process.cwd(), "rust/search-engine/pkg/search_engine_bg.wasm"')) {
    console.log("search_engine.js già patchato.");
    return;
  }

  if (!content.includes(originalLoader)) {
    console.warn(
      "Formato search_engine.js non riconosciuto — patch manuale potrebbe servire."
    );
    return;
  }

  content = content.replace(originalLoader, patchedLoader);
  fs.writeFileSync(file, content);
  console.log("Patch applicata a search_engine.js");
}

if (!fs.existsSync(cargoExe)) {
  console.error(
    [
      "Rust/Cargo non trovato in ~/.cargo/bin.",
      "Installa da https://rustup.rs/ poi riapri il terminale.",
    ].join("\n")
  );
  process.exit(1);
}

const env = withCargoPath(process.env);

if (fs.existsSync(wasmPackExe)) {
  run(wasmPackExe, [
    "build",
    path.join(root, "rust/search-engine"),
    "--target",
    "nodejs",
    "--out-dir",
    "pkg",
  ], { env });
} else {
  run(
    "npx",
    [
      "--yes",
      "wasm-pack@0.15.0",
      "build",
      "rust/search-engine",
      "--target",
      "nodejs",
      "--out-dir",
      "pkg",
    ],
    { cwd: root, env, shell: true }
  );
}

patchWasmPath();
console.log("build:wasm completato.");
