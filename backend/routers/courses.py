"""
Course management — CRUD for the Course model.
Courses act as subject buckets that group study materials (notes, past papers)
so pattern analysis is scoped to the right domain.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/courses", tags=["courses"])


class CourseCreate(BaseModel):
    name: str
    code: Optional[str] = None
    grade_level: Optional[str] = None
    exam_board: Optional[str] = None
    description: Optional[str] = None


class CourseUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    grade_level: Optional[str] = None
    exam_board: Optional[str] = None
    description: Optional[str] = None


def _course_dict(course: models.Course, include_materials: bool = False) -> dict:
    d = {
        "id": course.id,
        "name": course.name,
        "code": course.code,
        "grade_level": course.grade_level,
        "exam_board": course.exam_board,
        "description": course.description,
        "created_at": course.created_at.isoformat() if course.created_at else None,
        "material_count": len(course.materials),
        "past_paper_count": sum(1 for m in course.materials if m.material_type == "past_paper"),
    }
    if include_materials:
        d["materials"] = [
            {
                "id": m.id,
                "original_name": m.original_name,
                "material_type": m.material_type,
                "exam_year": m.exam_year,
                "exam_board": m.exam_board,
                "subject": m.subject,
                "processing_status": m.processing_status,
            }
            for m in sorted(course.materials, key=lambda x: x.exam_year or 0)
        ]
    return d


@router.get("/")
def list_courses(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    courses = (
        db.query(models.Course)
        .filter(models.Course.user_id == current_user.id)
        .order_by(models.Course.created_at.desc())
        .all()
    )
    return [_course_dict(c) for c in courses]


@router.post("/", status_code=201)
def create_course(
    body: CourseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = models.Course(
        user_id=current_user.id,
        name=body.name.strip(),
        code=body.code.strip() if body.code else None,
        grade_level=body.grade_level,
        exam_board=body.exam_board,
        description=body.description,
    )
    db.add(course)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="course_created",
        description=f"Created course: {body.name}",
        event_metadata={"course_name": body.name},
    )
    db.add(event)
    db.commit()
    db.refresh(course)
    return _course_dict(course)


@router.get("/{course_id}")
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.user_id == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return _course_dict(course, include_materials=True)


@router.patch("/{course_id}")
def update_course(
    course_id: int,
    body: CourseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.user_id == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if body.name is not None:
        course.name = body.name.strip()
    if body.code is not None:
        course.code = body.code.strip() or None
    if body.grade_level is not None:
        course.grade_level = body.grade_level or None
    if body.exam_board is not None:
        course.exam_board = body.exam_board or None
    if body.description is not None:
        course.description = body.description or None

    db.commit()
    db.refresh(course)
    return _course_dict(course)


@router.delete("/{course_id}")
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    course = db.query(models.Course).filter(
        models.Course.id == course_id,
        models.Course.user_id == current_user.id,
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    db.delete(course)
    db.commit()
    return {"message": "Course deleted"}
