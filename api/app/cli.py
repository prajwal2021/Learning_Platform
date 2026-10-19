"""Operator commands.

    python -m app.cli seed                       load / refresh the content
    python -m app.cli suggest-challenges --count 15   ask the model for more incident ideas
    python -m app.cli generate-questions --all   write the interview question bank into seed/interview/
    python -m app.cli generate-challenge --all   write challenges with OpenAI into seed/challenges/ (read them, then seed)
    python -m app.cli create-code "Cohort 1"     print a new access code (shown once)
    python -m app.cli list-codes
    python -m app.cli revoke-code 3              signs out everyone who used that code
"""
import argparse
import secrets
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import seed
from .db import Base, engine
from .models import AccessCode, Learner
from .security import hash_code

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def new_code() -> str:
    raw = "".join(secrets.choice(ALPHABET) for _ in range(16))
    return "-".join(raw[i:i + 4] for i in range(0, 16, 4))


def main() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("seed")
    c = sub.add_parser("create-code")
    c.add_argument("label", nargs="?", default="")
    g = sub.add_parser("generate-challenge")
    g.add_argument("slug", nargs="?")
    g.add_argument("--all", action="store_true")
    g.add_argument("--jobs", type=int, default=1)
    g.add_argument("--skip-existing", action="store_true")
    sg = sub.add_parser("suggest-challenges")
    sg.add_argument("--count", type=int, default=15)
    gq = sub.add_parser("generate-questions")
    gq.add_argument("slug", nargs="?")
    gq.add_argument("--all", action="store_true")
    gq.add_argument("--jobs", type=int, default=6)
    sub.add_parser("list-codes")
    r = sub.add_parser("revoke-code")
    r.add_argument("id", type=int)
    a = p.parse_args()

    if a.cmd == "seed":
        print(seed.run())
        return
    if a.cmd in ("generate-challenge", "suggest-challenges", "generate-questions"):
        import json
        from concurrent.futures import ThreadPoolExecutor
        from pathlib import Path
        if a.cmd == "generate-questions":
            from . import interview_gen
            topics = json.loads(Path("seed/interview_topics.json").read_text())
            pick = topics if a.all else [t for t in topics if t["slug"] == a.slug]
            if not pick:
                raise SystemExit("give a slug from seed/interview_topics.json, or --all")
            interview_gen.run(pick, Path("seed/interview"), a.jobs)
            u = interview_gen.usage()
            print(f"tokens: in={u['in']:,} out={u['out']:,}")
            return
        from . import challenge_gen
        tpath = Path("seed/challenge_topics.json")
        topics = json.loads(tpath.read_text())
        if a.cmd == "suggest-challenges":
            new = challenge_gen.suggest(a.count, topics)
            tpath.write_text(json.dumps(topics + new, indent=2, ensure_ascii=False))
            print(f"added {len(new)} topics:", ", ".join(t["slug"] for t in new))
            return
        pick = topics if a.all else [t for t in topics if t["slug"] == a.slug]
        if a.skip_existing:
            pick = [t for t in pick if not (Path("seed/challenges") / f"{t['slug']}.json").exists()]
        if not pick:
            raise SystemExit("nothing to do (give a slug from seed/challenge_topics.json, or --all)")

        def one(t):
            print("writing", t["slug"], flush=True)
            try:
                print("  ->", challenge_gen.make(t, Path("seed/challenges")), flush=True)
            except SystemExit as e:
                print("  FAILED", t["slug"], e, flush=True)
        with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
            list(ex.map(one, pick))
        return
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        if a.cmd == "create-code":
            code = new_code()
            db.add(AccessCode(code_hash=hash_code(code), label=a.label))
            db.commit()
            print(code)
        elif a.cmd == "list-codes":
            rows = db.execute(
                select(AccessCode, func.count(Learner.id)).outerjoin(Learner, Learner.access_code_id == AccessCode.id)
                .group_by(AccessCode.id).order_by(AccessCode.id)).all()
            for ac, n in rows:
                print(f"{ac.id:>3}  {'revoked' if ac.revoked_at else 'active ':7}  {n:>3} learners  {ac.label}")
        elif a.cmd == "revoke-code":
            ac = db.get(AccessCode, a.id)
            if ac is None:
                raise SystemExit("no such code")
            ac.revoked_at = datetime.now(timezone.utc)
            db.commit()
            print("revoked")


if __name__ == "__main__":
    main()
