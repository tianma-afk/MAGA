# Chapter Tutor Implementation Plan

**Goal:** Deliver a runnable chapter-scoped learning workspace using the real PPT files.

**Architecture:** Modular FastAPI backend and React frontend, joined by a small JSON API.
Document extraction is local; model calls are optional and server-side.

**Spec:** ../spec/chapter-tutor.md

## Constraints

- Every authored code file is at most 500 lines.
- Preserve original book files and unrelated changes.
- Distinguish local reading from model-backed tutoring.
- Keep chapter messages and slide position isolated and persistent.

## Work Packages

- [x] Backend agent: first test real PPT loading, page validation and offline teaching;
  implement catalog, model adapter and HTTP endpoints; run full backend tests.
- [x] Frontend agent: first test conversation persistence and isolation; implement
  chapter sidebar, chat composer, citations, slide pane and diagram pane; build and test.
- [x] Rendering agent: inspect local conversion capabilities; implement safe PPT
  export and source line-limit checker; verify using real materials.
- [x] Integrator: document architecture and environment configuration; verify API
  contracts, run suites, inspect desktop/mobile UI, and start local services.

## Review Focus

1. Chapter switch while a reply is pending must not mix histories.
2. Invalid slide references and model outputs must not navigate out of bounds.
3. Missing model credentials must be visible, not hidden by simulated AI.
4. Missing rendered PNGs must have an honest and useful text fallback.
5. Broken storage or upstream network errors must not make the workspace unusable.

## Verification Commands

```powershell
python -m pytest server/tests -q
npm --prefix web test -- --run
npm --prefix web run build
node scripts/check-file-lengths.mjs
```
