from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user
import models
from services.quiz_service import generate_quiz, score_attempt

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])


class GenerateQuizRequest(BaseModel):
    material_id: int
    title: str = "Practice Quiz"
    quiz_type: str = "mcq"
    count: int = 10


class SubmitAttemptRequest(BaseModel):
    quiz_id: int
    answers: Dict[str, str]
    time_taken: int = 0


class GenerateMockRequest(BaseModel):
    material_ids: List[int]
    title: str = "Mock Test"
    count: int = 10


@router.post("/generate")
def generate_quiz_endpoint(
    req: GenerateQuizRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    material = db.query(models.StudyMaterial).filter(
        models.StudyMaterial.id == req.material_id,
        models.StudyMaterial.user_id == current_user.id,
    ).first()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    if material.processing_status != "completed":
        raise HTTPException(status_code=400, detail="Material still being processed")

    chunks = db.query(models.MaterialChunk).filter(
        models.MaterialChunk.material_id == req.material_id
    ).all()
    content = " ".join([c.chunk_text for c in chunks[:25]])

    questions_data = generate_quiz(
        db=db,
        user_id=current_user.id,
        material_id=req.material_id,
        content_sample=content,
        count=req.count,
        quiz_type=req.quiz_type,
    )

    if not questions_data:
        raise HTTPException(status_code=500, detail="Quiz generation failed. Please try again.")

    quiz = models.Quiz(
        user_id=current_user.id,
        material_id=req.material_id,
        title=req.title,
        quiz_type=req.quiz_type,
        questions_count=len(questions_data),
    )
    db.add(quiz)
    db.flush()

    for q in questions_data:
        qq = models.QuizQuestion(
            quiz_id=quiz.id,
            question=q.get("question", ""),
            question_type=q.get("type", "mcq"),
            options=q.get("options"),
            correct_answer=q.get("correct_answer", ""),
            explanation=q.get("explanation", ""),
            topic=q.get("topic", ""),
            difficulty=q.get("difficulty", "medium"),
            marks=int(q.get("marks", 2)),
        )
        db.add(qq)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="quiz_generated",
        description=f"Generated quiz: {req.title}",
        event_metadata={"material_id": req.material_id, "quiz_id": quiz.id},
    )
    db.add(event)
    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "questions_count": quiz.questions_count,
        "message": "Quiz generated successfully",
    }


