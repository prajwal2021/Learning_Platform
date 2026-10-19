"""Tables, in three layers.

  access     who may enter: learners, oauth_identities, access_codes (invite codes, the original way in)
  content    what they read: pages, path_*, sm_*, lab*, workbooks, lessons   (seeded from api/seed, read-only at runtime)
  progress   what they did: learner_state (one row per learner, namespace and key), learner_activity (one row per day)
"""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (Boolean, Date, DateTime, ForeignKey, Integer, LargeBinary, String, Text,
                        UniqueConstraint)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- access
class AccessCode(Base):
    __tablename__ = "access_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Learner(Base):
    """One person. Either an account (email and password, or a Google / Microsoft / Apple sign-in) or, the original way,
    a name entered with an access code; the same code and name on another device is the same learner."""
    __tablename__ = "learners"
    __table_args__ = (UniqueConstraint("access_code_id", "name_key"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    access_code_id: Mapped[int | None] = mapped_column(ForeignKey("access_codes.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(60))
    name_key: Mapped[str] = mapped_column(String(60))
    email: Mapped[str | None] = mapped_column(String(254), nullable=True, unique=True, index=True)  # stored lower-case
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OAuthIdentity(Base):
    """A sign-in with an outside provider. `subject` is the provider's stable id for the person, never the email."""
    __tablename__ = "oauth_identities"
    provider: Mapped[str] = mapped_column(String(20), primary_key=True)  # google | microsoft | apple
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(254), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# -------------------------------------------------------------- progress
class LearnerState(Base):
    __tablename__ = "learner_state"
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), primary_key=True)
    namespace: Mapped[str] = mapped_column(String(20), primary_key=True)  # "path" | "stackmap"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class LearnerActivity(Base):
    """How many things a learner did on a day (ticks, answers, marks). Feeds the streak and the activity grid."""
    __tablename__ = "learner_activity"
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    n: Mapped[int] = mapped_column(Integer, default=0)


# --------------------------------------------------------------- content
class Page(Base):
    """A page shell: HTML with no data in it (the Learning Path frame, the Stack Map frame)."""
    __tablename__ = "pages"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    html: Mapped[str] = mapped_column(Text)


class PathUnit(Base):
    __tablename__ = "path_units"
    num: Mapped[str] = mapped_column(String(4), primary_key=True)  # "0".."13", "E"
    ord: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10))  # built | planned
    open_by_default: Mapped[bool] = mapped_column(Boolean, default=False)
    html: Mapped[str] = mapped_column(Text)


class PathStep(Base):
    __tablename__ = "path_steps"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    unit_num: Mapped[str] = mapped_column(ForeignKey("path_units.num", ondelete="CASCADE"))
    ord: Mapped[int] = mapped_column(Integer)
    optional: Mapped[bool] = mapped_column(Boolean, default=False)


class Resource(Base):
    __tablename__ = "sm_resources"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    descr: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text)


class MapNode(Base):
    __tablename__ = "sm_nodes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    data = mapped_column(JSONB)


class MapEdge(Base):
    __tablename__ = "sm_edges"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    data = mapped_column(JSONB)


class MapRoute(Base):
    __tablename__ = "sm_routes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    data = mapped_column(JSONB)


class MapPlane(Base):
    """A 'deeper view' (caching, sharding, ...). Its interactive tabs are code in the web app; its text here."""
    __tablename__ = "sm_planes"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    data = mapped_column(JSONB)


class Misc(Base):
    """Small singletons: the study order of the views, the planned labs, the shared parts of Explain panels."""
    __tablename__ = "sm_misc"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    data = mapped_column(JSONB)


class Lab(Base):
    __tablename__ = "labs"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    meta = mapped_column(JSONB)       # name, kicker, time, blurb, lede, covers, tabs, res
    items = mapped_column(JSONB)      # keys of the steps and exercises that can be ticked
    asset_id: Mapped[str | None] = mapped_column(ForeignKey("lab_assets.id"), nullable=True)


class LabTab(Base):
    __tablename__ = "lab_tabs"
    lab_id: Mapped[str] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), primary_key=True)
    tab_key: Mapped[str] = mapped_column(String(30), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    body = mapped_column(JSONB)


class LabAsset(Base):
    """Files, setup script and folder name of a project. Several labs share one (Labs 3, 4 and 5 use the same project)."""
    __tablename__ = "lab_assets"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    files = mapped_column(JSONB)
    setup: Mapped[str] = mapped_column(Text)
    folder: Mapped[str] = mapped_column(String(60))
    filesui = mapped_column(JSONB)


class LabExplain(Base):
    __tablename__ = "lab_explain"
    xi: Mapped[int] = mapped_column(Integer, primary_key=True)
    data = mapped_column(JSONB)


class LabExplainUse(Base):
    __tablename__ = "lab_explain_use"
    lab_id: Mapped[str] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), primary_key=True)
    xi: Mapped[int] = mapped_column(ForeignKey("lab_explain.xi", ondelete="CASCADE"), primary_key=True)


