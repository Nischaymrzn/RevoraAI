"""
Auto-extract structured metadata from an exam paper's OCR text using the LLM.
Returns exam_year, exam_board, grade_level, subject — all nullable.
"""

import json
import re
from typing import Dict, Any, Optional
from services.ai_client import generate


METADATA_PROMPT = """You are a document metadata extractor. Read the following text from an exam paper and extract key metadata.

Text (first 1500 chars):
{content}

Return ONLY valid JSON with these exact keys (use null for any field you cannot determine):
{{
  "exam_year": 2024,
  "exam_board": "NEB",
  "grade_level": "Grade XII",
  "subject": "Computer Science"
}}

Rules:
- exam_year: integer year (e.g. 2022, 2023). If year is in a local calendar (e.g. 2078 BS), convert to AD.
- exam_board: e.g. "NEB", "Cambridge", "CBSE", "Edexcel", or null
- grade_level: e.g. "Grade XII", "A-Level", "Year 13", or null
- subject: the subject name, e.g. "Computer Science", "Physics", "Mathematics", or null

Return only the JSON object, nothing else."""


def extract_paper_metadata(text: str) -> Dict[str, Any]:
    """
    Given OCR'd text from an exam paper, return extracted metadata dict.
    Always succeeds — returns nulls if extraction fails.
    """
    if not text or len(text.strip()) < 50:
        return {"exam_year": None, "exam_board": None, "grade_level": None, "subject": None}

    snippet = text[:1500]
    prompt = METADATA_PROMPT.format(content=snippet)

    try:
        raw = generate(prompt, temperature=0.1, large=False)
        json_match = re.search(r'\{.*?\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return {
                "exam_year": _safe_int(data.get("exam_year")),
                "exam_board": _safe_str(data.get("exam_board")),
                "grade_level": _safe_str(data.get("grade_level")),
                "subject": _safe_str(data.get("subject")),
            }
    except Exception as e:
        print(f"[metadata_service] extraction failed: {e}")

    return {"exam_year": None, "exam_board": None, "grade_level": None, "subject": None}


def _safe_int(val) -> Optional[int]:
    try:
        v = int(val)
        return v if 1900 < v < 2100 else None
    except (TypeError, ValueError):
        return None


def _safe_str(val) -> Optional[str]:
    if not val or str(val).lower() in ("null", "none", "unknown", ""):
        return None
    return str(val).strip()
