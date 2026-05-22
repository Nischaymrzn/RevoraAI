from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
import models
from services.pattern_service import calculate_readiness

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _get_attempts(db: Session, uid: int):
    """
    Returns (quiz_attempts, mock_attempts).

    quiz_attempts  — QuizAttempt rows (regular quizzes only).
                     If any old mock tests were accidentally stored here
                     (quiz_type == 'mock_test'), we still separate them.
    mock_attempts  — MockTestAttempt rows (proper mock test table).
                     Plus any legacy QuizAttempt rows whose quiz was a mock test.
    """
    all_quiz_rows = (
        db.query(models.QuizAttempt, models.Quiz)
        .join(models.Quiz, models.QuizAttempt.quiz_id == models.Quiz.id)
        .filter(models.QuizAttempt.user_id == uid)
        .all()
    )
    quiz_attempts      = [a for a, q in all_quiz_rows if q.quiz_type != 'mock_test']
    legacy_mock        = [a for a, q in all_quiz_rows if q.quiz_type == 'mock_test']

    proper_mock = (
        db.query(models.MockTestAttempt)
        .filter(models.MockTestAttempt.user_id == uid)
        .all()
    )

    mock_attempts = proper_mock + legacy_mock  # type: ignore[operator]
    return quiz_attempts, mock_attempts, proper_mock


def _readiness_score(quiz_attempts, mock_attempts) -> float:
    """
    Derive a readiness score (0-100) from available attempt data.
    Weights recent mock scores heavily; quiz scores fill in when no mocks exist.
    """
    mock_scores  = [a.score for a in mock_attempts]
    quiz_scores  = [a.score for a in quiz_attempts]

    if mock_scores:
        recent = mock_scores[-5:]
        base = sum(recent) / len(recent)
    elif quiz_scores:
        base = (sum(quiz_scores) / len(quiz_scores)) * 0.75
    else:
        return 0.0

    total = len(quiz_attempts) + len(mock_attempts)
    bonus = min(10.0, total * 1.0)
    return round(min(100.0, max(0.0, base + bonus)), 1)



@router.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    uid = current_user.id

    materials = db.query(models.StudyMaterial).filter(models.StudyMaterial.user_id == uid).all()
    materials_count = len(materials)
    processed_count = sum(1 for m in materials if m.processing_status == "completed")
    questions_asked = db.query(models.QueryHistory).filter(models.QueryHistory.user_id == uid).count()

    quiz_attempts, mock_attempts, _ = _get_attempts(db, uid)

    quiz_attempt_count = len(quiz_attempts)
    avg_quiz_score = round(sum(a.score for a in quiz_attempts) / len(quiz_attempts), 1) if quiz_attempts else 0

    mock_scores        = [a.score for a in mock_attempts]
    mock_attempt_count = len(mock_attempts)
    avg_mock_score     = round(sum(mock_scores) / len(mock_scores), 1) if mock_scores else 0

    all_scores = [a.score for a in quiz_attempts] + mock_scores
    avg_score  = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0

    readiness_score = _readiness_score(quiz_attempts, mock_attempts)

    # Weak topics — require ≥2 appearances or match a real material subject
    real_subjects = {m.subject for m in materials if m.subject}
    weak_topic_counts: dict = {}
    for a in quiz_attempts + mock_attempts:
        for t in (getattr(a, 'weak_topics', None) or []):
            weak_topic_counts[t] = weak_topic_counts.get(t, 0) + 1
    filtered_weak = {
        t: cnt for t, cnt in weak_topic_counts.items()
        if cnt >= 2 or any(rs.lower() in t.lower() or t.lower() in rs.lower() for rs in real_subjects)
    }
    top_weak = [t for t, _ in sorted(filtered_weak.items(), key=lambda x: -x[1])[:5]]

    subject_counts: dict = {}
    for m in materials:
        if m.subject:
            subject_counts[m.subject] = subject_counts.get(m.subject, 0) + 1

    courses = db.query(models.Course).filter(models.Course.user_id == uid).all()
    past_paper_count = sum(1 for m in materials if m.material_type == "past_paper")

    recent_events = (
        db.query(models.ActivityEvent)
        .filter(models.ActivityEvent.user_id == uid)
        .order_by(models.ActivityEvent.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "stats": {
            "materials_count":   materials_count,
            "processed_count":   processed_count,
            "past_paper_count":  past_paper_count,
            "questions_asked":   questions_asked,
            "quiz_attempt_count": quiz_attempt_count,
            "mock_attempt_count": mock_attempt_count,
            "avg_score":         avg_score,
            "avg_quiz_score":    avg_quiz_score,
            "avg_mock_score":    avg_mock_score,
            "readiness_score":   readiness_score,
            "courses_count":     len(courses),
        },
        "weak_topics": top_weak,
        "subjects":    subject_counts,
        "courses": [
            {
                "id": c.id,
                "name": c.name,
                "material_count": len(c.materials),
                "past_paper_count": sum(1 for m in c.materials if m.material_type == "past_paper"),
            }
            for c in courses
        ],
        "materials": [
            {
                "id": m.id,
                "name": m.original_name,
                "status": m.processing_status,
                "material_type": m.material_type,
                "subject": m.subject,
                "exam_year": m.exam_year,
                "upload_date": m.upload_date.isoformat() if m.upload_date else None,
            }
            for m in sorted(materials, key=lambda x: x.upload_date or x.id, reverse=True)[:5]
        ],
        "recent_activity": [
            {
                "id": e.id,
                "type": e.event_type,
                "description": e.description,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in recent_events
        ],
    }


@router.get("/readiness")
def get_readiness(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    uid = current_user.id
    quiz_attempts, mock_attempts, _ = _get_attempts(db, uid)

    avg_score   = sum(a.score for a in quiz_attempts) / len(quiz_attempts) if quiz_attempts else 0
    mock_scores = [a.score for a in mock_attempts]

    weak_topic_counts: dict = {}
    for a in quiz_attempts + mock_attempts:
        for t in (getattr(a, 'weak_topics', None) or []):
            weak_topic_counts[t] = weak_topic_counts.get(t, 0) + 1

    materials_count = db.query(models.StudyMaterial).filter(models.StudyMaterial.user_id == uid).count()
    questions_asked = db.query(models.QueryHistory).filter(models.QueryHistory.user_id == uid).count()

    readiness = calculate_readiness({
        "quiz_attempts":  len(quiz_attempts) + len(mock_attempts),
        "avg_score":      avg_score,
        "mock_scores":    mock_scores,
        "weak_topics":    list(weak_topic_counts.keys())[:5],
        "materials_count": materials_count,
        "questions_asked": questions_asked,
    })
    return readiness


@router.get("/progress")
def get_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    uid = current_user.id
    quiz_attempts, _, proper_mock = _get_attempts(db, uid)

    quiz_trend = [
        {
            "date":  a.completed_at.isoformat() if a.completed_at else None,
            "score": a.score,
            "type":  "quiz",
        }
        for a in sorted(quiz_attempts, key=lambda a: a.completed_at or a.id)
    ]

    mock_trend = [
        {
            "date":      a.completed_at.isoformat() if a.completed_at else None,
            "score":     a.score,
            "readiness": getattr(a, "readiness_score", 0),
            "type":      "mock",
        }
        for a in sorted(proper_mock, key=lambda a: a.completed_at or a.id)
    ]

    all_attempts = quiz_attempts + proper_mock
    return {
        "quiz_trend":       quiz_trend,
        "mock_trend":       mock_trend,
        "total_study_time": sum(a.time_taken for a in all_attempts),
    }
