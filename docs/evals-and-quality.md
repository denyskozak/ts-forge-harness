# Evals, completion evidence and code quality

## Simple React app acceptance

`npm run eval:simple-apps` sends the original emoji-gallery prompt to a local model,
then asks it to replace the gallery with a single Hello World button in the same
project and conversation. The default is `llama3.1:8b`; override it with
`FORGE_EVAL_MODEL`. Ollama and the installed Playwright Chromium are required.

The runner creates an isolated React/TypeScript fixture from installed dependencies.
It approves only fixture edits and compiler checks, supplies no implementation or
clarification answers, and saves transcripts, generated sources, screenshots and
`results.json` under `.forge-test-results/simple-apps-*`. Browser assertions live
outside the agent's editable project. They check case-insensitive search, empty
results, clearing the query, copying three different emoji to the real clipboard,
no API calls or added packages, and the single-button replacement. A compiler pass
alone cannot pass this evaluation. The runner does not grant human acceptance in
the application's completion policy.

The harness now folds system instructions into one leading Ollama message: the
installed Llama template skips interleaved system turns, including a trailing
turn that otherwise prevents its assistant prefix. Small existing React page
edits receive bounded source context. Whole-file generation uses a single fenced
TypeScript artifact instead of forcing source through a JSON grammar. Incomplete,
multiple or output-limited artifacts are rejected before review. Unchanged
whole-file writes switch to an exact-fragment edit. Syntax
errors and implicit parameter types can use compiler-located excerpts; type
repairs retain complete statement boundaries from the TypeScript syntax tree.
The model supplies replacement code, while the harness fixes the path and original
excerpt and retains the existing review, stale-source and validation gates.

Observed on 2026-11-13: `llama3.1:8b`, 16K context, temperature 0 passed both
browser cases in one uninterrupted run, with the button request following the
gallery in the same conversation. The gallery required autonomous syntax and
parameter-type repairs; no human answers or manual source edits were supplied.
The earlier `qwen2.5:1.5b` trial failed and is not counted as a success. These are
narrow fixture results, not a reliability claim for every model or project.
Validation: 209 tests passed, production build and eval-script typecheck passed,
and the Electron desktop smoke test passed.

### Qwen follow-up

`FORGE_EVAL_MODEL=qwen2.5:1.5b npm run eval:simple-apps` now passes both browser
cases in the same conversation at 16K context and temperature 0, without manual
source edits or clarification answers. Qwen initially substituted `alert` for
copying. A bounded omission check now detects an absent clipboard operation in a
self-contained small React page, asks the model to repair the relevant item
button, and reruns compiler checks. This check does not certify runtime behavior
and does not inspect imported helper implementations; independent browser checks
remain required. The browser test also rejects unassigned pictographic code points.

Platform guidance supplies standard browser API usage and a few correct Unicode
reference characters, not an app implementation. For an explicit whole-page
replacement, a props-free module with only a default export, React imports and
constant data can be summarized to its export contract after reading the full
file. Props, other exports, other imports and module-level execution retain the
full source. This avoids replaying superseded UI while preserving review and
stale-source protection. Regression validation: 216 tests passed, production
build, eval-script typecheck and Electron desktop smoke test passed. The same
final browser evaluation also passed both cases on `llama3.1:8b` after these changes.

## Implemented in this iteration

- `scripts/acceptance.ts` compiles candidate TypeScript with strict checks and runs test-owned behavior assertions outside the editable workspace. Successful chat text, candidate-authored tests and tool-call formatting cannot substitute for these assertions. Execution uses the existing macOS sandbox with no network or writable project access during verification.
- `scripts/evaluate.mts` runs isolated sum and nullable-string repair cases through local Ollama. The report records model digest, repository revision, dirty state, settings, tool errors, outcome, acceptance result and interventions. A clarification stops the unattended case instead of supplying a helpful answer. Timeout, needs-input and failure are distinct outcomes.
- `shared/completion-evidence.ts` is the single completion policy. Applied edits, a nonempty current source fingerprint, required successful checks with exit code zero, and explicit acceptance on that fingerprint are required for verified completion. A later failed receipt overrides an earlier pass. Successful checks without human acceptance remain unverified.
- `electron/failure-guard.ts` detects three failures of the same tool/category across intervening reads. Changed source snapshots reset the counter. The agent asks for inspection, an alternative approach, or stopping; custom answers remain available in the existing question UI.
- `shared/eval-metrics.ts` distinguishes approvals, human help and runner intervention. Answered runtime clarification questions also create journal intervention events. Automated evals make no manual edits; their zero manual-intervention count does not describe an interactive session.

## Reproduce

Start Ollama and install a tool-capable model, then run:

```sh
npm run eval:local
FORGE_EVAL_MODEL=llama3.1:8b npm run eval:local
npm run typecheck:e2e
npx tsx --test tests/eval-guardrails.test.ts tests/independent-acceptance.test.ts tests/harness-capabilities.test.ts tests/task-workflow.test.ts
```

The default model is `qwen2.5:1.5b`, with temperature 0, 32K context and a three-minute deadline per case. Report: `.forge-test-results/evaluation.json`. Override its path with `FORGE_EVAL_REPORT`. Reports contain transcripts; keep them local unless reviewed. Missing Ollama or a missing model is an unavailable run, never a passing benchmark.

## Quality criteria and remaining work

The target is 9/10 across the following criteria. No overall numerical score is claimed: this iteration does not establish broad coverage or production reliability.

