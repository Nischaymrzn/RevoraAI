import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
import models

from routers import auth, materials, qa, quizzes, mock_tests, analytics, courses

# Create all tables
Base.metadata.create_all(bind=engine)

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
