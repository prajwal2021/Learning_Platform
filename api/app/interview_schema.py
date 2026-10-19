from typing import List

from pydantic import BaseModel, Field, model_validator

LEVELS = ("basic", "intermediate", "advanced")


class Question(BaseModel):
    question: str = Field(min_length=12)
    answer: str = Field(min_length=40)
    real_world: str      # a short real situation where this matters; may be empty
    code_lang: str       # "" when there is no snippet
    code: str            # "" when there is no snippet
    follow_up: str       # what an interviewer might ask next; may be empty

    @model_validator(mode="after")
    def code_pair(self):
        if bool(self.code.strip()) != bool(self.code_lang.strip()):
            raise ValueError("code and code_lang go together")
        return self


class Batch(BaseModel):
    questions: List[Question]


def _s():
    return {"type": "string"}


JSON_SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {
        "type": "object",
        "properties": {k: _s() for k in ("question", "answer", "real_world", "code_lang", "code", "follow_up")},
        "required": ["question", "answer", "real_world", "code_lang", "code", "follow_up"],
        "additionalProperties": False}}},
    "required": ["questions"], "additionalProperties": False,
}
