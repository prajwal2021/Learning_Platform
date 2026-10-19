from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from . import migrate
from .db import engine
from .routers import auth, challenges, corebuild, field, guides, interview, me, path, roadmap, search, stackmap, state


@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate.run()
    yield


# No public docs: the API is only meant to be called by the web app.
app = FastAPI(title="Learning platform API", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
for r in (auth.router, me.router, search.router, path.router, stackmap.router, state.router, challenges.router, interview.router,
          guides.router, field.router, corebuild.router, roadmap.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    with engine.connect() as c:
        c.execute(text("select 1"))
    return {"ok": True}
