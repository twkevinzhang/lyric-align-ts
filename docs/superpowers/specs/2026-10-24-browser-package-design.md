# Browser npm package design

Browser-only npm package with both the retained fast guided alignment API and the session contract described in [session-contract.md](../../session-contract.md). No Node server or native binding at runtime. Existing timestamp accuracy issues remain documented.

## Decisions

- Package name lyric-align-ts, TypeScript API and ESM distribution. Browser classic Worker runs bundled engine; Emscripten pthread workers execute current C++ WASM. Node is build/test tooling only.
- Input: Blob/File, AudioBuffer, or {samples: Float32Array, sampleRate:16000}. Decode/downmix/resample file input with Web Audio. Lyrics string or string array, explicit language.
- API createAligner(options) -> Promise<Aligner>; aligner.align({audio,lyrics,language,signal?,onProgress?}) -> result; aligner.dispose(). Expose toSrt(cues). Results include words, cues and timing; missing text and zero-length cues reported rather than concealed.
- Assets: classic engine worker, parity.js/parity.wasm, multilingual tokenizer data. Default asset URLs relative to installed module; consumers may override assetBaseUrl and workerUrl. Model URL explicitly configurable with pinned tiny-Q5 SHA256. Do not include model weights in npm tarball.
- Browser requirements: secure context, crossOriginIsolated, SharedArrayBuffer, WebAssembly, Worker, Intl.Segmenter and Web Audio for encoded files. Fail with actionable errors. Single align per instance; cancellation terminates worker because synchronous WASM cannot cooperate immediately. Disposed/cancelled instance cannot be reused; concurrent calls reject.
- Preserve pinned upstream methods/helper behavior using audited browser-safe extraction with provenance/licenses. No runtime filesystem, dynamic source extraction, localhost HTTP or machine-specific paths.
- Native sources/build transforms live under native/; build scripts under scripts/. src/core/ contains platform-neutral pure helpers; src/engine/ contains browser inference; tests/ contains unit/browser/package checks; examples/browser/ contains a static demo.
- README retains user's current new visitor introduction and measured song tables, updates paths and states genuinely verified browser scope. No fake new performance claims after refactor.
- npm pack allowlist: dist/, README, license/notices. Include assets and .d.ts. Exclude model/audio, .local, C++ development files and Node-only tools. Prepare release with pack/install/browser smoke; do not publish.

## Worker contract

Request {id,type:'initialize',options:{modelUrl,modelSha256,assetBaseUrl,threads}}; {id,type:'align',audio:Float32Array,lyrics:string,language:string}; {id,type:'dispose'}.
The session also sends {id,type:'transcribe',audio:Float32Array,language:string} and {id,type:'align-segments',segments,lyrics,options}. These return contract Segment[] and AlignedLine[] respectively.
Response {id,type:'result',result}; {id,type:'error',error:{name,message,code?}}; {id,type:'progress',stage,completed?,total?}. Public session progress uses the typed contract and does not invent units for legacy counters.
initialize result {ready:true}; align result {words:TimelineEntry[],metrics:{initializationSeconds?,alignmentSeconds,totalSeconds}}. TimelineEntry {text,startTime,endTime,confidence?,timeline?,id?,type?}.

## Acceptance

No spike/ or poc/ remains; root npm install/build/typecheck/test/pack work. Browser runtime bundle has no Node builtins/native binding/Echogarden server dependency. Packed package installed in a separate local consumer actually aligns real PCM in Chrome without Node inference and exports matching lyrics and nonfinite-safe cue times. Old pure helper regression tests retained where applicable. Cancellation, cleanup, bad options, HTTP/model errors and packaging asset resolution tested. Final independent review before completion.
