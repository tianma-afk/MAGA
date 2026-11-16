"""Internal source-selection contract; not part of the public API."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Stage = Literal['scenarios', 'tactics', 'review']


class Source(BaseModel):
    # Do not strip excerpt whitespace: baseline content must remain identical.
    model_config = ConfigDict(extra='forbid', strict=True)
    chapterId: str
    slide: int = Field(ge=1)
    title: str
    source: str


class SourceDiagnostics(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    stage: Stage
    status: Literal['ok', 'empty']
    mode: Literal['baseline', 'normal', 'fallback', 'replay'] = 'baseline'
    reason: str | None = None
    queries: list[str] = Field(default_factory=list)
    stage_times_ms: dict[str, float] = Field(default_factory=dict)
    llm_calls: int = Field(default=0, ge=0)
    model_id: str | None = None
    prompt_version: str | None = None
    usage: dict[str, int | None] = Field(default_factory=dict)
    cost: float | None = None


class SourceSelection(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    sources: list[Source] = Field(max_length=8)
    diagnostics: SourceDiagnostics
