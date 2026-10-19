"""Writes interview questions with the OpenAI API (offline, by an operator).

    python -m app.cli generate-questions --all --jobs 8      every topic in seed/interview_topics.json
    python -m app.cli generate-questions react               one topic

Output: seed/interview/<slug>.json. Re-running only fills in levels that are missing, so an interrupted run resumes.
"""
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from openai import OpenAI
from pydantic import ValidationError

from .config import settings
from .interview_schema import JSON_SCHEMA, LEVELS, Batch

PER_CALL = 10
CALLS_PER_LEVEL = 2  # 20 questions per level

LEVEL_GUIDE = {
    "basic": "Fundamentals a junior is expected to know cold: core concepts, syntax and vocabulary, the 'what is X and when do you use it' questions, common beginner mistakes.",
    "intermediate": "Day-to-day professional depth: trade-offs, patterns, debugging a realistic problem, 'what happens if', comparing two approaches, performance and testing basics, what to do in real projects.",
    "advanced": "Senior-level depth: internals and how things actually work, performance and scaling, concurrency and failure modes, architecture decisions, edge cases and gotchas, production incidents, trade-offs with numbers.",
}

SYSTEM = """You write interview question banks for software engineers. Each item is a question an interviewer really asks, with a model answer a strong candidate would give.

Rules:
- Technical accuracy comes first. If you are not sure of a detail (a default value, a version-specific behaviour), leave it out or say it depends. Never invent API names, flags or numbers.
- `question`: phrased as spoken in an interview, one question, no numbering.
- `answer`: 2 to 6 sentences, at most about 110 words. Direct and concrete: the idea, why it matters, the key trade-off. No filler, no "great question", no marketing tone.
- `real_world`: one or two sentences describing a real situation where this matters (for example what goes wrong in production, or how a team uses it). Include it on at least half the questions; use "" when forced.
- `code` and `code_lang`: a short, correct snippet (at most 12 lines) only when it makes the answer clearer: "what does this output", the idiomatic way to do it, a bug and its fix. `code_lang` is a lowercase highlight name such as python, javascript, typescript, java, sql, bash, yaml, go, rust, csharp. Use "" for both when there is no snippet. Aim for a snippet on roughly a third of the questions, and none where it would be padding.
- `follow_up`: the next question a good interviewer would ask. May be "".
- Cover different sub-areas of the topic; do not ask the same thing twice in different words. A mix of conceptual, scenario-based and "what happens here" questions.
- Match the level exactly. Do not repeat anything in the list of questions already asked.
"""

_usage = {"in": 0, "out": 0}
_lock = threading.Lock()


def usage() -> dict:
    return dict(_usage)


def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise SystemExit("OPENAI_API_KEY is not set (put it in the project's .env)")
    return OpenAI(api_key=settings.openai_api_key, max_retries=6, timeout=600)


def _model(level: str) -> str:
    return settings.openai_model_advanced if level == "advanced" else settings.openai_model_questions


def _ask(client: OpenAI, topic: dict, level: str, asked: list[str]) -> list[dict]:
    user = (f"Topic: {topic['name']} (category: {topic['category']})\nLevel: {level}\n{LEVEL_GUIDE[level]}\n\n"
            f"Write exactly {PER_CALL} new questions.")
    if asked:
        user += "\n\nAlready asked, do not repeat or paraphrase:\n- " + "\n- ".join(asked)
    last = ""
    for attempt in range(3):
        r = client.chat.completions.create(
            model=_model(level),
            messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user + last}],
            response_format={"type": "json_schema", "json_schema": {"name": "batch", "strict": True, "schema": JSON_SCHEMA}},
        )
        with _lock:
            _usage["in"] += r.usage.prompt_tokens
            _usage["out"] += r.usage.completion_tokens
        try:
            batch = Batch.model_validate(json.loads(r.choices[0].message.content))
        except (ValidationError, json.JSONDecodeError) as e:
            last = f"\n\nYour last reply was rejected ({str(e)[:200]}). Fix it."
            continue
        if len(batch.questions) >= PER_CALL - 2:
            return [q.model_dump() for q in batch.questions]
        last = f"\n\nYou wrote only {len(batch.questions)} questions. Write {PER_CALL}."
    raise RuntimeError(f"{topic['slug']}/{level}: no valid batch")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower())


def _words(s: str) -> set:
    return set(_norm(s).split())


def _too_similar(q: str, others: list[str]) -> bool:
    w = _words(q)
    for o in others:
        v = _words(o)
        if w and v and len(w & v) / len(w | v) >= 0.6:
            return True
    return False


def make(topic: dict, out_dir: Path) -> tuple[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{topic['slug']}.json"
    doc = json.loads(path.read_text()) if path.exists() else {}
    doc.update(slug=topic["slug"], name=topic["name"], category=topic["category"])
    levels = doc.setdefault("levels", {})
    client = _client()
    for level in LEVELS:
        if len(levels.get(level, [])) >= PER_CALL * CALLS_PER_LEVEL - 4:
            continue
        got: list[dict] = []
        for _ in range(CALLS_PER_LEVEL):
            # everything already written for this topic, at any level, so no question repeats across levels
            prior = [q["question"] for lv, qs in levels.items() if lv != level for q in qs] + [q["question"] for q in got]
            for q in _ask(client, topic, level, prior):
                if not _too_similar(q["question"], prior):
                    got.append(q)
                    prior.append(q["question"])
        levels[level] = got
        path.write_text(json.dumps(doc, indent=1, ensure_ascii=False))  # save per level so a crash loses little
    return topic["slug"], sum(len(v) for v in levels.values())


def run(topics: list[dict], out_dir: Path, jobs: int) -> None:
    failed = []
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        futs = {ex.submit(make, t, out_dir): t["slug"] for t in topics}
        for f in as_completed(futs):
            try:
                slug, n = f.result()
                print(f"done {slug}: {n} questions   (tokens so far in={_usage['in']:,} out={_usage['out']:,})", flush=True)
            except Exception as e:  # keep going; re-running resumes
                failed.append(futs[f])
                print(f"FAILED {futs[f]}: {str(e)[:200]}", flush=True)
    if failed:
        print("failed (re-run to resume):", " ".join(failed))
