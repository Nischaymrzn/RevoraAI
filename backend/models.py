from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from database import Base
from config import EMBEDDING_DIMS


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)   # nullable for Google OAuth users
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    materials = relationship("StudyMaterial", back_populates="user", cascade="all, delete")
    courses = relationship("Course", back_populates="user", cascade="all, delete")
    queries = relationship("QueryHistory", back_populates="user", cascade="all, delete")
    quizzes = relationship("Quiz", back_populates="user", cascade="all, delete")
    mock_tests = relationship("MockTest", back_populates="user", cascade="all, delete")
    activity_events = relationship("ActivityEvent", back_populates="user", cascade="all, delete")


class Course(Base):
    """
    A course/subject the user is studying.
    Past papers and lesson notes are linked to a course for organised retrieval.
    """
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)           # "Computer Science"
    code = Column(String, nullable=True)            # "CS232"
    grade_level = Column(String, nullable=True)     # "Grade XII"
    exam_board = Column(String, nullable=True)      # "NEB"
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="courses")
    materials = relationship("StudyMaterial", back_populates="course")


class StudyMaterial(Base):
    __tablename__ = "study_materials"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    filename = Column(String, nullable=False)         # unique storage filename
    original_name = Column(String, nullable=False)    # original upload name
    file_type = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    processing_status = Column(String, default="pending")  # pending, processing, completed, failed
    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    word_count = Column(Integer, default=0)
    summary = Column(Text, nullable=True)

    # Material type — drives quiz/mock-test generation logic
    # values: general | past_paper | lesson | notes | textbook
    material_type = Column(String, default="general")

    # Auto-extracted metadata (populated by LLM after OCR)
    exam_year = Column(Integer, nullable=True)         # 2022, 2023, 2024 …
    exam_board = Column(String, nullable=True)         # NEB, Cambridge, CBSE …
    grade_level = Column(String, nullable=True)        # Grade XII, A-Level …
    subject = Column(String, nullable=True)            # Computer Science, Physics …

    # Permanent URL in Supabase Storage
    storage_url = Column(Text, nullable=True)

    user = relationship("User", back_populates="materials")
    course = relationship("Course", back_populates="materials")
    chunks = relationship("MaterialChunk", back_populates="material", cascade="all, delete")
    queries = relationship("QueryHistory", back_populates="material")
    quizzes = relationship("Quiz", back_populates="material")
    pattern_analyses = relationship("PatternAnalysis", back_populates="material", cascade="all, delete")
    paper_questions = relationship("PaperQuestion", back_populates="material", cascade="all, delete")


class MaterialChunk(Base):
    __tablename__ = "material_chunks"
    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("study_materials.id"), nullable=False)
    chunk_text = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    page_number = Column(Integer, default=0)
    char_count = Column(Integer, default=0)

    # pgvector embedding sized to EMBEDDING_DIMS
    embedding = Column(Vector(EMBEDDING_DIMS), nullable=True)

    material = relationship("StudyMaterial", back_populates="chunks")


class QueryHistory(Base):
    __tablename__ = "query_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("study_materials.id"), nullable=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="queries")
    material = relationship("StudyMaterial", back_populates="queries")


class Quiz(Base):
    __tablename__ = "quizzes"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("study_materials.id"), nullable=True)
    title = Column(String, nullable=False)
    quiz_type = Column(String, default="mcq")  # mcq, short_answer, mixed
    questions_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="quizzes")
    material = relationship("StudyMaterial", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    question = Column(Text, nullable=False)
    question_type = Column(String, default="mcq")
    options = Column(JSON, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    topic = Column(String, nullable=True)
    difficulty = Column(String, default="medium")
    marks = Column(Integer, default=2, nullable=True)

    quiz = relationship("Quiz", back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    answers = Column(JSON, nullable=True)
    score = Column(Float, default=0.0)
    total_questions = Column(Integer, default=0)
    time_taken = Column(Integer, default=0)
    weak_topics = Column(JSON, nullable=True)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())

    quiz = relationship("Quiz", back_populates="attempts")


class MockTest(Base):
    __tablename__ = "mock_tests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    material_ids = Column(JSON, nullable=True)
    questions_count = Column(Integer, default=10)
    time_limit = Column(Integer, default=30)  # minutes
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="mock_tests")
    questions = relationship("MockTestQuestion", back_populates="mock_test", cascade="all, delete")
    attempts = relationship("MockTestAttempt", back_populates="mock_test", cascade="all, delete")


class MockTestQuestion(Base):
    __tablename__ = "mock_test_questions"
    id = Column(Integer, primary_key=True, index=True)
    mock_test_id = Column(Integer, ForeignKey("mock_tests.id"), nullable=False)
    question = Column(Text, nullable=False)
    question_type = Column(String, default="mcq")
    options = Column(JSON, nullable=True)
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text, nullable=True)
    topic = Column(String, nullable=True)
    marks = Column(Integer, default=1)

    mock_test = relationship("MockTest", back_populates="questions")


class MockTestAttempt(Base):
    __tablename__ = "mock_test_attempts"
    id = Column(Integer, primary_key=True, index=True)
    mock_test_id = Column(Integer, ForeignKey("mock_tests.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    answers = Column(JSON, nullable=True)
    score = Column(Float, default=0.0)
    total_questions = Column(Integer, default=0)
    time_taken = Column(Integer, default=0)
    weak_topics = Column(JSON, nullable=True)
    readiness_score = Column(Float, default=0.0)
    feedback = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())

    mock_test = relationship("MockTest", back_populates="attempts")


class PaperQuestion(Base):
    """
    Individual question extracted from a past exam paper.
    Section (mcq/short_answer/long_answer), marks, chapter, topic all stored here.
    Embedding enables cross-paper similarity search — the "underlining" feature.
    """
    __tablename__ = "paper_questions"
    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("study_materials.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_number = Column(Integer, nullable=True)
    # Section type: mcq | short_answer | long_answer | unknown
    section = Column(String, nullable=False, default="unknown")
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=True)          # A/B/C/D options for MCQ
    marks = Column(Integer, nullable=True)
    detected_chapter = Column(String, nullable=True)      # e.g. "Chapter 5: DBMS"
    detected_topic = Column(String, nullable=True)        # e.g. "Normalization"
    question_category = Column(String, nullable=True)     # code | theory | numerical | diagram | other
    embedding = Column(Vector(EMBEDDING_DIMS), nullable=True)
    extracted_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("StudyMaterial", back_populates="paper_questions")


class PatternAnalysis(Base):
    __tablename__ = "pattern_analysis"
    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("study_materials.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=True)
    # JSON list of all material IDs included in this analysis
    material_ids_json = Column(JSON, nullable=True)
    is_past_paper_analysis = Column(Boolean, default=False)
    topics = Column(JSON, nullable=True)
    likely_questions = Column(JSON, nullable=True)
    analysis_text = Column(Text, nullable=True)
    topic_weights = Column(JSON, nullable=True)
    # Full analysis result JSON (complete output from analyze_papers_rag)
    full_result_json = Column(JSON, nullable=True)
    # Question clusters — the "same question across papers" detection result
    question_clusters_json = Column(JSON, nullable=True)
    # Section-level breakdown (MCQ / short / long analysis)
    section_breakdown_json = Column(JSON, nullable=True)
    # Human-readable label for this analysis run
    analysis_label = Column(String, nullable=True)
    papers_analyzed = Column(JSON, nullable=True)  # [{name, year, id}]
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    material = relationship("StudyMaterial", back_populates="pattern_analyses")


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    event_type = Column(String, nullable=False)
    description = Column(String, nullable=False)
    event_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="activity_events")
