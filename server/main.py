from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from .chapters import ChapterStore
from .llm import ai_answer, ai_enabled
from .models import Chapter, ChapterDetail, ChatRequest, ChatResponse
from .tutor import offline_answer

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def create_app(book_dir: Path | None = None, slides_dir: Path | None = None):
    app = FastAPI(title="Chapter PPT Tutor")
    store = ChapterStore(book_dir or ROOT / "book", slides_dir or ROOT / "data" / "slides")
    app.state.llm_transport = None
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$",
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok", "mode": "ai" if ai_enabled() else "offline"}

    @app.get("/api/chapters", response_model=list[Chapter])
    def chapters():
        return store.list()

    @app.get("/api/chapters/{chapter_id}", response_model=ChapterDetail,
             response_model_exclude_none=True)
    def chapter(chapter_id: str):
        return store.read(chapter_id)

    @app.get("/api/chapters/{chapter_id}/file")
    def original(chapter_id: str):
        path = store.file(chapter_id)
        return FileResponse(
            path, filename=path.name,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )

    @app.get("/api/chapters/{chapter_id}/slides/{number}/image")
    def image(chapter_id: str, number: int):
        chapter = store.read(chapter_id)
        if not 1 <= number <= chapter.slideCount:
            raise HTTPException(404, "Slide not found")
        path = store.image(chapter_id, number)
        if path is None:
            raise HTTPException(404, "Slide image is not available")
        return FileResponse(path, media_type="image/png")

    @app.post("/api/chat", response_model=ChatResponse, response_model_exclude_none=True)
    async def chat(request: ChatRequest):
        chapter = await run_in_threadpool(store.read, request.chapterId)
        if request.slide > chapter.slideCount:
            raise HTTPException(422, "Slide number is outside this chapter")
        if ai_enabled():
            return await ai_answer(chapter, request, app.state.llm_transport)
        return offline_answer(chapter, request)

    return app


app = create_app()
