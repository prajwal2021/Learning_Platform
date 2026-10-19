"""Writes challenges with the OpenAI API (offline, by an operator; learners never trigger a model call).

    python -m app.cli generate-challenge --all            every topic in seed/challenge_topics.json
    python -m app.cli generate-challenge <slug>           one topic

Each result is checked against ChallengeDoc, then reviewed by a second model call that looks for steps with
two defensible answers or a wrong "right" answer. Output goes to seed/challenges/<slug>.json for you to read
before publishing with `python -m app.cli seed`.
"""
import json
import re
import random
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from .challenge_schema import JSON_SCHEMA, ChallengeDoc
from .config import settings

SYSTEM = """You write interactive system design debugging challenges for software engineers who are learning.

A challenge is a short real-world incident. The learner works through it one multiple choice step at a time, the way a
good engineer debugs: where do I look first, what does that tell me, what is the root cause, what is the fix, how do I
make the fix safe, how do I confirm it worked.

Rules:
- 5 to 7 steps. Each step has exactly 4 options and exactly 1 correct option. Wrong options must be tempting and
  plausible (things real engineers actually try), never silly. Make the options similar in length so length does not
  give the answer away. Put the correct option in any position.
- Every wrong option has a `hint`: one or two sentences that point the learner toward the right idea WITHOUT stating
  the right answer and without saying which option is right. The correct option has an empty hint.
- `explanation` is shown after the right pick: 2 to 4 sentences of reasoning. Say why the right option works and why
  the most tempting wrong one does not. Use the numbers from the scenario where they matter.
- Later steps must build on earlier ones (the learner has just discovered the earlier answers). Do not reveal later
  answers in earlier questions, options or hints.
- `concepts` is the glossary shown beside the question: every technology or idea a step mentions (for example redis,
  ttl, cache-invalidation, search-index, outbox). `summary` explains it in plain words in two sentences at most, as if
  to someone who has never used it. `used_here` says what it does in THIS scenario. Reference them from each step in
  `concept_keys` (lowercase, hyphenated keys).
- Answers must be correct for production, not just plausible. If a fix emits an event after a database write, the right
  option must say the event is recorded in the same transaction as the write (an outbox) or is otherwise not lost. A
  mechanism whose own timing contradicts the target (a 30 s refresh cannot give a 5 s guarantee) is never a right answer.
- Keep each step's question and options self-contained. Do not name a technique in an earlier question or option that
  a later step is meant to discover.
- Write plain, direct sentences. No marketing tone, no emoji, no filler. Use real numbers.
- Technical claims must be correct. If a number in the scenario implies an answer (for example 60 s + 30 s = 90 s),
  make sure the arithmetic and the mechanism are right.
- `slug` is the one given. `difficulty` is easy, medium or hard. `est_minutes` is 5 to 15.
- The scenario is one paragraph in plain text. `goal` is one sentence stating the target.
- `takeaway` is 2 to 3 sentences the learner should remember next time.
"""

REVIEW = """You are a strict reviewer of a system design challenge written as JSON. Check, step by step:
1. Is the option marked correct really the best answer, and is each wrong option really worse (not equally valid)?
2. Do any hints give away the correct answer or contradict it?
3. Is any technical claim wrong, or any arithmetic off?
4. Does any earlier question, option or hint reveal a later answer?
Reply with JSON {"ok": boolean, "issues": [string]}. List concrete issues only, each naming the step number (from 1)."""


def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY is not set (put it in the project's .env)")
    return OpenAI(api_key=settings.openai_api_key)


def _generate(client: OpenAI, topic: dict, issues: list[str] | None) -> dict:
    user = (f"Slug: {topic['slug']}\nTitle idea: {topic['title']}\n\nIncident:\n{topic['brief']}\n\n"
            f"What a strong answer covers (use this to decide the correct options; do not copy it word for word):\n"
            f"{topic['insight']}")
    if issues:
        user += "\n\nA reviewer found these problems with your previous attempt. Fix all of them:\n- " + "\n- ".join(issues)
    r = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        response_format={"type": "json_schema", "json_schema": {"name": "challenge", "strict": True, "schema": JSON_SCHEMA}},
    )
    return json.loads(r.choices[0].message.content)


