# Revora.ai — Project Documentation

> AI-powered exam revision and study support system for students.

---

## What is Revora?

Revora is a full-stack web application that uses AI to help students prepare for exams more effectively. Students upload their study materials (PDFs, notes, past papers, slides) and the system automatically extracts knowledge from them, answers questions using that knowledge, generates quizzes and mock tests, and predicts likely exam questions by analysing recurring patterns across past papers.

---

## Core Capabilities

| Feature                    | What it does                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **AI Tutor**               | Answers any question using RAG (Retrieval-Augmented Generation) from uploaded materials |
| **Viva Mode**              | 3-question oral examination with AI grading and detailed feedback                       |
| **Quiz Generation**        | Auto-generates MCQ and short-answer quizzes from uploaded content                       |
| **Mock Test**              | Timed full exam with written-answer partial-credit grading                              |
| **Flashcards**             | Auto-generated front/back flashcards per document                                       |
| **Past Paper Analysis**    | Finds recurring question patterns across multiple exam papers                           |
| **Question Clustering**    | Detects identical questions appearing across different years                            |
| **Exam Readiness Score**   | Dynamic score (0–100) derived from quiz and mock performance                            |
| **AI Study Plan**          | Personalised revision plan generated from performance data                              |
| **Material Summarisation** | One-click AI summary of any uploaded document                                           |
| **Progress Analytics**     | Score trends, weak topics, time spent, readiness gauge                                  |

---

## Team

| Member  
| --------------------
| **Nischay Maharjan**
| **Uddhab**

---

## Deployment

| Layer        | Platform                         |
| ------------ | -------------------------------- |
| Frontend     | Vercel (auto-deploy from GitHub) |
| Backend      | Render (Docker container)        |
| Database     | Supabase PostgreSQL + pgvector   |
| File Storage | Supabase Storage (S3-compatible) |

---

## Repository Structure

```
revora/
├── backend/                   # FastAPI Python backend
│   ├── main.py                # App entry, CORS, startup tasks
│   ├── config.py              # All environment variables
│   ├── models.py              # SQLAlchemy ORM models (13 tables)
│   ├── database.py            # SQLAlchemy engine + session
│   ├── auth.py                # JWT auth helpers
│   ├── migrate.py             # Database migration script
│   ├── Dockerfile             # Docker build for Render
│   ├── requirements.txt       # Python dependencies
│   ├── routers/               # FastAPI route handlers
│   │   ├── auth.py            # Login / register / Google OAuth
│   │   ├── materials.py       # Upload, process, list, delete
│   │   ├── qa.py              # AI tutor, pattern analysis, grading
│   │   ├── quizzes.py         # Quiz CRUD + attempt submission
│   │   ├── mock_tests.py      # Mock test CRUD + attempt
│   │   ├── analytics.py       # Dashboard + progress + readiness
│   │   └── courses.py         # Course management
│   └── services/              # Business logic
│       ├── ai_client.py       # Groq + Gemini LLM wrapper
│       ├── vector_store.py    # Gemini embeddings + pgvector search
│       ├── rag_service.py     # RAG question answering
│       ├── quiz_service.py    # Quiz/mock generation + grading
│       ├── pattern_service.py # Pattern analysis prompts
│       ├── rag_pattern_service.py  # RAG-based multi-paper analysis
│       ├── question_extractor.py   # Past paper question extraction
│       ├── question_clusterer.py   # Cross-paper similarity clustering
│       ├── metadata_service.py     # Auto exam metadata extraction
│       ├── document_processor.py   # PDF/DOCX/PPTX text extraction
│       └── storage_service.py      # Supabase Storage upload/delete
├── frontend/                  # React + TypeScript + Vite frontend
│   └── src/
│       ├── pages/             # Route-level page components
│       │   ├── Dashboard.tsx
│       │   ├── Materials.tsx
│       │   ├── AITutor.tsx    # Chat + Viva mode
│       │   ├── Quiz.tsx
│       │   ├── MockTest.tsx
│       │   ├── Progress.tsx
│       │   ├── Assessment.tsx
│       │   └── StudyAI.tsx
│       ├── components/        # Reusable UI components
│       │   ├── Layout.tsx
│       │   ├── Sidebar.tsx
│       │   └── ui/            # shadcn/ui primitives
│       ├── services/api.ts    # Axios API client
│       ├── store/             # Zustand state stores
│       └── types/             # TypeScript type definitions
└── docs/                      # This documentation
```
