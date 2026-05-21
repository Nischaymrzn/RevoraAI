from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user
import models
from services.rag_service import answer_question
from services.pattern_service import analyze_patterns, calculate_readiness

router = APIRouter(prefix="/api/qa", tags=["qa"])


class QuestionRequest(BaseModel):
    question: str
    material_id: Optional[int] = None
    material_type: Optional[str] = None  # optionally filter by type


class PatternRequest(BaseModel):
    material_id: int


@router.post("/ask")
def ask_question(
    req: QuestionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if req.material_id:
        material = db.query(models.StudyMaterial).filter(
            models.StudyMaterial.id == req.material_id,
            models.StudyMaterial.user_id == current_user.id,
        ).first()
        if not material:
            raise HTTPException(status_code=404, detail="Material not found")
        if material.processing_status != "completed":
            raise HTTPException(status_code=400, detail="Material still being processed")

    result = answer_question(
        db=db,
        user_id=current_user.id,
        question=req.question,
        material_id=req.material_id,
        material_type=req.material_type,
    )

    history = models.QueryHistory(
        user_id=current_user.id,
        material_id=req.material_id,
        question=req.question,
        answer=result["answer"],
        sources=result["sources"],
    )
    db.add(history)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="question",
        description=f"Asked: {req.question[:80]}...",
        event_metadata={"material_id": req.material_id},
    )
    db.add(event)
    db.commit()

    return result


@router.get("/history")
def get_history(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    queries = (
        db.query(models.QueryHistory)
        .filter(models.QueryHistory.user_id == current_user.id)
        .order_by(models.QueryHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": q.id,
            "question": q.question,
            "answer": q.answer,
            "material_id": q.material_id,
            "sources": q.sources,
            "created_at": q.created_at.isoformat() if q.created_at else None,
        }
        for q in queries
    ]


@router.post("/analyze-patterns")
def run_pattern_analysis(
    req: PatternRequest,
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

    analysis = analyze_patterns(content, material.original_name)

    pa = models.PatternAnalysis(
        material_id=req.material_id,
        user_id=current_user.id,
        topics=[t["name"] for t in analysis.get("main_topics", [])],
        likely_questions=analysis.get("likely_questions", []),
        analysis_text=analysis.get("analysis_summary", ""),
        topic_weights=analysis.get("topic_distribution", {}),
    )
    db.add(pa)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="pattern_analysis",
        description=f"Analysed patterns in {material.original_name}",
        event_metadata={"material_id": req.material_id},
    )
    db.add(event)
    db.commit()

    return analysis


@router.get("/pattern-analysis/{material_id}")
def get_pattern_analysis(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pa = db.query(models.PatternAnalysis).filter(
        models.PatternAnalysis.material_id == material_id,
        models.PatternAnalysis.user_id == current_user.id,
    ).order_by(models.PatternAnalysis.created_at.desc()).first()

    if not pa:
        return None

    return {
        "id": pa.id,
        "material_id": pa.material_id,
        "topics": pa.topics,
        "likely_questions": pa.likely_questions,
        "analysis_text": pa.analysis_text,
        "topic_weights": pa.topic_weights,
        "created_at": pa.created_at.isoformat() if pa.created_at else None,
    }
