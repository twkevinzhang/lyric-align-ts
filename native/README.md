# Native browser engine

Prerequisites: Node.js 22.18+ (Node 24 recommended), Git, and Docker with Linux containers. From the repository root run:

```sh
node scripts/native/build.mjs
```

Set `DOCKER_BIN` to override the Docker executable; Windows also detects the standard Docker Desktop installation. Docker Desktop must be running.

This uses the immutable Emscripten image in `lock.json`, fetches the pinned Whisper fork, applies the grouped/compact SIMD and temporal mel transforms, runs mel and matrix/unroll checks, and writes `parity.js` and `parity.wasm` to `.local/native/build/`. No model is needed to compile or run these kernel checks. The internal `_poc_*` ABI remains unchanged for the browser engine.

With the pinned Emscripten SDK already active, `bash scripts/native/build.sh` runs the same process without Docker. Source preparation alone: `node scripts/native/prepare.mjs`. All generated source variants and build artifacts live under `.local/native/`; this is a disposable development cache. The build uses 12 prewarmed workers, relaxed SIMD, and `-ffp-contract=off`, matching the current fast implementation; the optional experimental weight cache is disabled.

Model acquisition is separate: `node scripts/native/model.mjs` downloads the pinned tiny Q5_1 model into `.local/native/` and rejects mismatched SHA-256. Weights must never be included in the published package.

Run lightweight invariants with `node --test tests/native/*.test.mjs`. Set `NATIVE_SOURCE_TEST=1` to also prepare the source and validate golden kernel hashes plus repeatability (requires Git/network on first run). Model-based alignment and browser parity are tested by the repository integration suite.
