from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Slide(StrictModel):
    number: int
    title: str
    text: str
    notes: str
    imageUrl: str | None = None
    ocrText: str | None = None


class Chapter(StrictModel):
    id: str
    title: str
    filename: str
    slideCount: int


class ChapterDetail(Chapter):
    slides: list[Slide]


class HistoryMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(StrictModel):
    chapterId: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    message: str = Field(min_length=1, max_length=8000)
    slide: int = Field(ge=1, strict=True)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=30)

    @field_validator("history")
    @classmethod
    def bound_history(cls, value):
        if sum(len(message.content) for message in value) > 32000:
            raise ValueError("History exceeds 32000 characters")
        return value


class Citation(StrictModel):
    slide: int = Field(ge=1, strict=True)
    title: str = Field(max_length=500)


class Node(StrictModel):
    id: str = Field(min_length=1, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=160)


class Edge(StrictModel):
    source: str = Field(min_length=1, max_length=50)
    target: str = Field(min_length=1, max_length=50)
    label: str | None = Field(default=None, max_length=120)


class Diagram(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    nodes: list[Node] = Field(min_length=2, max_length=12)
    edges: list[Edge] = Field(min_length=1, max_length=24)

    @model_validator(mode="after")
    def valid_graph(self):
        ids = {node.id for node in self.nodes}
        if len(ids) != len(self.nodes):
            raise ValueError("Diagram node IDs must be unique")
        if any(edge.source not in ids or edge.target not in ids for edge in self.edges):
            raise ValueError("Diagram edges must reference existing nodes")
        return self


class TutorAnswer(StrictModel):
    content: str = Field(min_length=1, max_length=16000)
    slide: int = Field(ge=1, strict=True)
    citations: list[Citation] = Field(max_length=8)
    diagram: Diagram | None = None


class ChatResponse(TutorAnswer):
    mode: Literal["ai"]


class QuizRequest(StrictModel):
    chapterId: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    slide: int = Field(ge=1, strict=True)


class QuizQuestion(StrictModel):
    question: str = Field(min_length=1, max_length=600)
    options: list[str] = Field(min_length=2, max_length=6)
    correctIndex: int = Field(ge=0, strict=True)
    explanation: str = Field(min_length=1, max_length=2000)
    citations: list[Citation] = Field(min_length=1, max_length=4)

    @field_validator("options")
    @classmethod
    def valid_options(cls, value):
        if any(not option or len(option) > 300 for option in value):
            raise ValueError("Quiz options must be non-empty and <= 300 characters")
        if len(set(value)) != len(value):
            raise ValueError("Quiz options must be unique")
        return value

    @model_validator(mode="after")
    def index_in_range(self):
        if self.correctIndex >= len(self.options):
            raise ValueError("correctIndex must reference an option")
        return self


class QuizAnswer(StrictModel):
    questions: list[QuizQuestion] = Field(min_length=3, max_length=5)


class QuizResponse(QuizAnswer):
    mode: Literal["ai"]


class SearchResult(StrictModel):
    chapterId: str
    chapterTitle: str
    slide: int = Field(ge=1, strict=True)
    slideTitle: str
    snippet: str
    score: int = Field(ge=1, strict=True)


class SearchResponse(StrictModel):
    query: str
    results: list[SearchResult]
