# MAGA Hybrid Retrieval: design and work log

Date: 2026-11-23. Branch: `feature/mxl-hybrid-retrieval`. Status: **planned; implementation not yet verified**.

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
