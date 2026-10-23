# Ten-second alignment implementation plan

> **For agentic workers:** Use executing-plans to implement task by task.

**Goal:** Make each of the three approved songs pass the 10-second/start-only acceptance gate.
**Architecture:** Keep Chrome CPU/WASM inference and Node orchestration. Measure complete runs, change one bottleneck at a time, and score only after inference.
**Tech Stack:** Node.js, Emscripten, whisper.cpp, Chrome.
**Spec:** ../specs/2026-10-24-ten-second-alignment-design.md

## Global constraints

Per song: totalSeconds <=10, exclusions <=floor(N*0.1), retained start MAE <=1 second. Invalid cues consume exclusions. Reference times never enter inference. Include initialization and RPC in timing; no moving computation outside the timer. Keep latest consolidated report and raw local measurements. Do not commit without make-git. Use existing isolated cpp worktree; execute inline under the user's implementation authorization.

## Review focus

Fractional exclusion quotas; invalid cues exhausting the quota; signed errors cancelling; absent/nonfinite timing; reference timestamps leaking into inference. Task 1 covers the first four, Task 2 records the inference/reference boundary and existing cue-score regression tests cover pairing independence.

### Task 1: Acceptance gate

Files: song/acceptance.mjs, acceptance.test.mjs under poc/whisper.
Interface: acceptance(seconds, rows with usable/startError) returns pass/timePass/qualityPass, excluded, meanAbs and retainedCount.
- [x] Add tests for <=10 seconds, invalid cues within/exceeding quota, nonfinite times/errors, signed absolute errors, floor quota and end-only changes.
- [x] Run node --test poc/whisper/song/acceptance.test.mjs and observe failures.
- [x] Implement the confirmed gate, preserve line identities, and rerun tests plus song suite.

### Task 2: Repeatable measurement

Files: add song/benchmark.mjs and benchmark-report.mjs; adapt serve.mjs only as needed for measured experiment parameters/diagnostics.
Interface: runner selects a configured song and isolated output profile; each real Chrome run writes wasm.json; report converts scoreCues.rows.error into acceptance startError and writes JSON/CSV plus current consolidated report.
- [x] Inspect available build/runtime and inspect alignment logic before choosing interventions.
- [x] Automate sequential real-browser runs with owned server cleanup, verified HTTP readiness, bounded timeout, input/build/parameter hashes and subprocess errors.
- [x] Run all three baseline songs; report per-stage time, acceptance and all excluded cues. Never fabricate missing measurements.

### Task 3: Iterative optimization

Files: parameter/configuration, orchestration and/or WASM source selected by measured bottleneck, plus relevant regression tests.
- [x] For each experiment, record hypothesis, exact change and expected benefit in consolidated report.
- [x] Make targeted change; verify correctness with meaningful tests and rerun all three songs.
- [x] Keep/ reject based on measured time and quality, record next direction and continue.
- [x] Once a candidate passes all songs, run three independent complete measurements per song; every run must pass.
- [x] Review changes, rerun affected tests, update README to current facts, stop owned services and verify ports released.

## Execution ledger

2026-10-24: Existing linked worktree cpp confirmed; original song test suite 12/12 passes. Ruling: no additional approval handoff or commits; user already explicitly authorized implementation. No new dependencies needed yet. Task 2 consumes Task 1 via an explicit error-to-startError adapter.
Task 1: complete — 10-second acceptance and invalid-cue quota tests pass. Task 2: complete — three baseline real Chrome runs, hashes, lifecycle cleanup and scoring recorded. Task 3: complete — fixed ten-second preset passed validation-1, validation-2 and validation-3 for all three songs. Independent validator rescored raw timelines and checked consistent source/build/input hashes and fresh lifecycles. 37 song tests pass. Independent gpt-6-astra review was performed on a working-tree package against HEAD 673a5d5 (changes are uncommitted); missing-child-token scoring, exception cleanup and stale retry findings were fixed. README and consolidated report reflect final results; all owned services stopped. No commit or deployment.

