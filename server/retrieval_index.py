"""Build a persistent slide-level FTS5 + Jina index; run: python -m server.retrieval_index."""
import hashlib
import json
import math
import os
import sqlite3
import time
from pathlib import Path

import httpx

from .chapters import ChapterStore, meaningful_text

ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = ROOT / "data" / "retrieval" / "index.sqlite3"
MODEL = "jina-embeddings-v3"
DIMENSIONS = 1024
ENDPOINT = "https://api.jina.ai/v1/embeddings"


def open_index(path=INDEX_PATH):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS slides (
            doc_id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL, chapter_title TEXT NOT NULL,
            slide INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
            notes TEXT NOT NULL, ocr TEXT NOT NULL, digest TEXT NOT NULL,
            model TEXT NOT NULL, vector TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS slides_fts USING fts5(
            doc_id UNINDEXED, title, body, notes, ocr, tokenize='unicode61'
        );
    """)
    return conn


def jina_embeddings(texts, task, *, api_key=None, transport=None):
    """Return ordered finite vectors. All write batches are validated before commit."""
    if not texts:
        return []
    key = api_key if api_key is not None else os.getenv("JINA_API_KEY", "")
    if not key:
        raise ValueError("JINA_API_KEY is required to generate embeddings")
    body = {
        "model": MODEL, "input": list(texts), "task": task,
        "dimensions": DIMENSIONS, "embedding_type": "float",
        "normalized": True, "truncate": False,
    }
    for attempt in range(3):
        try:
            with httpx.Client(timeout=30, transport=transport) as client:
                response = client.post(ENDPOINT, headers={
                    "Authorization": "Bearer " + key,
                    "Content-Type": "application/json",
                }, json=body)
                response.raise_for_status()
                payload = response.json()
            data = payload["data"]
            if not isinstance(data, list) or len(data) != len(texts):
                raise ValueError("Unexpected Jina embedding response size")
            vectors = [None] * len(texts)
            for item in data:
                idx, vector = item["index"], item["embedding"]
                if (type(idx) is not int or not 0 <= idx < len(texts)
                        or vectors[idx] is not None or not isinstance(vector, list)
                        or len(vector) != DIMENSIONS
                        or any(type(v) not in (int, float) or not math.isfinite(v) for v in vector)):
                    raise ValueError("Invalid Jina embedding vector")
                vectors[idx] = vector
            if any(v is None for v in vectors):
                raise ValueError("Incomplete Jina embeddings")
            return vectors
        except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
            retry = (not isinstance(exc, httpx.HTTPStatusError)
                     or exc.response.status_code in (408, 429)
                     or exc.response.status_code >= 500)
            if not retry or attempt == 2:
                raise
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError("Unreachable embedding retry")


def slide_rows(store):
    for chapter_id in store.files():
        chapter = store.read(chapter_id)
        for slide in chapter.slides:
            body = meaningful_text(slide.text)
            ocr = slide.ocrText or ""
            content = "\n".join((slide.title, body, slide.notes, ocr))
            yield {
                "doc_id": f"{chapter_id}:{slide.number}",
                "chapter_id": chapter_id, "chapter_title": chapter.title,
                "slide": slide.number, "title": slide.title, "body": body,
                "notes": slide.notes, "ocr": ocr,
                "digest": hashlib.sha256(content.encode("utf-8")).hexdigest(),
                "content": content,
            }


def rebuild(store, *, path=INDEX_PATH, embed=jina_embeddings):
    """Incrementally update changed slides and delete removed slides."""
    with open_index(path) as conn:
        source_rows = list(slide_rows(store))
        known = {doc_id: (digest, model) for doc_id, digest, model in conn.execute(
            "SELECT doc_id,digest,model FROM slides")}
        incoming = {row["doc_id"] for row in source_rows}
        deleted = set(known) - incoming
        changed = [row for row in source_rows if
                   known.get(row["doc_id"]) != (row["digest"], MODEL)]
        vectors = []
        for start in range(0, len(changed), 16):
            vectors.extend(embed([r["content"][:12000] for r in changed[start:start + 16]],
                                 "retrieval.passage"))
        for doc_id in deleted | {r["doc_id"] for r in changed}:
            conn.execute("DELETE FROM slides_fts WHERE doc_id=?", (doc_id,))
            conn.execute("DELETE FROM slides WHERE doc_id=?", (doc_id,))
        for row, vector in zip(changed, vectors):
            conn.execute("""INSERT INTO slides
                (doc_id,chapter_id,chapter_title,slide,title,body,notes,ocr,digest,model,vector)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (row["doc_id"], row["chapter_id"], row["chapter_title"], row["slide"],
                 row["title"], row["body"], row["notes"], row["ocr"], row["digest"],
                 MODEL, json.dumps(vector, separators=(",", ":"))))
            conn.execute("INSERT INTO slides_fts (doc_id,title,body,notes,ocr) VALUES (?,?,?,?,?)",
                         (row["doc_id"], row["title"], row["body"], row["notes"], row["ocr"]))
        return {"total": len(source_rows), "updated": len(changed), "deleted": len(deleted)}


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    print(rebuild(ChapterStore(ROOT / "book", ROOT / "data" / "slides")))
