import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
SECRET_KEY = os.getenv("SECRET_KEY", "fallback_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in .env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "materials")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".txt", ".doc"}
MAX_FILE_SIZE_MB = 50
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

EMBEDDING_DIMS = 3072  # gemini-embedding-001 native output dimension

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.1-8b-instant"             
GROQ_MODEL_LARGE = "llama-3.3-70b-versatile"   
GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"  

GEMINI_MODEL = "gemini-2.0-flash"
