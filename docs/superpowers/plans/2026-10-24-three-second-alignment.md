# Three-second Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Three full songs each pass three runs at operationSeconds ≤3 and retained start MAE ≤1 second.

**Architecture:** Preserve browser CPU/WASM API and tiny Q5_1. Add reproducible measurement, profile the hot paths, then iterate internal settings and algorithms against the same reference-only scoring.

**Tech Stack:** TypeScript, JavaScript, C++, Emscripten, Chrome, Playwright.

**Spec:** docs/superpowers/specs/2026-10-24-three-second-alignment-design.md (approved).

## Global Constraints

- Full audio; model initialized, no song-specific precomputation outside align().
- Each song excludes at most floor(N × 0.1) starts; retained MAE ≤1 second; ends non-gating.
- Nine final runs must all take ≤3 seconds; no removal of slow runs.
- CPU browser execution, no reference timestamps in inference, no song-specific paths or branches.
- Preserve all pre-existing uncommitted work; no deployment or publication.
- User explicitly authorized autonomous execution; do not add intermediate approval gates.

## Review Focus

- Invalid or missing starts consume exclusion budget (task 1).
- Odd PCM lengths and changed time scale preserve original duration (task 2).
- Failed and cancelled calls do not leave configuration or worker state corrupt (task 2/3).
- Short tails and dense lyrics do not truncate output when reducing work (task 2).
- Reused aligner does not carry previous song tokens or configuration (task 3).

### Task 1: Reliable measurements

Files: src/core/acceptance.mjs, tests/core/acceptance.test.mjs, scripts/benchmark-browser.mjs, new scripts/benchmark-three-second.mjs.
Interface: acceptance(seconds, rows, maximumSeconds=3); benchmark fixture input retains existing schema. Outputs per-run original result, timings, scoring, source/input hashes and load samples under .local/.

- [x] Test 3 seconds inclusive, above 3 fails, exclusion flooring and invalid-start handling; run focused tests red then green.
- [x] Use operationSeconds explicitly in benchmark. Keep initialization and full output separately.
- [x] Implement sequential configurable trials, browser/server cleanup and load sampling; save settings and every result. Test with three real songs.

### Task 2: Profile and iterate

Files: src/engine/engine.mjs, src/engine/native-context.mjs, src/core/audio-time-scale.mjs, native/bridge.cpp and focused tests as needed; scripts/native transforms only if profiling justifies native changes.
Interface: internal configuration (time scale, batch size, threads and profiling), with production defaults selected by results; no new public API required. Profiling returns encode/mel/decoder/path/transfer time and counts.

- [x] Add opt-in profiling and a test-only build configuration, without moving song work outside timing.
- [x] Profile three songs. Choose largest measured costs, record each hypothesis before its experiment.
- [x] For semantic changes, write targeted regression tests first; test scale conversion for odd lengths, tiny input and short tails.
- [x] Sweep thread counts, supported mel compression and batch sizes serially; evaluate all starts for every candidate. Keep failures as evidence, never as the production default.
- [x] Optimize proven hot paths if parameters alone cannot pass. Repeat profiling and acceptance after each change; record retained/rejected decisions and next direction.

### Task 3: Integrate, verify, report

Files: selected implementation files, tests/engine, scripts/test-browser.mjs, README.md, docs/three-second-alignment-report.md.

- [x] Integrate fastest passing configuration and remove exploratory instrumentation from default runtime.
- [x] Verify reused instance with different songs, error cleanup, full audio duration and lyric coverage. Run node --test tests/core/*.test.mjs tests/api/*.test.mjs tests/engine/*.test.mjs tests/native/*.test.mjs, typecheck and build.
- [x] Run final three-song × three-run acceptance on actual built distribution. All nine must pass; otherwise return to task 2.
- [x] Run browser/package smoke as applicable and independent final code review; address findings.
- [x] Update current report and README from verified evidence, including limitations and each iteration's direction. Verify no test server remains.

Plan self-review: covers timing, quality, no leakage, full audio, repeated final tests, evolving report and cleanup. Execution in current worktree by primary agent; review may use a fresh reviewer as required by executing-plans. Read make-git before any commit; do not bundle unrelated user changes.

Final evidence: `.local/three-second/1792812241771-production-final-acceptance-full-tile44/`, native build28 checks, 58/58 JS tests with source idempotence, both TypeScript configs, real Chrome browser smoke including 500-token overflow, different-song reuse parity, and tarball consumer validation. Independent review found dense-final truncation; fixed and reviewed again with actual WASM coverage evidence. Prior failed formal batches remain in the report. No commit/deployment.
