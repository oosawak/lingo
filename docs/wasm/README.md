# WASM entry point

This directory is reserved for the browser-side WASM bundle.

Expected generated files from a future `wasm-pack` build:

- `lingo_wasm.js`
- `lingo_wasm_bg.wasm`
- `lingo_wasm.d.ts`

`docs/main.js` imports `./wasm/lingo_wasm.js` dynamically and falls back to a JS stub when the bundle is not present yet.