| Criterion | Evidence added | What prevents a 9/10 claim |
| --- | --- | --- |
| Correctness | Negative and positive independent acceptance checks; stale/missing receipt regressions | Only two live TypeScript repair cases; no broad framework benchmark |
| Reliability | Repeated-error question, distinct timeout and assistance outcomes | Failure categories are coarse; edits can reset the budget without semantic progress |
| Modularity | Pure completion policy, error guard, metrics and external verifier | Agent remains about 3,100 lines; App about 1,550 lines |
| Type safety | Strict TypeScript, unused-symbol checks, eval scripts now typechecked | External responses and persisted legacy data need broader schema audits |
| Security | Acceptance outside workspace; isolated execution; existing scoped tools | Sandbox is macOS-only; not a proof against deliberately malicious generated programs |
| Observability | Digest, revision, settings, outcome and intervention accounting | Manual edits outside Forge are not automatically attributable to a person |
| Reproducibility | Fixed fixtures and settings, independent evaluator | Need repeated runs, stable held-out suites and a CI baseline comparison |
| Maintainability | Shared policy replaces duplicated completion checks | Agent routing, execution and recovery still need separate typed modules |

Next steps: extract tool execution and recovery from Agent; add typed run events; introduce held-out React/API/R3F tasks with browser assertions; run repeated seeds/models and publish autonomous completion rate, assistance rate, false-success rate and latency. Gate releases on zero false-success regressions and compare capability scores against a pinned baseline. Do not raise a score by weakening tests or adding benchmark-specific recipes.

## Measured result — 2026-10-24

- Full suite: **172/172 passing**, with a 60-second per-test timeout to expose hangs.
- Production build and eval TypeScript checks: passed.
- New modules: Prettier check passed; `git diff --check` passed.
- Fixed a development-process recovery race: capture the package-manager process identity after startup, when its command/title has stabilized. Recovery and stop tests pass in the full suite.
- Local Ollama `qwen2.5:1.5b`, 32K context, temperature 0: **0/2 autonomous successes**. Sum repair required assistance after repeated absolute workspace paths (51.7s); nullable-label repair required assistance after repeated empty required-check lists (30.8s). No project edits were applied. Both cases stopped through the repeated-error question. No manual answer was supplied and no verified completion was falsely recorded.
- An earlier run produced the same two failure categories. This small sample validates those failure paths, not general model reliability. The initial 8K configuration failed before inference because the prompt exceeded the context budget; it is not a capability result.

The next capability improvement should target valid structured planning and relative file paths, while preserving these failing cases as regressions. A stronger model should be evaluated separately with the same fixtures and policy.

## Follow-up: tool argument reliability

The first failures exposed mismatches between the model-facing contract and the executor:

- Tool schema compaction removed `minItems`, so an empty required-check list was valid to the model but invalid to Zod. Wire schemas now retain their constraints.
- Existing implementation tasks now enter a focused planning step before editing. Planning receives detected validation candidates and preserves the user's actual request as an acceptance criterion.
- Forced JSON generation previously supplied a grammar without descriptions of the selected tools in the conversation. It now also supplies the selected tool definitions, current task and exact-replacement instructions to the model.
- For repairs to explicitly named, fully read files, the harness focuses on `replace_text`. Its path enum contains actual fully read files. Rejected edit paths also trigger this recovery route.
- Local read/edit/validation arguments consistently normalize absolute paths only when they are inside the actual workspace root. No suffix or basename guessing. Source content and SSH paths are not rewritten. Existing path policy still checks symlinks, exclusions and secrets.

Regression tests cover schema constraints, nested edits, root-prefix collisions, traversal, secrets, symlinks, validation paths, initial planning and the recovery schema/instructions. The independent acceptance fixtures and approval policy were not weakened or given task-specific implementations.

For an exact-fragment mismatch in a fully read file of at most 4,000 characters, the harness can offer a reviewed whole-file write. It supplies the current source as untrusted data, retains the original task and preserves normal approval/stale-content checks. It does not perform fuzzy replacement or supply the implementation itself.

Follow-up validation: **177/177 tests pass**, production build and eval-script typecheck pass. On unchanged fixtures and settings, `qwen2.5:1.5b` now completes both tool workflows without human help: planning, file read, write and validation. Independent acceptance passes **1/2**. Sum passes; nullable-label is rejected because the generated implementation throws on null instead of returning an empty string. The latter run recovers from one exact-fragment mismatch through a reviewed whole-file write. This is a behavioral model failure, not a passing task. Neither task receives verified human acceptance automatically.

### Final comparison after focused inspection

Explicit-file repairs now also focus the read step before editing, rather than offering unrelated tools immediately after planning. Both models were tested with the same two independent fixtures, 32K context, temperature 0 and the same approval policy:

| Model | Sum | Nullable label | Tool errors | Human/runner interventions |
| --- | --- | --- | --- | --- |
| qwen2.5:1.5b | Pass, 19.6s | Fail, 17.1s: throws on null | 0 / 1 (exact-fragment recovery) | 0 / 0 |
| llama3.1:8b | Pass, 69.0s | Fail, 49.8s: returns untrimmed strings | 0 / 0 | 0 / 0 |

All four runs plan, read, write and run TypeScript checks. No repeated planning/path failures remain in these observed runs. Neither model solves both behavioral requirements in the nullable-label case; neither failed case is counted as an acceptance success. This is a narrow two-case benchmark, not evidence that argument or behavior errors are eliminated generally. Reports remain local at `.forge-test-results/evaluation.json` and `.forge-test-results/evaluation-llama.json`.
