from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from auth import get_current_user
import models
from services.rag_service import answer_question, summarize_material
from services.pattern_service import analyze_patterns, calculate_readiness
from services.rag_pattern_service import analyze_papers_rag
from services.question_clusterer import cluster_questions, has_extracted_questions
from services.question_extractor import build_section_breakdown

router = APIRouter(prefix="/api/qa", tags=["qa"])


class QuestionRequest(BaseModel):
    question: str
    material_id: Optional[int] = None
    material_ids: Optional[List[int]] = None
    material_type: Optional[str] = None


class PatternRequest(BaseModel):
    material_id: int


class PaperAnalysisRequest(BaseModel):
    material_ids: List[int]
    label: Optional[str] = None       # optional human name for this run


class LessonSummaryRequest(BaseModel):
    material_ids: List[int]           # lesson/notes materials to summarise


class AssessmentRequest(BaseModel):
    analysis_id: int                  # PatternAnalysis.id to generate from
    count: int = 10
    title: Optional[str] = None


# ── AI Tutor ──────────────────────────────────────────────────────────────────

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
        material_ids=req.material_ids if req.material_ids else None,
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
        description=f"Asked: {req.question[:80]}",
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


# ── Single-material pattern analysis (legacy) ─────────────────────────────────

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
        full_result_json=analysis,
        analysis_label=material.original_name,
        papers_analyzed=[{"id": material.id, "name": material.original_name}],
    )
    db.add(pa)
    db.commit()
    return analysis


# ── Lesson/notes summary (separate from past-paper pattern analysis) ──────────

