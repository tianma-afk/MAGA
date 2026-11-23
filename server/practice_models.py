"""Strict contracts for stateless, bounded case-based practice."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .models import RetrievalStrategy, DesignCitation


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class KnowledgeReceipt(Strict):
    strategy: RetrievalStrategy
    queries: list[str] = Field(max_length=3)
    citations: list[DesignCitation] = Field(max_length=8)


class PracticePlanRequest(Strict):
    caseId: str = Field(min_length=1, max_length=80)
    analysis: str = Field(min_length=20, max_length=4000)
    retrievalStrategy: RetrievalStrategy = "baseline"


class PracticeQuestion(Strict):
    id: str = Field(min_length=1, max_length=60)
    question: str = Field(min_length=15, max_length=1000)
    citations: list[DesignCitation] = Field(default_factory=list, max_length=4)


class PracticePlanAnswer(Strict):
    decisions: list[PracticeQuestion] = Field(min_length=3, max_length=3)


class PracticePlanResponse(PracticePlanAnswer):
    knowledge: KnowledgeReceipt


class PracticeTurn(Strict):
    question: str = Field(min_length=15, max_length=1000)
    answer: str = Field(min_length=20, max_length=4000)


class PracticeAnswerRequest(Strict):
    caseId: str = Field(min_length=1, max_length=80)
    analysis: str = Field(min_length=20, max_length=4000)
    retrievalStrategy: RetrievalStrategy = "baseline"
    decision: PracticeQuestion
    turns: list[PracticeTurn] = Field(min_length=1, max_length=3)


class PracticeAnswerDraft(Strict):
    action: Literal["followup", "complete"]
    feedback: str = Field(min_length=10, max_length=1600)
    followup: str | None = Field(default=None, max_length=1000)
    citations: list[DesignCitation] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def consistent(self):
        if self.action == "followup" and (not self.followup or len(self.followup) < 15):
            raise ValueError("Follow-up question missing")
        if self.action == "complete" and self.followup is not None:
            raise ValueError("Completed assessment cannot include follow-up")
        return self


class PracticeAnswerResponse(PracticeAnswerDraft):
    knowledge: KnowledgeReceipt


class PracticeDecisionRecord(Strict):
    decision: PracticeQuestion
    turns: list[PracticeTurn] = Field(min_length=1, max_length=3)
    assessment: PracticeAnswerDraft

    @model_validator(mode="after")
    def closed(self):
        if self.assessment.action != "complete":
            raise ValueError("Decision assessment must be complete")
        if self.turns[0].question != self.decision.question:
            raise ValueError("First response must answer initial question")
        return self


class PracticeFinalRequest(Strict):
    caseId: str = Field(min_length=1, max_length=80)
    analysis: str = Field(min_length=20, max_length=4000)
    retrievalStrategy: RetrievalStrategy = "baseline"
    decisions: list[PracticeDecisionRecord] = Field(min_length=3, max_length=3)


class PracticeFinalAnswer(Strict):
    summary: str = Field(min_length=20, max_length=2200)
    strengths: list[str] = Field(min_length=1, max_length=5)
    improvements: list[str] = Field(min_length=1, max_length=5)
    referenceApproach: str = Field(min_length=20, max_length=3500)
    citations: list[DesignCitation] = Field(default_factory=list, max_length=6)


class PracticeFinalResponse(PracticeFinalAnswer):
    knowledge: KnowledgeReceipt