def _review(client: OpenAI, doc: dict) -> list[str]:
    r = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "system", "content": REVIEW}, {"role": "user", "content": json.dumps(doc)}],
        response_format={"type": "json_schema", "json_schema": {"name": "review", "strict": True, "schema": {
            "type": "object", "properties": {"ok": {"type": "boolean"}, "issues": {"type": "array", "items": {"type": "string"}}},
            "required": ["ok", "issues"], "additionalProperties": False}}},
    )
    out = json.loads(r.choices[0].message.content)
    return [] if out["ok"] else out["issues"]


def _shuffle_and_letter(doc: dict) -> dict:
    """Models tend to put the right answer in the same place. Shuffle options with a fixed seed and label them a-d."""
    rng = random.Random(doc["slug"])
    for step in doc["steps"]:
        rng.shuffle(step["options"])
        for i, o in enumerate(step["options"]):
            o["id"] = "abcd"[i]
            if o["correct"]:
                o["hint"] = ""
    return doc


def make(topic: dict, out_dir: Path, tries: int = 3) -> Path:
    client = _client()
    issues: list[str] | None = None
    raw, valid = None, False
    for attempt in range(1, tries + 1):
        raw = _generate(client, topic, issues)
        raw["slug"] = topic["slug"]
        try:
            ChallengeDoc.model_validate(raw)
            valid = True
        except ValidationError as e:
            valid = False
            issues = [f"schema: {err['msg']}" for err in e.errors()]
            print(f"  attempt {attempt}: invalid ({issues[0]})")
            continue
        found = _review(client, raw)
        if not found:
            issues = None
            break
        print(f"  attempt {attempt}: reviewer found {len(found)} issue(s)")
        issues = found
    if not valid:
        raise SystemExit(f"{topic['slug']}: no valid challenge after {tries} attempts")
    doc = _shuffle_and_letter(raw)
    doc["review_issues"] = issues or []  # non-empty means the reviewer still disagreed on the last attempt
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{topic['slug']}.json"
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False))
    return path


SUGGEST = """You design system design debugging incidents for a practice site. Propose new incidents.

Each has:
- slug: lowercase hyphenated, short, unique
- title: a vivid one-line symptom as an engineer would first see it (not the cause)
- brief: 2 to 4 sentences of scenario with concrete numbers (traffic, TTLs, sizes, timings) and what is going wrong
- insight: what a strong answer covers: the root cause, the fix, what NOT to do, and trade-offs. Be technically exact.

Spread them across areas: caching, queues and async work, databases and indexing, transactions and consistency, replication,
sharding, search, rate limiting and abuse, real-time systems, payments and idempotency, deploys and rollbacks, observability,
multi-region and failover, file uploads and storage, scheduling, auth and sessions, API design and versioning, cost and capacity.
Vary difficulty. Each incident must have one clear best answer that an expert would agree on."""


def suggest(count: int, existing: list[dict]) -> list[dict]:
    client = _client()
    schema = {"type": "object", "properties": {"topics": {"type": "array", "items": {
        "type": "object", "properties": {k: {"type": "string"} for k in ("slug", "title", "brief", "insight")},
        "required": ["slug", "title", "brief", "insight"], "additionalProperties": False}}},
        "required": ["topics"], "additionalProperties": False}
    have = "\n".join(f"- {t['slug']}: {t['title']}" for t in existing)
    r = client.chat.completions.create(
        model=settings.openai_model,
        messages=[{"role": "system", "content": SUGGEST},
                  {"role": "user", "content": f"Propose {count} new incidents. Do not overlap with these existing ones:\n{have}"}],
        response_format={"type": "json_schema", "json_schema": {"name": "topics", "strict": True, "schema": schema}},
    )
    out, seen = [], {t["slug"] for t in existing}
    for t in json.loads(r.choices[0].message.content)["topics"]:
        slug = re.sub(r"[^a-z0-9-]", "", t["slug"].lower().replace("_", "-"))[:60]
        if len(slug) >= 3 and slug not in seen:
            seen.add(slug)
            out.append({**t, "slug": slug})
    return out