@router.post("/lesson-summary")
def lesson_summary(
    req: LessonSummaryRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Summarise lesson/course materials — topic breakdown, key concepts, study notes.
    This is the NON-past-paper path. For past papers use /analyze-papers.
    """
    if not req.material_ids:
        raise HTTPException(status_code=400, detail="Select at least one material")

    summaries = []
    for mid in req.material_ids:
        m = db.query(models.StudyMaterial).filter(
            models.StudyMaterial.id == mid,
            models.StudyMaterial.user_id == current_user.id,
        ).first()
        if not m or m.processing_status != "completed":
            continue

        chunks = (
            db.query(models.MaterialChunk)
            .filter(models.MaterialChunk.material_id == mid)
            .order_by(models.MaterialChunk.chunk_index)
            .limit(20)
            .all()
        )
        content = " ".join(c.chunk_text for c in chunks)

        # Use the existing summarize_material which calls the large LLM
        summary_text = summarize_material(content)
        summaries.append({
            "material_id": mid,
            "material_name": m.original_name,
            "material_type": m.material_type,
            "subject": m.subject,
            "summary": summary_text,
        })

        # Cache the summary on the material record
        if not m.summary:
            m.summary = summary_text
            db.commit()

    return {
        "type": "lesson_summary",
        "count": len(summaries),
        "summaries": summaries,
    }


# ── Past-paper RAG pattern analysis ──────────────────────────────────────────

@router.post("/analyze-papers")
def run_paper_analysis(
    req: PaperAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    True RAG-based multi-paper pattern analysis.

    Steps:
    1. RAG semantic topic retrieval across all selected papers.
    2. Cross-paper question clustering (the "underlining" feature).
    3. Section-level breakdown (MCQ / short / long).
    4. Store full result in PatternAnalysis for history.
    5. Return combined analysis.
    """
    if not req.material_ids:
        raise HTTPException(status_code=400, detail="Select at least one material")

    # Verify ownership and processing status
    verified = []
    for mid in req.material_ids:
        m = db.query(models.StudyMaterial).filter(
            models.StudyMaterial.id == mid,
            models.StudyMaterial.user_id == current_user.id,
        ).first()
        if not m:
            raise HTTPException(status_code=404, detail=f"Material {mid} not found")
        if m.processing_status != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"'{m.original_name}' is still processing. Wait for it to finish.",
            )
        verified.append(m)

    # Resolve subject from stored metadata
    subjects = {m.subject for m in verified if m.subject}
    subject = next(iter(subjects), None)

    has_past_papers = any(m.material_type == "past_paper" for m in verified)

    # ── Step 1: RAG topic analysis ────────────────────────────────────────────
    rag_analysis = analyze_papers_rag(
        db=db,
        user_id=current_user.id,
        material_ids=req.material_ids,
        subject=subject,
    )

    # ── Step 2: Question clustering (same question across papers) ─────────────
    question_clusters: List[dict] = []
    section_breakdown: dict = {}

    if has_extracted_questions(db, current_user.id, req.material_ids):
        print(f"[analyze-papers] Running question clustering for {len(req.material_ids)} papers...")
        question_clusters = cluster_questions(
            db=db,
            user_id=current_user.id,
            material_ids=req.material_ids,
        )

        # ── Step 3: Section breakdown ─────────────────────────────────────────
        pq_rows = (
            db.query(models.PaperQuestion)
            .filter(
                models.PaperQuestion.material_id.in_(req.material_ids),
                models.PaperQuestion.user_id == current_user.id,
            )
            .all()
        )
        section_breakdown = build_section_breakdown([
            {
                "section": pq.section,
                "detected_topic": pq.detected_topic,
                "detected_chapter": pq.detected_chapter,
                "marks": pq.marks,
                "material_id": pq.material_id,
            }
            for pq in pq_rows
        ])

        # ── Step 3b: Question-type frequency across papers ────────────────────
        # For each section type (mcq/short/long) AND "code" category, count
        # how many of the selected papers contain that type.
        # Code detection: prefer question_category="code" from the LLM extractor;
        # fall back to keyword matching for older records without the field.
        _CODE_KW = frozenset([
            "write a program", "write program", "program to", "code to",
            "write a code", "write code", "write the code", "write a function",
            "write function", "write a class", "write an algorithm", "write algorithm",
            "pseudocode", "pseudo code", "trace the", "trace this",
            "output of the following", "output of following", "find the output",
            "what is the output", "what will be the output", "identify the error",
            "debug", "syntax error", "runtime error", "compile", "execute",
        ])

        def _is_code_q(pq) -> bool:
            if pq.question_category == "code":
                return True
            if pq.question_category and pq.question_category != "other":
                return False   # has a non-code category set — trust it
            # fallback: keyword scan for older records
            q_lower = (pq.question_text or "").lower()
            return any(kw in q_lower for kw in _CODE_KW)

        _type_paper_map: dict = {}   # section -> set of material_ids
        _code_paper_ids: set = set()
        _cat_paper_map: dict = {}    # question_category -> set of material_ids

        for pq in pq_rows:
            _type_paper_map.setdefault(pq.section, set()).add(pq.material_id)
            if _is_code_q(pq):
                _code_paper_ids.add(pq.material_id)
            # Track per-category (theory/numerical/diagram) if extracted
            cat = pq.question_category
            if cat and cat not in ("code", "other"):
                _cat_paper_map.setdefault(cat, set()).add(pq.material_id)

        n_papers = len(req.material_ids)
        question_type_frequency: dict = {}

        # Section-level frequency (mcq / short_answer / long_answer)
        for sec, paper_ids in _type_paper_map.items():
            sec_pqs = [pq for pq in pq_rows if pq.section == sec]
            question_type_frequency[sec] = {
                "papers": len(paper_ids),
                "total_papers": n_papers,
                "pct": round(len(paper_ids) / n_papers * 100) if n_papers else 0,
                "question_count": len(sec_pqs),
                "total_marks": sum((pq.marks or 0) for pq in sec_pqs),
            }

        # Code questions (cross-cutting — spans all sections)
        code_pqs = [pq for pq in pq_rows if _is_code_q(pq)]
        if code_pqs:
            question_type_frequency["code"] = {
                "papers": len(_code_paper_ids),
                "total_papers": n_papers,
                "pct": round(len(_code_paper_ids) / n_papers * 100) if n_papers else 0,
                "question_count": len(code_pqs),
                "total_marks": 0,
            }

        # Additional categories from LLM extraction (theory / numerical / diagram)
        for cat, paper_ids in _cat_paper_map.items():
            cat_pqs = [pq for pq in pq_rows if pq.question_category == cat]
            question_type_frequency[cat] = {
                "papers": len(paper_ids),
                "total_papers": n_papers,
                "pct": round(len(paper_ids) / n_papers * 100) if n_papers else 0,
                "question_count": len(cat_pqs),
                "total_marks": sum((pq.marks or 0) for pq in cat_pqs),
            }

    else:
        print(f"[analyze-papers] No extracted questions yet — clustering skipped. Re-upload past papers to enable.")
        question_type_frequency = {}

    # ── Step 4: Build combined result ─────────────────────────────────────────
    papers_info = [
        {
            "id": m.id,
            "name": m.original_name,
            "year": m.exam_year,
            "board": m.exam_board,
            "subject": m.subject,
        }
        for m in verified
    ]

    combined = {
        **rag_analysis,
        "question_clusters": question_clusters,
        "section_breakdown": section_breakdown,
        "question_type_frequency": question_type_frequency,
        "papers_analyzed": papers_info,
        "has_question_extraction": len(question_clusters) > 0 or bool(section_breakdown),
    }

    # ── Step 5: Persist in history ────────────────────────────────────────────
    course_ids = {m.course_id for m in verified if m.course_id}
    shared_course_id = next(iter(course_ids), None) if len(course_ids) == 1 else None

    label = req.label or (
        f"{subject or 'General'} — "
        + ", ".join(str(m.exam_year or m.original_name) for m in verified)
    )

    pa = models.PatternAnalysis(
        material_id=verified[0].id,
        user_id=current_user.id,
        course_id=shared_course_id,
        material_ids_json=req.material_ids,
        is_past_paper_analysis=has_past_papers,
        topics=[t["name"] for t in rag_analysis.get("main_topics", [])],
        likely_questions=rag_analysis.get("likely_questions", []),
        analysis_text=rag_analysis.get("analysis_summary", ""),
        topic_weights=rag_analysis.get("topic_distribution", {}),
        full_result_json=combined,
        question_clusters_json=question_clusters,
        section_breakdown_json=section_breakdown,
        analysis_label=label,
        papers_analyzed=papers_info,
    )
    db.add(pa)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="pattern_analysis",
        description=f"Analysed {len(verified)} paper(s) — {label}",
        event_metadata={
            "analysis_id": None,  # filled after flush
            "material_ids": req.material_ids,
            "subject": subject,
            "clusters_found": len(question_clusters),
        },
    )
    db.add(event)
    db.flush()

    # Backfill analysis_id now that we have it
    event.event_metadata = {**event.event_metadata, "analysis_id": pa.id}
    combined["analysis_id"] = pa.id
    db.commit()

    return combined


