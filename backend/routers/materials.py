import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
import models
from config import UPLOAD_DIR, ALLOWED_EXTENSIONS, CHUNK_SIZE, CHUNK_OVERLAP
from services.document_processor import extract_text_from_file, chunk_text
from services.storage_service import upload_material as upload_to_storage, delete_material as delete_from_storage

router = APIRouter(prefix="/api/materials", tags=["materials"])

os.makedirs(UPLOAD_DIR, exist_ok=True)

VALID_MATERIAL_TYPES = {"general", "past_paper", "lesson", "notes", "textbook"}


def _log_activity(db: Session, user_id: int, event_type: str, description: str, metadata: dict = None):
    event = models.ActivityEvent(user_id=user_id, event_type=event_type, description=description, event_metadata=metadata)
    db.add(event)
    db.commit()


def _process_material(material_id: int, temp_filepath: str, file_type: str, db_url: str, user_id: int):
    """
    Background task: extract text → chunk → embed each chunk via Google API
    → store embeddings in PostgreSQL (pgvector).
    Temp file is deleted at the end regardless of success/failure.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from services.vector_store import embed_text

    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        material = db.query(models.StudyMaterial).filter(models.StudyMaterial.id == material_id).first()
        if not material:
            return

        material.processing_status = "processing"
        db.commit()

        text, page_count = extract_text_from_file(temp_filepath, file_type)
        chunks = chunk_text(text, CHUNK_SIZE, CHUNK_OVERLAP)
        word_count = len(text.split())

        # Embed each chunk and store in DB with pgvector
        for i, chunk in enumerate(chunks):
            embedding = embed_text(chunk, task_type="retrieval_document")
            c = models.MaterialChunk(
                material_id=material_id,
                chunk_text=chunk,
                chunk_index=i,
                char_count=len(chunk),
                embedding=embedding,
            )
            db.add(c)

        material.processing_status = "completed"
        material.page_count = page_count
        material.chunk_count = len(chunks)
        material.word_count = word_count
        db.commit()

    except Exception as e:
        import traceback
        print(f"[ERROR] _process_material failed for material {material_id}: {e}")
        traceback.print_exc()
        try:
            db.rollback()
            material = db.query(models.StudyMaterial).filter(models.StudyMaterial.id == material_id).first()
            if material:
                material.processing_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
        # Always delete the temp file after processing
        if os.path.exists(temp_filepath):
            os.remove(temp_filepath)


@router.post("/upload")
def upload_material(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    material_type: str = Form(default="general"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Validate material type
    if material_type not in VALID_MATERIAL_TYPES:
        material_type = "general"

    # Read file content
    content = file.file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 50MB.")

    unique_name = f"{uuid.uuid4()}{ext}"

    # Upload permanently to Supabase Storage
    storage_url = upload_to_storage(unique_name, content)

    # Save temp file for background processing
    temp_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(temp_path, "wb") as f:
        f.write(content)

    # Create DB record
    material = models.StudyMaterial(
        user_id=current_user.id,
        filename=unique_name,
        original_name=file.filename,
        file_type=ext,
        file_size=len(content),
        processing_status="pending",
        material_type=material_type,
        storage_url=storage_url,
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    # Queue background processing (extract text → embed → store in pgvector)
    from config import DATABASE_URL
    background_tasks.add_task(
        _process_material, material.id, temp_path, ext, DATABASE_URL, current_user.id
    )

    _log_activity(db, current_user.id, "upload", f"Uploaded {file.filename}", {"material_id": material.id})

    return {
        "id": material.id,
        "original_name": material.original_name,
        "file_type": material.file_type,
        "material_type": material.material_type,
        "processing_status": material.processing_status,
        "message": "File uploaded. Processing started in background.",
    }


@router.get("/")
def list_materials(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    materials = (
        db.query(models.StudyMaterial)
        .filter(models.StudyMaterial.user_id == current_user.id)
        .order_by(models.StudyMaterial.upload_date.desc())
        .all()
    )
    return [
        {
            "id": m.id,
            "original_name": m.original_name,
            "file_type": m.file_type,
            "file_size": m.file_size,
            "upload_date": m.upload_date.isoformat() if m.upload_date else None,
            "processing_status": m.processing_status,
            "material_type": m.material_type,
            "page_count": m.page_count,
            "chunk_count": m.chunk_count,
            "word_count": m.word_count,
            "has_summary": bool(m.summary),
            "storage_url": m.storage_url,
        }
        for m in materials
    ]


@router.get("/{material_id}")
def get_material(material_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    m = db.query(models.StudyMaterial).filter(
        models.StudyMaterial.id == material_id,
        models.StudyMaterial.user_id == current_user.id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    chunks = db.query(models.MaterialChunk).filter(models.MaterialChunk.material_id == material_id).all()
    patterns = db.query(models.PatternAnalysis).filter(models.PatternAnalysis.material_id == material_id).first()

    return {
        "id": m.id,
        "original_name": m.original_name,
        "file_type": m.file_type,
        "file_size": m.file_size,
        "upload_date": m.upload_date.isoformat() if m.upload_date else None,
        "processing_status": m.processing_status,
        "material_type": m.material_type,
        "page_count": m.page_count,
        "chunk_count": m.chunk_count,
        "word_count": m.word_count,
        "summary": m.summary,
        "storage_url": m.storage_url,
        "chunks_preview": [c.chunk_text[:200] for c in chunks[:3]],
        "has_pattern_analysis": bool(patterns),
    }


@router.post("/{material_id}/summarize")
def summarize_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from services.rag_service import summarize_material as do_summarize

    m = db.query(models.StudyMaterial).filter(
        models.StudyMaterial.id == material_id,
        models.StudyMaterial.user_id == current_user.id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    if m.processing_status != "completed":
        raise HTTPException(status_code=400, detail="Material is still being processed")

    chunks = db.query(models.MaterialChunk).filter(models.MaterialChunk.material_id == material_id).all()
    content = " ".join([c.chunk_text for c in chunks[:20]])

    summary = do_summarize(content)
    m.summary = summary
    db.commit()

    _log_activity(db, current_user.id, "summarize", f"Generated summary for {m.original_name}", {"material_id": m.id})

    return {"summary": summary}


@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    m = db.query(models.StudyMaterial).filter(
        models.StudyMaterial.id == material_id,
        models.StudyMaterial.user_id == current_user.id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")

    # Delete from Supabase Storage
    delete_from_storage(m.filename)

    # DB cascade deletes all chunks (including their embeddings) automatically
    db.delete(m)
    db.commit()

    return {"message": "Material deleted successfully"}
