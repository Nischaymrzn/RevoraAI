import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
import models

from routers import auth, materials, qa, quizzes, mock_tests, analytics, courses


def _ensure_embedding_dims() -> None:
    """
    Auto-fix embedding column dimensions on every startup.

    Uses AUTOCOMMIT so every DDL statement commits independently — if index
    creation fails the column fix still persists. Uses format_type() for
    dimension detection which is reliable across all pgvector versions.
    """
    import re
    from sqlalchemy import text
    from config import EMBEDDING_DIMS

    # Each DDL statement must auto-commit; never bundle column+index in one txn
    ac = engine.execution_options(isolation_level="AUTOCOMMIT")

    for tbl in ("material_chunks", "paper_questions"):
        try:
            with ac.connect() as conn:
                row = conn.execute(text(
                    "SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) "
                    "FROM pg_attribute a "
                    "JOIN pg_class c ON c.oid = a.attrelid "
                    f"WHERE c.relname = '{tbl}' AND a.attname = 'embedding' "
                    "AND NOT a.attisdropped"
                )).fetchone()
        except Exception:
            row = None  # table not yet created — create_all handles it

        if row is None:
            continue

        m = re.search(r'\((\d+)\)', str(row[0]))
        current_dim = int(m.group(1)) if m else -1
        print(f"[startup] {tbl}.embedding = vector({current_dim}), required = vector({EMBEDDING_DIMS})")

        if current_dim == EMBEDDING_DIMS:
            continue  # already correct

        print(f"[startup] rebuilding {tbl}.embedding …")
        try:
            with ac.connect() as conn:
                conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN IF EXISTS embedding"))
                conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN embedding vector({EMBEDDING_DIMS})"))
            print(f"[startup] {tbl}.embedding → vector({EMBEDDING_DIMS}) ✓")
        except Exception as exc:
            print(f"[startup] ERROR rebuilding {tbl}.embedding: {exc}")
            continue

    # Rebuild HNSW indexes (each in its own autocommit connection).
    # pgvector HNSW supports at most 2 000 dimensions; for higher dims (e.g. 3 072
    # from gemini-embedding-001) we try a halfvec cast (pgvector ≥ 0.7) which
    # stores half-precision floats and supports up to 4 000 dims. If the DB is
    # older we just skip the index — pgvector falls back to a sequential scan
    # which is perfectly fine for small/medium datasets.
    for idx, tbl in (
        ("material_chunks_embedding_idx",  "material_chunks"),
        ("paper_questions_embedding_idx",   "paper_questions"),
    ):
        try:
            with ac.connect() as conn:
                conn.execute(text(f"DROP INDEX IF EXISTS {idx}"))
        except Exception as exc:
            print(f"[startup] drop index {idx}: {exc}")
            continue

        if EMBEDDING_DIMS <= 2000:
            # Standard HNSW — no dimension constraint
            index_sql = (
                f"CREATE INDEX {idx} ON {tbl} "
                "USING hnsw (embedding vector_cosine_ops)"
            )
        else:
            # halfvec HNSW for high-dimensional embeddings (pgvector 0.7+)
            index_sql = (
                f"CREATE INDEX {idx} ON {tbl} "
                f"USING hnsw ((embedding::halfvec({EMBEDDING_DIMS})) halfvec_cosine_ops)"
            )

        try:
            with ac.connect() as conn:
                conn.execute(text(index_sql))
            print(f"[startup] index {idx}: created ✓")
        except Exception as exc:
            # halfvec not available on this pgvector version — sequential scan will be used
            print(f"[startup] index {idx}: skipped ({exc.__class__.__name__}: {exc!s:.120})")


# Create tables (no-op if they already exist) then fix dimensions if needed
Base.metadata.create_all(bind=engine)
_ensure_embedding_dims()

app = FastAPI(
    title="Revora.ai API",
    description="AI-powered exam revision support system",
    version="1.0.0",
)

# Build allowed origins: always include local dev, add FRONTEND_URL from env
# (set FRONTEND_URL to your Vercel deployment URL on Render)
_base_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
]
_frontend_url = os.getenv("FRONTEND_URL", "")
_allowed_origins = _base_origins + ([_frontend_url] if _frontend_url else [])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # allow all Vercel preview URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(materials.router)
app.include_router(qa.router)
app.include_router(quizzes.router)
app.include_router(mock_tests.router)
app.include_router(analytics.router)


@app.get("/api/health")
def health():
    from services.ai_client import is_configured
    return {
        "status": "ok",
        "ai_configured": is_configured(),
        "message": "Revora.ai is running",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
