"""
Run database migrations.
Usage: python migrate.py

Applies all schema changes needed for Revora:
- Enables pgvector extension
- Adds material_type, storage_url to study_materials
- Resets embedding column to correct dims (384, all-MiniLM-L6-v2)
- Creates HNSW index for fast similarity search
- Creates all tables if they don't exist yet
"""

from sqlalchemy import text
from database import engine, Base
import models  # noqa: F401 — registers all models with Base


MIGRATIONS = [
    # Enable pgvector
    "CREATE EXTENSION IF NOT EXISTS vector",

    # users new columns
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR",
    "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",

    # study_materials new columns
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS material_type VARCHAR DEFAULT 'general'",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS storage_url TEXT",

    # Drop old embedding column if wrong dims, recreate at 384 (all-MiniLM-L6-v2)
    "ALTER TABLE material_chunks DROP COLUMN IF EXISTS embedding",
    "ALTER TABLE material_chunks ADD COLUMN IF NOT EXISTS embedding vector(384)",

    # Drop old index if it exists, create fresh HNSW index
    "DROP INDEX IF EXISTS material_chunks_embedding_idx",
    """
    CREATE INDEX material_chunks_embedding_idx
    ON material_chunks USING hnsw (embedding vector_cosine_ops)
    """,

    # ── v2 migrations ──────────────────────────────────────────────────────────

    # Courses table (created by SQLAlchemy Base.metadata.create_all — listed
    # here only to document intent; the CREATE TABLE is idempotent via ORM)
    "SELECT 1",   # no-op placeholder

    # study_materials: course link + paper metadata
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id)",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS exam_year INTEGER",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS exam_board VARCHAR",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS subject VARCHAR",

    # pattern_analysis: multi-paper context
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS course_id INTEGER",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS material_ids_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS is_past_paper_analysis BOOLEAN DEFAULT FALSE",

    # ── v3 migrations ──────────────────────────────────────────────────────────

    # pattern_analysis: full history + question cluster storage
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS full_result_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS question_clusters_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS section_breakdown_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS analysis_label VARCHAR",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS papers_analyzed JSON",

    # paper_questions table: created by ORM via create_all
    "SELECT 1",

    # HNSW index on paper_questions.embedding for fast cross-paper similarity
    "DROP INDEX IF EXISTS paper_questions_embedding_idx",
    """
    CREATE INDEX paper_questions_embedding_idx
    ON paper_questions USING hnsw (embedding vector_cosine_ops)
    """,

    # ── v4 migrations ──────────────────────────────────────────────────────────

    # paper_questions: question category (code | theory | numerical | diagram | other)
    "ALTER TABLE paper_questions ADD COLUMN IF NOT EXISTS question_category VARCHAR",

    # ── v5 migrations ──────────────────────────────────────────────────────────

    # quiz_questions: marks per question for partial-credit grading
    "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS marks INTEGER DEFAULT 2",
]


def run():
    print("Running migrations...\n")

    # Create all tables that don't exist yet (new installs)
    Base.metadata.create_all(bind=engine)
    print("OK Tables created / verified")

    # Apply column-level migrations
    with engine.connect() as conn:
        for sql in MIGRATIONS:
            stmt = sql.strip().split("\n")[0][:70]
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"OK {stmt}...")
            except Exception as e:
                print(f"SKIP {stmt}... → {e}")

    print("\nMigrations complete.")


if __name__ == "__main__":
    run()
