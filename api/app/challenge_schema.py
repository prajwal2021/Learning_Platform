"""The shape of a challenge, used to ask the model for it (strict JSON schema) and to check what comes back."""
import re
from typing import List

from pydantic import BaseModel, Field, model_validator


class Concept(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9-]{2,30}$")
    name: str
    summary: str      # what it is, two sentences at most
    used_here: str    # what it does in this scenario, one sentence


class Option(BaseModel):
    text: str
    correct: bool
    hint: str         # shown under a wrong pick; empty for the right one


class Step(BaseModel):
    title: str
    question: str
    concept_keys: List[str]
    options: List[Option]
    explanation: str  # the reasoning, shown after the right pick

    @model_validator(mode="after")
    def one_right(self):
        if len(self.options) != 4:
            raise ValueError("a step needs exactly 4 options")
        if sum(o.correct for o in self.options) != 1:
            raise ValueError("a step needs exactly 1 correct option")
        for o in self.options:
            if not o.correct and len(o.hint.strip()) < 10:
                raise ValueError("every wrong option needs a hint")
        return self


class ChallengeDoc(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{3,60}$")
    title: str
    difficulty: str = Field(pattern=r"^(easy|medium|hard)$")
    est_minutes: int = Field(ge=3, le=40)
    tags: List[str]
    scenario: str
    goal: str
    concepts: List[Concept]
    steps: List[Step]
    takeaway: str

    @model_validator(mode="after")
    def consistent(self):
        if not 5 <= len(self.steps) <= 8:
            raise ValueError("5 to 8 steps")
        keys = {c.key for c in self.concepts}
        if len(keys) != len(self.concepts):
            raise ValueError("duplicate concept keys")
        for s in self.steps:
            missing = [k for k in s.concept_keys if k not in keys]
            if missing:
                raise ValueError(f"step uses unknown concepts {missing}")
        return self


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


_S = {"type": "string"}
# Hand-written because the strict structured-output mode wants every field required and no extras.
JSON_SCHEMA = _obj({
    "slug": _S, "title": _S, "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
    "est_minutes": {"type": "integer"}, "tags": {"type": "array", "items": _S},
    "scenario": _S, "goal": _S,
    "concepts": {"type": "array", "items": _obj({"key": _S, "name": _S, "summary": _S, "used_here": _S})},
    "steps": {"type": "array", "items": _obj({
        "title": _S, "question": _S, "concept_keys": {"type": "array", "items": _S},
        "options": {"type": "array", "items": _obj({"text": _S, "correct": {"type": "boolean"}, "hint": _S})},
        "explanation": _S,
    })},
    "takeaway": _S,
})