class Challenge(Base):
    """A daily system design challenge: a scenario, then steps the learner debugs one at a time."""
    __tablename__ = "challenges"
    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="published")  # draft | published
    title: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[str] = mapped_column(String(12))
    est_minutes: Mapped[int] = mapped_column(Integer)
    tags = mapped_column(JSONB)
    scenario: Mapped[str] = mapped_column(Text)
    goal: Mapped[str] = mapped_column(Text)
    takeaway: Mapped[str] = mapped_column(Text)
    concepts = mapped_column(JSONB)   # [{key, name, summary, used_here}]


class ChallengeStep(Base):
    __tablename__ = "challenge_steps"
    challenge_slug: Mapped[str] = mapped_column(ForeignKey("challenges.slug", ondelete="CASCADE"), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    question: Mapped[str] = mapped_column(Text)
    concept_keys = mapped_column(JSONB)
    options = mapped_column(JSONB)    # [{id, text, correct, hint}]  -- correct/hint never leave the server before an answer
    explanation: Mapped[str] = mapped_column(Text)


class IqTopic(Base):
    """A technology in the interview question bank (Angular, PostgreSQL, ...)."""
    __tablename__ = "iq_topics"
    slug: Mapped[str] = mapped_column(String(40), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40))


class IqQuestion(Base):
    __tablename__ = "iq_questions"
    # a hash of topic, level and question text, so a learner's marks survive re-seeding
    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    topic_slug: Mapped[str] = mapped_column(ForeignKey("iq_topics.slug", ondelete="CASCADE"), index=True)
    level: Mapped[str] = mapped_column(String(12))  # basic | intermediate | advanced
    ord: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    real_world: Mapped[str] = mapped_column(Text, default="")
    code_lang: Mapped[str] = mapped_column(String(20), default="")
    code: Mapped[str] = mapped_column(Text, default="")
    follow_up: Mapped[str] = mapped_column(Text, default="")


class IqFlag(Base):
    """A learner saying an answer is wrong or unclear. Content is AI-written, so this is how errors get found."""
    __tablename__ = "iq_flags"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[str] = mapped_column(String(16), index=True)
    learner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Guide(Base):
    """A long-form reference document (the Core Build Starter Guide, the job queue comparison, the roadmap)."""
    __tablename__ = "guides"
    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    eyebrow: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str] = mapped_column(Text)
    subtitle: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(Text, default="")  # the Drive file it came from
    html: Mapped[str] = mapped_column(Text)


class GuideAsset(Base):
    __tablename__ = "guide_assets"
    guide_slug: Mapped[str] = mapped_column(ForeignKey("guides.slug", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), primary_key=True)
    content_type: Mapped[str] = mapped_column(String(40))
    data = mapped_column(LargeBinary)


class Workbook(Base):
    """A Core Build stage workbook: a complete interactive page from the course folder, kept as it was written."""
    __tablename__ = "workbooks"
    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    stage: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="")
    companion: Mapped[bool] = mapped_column(Boolean, default=False)
    html: Mapped[str] = mapped_column(Text)


class WorkbookFile(Base):
    __tablename__ = "workbook_files"
    workbook_slug: Mapped[str] = mapped_column(ForeignKey("workbooks.slug", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), primary_key=True)
    label: Mapped[str] = mapped_column(Text, default="")
    content_type: Mapped[str] = mapped_column(String(60))
    data = mapped_column(LargeBinary)


class Lesson(Base):
    """A narrated slide lesson (the Stage 1 video kit): slides in order, each with the words spoken over it."""
    __tablename__ = "lessons"
    slug: Mapped[str] = mapped_column(String(60), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    stage: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(Text)
    subtitle: Mapped[str] = mapped_column(Text, default="")
    cover = mapped_column(LargeBinary, nullable=True)


class LessonSlide(Base):
    __tablename__ = "lesson_slides"
    lesson_slug: Mapped[str] = mapped_column(ForeignKey("lessons.slug", ondelete="CASCADE"), primary_key=True)
    n: Mapped[int] = mapped_column(Integer, primary_key=True)
    chapter: Mapped[str] = mapped_column(Text)
    narration: Mapped[str] = mapped_column(Text)
    image = mapped_column(LargeBinary)
