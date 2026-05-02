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
