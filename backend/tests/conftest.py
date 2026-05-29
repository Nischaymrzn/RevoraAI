"""
conftest.py — runs before any test file is imported.

Sets all required environment variables so that config.py does not
raise ValueError and database.py can create its (lazy) engine object
without making a real connection.
"""
import os
import sys

# ── Add backend root to sys.path so "from auth import …" etc. work ──────────
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

# ── Env vars — must be set BEFORE any backend module is imported ─────────────
# DATABASE_URL must be a syntactically valid PostgreSQL URL so SQLAlchemy's
# create_engine() doesn't fail (it is lazy — no actual connection is made).
os.environ.setdefault("DATABASE_URL", "postgresql://testuser:testpass@localhost:5432/testdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("GEMINI_API_KEY", "fake-gemini-key")
os.environ.setdefault("GROQ_API_KEY", "fake-groq-key")
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "fake-supabase-key")
os.environ.setdefault("SUPABASE_BUCKET", "test-bucket")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
