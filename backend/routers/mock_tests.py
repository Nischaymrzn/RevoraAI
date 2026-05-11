from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user
import models
from services.quiz_service import generate_mock_test_questions, score_attempt
from services.pattern_service import calculate_readiness

router = APIRouter(prefix="/api/mock-tests", tags=["mock_tests"])


class CreateMockTestRequest(BaseModel):
    title: str = "Mock Test"
    material_ids: List[int]
    questions_count: int = 10
    time_limit: int = 30


class SubmitMockTestRequest(BaseModel):
    mock_test_id: int
    answers: Dict[str, str]
    time_taken: int = 0


@router.post("/create")
def create_mock_test(
    req: CreateMockTestRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    for mid in req.material_ids:
        m = db.query(models.StudyMaterial).filter(
            models.StudyMaterial.id == mid,
            models.StudyMaterial.user_id == current_user.id,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail=f"Material {mid} not found")
        if m.processing_status != "completed":
            raise HTTPException(status_code=400, detail=f"Material {m.original_name} still processing")

    questions_data = generate_mock_test_questions(
        db=db,
        user_id=current_user.id,
        material_ids=req.material_ids,
        count=req.questions_count,
    )

    if not questions_data:
        raise HTTPException(status_code=500, detail="Mock test generation failed. Please try again.")

    mock = models.MockTest(
        user_id=current_user.id,
        title=req.title,
        material_ids=req.material_ids,
        questions_count=len(questions_data),
        time_limit=req.time_limit,
    )
    db.add(mock)
    db.flush()

    for q in questions_data:
        mq = models.MockTestQuestion(
            mock_test_id=mock.id,
            question=q.get("question", ""),
            question_type=q.get("type", "mcq"),
            options=q.get("options"),
            correct_answer=q.get("correct_answer", ""),
            explanation=q.get("explanation", ""),
            topic=q.get("topic", ""),
            marks=q.get("marks", 1),
        )
        db.add(mq)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="mock_test_created",
        description=f"Created mock test: {req.title}",
        event_metadata={"mock_test_id": mock.id},
    )
    db.add(event)
    db.commit()
    db.refresh(mock)

    return {
        "mock_test_id": mock.id,
        "title": mock.title,
        "questions_count": mock.questions_count,
        "time_limit": mock.time_limit,
        "message": "Mock test created successfully",
    }


@router.get("/")
def list_mock_tests(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    mocks = (
        db.query(models.MockTest)
        .filter(models.MockTest.user_id == current_user.id)
        .order_by(models.MockTest.created_at.desc())
        .all()
    )
    result = []
    for m in mocks:
        attempts = db.query(models.MockTestAttempt).filter(models.MockTestAttempt.mock_test_id == m.id).all()
        best_score = max([a.score for a in attempts], default=0)
        result.append({
            "id": m.id,
            "title": m.title,
            "questions_count": m.questions_count,
            "time_limit": m.time_limit,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "attempt_count": len(attempts),
            "best_score": best_score,
        })
    return result


@router.get("/{mock_id}")
def get_mock_test(mock_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    mock = db.query(models.MockTest).filter(
        models.MockTest.id == mock_id,
        models.MockTest.user_id == current_user.id,
    ).first()
    if not mock:
        raise HTTPException(status_code=404, detail="Mock test not found")

    questions = db.query(models.MockTestQuestion).filter(
        models.MockTestQuestion.mock_test_id == mock_id
    ).all()

    return {
        "id": mock.id,
        "title": mock.title,
        "time_limit": mock.time_limit,
        "questions_count": mock.questions_count,
        "questions": [
            {
                "id": i,
                "question": q.question,
                "type": q.question_type,
                "options": q.options,
                "topic": q.topic,
                "marks": q.marks,
            }
            for i, q in enumerate(questions)
        ],
    }


@router.post("/submit")
def submit_mock_test(
    req: SubmitMockTestRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    mock = db.query(models.MockTest).filter(
        models.MockTest.id == req.mock_test_id,
        models.MockTest.user_id == current_user.id,
    ).first()
    if not mock:
        raise HTTPException(status_code=404, detail="Mock test not found")

    questions = db.query(models.MockTestQuestion).filter(
        models.MockTestQuestion.mock_test_id == req.mock_test_id
    ).all()
    questions_data = [
        {"question": q.question, "correct_answer": q.correct_answer, "topic": q.topic, "explanation": q.explanation}
        for q in questions
    ]

    result = score_attempt(questions_data, req.answers)

    all_attempts = db.query(models.MockTestAttempt).filter(
        models.MockTestAttempt.user_id == current_user.id
    ).all()
    mock_scores = [a.score for a in all_attempts]
    quiz_attempts = db.query(models.QuizAttempt).filter(models.QuizAttempt.user_id == current_user.id).all()
    avg_quiz = sum(a.score for a in quiz_attempts) / len(quiz_attempts) if quiz_attempts else 0

    readiness_data = calculate_readiness({
        "quiz_attempts": len(quiz_attempts),
        "avg_score": avg_quiz,
        "mock_scores": mock_scores + [result["score_percentage"]],
        "weak_topics": result["weak_topics"],
        "materials_count": db.query(models.StudyMaterial).filter(models.StudyMaterial.user_id == current_user.id).count(),
        "questions_asked": db.query(models.QueryHistory).filter(models.QueryHistory.user_id == current_user.id).count(),
    })

    attempt = models.MockTestAttempt(
        mock_test_id=req.mock_test_id,
        user_id=current_user.id,
        answers=req.answers,
        score=result["score_percentage"],
        total_questions=result["total"],
        time_taken=req.time_taken,
        weak_topics=result["weak_topics"],
        readiness_score=readiness_data.get("readiness_score", 0),
        feedback=readiness_data.get("recommendation", ""),
    )
    db.add(attempt)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="mock_test_attempt",
        description=f"Completed mock test: {mock.title} — {result['score_percentage']}%",
        event_metadata={"mock_test_id": req.mock_test_id, "score": result["score_percentage"]},
    )
    db.add(event)
    db.commit()

    detailed = []
    for i, q in enumerate(questions):
        user_ans = req.answers.get(str(i), req.answers.get(i, ""))
        is_correct = user_ans.strip().upper()[:1] == q.correct_answer.strip().upper()[:1]
        detailed.append({
            "question": q.question,
            "user_answer": user_ans,
            "correct_answer": q.correct_answer,
            "is_correct": is_correct,
            "explanation": q.explanation,
            "topic": q.topic,
            "options": q.options,
        })

    return {
        "score": result["score_percentage"],
        "correct": result["correct"],
        "total": result["total"],
        "weak_topics": result["weak_topics"],
        "readiness": readiness_data,
        "detailed_results": detailed,
    }
