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
import models  


MIGRATIONS = [
    "CREATE EXTENSION IF NOT EXISTS vector",

    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR",
    "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",

    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS material_type VARCHAR DEFAULT 'general'",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS storage_url TEXT",

    "ALTER TABLE material_chunks DROP COLUMN IF EXISTS embedding",
    "ALTER TABLE material_chunks ADD COLUMN IF NOT EXISTS embedding vector(3072)",

    "DROP INDEX IF EXISTS material_chunks_embedding_idx",
    # pgvector HNSW supports max 2 000 dims; 3 072-dim needs halfvec cast (pgvector 0.7+).
    # Falls back gracefully — sequential scan is used if this fails.
    """
    CREATE INDEX material_chunks_embedding_idx
    ON material_chunks USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    """,

    "SELECT 1",  

    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS course_id INTEGER REFERENCES courses(id)",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS exam_year INTEGER",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS exam_board VARCHAR",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR",
    "ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS subject VARCHAR",

    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS course_id INTEGER",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS material_ids_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS is_past_paper_analysis BOOLEAN DEFAULT FALSE",


    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS full_result_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS question_clusters_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS section_breakdown_json JSON",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS analysis_label VARCHAR",
    "ALTER TABLE pattern_analysis ADD COLUMN IF NOT EXISTS papers_analyzed JSON",

    "SELECT 1",

    "DROP INDEX IF EXISTS paper_questions_embedding_idx",
    # Same halfvec approach for paper_questions
    """
    CREATE INDEX paper_questions_embedding_idx
    ON paper_questions USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    """,


    "ALTER TABLE paper_questions ADD COLUMN IF NOT EXISTS question_category VARCHAR",


    "ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS marks INTEGER DEFAULT 2",
]


def run():
    print("Running migrations...\n")

    Base.metadata.create_all(bind=engine)
    print("OK Tables created / verified")

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
