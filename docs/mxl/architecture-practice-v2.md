# Architecture Practice v2 — case-driven RAG decision training

Date: 2026-11-23. Target branch: `feature/mxl-hybrid-retrieval`. **This design was committed before implementation.**

## 1. Problem and learning objective

The existing `DesignStudio` collects an unrestricted project description, then has AI produce quality-attribute scenarios and tactics. This assesses prompt-writing more than learner-led architecture reasoning. Replace the visible /studio route with **predefined case → learner's independent requirement analysis → three architecture decision questions → per-answer targeted follow-ups and bounded feedback → comparative final review**. No diagrams, code implementation, or detailed interface contracts are required. Assess interpretation, decision quality, alternatives, tradeoffs and response to changes, not one supposedly correct architecture.

Predefine three realistic, bounded cases: campus event booking (high-contention quota & notification), online examination (availability, submission idempotency, degraded mode) and media search service (index/data consistency, throughput, evolution). Each case contains business background, functional requirements, explicit constraints, and **three fixed assessment objectives** with rubrics and desired architectural reasoning. Users choose a case and state extra constraints, risks and assumptions before AI generates questions. AI cannot substitute random new objectives for those authored in the case.

## 2. Fixed workflow, no autonomous agent

```
case selection (GET /api/practice/cases)
  ↓ learner independent requirements analysis
POST /api/practice/plan → LLM structured English queries → selected course retrieval
  → LLM three decision questions, one per predefined objective → validate citations
  ↓ for each decision
POST /api/practice/answer(answer, prior turns, objective)
  → LLM stage-aware English queries → course retrieval (reuse source contract)
  → LLM choose targeted follow-up OR finish bounded assessment
  → at most TWO follow-ups per decision; first independent answer retained
  → do not display model reference answer before case completion
  ↓ all decisions closed
POST /api/practice/finalize → LLM English queries → selected course retrieval
  → LLM structured overall review and comparison, citations verified
  ↓ view result and original answer history
```

Fixed controller makes all transitions deterministic; model outputs content and a `follow_up` / `complete` recommendation, but programmatic round limits determine whether the stage may end. Retrying a failed request must not advance the UI state. The client stores the session locally under a new versioned key. Server remains stateless and validates input payload bounds. On changing case, clear downstream questions and assessment. On changing retrieval mode after planning, do not silently switch the source provenance of an ongoing session: reset before entering a new practice.

## 3. Retrieval boundary and knowledge insertion

Each of **plan**, **answer** (including each follow-up), and **finalize** starts with a model call producing 1–3 **English** search queries, bounded length, structurally validated (no URLs, fabricated pages). Stage-specific prompts generate queries about decision principles and lecture topics rather than dumping an entire Chinese case description. Query step and teaching step are separate model calls. This applies even if learner selects baseline.

Introduce `server/practice_knowledge.py` with `retrieve(store, queries, strategy, transport)`:
- `baseline`: first generated English query through existing `legacy_sources` lexical API.
- `llm_assisted`: multi-query lexical retrieval; round-robin merge with dedupe.
- `hybrid`: multi-query `hybrid_search` (existing FTS5 BM25=0.2 + Jina embedding=0.5), round-robin merge. Selecting hybrid uses existing `useRetrievalIndex` automatic index preparation gate; no user-run CLI required.
- Result set capped at 8 verified original `chapterId/slide/title/excerpt` sources by existing `validate_selection`. Do not reuse an untrusted LLM-supplied reference as a source. Failure of hybrid must remain explicit 503 rather than pretend hybrid succeeded.
- The structured LLM outputs carry 0–4 citations, which are canonicalized against the supplied sources and must not fabricate a page. If none is relevant, output empty citations and explicitly distinguish unsupported engineering reasoning from directly evidenced course claims.
- Query, strategy, sources for each step attached to a `knowledge` receipt (query strings and citation handles, not full excerpts) for auditing. Respect context budget: source excerpts truncated for prompt; validate source identity against original untruncated records.

Do not let learner see private rubric or model reference answers before answering. Prompt injection boundary: course PPT and user answers are *untrusted data*, not executable instructions. AI feedback not an objective exam grade; distinguish initial independent reasoning from follow-up correction. Persist original response separately from follow-up responses.

## 4. Modules, API, data contract

- `server/practice_cases.py` — curated immutable scenario content and authored objectives.
- `server/practice_models.py` — Pydantic bounded requests/responses: case, decision (id, question, objective), turn, evaluation, references, final report; constraints prevent unbounded history/context.
- `server/practice_knowledge.py` — English query planner + strategy retrieval + source verification; reuse `server/design.py::_complete_json`, `design_sources.legacy_sources/validate_selection`, and `hybrid_search.hybrid_search`.
- `server/practice.py` — fixed asynchronous `plan / answer / finalize` orchestration; strict stage schema and verified citations; no arbitrary tool loop or server-side session global.
- `server/main.py` — four new endpoints (case list, plan, answer, finalize). Legacy `/api/design/*` kept for backward compatibility and tests; /studio changes to v2.
- `web/src/practice.ts` — type definitions, versioned localStorage + recovery checks, import/export.
- `web/src/PracticeStudio.tsx` — selection, independent analysis, per-question answer, round history, final review, course citations; reuses `DesignRetrievalMode` and `useRetrievalIndex`. Avoid editing the existing 477-line `DesignStudio.tsx` and breaking old draft format. No code editor or drawing canvas.
- `web/src/api.ts` — typed practice endpoints, simple response validation.
- `web/src/App.tsx` — change /studio view to new practice; original legacy component and exports can remain while migrating.

State machine:
`selecting → analysis → decisions → ready_review → finished`.
`Decision`: `prompt`, `turns` (first is independent answer), `feedback`, `closed`, `sources`.
A server answer response contains a complete decision evaluation only when closed; else contains **one** next follow-up. At most two follow-ups. After review, read-only until reset.

## 5. Validation and operational risk

Automated tests must cover: three cases; English query validation; per-mode retrieval dispatch; forged citations; bounded follow-ups; no accidental answer leakage; final review only after all decision points; API validation; UI case selection, local save/resume, hybrid index block, error retry, source preview, and reset. Run existing backend/frontend and file-length checks. Avoid real LLM/Jina calls in CI: inject `httpx.MockTransport` or patch retrieval.

Risks: (1) extra LLM planning call at each stage increases latency/cost, (2) small PPT corpus may not support all relevant engineering conclusions, (3) no cross-device session sync, (4) scores are formative and model-generated. Report empirical evidence separately from planned tests.

## 6. Work log

- [x] Audited actual branch implementations: `hybrid_search.py`, `retrieval_index.py`, `design_sources.py`, existing practice UI/API; retained original legacy interfaces.
- [x] Authored this architecture/design record **before any practice code changes**.
- [ ] Implement backend and tests.
- [ ] Implement frontend and tests.
- [ ] Execute CI / test commands; record actual results and any remaining limitations.
