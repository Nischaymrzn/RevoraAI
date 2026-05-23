from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from auth import get_current_user
import models
from services.pattern_service import calculate_readiness

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


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

    quiz_attempts = db.query(models.QuizAttempt).filter(models.QuizAttempt.user_id == uid).all()
    quiz_attempt_count = len(quiz_attempts)
    avg_quiz_score = round(sum(a.score for a in quiz_attempts) / len(quiz_attempts), 1) if quiz_attempts else 0

    mock_attempts = db.query(models.MockTestAttempt).filter(models.MockTestAttempt.user_id == uid).all()
    mock_attempt_count = len(mock_attempts)
    avg_mock_score = round(sum(a.score for a in mock_attempts) / len(mock_attempts), 1) if mock_attempts else 0

    all_scores = [a.score for a in quiz_attempts] + [a.score for a in mock_attempts]
    avg_score = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0

    # Collect weak topics — filter out obviously wrong/hallucinated ones by only
    # keeping topics that appear in at least 2 attempts OR match actual material subjects
    real_subjects = {m.subject for m in materials if m.subject}
    weak_topic_counts: dict = {}
    for a in quiz_attempts:
        for t in (a.weak_topics or []):
            weak_topic_counts[t] = weak_topic_counts.get(t, 0) + 1
    for a in mock_attempts:
        for t in (a.weak_topics or []):
            weak_topic_counts[t] = weak_topic_counts.get(t, 0) + 1
    # Filter: keep topics seen ≥2 times OR whose name substring-matches a real subject
    filtered_weak = {
        t: cnt for t, cnt in weak_topic_counts.items()
        if cnt >= 2 or any(rs.lower() in t.lower() or t.lower() in rs.lower() for rs in real_subjects)
    }
    weak_topics_sorted = sorted(filtered_weak.items(), key=lambda x: -x[1])
    top_weak = [t for t, _ in weak_topics_sorted[:5]]

    # Subjects from actual material metadata (ground truth — no hallucination)
    subject_counts: dict = {}
    for m in materials:
        if m.subject:
            subject_counts[m.subject] = subject_counts.get(m.subject, 0) + 1

    # Courses summary
    courses = db.query(models.Course).filter(models.Course.user_id == uid).all()

    # Past papers count
    past_paper_count = sum(1 for m in materials if m.material_type == "past_paper")

    # Latest readiness score
    latest_mock = (
        db.query(models.MockTestAttempt)
        .filter(models.MockTestAttempt.user_id == uid)
        .order_by(models.MockTestAttempt.completed_at.desc())
        .first()
    )
    readiness_score = latest_mock.readiness_score if latest_mock else 0

    # Recent activity
    recent_events = (
        db.query(models.ActivityEvent)
        .filter(models.ActivityEvent.user_id == uid)
        .order_by(models.ActivityEvent.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "stats": {
            "materials_count": materials_count,
            "processed_count": processed_count,
            "past_paper_count": past_paper_count,
            "questions_asked": questions_asked,
            "quiz_attempt_count": quiz_attempt_count,
            "mock_attempt_count": mock_attempt_count,
            "avg_score": avg_score,
            "avg_quiz_score": avg_quiz_score,
            "avg_mock_score": avg_mock_score,
            "readiness_score": readiness_score,
            "courses_count": len(courses),
        },
        "weak_topics": top_weak,
        "subjects": subject_counts,  # actual subjects from material metadata
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

    quiz_attempts = db.query(models.QuizAttempt).filter(models.QuizAttempt.user_id == uid).all()
    mock_attempts = db.query(models.MockTestAttempt).filter(models.MockTestAttempt.user_id == uid).all()

    avg_score = sum(a.score for a in quiz_attempts) / len(quiz_attempts) if quiz_attempts else 0
    mock_scores = [a.score for a in mock_attempts]

    weak_topic_counts: dict = {}
    for a in quiz_attempts + mock_attempts:
        for t in (a.weak_topics or []):
            weak_topic_counts[t] = weak_topic_counts.get(t, 0) + 1

    materials_count = db.query(models.StudyMaterial).filter(models.StudyMaterial.user_id == uid).count()
    questions_asked = db.query(models.QueryHistory).filter(models.QueryHistory.user_id == uid).count()

    readiness = calculate_readiness({
        "quiz_attempts": len(quiz_attempts),
        "avg_score": avg_score,
        "mock_scores": mock_scores,
        "weak_topics": list(weak_topic_counts.keys())[:5],
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

    quiz_attempts = db.query(models.QuizAttempt).filter(
        models.QuizAttempt.user_id == uid
    ).order_by(models.QuizAttempt.completed_at).all()

    mock_attempts = db.query(models.MockTestAttempt).filter(
        models.MockTestAttempt.user_id == uid
    ).order_by(models.MockTestAttempt.completed_at).all()

    quiz_trend = [
        {
            "date": a.completed_at.isoformat() if a.completed_at else None,
            "score": a.score,
            "type": "quiz",
        }
        for a in quiz_attempts
    ]

    mock_trend = [
        {
            "date": a.completed_at.isoformat() if a.completed_at else None,
            "score": a.score,
            "readiness": a.readiness_score,
            "type": "mock",
        }
        for a in mock_attempts
    ]

    return {
        "quiz_trend": quiz_trend,
        "mock_trend": mock_trend,
        "total_study_time": sum(a.time_taken for a in quiz_attempts) + sum(a.time_taken for a in mock_attempts),
    }