@router.post("/generate-mock")
def generate_mock_endpoint(
    req: GenerateMockRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Generate a mixed-format mock test (MCQ + short + long) from multiple materials."""
    from services.quiz_service import generate_mock_test_questions

    # Validate all materials belong to user
    for mid in req.material_ids:
        m = db.query(models.StudyMaterial).filter(
            models.StudyMaterial.id == mid,
            models.StudyMaterial.user_id == current_user.id,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail=f"Material {mid} not found")

    questions_data = generate_mock_test_questions(
        db=db,
        user_id=current_user.id,
        material_ids=req.material_ids,
        count=req.count,
    )

    if not questions_data:
        raise HTTPException(status_code=500, detail="Mock test generation failed. Please try again.")

    quiz = models.Quiz(
        user_id=current_user.id,
        material_id=req.material_ids[0] if req.material_ids else None,
        title=req.title,
        quiz_type="mock_test",
        questions_count=len(questions_data),
    )
    db.add(quiz)
    db.flush()

    for q in questions_data:
        qq = models.QuizQuestion(
            quiz_id=quiz.id,
            question=q.get("question", ""),
            question_type=q.get("type", "mcq"),
            options=q.get("options"),
            correct_answer=q.get("correct_answer", ""),
            explanation=q.get("explanation", ""),
            topic=q.get("topic", ""),
            difficulty=q.get("difficulty", "medium"),
            marks=int(q.get("marks", 2)),
        )
        db.add(qq)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="mock_test_generated",
        description=f"Generated mock test: {req.title}",
        event_metadata={"quiz_id": quiz.id, "material_ids": req.material_ids},
    )
    db.add(event)
    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "questions_count": quiz.questions_count,
        "message": "Mock test generated successfully",
    }


@router.get("/")
def list_quizzes(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    quizzes = (
        db.query(models.Quiz)
        .filter(models.Quiz.user_id == current_user.id)
        .order_by(models.Quiz.created_at.desc())
        .all()
    )
    result = []
    for q in quizzes:
        attempts = db.query(models.QuizAttempt).filter(models.QuizAttempt.quiz_id == q.id).all()
        best_score = max([a.score for a in attempts], default=0)
        result.append({
            "id": q.id,
            "title": q.title,
            "quiz_type": q.quiz_type,
            "questions_count": q.questions_count,
            "material_id": q.material_id,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "attempt_count": len(attempts),
            "best_score": best_score,
        })
    return result


@router.get("/{quiz_id}")
def get_quiz(quiz_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id == quiz_id,
        models.Quiz.user_id == current_user.id,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = db.query(models.QuizQuestion).filter(models.QuizQuestion.quiz_id == quiz_id).all()
    return {
        "id": quiz.id,
        "title": quiz.title,
        "quiz_type": quiz.quiz_type,
        "questions": [
            {
                "id": i,
                "question": q.question,
                "type": q.question_type,
                "options": q.options,
                "topic": q.topic,
                "difficulty": q.difficulty,
                "marks": getattr(q, "marks", 2) or 2,
            }
            for i, q in enumerate(questions)
        ],
    }


@router.post("/attempt")
def submit_attempt(
    req: SubmitAttemptRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id == req.quiz_id,
        models.Quiz.user_id == current_user.id,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = db.query(models.QuizQuestion).filter(
        models.QuizQuestion.quiz_id == req.quiz_id
    ).all()

    questions_data = [
        {
            "question":      q.question,
            "correct_answer":q.correct_answer,
            "topic":         q.topic,
            "explanation":   q.explanation,
            "question_type": q.question_type,
            "options":       q.options,
            "marks":         getattr(q, "marks", 2) or 2,
        }
        for q in questions
    ]

    result = score_attempt(questions_data, req.answers, grade_written=True)

    attempt = models.QuizAttempt(
        quiz_id=req.quiz_id,
        user_id=current_user.id,
        answers=req.answers,
        score=result["score_percentage"],
        total_questions=result["total"],
        time_taken=req.time_taken,
        weak_topics=result["weak_topics"],
    )
    db.add(attempt)

    is_mock = (quiz.quiz_type == 'mock_test')
    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="mock_attempt" if is_mock else "quiz_attempt",
        description=f"Completed {'mock test' if is_mock else 'quiz'}: {quiz.title} — {result['score_percentage']}%",
        event_metadata={"quiz_id": req.quiz_id, "score": result["score_percentage"]},
    )
    db.add(event)
    db.commit()

    # Build detailed results merging per-question grades
    q_grades = {g["index"]: g for g in result.get("question_grades", [])}
    detailed = []
    for i, q in enumerate(questions):
        user_ans = req.answers.get(str(i), req.answers.get(i, ""))
        grade = q_grades.get(i, {})
        detailed.append({
            "question":       q.question,
            "user_answer":    user_ans,
            "correct_answer": q.correct_answer,
            "is_correct":     grade.get("is_correct", False),
            "marks_awarded":  grade.get("marks_awarded", 0),
            "max_marks":      grade.get("max_marks", getattr(q, "marks", 2) or 2),
            "feedback":       grade.get("feedback", ""),
            "key_points_hit":   grade.get("key_points_hit", []),
            "key_points_missed":grade.get("key_points_missed", []),
            "explanation":    q.explanation,
            "topic":          q.topic,
            "options":        q.options,
            "question_type":  q.question_type,
        })

    return {
        "score":           result["score_percentage"],
        "correct":         result["correct"],
        "total":           result["total"],
        "total_marks":     result["total_marks"],
        "marks_awarded":   result["marks_awarded"],
        "weak_topics":     result["weak_topics"],
        "detailed_results":detailed,
    }
