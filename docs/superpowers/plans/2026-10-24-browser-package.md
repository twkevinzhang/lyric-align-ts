# Browser package implementation plan

> Execute using subagent-driven-development; user authorized direct implementation, no further design approval needed.

**Goal:** Replace the experiment layout with a browser-runtime npm library and release-ready development structure.
**Architecture:** Public TypeScript client -> classic engine Worker -> existing fast WASM with bundled browser-safe tokenizer/alignment helpers. Static assets only; no Node inference server.
**Tech Stack:** TypeScript, ESM, esbuild, Node test runner, Playwright Chrome, Emscripten/C++.
**Spec:** ../specs/2026-10-24-browser-package-design.md

## Global constraints

Preserve current fast algorithm and known limitations; no truth times in inference. Protect uncommitted user README edit. Do not publish npm or push. No model/song weights in tarball. Work within existing cpp worktree. Remove old directories only after dependencies migrate. Every recursive removal resolves within this workspace.

## Review focus

Worker/pthread asset URLs after packing; model integrity before execution; cancellation during synchronous WASM; cleanup after initialization failure; browser-only dependency closure and license provenance; unmatched lyric ranges and zero-length SRT cues; equivalent multilingual tokenization.

## Tasks

- [x] 1. Migrate browser-safe upstream engine, tokenizer and Worker inference. Own src/engine and vendor engine tooling; verify tokenizer/algorithm parity and actual worker operation.
- [x] 2. Migrate pinned native source/build tools into native/ and scripts/native; verify reproducible source/build paths and license notices.
- [x] 3. Implement public typed client, audio preparation, cue/SRT utilities, root package build/export/asset setup and platform-neutral tests. Watch API test failures before implementation.
- [x] 4. Integrate static demo, pack/install consumer, real Chrome song tests and error/cancel cleanup; remove spike/poc and obsolete docs after replacing necessary helpers.
- [x] 5. Update README/release docs, inspect tarball, independent review, fix important findings and rerun affected checks.

## Execution ledger

2026-10-24: User approved direct implementation; pcc interpreted as current cpp/fast. No publication, push, or new commit performed. Existing README introduction and six prior comparisons preserved while updating architecture and adding SDK measurements.

- Task 1 complete: fixed upstream browser subset, tokenizer JS/WASM and static vocabulary assets; full engine runs in classic Worker. English/Japanese token fixtures and DTW path parity pass. The original three songs' output token ID sequences match their previous fast results exactly.
- Task 2 complete: native source generation reproduces the fixed kernel digest and is idempotent. Fresh pinned Docker/Emscripten build completed exit 0 after host WSL repair; mel and 1537-length/F16/Q5/broadcast/noncontiguous matrix tests pass, max F16 error 0.000366210938 within 0.001 tolerance. Assets are newly rebuilt, not the temporary prebuilt fallback.
- Task 3 complete: typed ESM API, browser audio decoding/resampling, input ownership, progress, sequential reuse, cancellation/dispose, cue diagnostics and valid SRT export. No runtime Node dependency or native N-API binding.
- Task 4 complete: six real full songs executed in Chrome. All satisfy retained-start mean quality; SUNEO-ISM and Boys Will Be Bugs exceed 10 seconds in new SDK total timing. README distinguishes these from old prototype timings. Legacy spike/ and poc/ tracked files removed, then only verified empty directories removed. Local models/audio/measurements untouched. Obsolete HTTP wire/recognize-map/thread-tuning helpers and tests retired because those interfaces no longer exist; relevant core tests retained.
- Task 5 complete: TypeScript checks main and Worker; 44/44 tests including native source checks pass with NATIVE_SOURCE_TEST=1. Real Chrome smoke checks initialization errors, reuse, immediate cancellation rejection and eventual zero live Workers. Tarball allowlist, separate consumer install/types and real Chrome inference pass using both pnpm and actual npm 11.6.2. Tarball excludes models, audio, native/build scripts and local paths; no production runtime dependencies.

Final independent review: fresh gpt-6-astra reviewer, read-only full refactor against dba1da5 and the approved spec. Two Important findings fixed: unresolved audio preparation now races a lifetime abort signal and closes AudioContext (regression observed RED→GREEN for file read and additional decode/render tests); bundled tiktoken JS/WASM now carries a separate verified upstream MIT notice (notice regression RED→GREEN). Text-segmentation MIT notice also retained. No Critical findings.

Ruling: Intl Japanese/Chinese segmentation avoids large Node dictionaries; the provided Japanese lyrics and independent tokenizer fixtures are checked, but arbitrary morphology equivalence is not claimed. Costs are documented in README and provenance.
Ruling: Worker termination propagation through synchronous WASM can be delayed; a bounded real-browser teardown test verifies all Workers close within 15 seconds. The Promise rejects promptly and cancelled/disposed instances cannot be reused; no claim of instant CPU shutdown.
Ruling: npm package remains experimental; current time estimates are not fixed by this refactor. SRT omission of invalid intervals is format safety, not an alignment correction. Remote CI is configured but has not been executed here.
