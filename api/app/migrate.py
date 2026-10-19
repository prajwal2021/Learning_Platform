"""Changes to tables that already exist. create_all() only adds missing tables, so columns added later are added here.
Each statement is safe to run again."""
from sqlalchemy import text

from .db import Base, engine

STATEMENTS = [
    # accounts (email and password, Google, Microsoft, Apple) next to the original access-code learners
    "ALTER TABLE learners ALTER COLUMN access_code_id DROP NOT NULL",
    "ALTER TABLE learners ADD COLUMN IF NOT EXISTS email varchar(254)",
    "ALTER TABLE learners ADD COLUMN IF NOT EXISTS password_hash varchar(200)",
    "ALTER TABLE learners ADD COLUMN IF NOT EXISTS avatar_url text",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_learners_email ON learners (email)",
]


def run() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as c:
        for s in STATEMENTS:
            c.execute(text(s))
