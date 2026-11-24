# MAGA Hybrid Retrieval: design and work log

Date: 2026-11-23. Branch: `feature/mxl-hybrid-retrieval`. **Historical design snapshot**: the original planning state below was recorded *before implementation*; it is not the current delivery status.

**Current status (2026-11-24): implemented and automatically tested.** The explicit Hybrid selector, incremental SQLite FTS5/Jina index, automatic index preparation and practice integration are present on this branch. The most recent code CI [45312834087](https://github.com/tianma-afk/MAGA/actions/runs/45312834087) passed (backend 268, frontend 162, E2E 27). No live Jina credentials/model quality measurements have been verified. For authoritative as-built behavior use [retrieval-implementation.md](retrieval-implementation.md), [repository-status.md](repository-status.md), and [validation-and-risks.md](validation-and-risks.md).

> **Historical decisions superseded by implementation:** the early plan proposed a lexical fallback on Jina/index failures and a manual offline index prerequisite. Current **explicit Hybrid** behavior instead returns a visible 503 on failure and automatically prepares the index when the mode is selected. The global `GET /api/search` remains lexical. The original checklist below is retained as planning evidence, not current open tasks.

## Scope and precedent

Reviewed BatMem (`scutll/BatMem`): `src/storage/database.ts` uses persistent SQLite FTS5 and embedding records, `src/retrieval/recall/bm25-embedding.ts` dispatches two recall paths, `src/models/embedding/jina.ts` uses Jina `jina-embeddings-v3` with separate `retrieval.passage` and `retrieval.query` tasks, and `src/retrieval/processors/rrf-rerank-blend.ts` merges/reranks. MAGA currently scans PPT pages in `search_all`; chapter parsing is memory cached but OCR text files are reread and scores recomputed. MAGA practice `design_sources.py` uses the existing search API and must keep the true-page contract.

Do **not** copy BatMem's Node/sqlite-vec infrastructure or rerank requirement: MAGA is a Python/FastAPI single-user course assistant with ~340 slides. Use standard-library SQLite FTS5 and stored vectors, with exact cosine similarity for this small corpus. Adopt the storage/retrieval/fusion separation.

## Behavioral contract

- Index unit: **one slide**; `doc_id = chapterId:slideNumber`. Store true title, body, notes, OCR, page and chapter metadata. Never claim embedded pictures or visual relationships were understood.
- Offline `python -m server.retrieval_index` builds/refreshes an index in ignored `data/retrieval/index.sqlite3`. Index only current files. Rebuild when PPT/OCR/analysis-model identity changes. The index may be fully regenerated deterministically for v1; document-build is not a query-time task.
- FTS5 (Unicode tokenizer) supplies English-query BM25. Stored normalized Jina passage embeddings supply cosine scores. Do not regenerate slide embeddings for each query. Query embedding uses `retrieval.query`.
- English query: when the query already contains only ASCII/English language text, use it unchanged; when Chinese is present and the configured LLM is available, request a brief English search translation. Keep original source text untouched. An LLM-translation failure **does not silently claim English**: fall back to existing bilingual lexical search and label the path in diagnostics where feasible. Do not force an LLM key on the existing unauthenticated cross-chapter search.
- Fusion: normalize each lane **per query/candidate set** into [0,1] and compute `0.5 * embedding + 0.2 * bm25`. The unallocated `0.3` is **reserved** (not redistributed and not silently assigned to a reranker); rankings are equivalent to a 5:2 ratio. Missing lane contribution = 0. Scores returned through existing `SearchResult` contract are scaled positive integers for compatibility.
- Failure behavior: absent Jina key/index or Jina/API failure uses current `search_all` lexical behavior rather than breaking existing tests; never write credentials to artifacts. Do not let untrusted embedding payloads invent chapter/page references.
- Existing practice Baseline vs optional LLM planner remains intact; both strategies consume `search_all` output. Preserve citation canonicalization, 8-source cap, and old error behavior. Original PPT page validation stays authoritative.
- Free-key onboarding: add `JINA_API_KEY=` to `.env.example`, link to Jina dashboard in README, explain that live API calls consume free-tier quota and are not guaranteed unlimited.

## Implementation order

1. [x] Read BatMem's FTS5, Jina embedding adapter, recall and blend design; inspect MAGA existing parser, search, models and API.
2. [x] Write this plan and retrieval specification under `docs/mxl/` **before modifying production code**.
3. [ ] Implement persistent indexing and Jina client, English-query handling and hybrid fusion.
4. [ ] Wire search without altering response schemas or architecture-practice strategy semantics.
5. [ ] Add offline deterministic tests (mock Jina/translation), regression tests and README instructions.
6. [ ] Run backend tests, front-end tests/build and repository file-length checks; record executed outputs and residual risks below.

## Test results and limitations

GitHub Actions run **45191068924**, PR #3 revision `9b36bc1` (2026-11-23): **backend 252 passed** (one upstream deprecation warning), **frontend 152 passed** in 21 files; TypeScript/Vite production build **passed**; line-length checker and its tests **passed**; **25 browser E2E passed**. This validates the revised index connection handling and the added missing-index / one-slide reindex tests. No real Jina requests were made by the test suite.

Implementation limits: manually run index build after editing source PPT/OCR; no automated filesystem watch or current-source hash comparison on query. The stored embeddings must therefore be refreshed after edits. Jina model API connectivity and real free-tier quota not tested (no key accessed). Jina embeddings on the small ~340-page corpus are scanned in SQLite to calculate exact cosine, not ANN; this is deliberately simpler than BatMem's sqlite-vec. Optional English translation uses the configured LLM for Chinese queries and otherwise reverts to original lexical search; absence of API credentials does not block offline learning/search. Client request score remains a positive integer for compatibility, so absolute scores cannot be interpreted as a calibrated probability. No benchmark demonstrating throughput or relevance gains has yet been run.


## 2026-11-23 — Architecture Practice RAG selector integration

New requirement: make RAG an **explicit** option in the architecture practice screen; do not create another PR. GitHub working branch remains `feature/mxl-hybrid-retrieval`.

- Existing modes `baseline` and `llm_assisted` are retained. Add `hybrid` to the frontend selector and strict backend request schema; the UI sends this value to scenarios, tactics and review.
- Remove the previous implicit `JINA_API_KEY` switch inside global `search_all()`. Cross-chapter search and existing LLM-assisted planner therefore continue using the original search behavior. Only explicit `hybrid` invokes the persisted index.
- The explicit hybrid path retrieves Top-8 indexed slide IDs, loads canonical original slide text, and passes the existing `validate_selection()` source integrity contract. If the index, translation or Jina API is unavailable, return sanitized HTTP 503 `RAG_UNAVAILABLE`, **not** an invisible downgrade to baseline.
- API frontend reports a specific RAG setup error. The selector does not persist across reloads, matching preexisting behavior.
- Add browser-component tests for all three stage requests, client error handling, and backend source-selection tests including the 503 failure case.
- This change does **not** auto-build the index, verify real Jina credentials, or independently benchmark relevance; those remain follow-up work.

## 2026-11-23 — Automatic index readiness on selecting Hybrid RAG (implementation plan)

Requirement: selecting **RAG 混合检索** in the architecture-practice UI must **check/build/update the index automatically**, and **no design-generation stage can run until success**. End users must not need to run `python -m server.retrieval_index`.

Design before code:
1. POST `/api/retrieval/index/ensure` checks `JINA_API_KEY` and invokes the existing `rebuild(store)` in a worker thread with a per-app asynchronous lock, avoiding concurrent builds. `rebuild()` retains/updates unchanged slide embeddings and transactionally replaces changed entries. Return bounded `{status:'ready',total,updated,deleted}`. Map missing key/upstream/index errors to sanitized HTTP 503 `RAG_INDEX_UNAVAILABLE`. Empty source corpus must not be reported ready.
2. Frontend API exposes `ensureRetrievalIndex(signal)` and translates the known error code into an actionable message.
3. When the selector changes to `hybrid`, initiate POST immediately and show an explicit `building` state; block **all three** generation buttons, request handlers, and confirmation while not ready. On success show ready counts; on error keep hybrid selected but blocked and provide a retry button. Switching away / unmount aborts client requests and discards stale completions. Selection remains session-local as before.
4. Existing `hybrid_search()` still validates index existence/credentials when invoked by API without a prior UI selection; no implicit fallback. The index refresh is a UI activation operation, not a side effect of every query.
5. Add backend endpoint tests including idempotence/error, and React tests for pending/success/failure/retry/race behavior. Run CI on final revision; live Jina key remains unverified in offline tests.

## Automatic indexing implementation and validation

Implemented `POST /api/retrieval/index/ensure` with a per-FastAPI-app lock, missing-key validation, synchronous readiness response after incremental `rebuild(store)`, empty-index rejection and sanitized 503 diagnostics. The frontend `useRetrievalIndex` hook prepares the index immediately on selecting `hybrid`, blocks all three generation stages during pending/error states, exposes count and retry, and rejects late completions after a selection change. The API does not claim readiness until index build has committed.

CI run [45200002937](https://github.com/tianma-afk/MAGA/actions/runs/45200002937), code revision `9d12bf3`, **all jobs passed**: backend **260 passed**; frontend **156 passed** in 21 test files and production build passed; **25 browser E2E passed**; repository file-length checks passed. These are deterministic tests, with Jina mocked rather than live network credentials.

**Operational boundaries:** selecting hybrid may wait for multiple Jina passage embedding batches on the first use, and it sends course text to Jina. Aborted browser requests do not forcibly cancel an already running server-side build; the server lock serializes concurrent ensure requests and the next attempt can reuse the committed index. Progress is exposed as a building/ready/failed status, not a per-slide percentage. A valid Jina key and external model connectivity still require live user-environment validation.
