# search-engine

Motore Rust/WASM per il confronto combinatorio prezzi e-commerce.

## Prerequisiti

- [Rust](https://rustup.rs/) (`rustup`)
- Target WASM: `rustup target add wasm32-unknown-unknown`
- Su Windows, aggiungi `%USERPROFILE%\.cargo\bin` al PATH (o riapri il terminale dopo rustup)

Su Windows senza Visual Studio Build Tools, usa la toolchain GNU:

```bash
rustup default stable-x86_64-pc-windows-gnu
```

## Build

Dalla root del progetto Next.js:

```bash
npm run build:wasm
```

Lo script `scripts/build-wasm.mjs` aggiunge automaticamente `~/.cargo/bin` al PATH
(se manca) e applica la patch per Next.js.

Genera `pkg/` con:
- `search_engine_bg.wasm`
- `search_engine.js` (glue Node.js)
- `search_engine.d.ts`

## Test Rust nativi

```bash
cd rust/search-engine
cargo test
```

## Integrazione

Il wrapper TypeScript è in `app/lib/search/elabora-scenari.ts` e chiama
`elaboraConfrontoWasm()` via CommonJS (`createRequire`).

Il pacchetto npm locale `search-engine` punta a `file:rust/search-engine/pkg`.