# ── Analysis history ──────────────────────────────────────────────────────────

@router.get("/analysis-history")
def get_analysis_history(
    limit: int = 20,
    course_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all past pattern analyses for the current user, newest first."""
    q = (
        db.query(models.PatternAnalysis)
        .filter(models.PatternAnalysis.user_id == current_user.id)
        .order_by(models.PatternAnalysis.created_at.desc())
    )
    if course_id:
        q = q.filter(models.PatternAnalysis.course_id == course_id)

    analyses = q.limit(limit).all()
    return [
        {
            "id": pa.id,
            "label": pa.analysis_label or f"Analysis #{pa.id}",
            "is_past_paper": pa.is_past_paper_analysis,
            "material_ids": pa.material_ids_json or [pa.material_id],
            "papers_analyzed": pa.papers_analyzed,
            "course_id": pa.course_id,
            "topics": pa.topics,
            "cluster_count": len(pa.question_clusters_json or []),
            "analysis_text": pa.analysis_text,
            "created_at": pa.created_at.isoformat() if pa.created_at else None,
        }
        for pa in analyses
    ]


@router.get("/analysis-history/{analysis_id}")
def get_analysis_detail(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get the full result of a specific past analysis."""
    pa = db.query(models.PatternAnalysis).filter(
        models.PatternAnalysis.id == analysis_id,
        models.PatternAnalysis.user_id == current_user.id,
    ).first()
    if not pa:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {
        "id": pa.id,
        "label": pa.analysis_label or f"Analysis #{pa.id}",
        "is_past_paper": pa.is_past_paper_analysis,
        "material_ids": pa.material_ids_json or [pa.material_id],
        "papers_analyzed": pa.papers_analyzed,
        "course_id": pa.course_id,
        "created_at": pa.created_at.isoformat() if pa.created_at else None,
        # Full stored result
        "full_result": pa.full_result_json or {
            "analysis_summary": pa.analysis_text,
            "main_topics": [{"name": t} for t in (pa.topics or [])],
            "likely_questions": pa.likely_questions or [],
            "topic_distribution": pa.topic_weights or {},
        },
        "question_clusters": pa.question_clusters_json or [],
        "section_breakdown": pa.section_breakdown_json or {},
    }


# ── Assessment from analysis ──────────────────────────────────────────────────

def _extract_json_array(raw: str) -> list:
    """Robustly extract a JSON array from LLM output, handling markdown fences."""
    import json, re
    # Strip markdown code fences
    raw = re.sub(r'```(?:json)?', '', raw).strip()
    # Try to find array with dotall
    m = re.search(r'\[.*?\]', raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    # Try whole string
    try:
        return json.loads(raw)
    except Exception:
        pass
    # Try to salvage partial JSON: find all {...} objects
    objects = re.findall(r'\{[^{}]+\}', raw, re.DOTALL)
    if objects:
        try:
            return [json.loads(o) for o in objects]
        except Exception:
            pass
    return []


@router.post("/assessment-from-analysis")
def assessment_from_analysis(
    req: AssessmentRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Generate an assessment from a saved pattern analysis.

    Question sourcing priority:
    1. Actual PaperQuestion rows from the analysed papers — clustered (repeated) first
    2. Likely_questions from RAG analysis — fills remaining slots if extracted Qs are sparse
    """
    from services.ai_client import generate

    pa = db.query(models.PatternAnalysis).filter(
        models.PatternAnalysis.id == req.analysis_id,
        models.PatternAnalysis.user_id == current_user.id,
    ).first()
    if not pa:
        raise HTTPException(status_code=404, detail="Analysis not found")

    material_ids: List[int] = pa.material_ids_json or [pa.material_id]

    # ── 1. Paper context ───────────────────────────────────────────────────────
    papers = db.query(models.StudyMaterial).filter(
        models.StudyMaterial.id.in_(material_ids),
    ).all()
    subject     = next((p.subject     for p in papers if p.subject),     "")
    grade       = next((p.grade_level for p in papers if p.grade_level), "Senior Secondary")
    board       = next((p.exam_board  for p in papers if p.exam_board),  "NEB")
    years       = sorted({p.exam_year for p in papers if p.exam_year})
    context_line = (
        f"Subject: {subject or 'Computer Science'} | "
        f"Grade/Level: {grade} | "
        f"Board: {board} | "
        f"Paper years: {', '.join(str(y) for y in years) if years else 'N/A'}"
    )

    # ── 2. Build cluster question text set (for priority ordering) ─────────────
    cluster_texts: set = set()
    for cluster in (pa.question_clusters_json or []):
        for q in cluster.get("questions", []):
            txt = (q.get("question_text") or "")[:200].lower().strip()
            if txt:
                cluster_texts.add(txt)
        rep = (cluster.get("representative_question") or "")[:200].lower().strip()
        if rep:
            cluster_texts.add(rep)

    def _is_cluster_q(text: str) -> bool:
        t = text[:200].lower().strip()
        return any(t in c or c in t for c in cluster_texts)

    # ── 3. Pull actual extracted questions from the papers ─────────────────────
    SEC_ORDER = {"mcq": 0, "short_answer": 1, "long_answer": 2, "unknown": 3}

    pq_rows = (
        db.query(models.PaperQuestion)
        .filter(
            models.PaperQuestion.material_id.in_(material_ids),
            models.PaperQuestion.user_id == current_user.id,
        )
        .order_by(models.PaperQuestion.material_id, models.PaperQuestion.question_number)
        .all()
    )

    cluster_qs: List[dict] = []
    other_qs:   List[dict] = []

    for pq in pq_rows:
        q_text = (pq.question_text or "").strip()
        if not q_text or len(q_text) < 8:
            continue
        entry = {
            "section": pq.section,
            "q_num":   pq.question_number,
            "text":    q_text,
            "options": pq.options,
            "marks":   pq.marks,
            "topic":   pq.detected_topic   or "",
            "chapter": pq.detected_chapter or "",
            "category":pq.question_category or "",
        }
        (cluster_qs if _is_cluster_q(q_text) else other_qs).append(entry)

    # Section order within non-cluster: MCQ first (complete with options), then short, then long
    other_qs.sort(key=lambda q: SEC_ORDER.get(q["section"], 3))

    all_candidates = cluster_qs + other_qs

    # ── 4. Supplement with RAG likely_questions if extracted Qs are sparse ─────
    if len(all_candidates) < req.count:
        for lq in (pa.likely_questions or []):
            q_text = (lq.get("question") or "").strip()
            if q_text:
                all_candidates.append({
                    "section":  lq.get("type", "short_answer"),
                    "q_num":    None,
                    "text":     q_text,
                    "options":  None,
                    "marks":    lq.get("marks"),
                    "topic":    lq.get("topic", ""),
                    "chapter":  "",
                    "category": "",
                })

    selected = all_candidates[: req.count]

    if not selected:
        raise HTTPException(
            status_code=400,
            detail="No questions available. Upload and re-analyse past papers first.",
        )

    # ── 5. Build prompt with full question context ─────────────────────────────
    SEC_LABEL = {"mcq": "MCQ", "short_answer": "Short Answer", "long_answer": "Long Answer"}

    q_blocks: List[str] = []
    for i, q in enumerate(selected):
        sec_lbl = SEC_LABEL.get(q["section"], "Question")
        block = f"\n{i+1}. [{sec_lbl}]"
        if q["q_num"]:
            block += f" Q{q['q_num']}"
        if q["marks"]:
            block += f" [{q['marks']} marks]"
        block += f"\n{q['text']}"
        if q["options"]:                        # MCQ options already extracted
            for opt in q["options"]:
                block += f"\n   {opt}"
        if q["topic"]:
            block += f"\n   (Topic: {q['topic']})"
        q_blocks.append(block)

    FORMAT_PROMPT = f"""You are an exam paper formatter for the following paper context:
{context_line}

Format the {len(selected)} questions below into a proper exam assessment.
These questions are taken DIRECTLY from past exam papers — preserve each question's text exactly as written.

{"".join(q_blocks)}

Return a JSON array with EXACTLY {len(selected)} entries — one per question above.
Each entry must have:
  "question":       the FULL question text exactly as given (do not truncate, do not rewrite)
  "type":           "mcq" | "short_answer" | "long_answer"
  "options":        for MCQ — array ["A. ...", "B. ...", "C. ...", "D. ..."] using the options given above; null for others
  "correct_answer": for MCQ — the correct option letter only (A/B/C/D);
                    for short_answer — a complete 2–4 sentence model answer;
                    for long_answer — a complete structured model answer (5–8 sentences)
  "explanation":    brief explanation of the key concepts tested
  "topic":          the topic/concept being tested
  "marks":          the marks value (integer; use given value or: MCQ=1, short=4, long=8)

CRITICAL RULES:
- Return EXACTLY {len(selected)} JSON objects in the array
- Do NOT skip any question
- question text must be COMPLETE — copy it exactly from above
- For MCQ with given options above, use those exact options
- Do NOT add new questions or combine questions

Return ONLY the JSON array:"""

    # ── 6. Call LLM and parse robustly ────────────────────────────────────────
    questions_data: list = []
    try:
        raw = generate(FORMAT_PROMPT, temperature=0.15, large=True)
        questions_data = _extract_json_array(raw)
    except Exception as e:
        print(f"[assessment] LLM call failed: {e}")

    # Fallback: if we got fewer questions than requested, fill from selected directly
    if len(questions_data) < len(selected):
        print(f"[assessment] LLM returned {len(questions_data)}/{len(selected)} — filling gaps")
        existing_texts = {q.get("question", "")[:80].lower() for q in questions_data}
        for i, s in enumerate(selected):
            if s["text"][:80].lower() not in existing_texts:
                sec = s["section"]
                questions_data.append({
                    "question":       s["text"],
                    "type":           sec if sec in ("mcq", "short_answer", "long_answer") else "short_answer",
                    "options":        s["options"],
                    "correct_answer": "(See model answer)",
                    "explanation":    s["topic"],
                    "topic":          s["topic"],
                    "marks":          s["marks"] or (1 if sec == "mcq" else 4),
                })
            if len(questions_data) >= len(selected):
                break

    if not questions_data:
        raise HTTPException(status_code=500, detail="Assessment generation failed. Please try again.")

    # ── 7. Persist Quiz + QuizQuestions ───────────────────────────────────────
    title = req.title or f"Assessment — {pa.analysis_label or subject or 'Past Papers'}"
    quiz = models.Quiz(
        user_id=current_user.id,
        material_id=pa.material_id,
        title=title,
        quiz_type="mixed",
        questions_count=len(questions_data),
    )
    db.add(quiz)
    db.flush()

    for q in questions_data:
        qq = models.QuizQuestion(
            quiz_id=quiz.id,
            question=q.get("question", ""),
            question_type=q.get("type", "short_answer"),
            options=q.get("options"),
            correct_answer=q.get("correct_answer", ""),
            explanation=q.get("explanation", ""),
            topic=q.get("topic", ""),
            difficulty="medium",
        )
        db.add(qq)

    event = models.ActivityEvent(
        user_id=current_user.id,
        event_type="assessment_generated",
        description=f"Generated {len(questions_data)}-question assessment from: {pa.analysis_label}",
        event_metadata={"quiz_id": quiz.id, "analysis_id": req.analysis_id},
    )
    db.add(event)
    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "questions_count": quiz.questions_count,
        "source_analysis_id": req.analysis_id,
        "message": f"Assessment created with {quiz.questions_count} questions from pattern analysis",
    }


# ── Legacy single-material pattern endpoint ───────────────────────────────────

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
        "label": pa.analysis_label,
        "topics": pa.topics,
        "likely_questions": pa.likely_questions,
        "analysis_text": pa.analysis_text,
        "topic_weights": pa.topic_weights,
        "question_clusters": pa.question_clusters_json or [],
        "section_breakdown": pa.section_breakdown_json or {},
        "created_at": pa.created_at.isoformat() if pa.created_at else None,
    }
