"""
Extract individual questions from past exam paper OCR text.

A NEB/Cambridge/CBSE paper typically looks like:
  Group A (MCQ) — 10 questions × 1 mark
  Group B (Short answer) — 8 questions × 4 marks
  Group C / Group D (Long answer) — 4 questions × 8 marks

This service:
1. Extracts every question, its section type, marks, and options (for MCQ).
2. Classifies each question to a chapter/topic using the LLM.
3. Embeds each question text for later cross-paper similarity clustering.
"""

import json
import re
from typing import List, Dict, Any, Optional
from services.ai_client import generate


# ── Extraction ────────────────────────────────────────────────────────────────

EXTRACT_PROMPT = """You are an exam question extractor. Extract ALL questions from this past exam paper.

Exam papers have sections like:
  - Group A / Section A / Part A — MCQ (multiple choice, 1 mark each, options A/B/C/D)
  - Group B / Section B — Short answer questions (2–8 marks each)
  - Group C / Group D / Section C — Long answer / essay questions (8–16 marks each)

Paper text:
{text}

Extract every single question and return a JSON array. For each question:
  "section":          "mcq", "short_answer", or "long_answer"
  "question_number":  the number printed in the paper (integer), or null
  "question_text":    the complete question text as written
  "options":          array like ["A. SELECT", "B. INSERT", "C. CREATE", "D. UPDATE"] for MCQ, else null
  "marks":            integer marks if visible in the paper, else null
  "detected_topic":   the concept or keyword this question tests (e.g. "SQL normalization", "OOP inheritance")
  "question_category": classify the question nature — one of:
      "code"      — asks to write/trace/debug a program, algorithm, function, or code output
      "theory"    — asks to define, explain, describe, or compare concepts
      "numerical" — involves calculation, formula application, or numeric answer
      "diagram"   — asks to draw, label, or interpret a diagram/flowchart/ER diagram
      "other"     — anything that doesn't fit the above

Rules:
- Include ALL questions — don't skip any section
- For MCQ, put the full option text including letter prefix
- question_text should be the question only, NOT the options
- If you cannot determine section, use "unknown"
- "code" category: look for "write a program", "algorithm", "trace", "output of", "pseudocode", "write a function"

Return ONLY the JSON array, nothing else:"""


# ── Chapter detection ─────────────────────────────────────────────────────────

CHAPTER_DETECT_PROMPT = """You are a curriculum expert. Classify each exam question to its chapter.

Subject: {subject}
Grade/Level: {grade_level}

Questions to classify:
{questions_json}

For each question, identify which chapter or unit of the standard {subject} curriculum it comes from.
Use specific chapter names that students would recognise (e.g. "Chapter 5: Database Management System",
"Unit 3: Computer Networking", "Chapter 2: OOP Concepts").

Return a JSON array — one entry per question:
  "question_number": same as input (integer)
  "chapter":         chapter/unit name string
  "chapter_number":  integer chapter number if determinable, else null

Return ONLY the JSON array:"""


def extract_questions(
    text: str,
    subject: str = "",
    grade_level: str = "",
) -> List[Dict[str, Any]]:
    """
    Extract structured questions from OCR'd exam paper text.
    Returns a list of question dicts ready for DB insertion.
    """
    if not text or len(text.strip()) < 100:
        return []

    # Most NEB papers fit in 8 000 chars; long papers get truncated but
    # the structure (question numbers, marks) is still visible.
    snippet = text[:9000]
    prompt = EXTRACT_PROMPT.format(text=snippet)

    try:
        raw = generate(prompt, temperature=0.1, large=True)
        arr_match = re.search(r'\[.*\]', raw, re.DOTALL)
        if arr_match:
            questions = json.loads(arr_match.group())
            if isinstance(questions, list) and len(questions) > 0:
                print(f"[question_extractor] extracted {len(questions)} questions")
                return questions
    except Exception as e:
        print(f"[question_extractor] extraction failed: {e}")

    return []


def detect_chapters(
    questions: List[Dict],
    subject: str,
    grade_level: str,
) -> Dict[int, Dict]:
    """
    Given extracted questions, classify each to a chapter.
    Returns mapping of question_number → {chapter, chapter_number}.
    """
    if not questions or not subject:
        return {}

    # Only pass question_text to keep the prompt small
    q_summary = [
        {
            "question_number": q.get("question_number"),
            "question_text": (q.get("question_text") or "")[:180],
        }
        for q in questions
        if q.get("question_number") is not None
    ]

    if not q_summary:
        return {}

    prompt = CHAPTER_DETECT_PROMPT.format(
        subject=subject,
        grade_level=grade_level or "Senior secondary",
        questions_json=json.dumps(q_summary, indent=2)[:5000],
    )

    try:
        raw = generate(prompt, temperature=0.1, large=False)
        arr_match = re.search(r'\[.*\]', raw, re.DOTALL)
        if arr_match:
            chapter_data = json.loads(arr_match.group())
            return {
                item["question_number"]: {
                    "chapter": item.get("chapter"),
                    "chapter_number": item.get("chapter_number"),
                }
                for item in chapter_data
                if isinstance(item, dict) and "question_number" in item
            }
    except Exception as e:
        print(f"[question_extractor] chapter detection failed: {e}")

    return {}


def build_section_breakdown(questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Given a list of PaperQuestion-style dicts (with section, topic, chapter, marks),
    build a breakdown grouped by section type.
    Used for the section_breakdown_json field in PatternAnalysis.
    """
    sections: Dict[str, Dict] = {}

    for q in questions:
        sec = q.get("section", "unknown")
        if sec not in sections:
            sections[sec] = {
                "section": sec,
                "count": 0,
                "total_marks": 0,
                "topics": {},
                "chapters": {},
            }
        s = sections[sec]
        s["count"] += 1
        s["total_marks"] += q.get("marks") or 0

        topic = q.get("detected_topic") or "Unknown"
        s["topics"][topic] = s["topics"].get(topic, 0) + 1

        chapter = q.get("detected_chapter") or "Unknown"
        s["chapters"][chapter] = s["chapters"].get(chapter, 0) + 1

    # Sort topic/chapter dicts by count
    for sec_data in sections.values():
        sec_data["topics"] = dict(
            sorted(sec_data["topics"].items(), key=lambda x: -x[1])
        )
        sec_data["chapters"] = dict(
            sorted(sec_data["chapters"].items(), key=lambda x: -x[1])
        )

    return sections
