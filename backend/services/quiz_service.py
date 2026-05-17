import json
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from services.vector_store import search_chunks
from services.ai_client import generate


# ─── Prompts ──────────────────────────────────────────────────────────────────

QUIZ_PROMPT = """You are Revora AI, an expert quiz generator for academic revision.

Generate exactly {count} {quiz_type} questions from the following study material content.

Study Material Content:
{content}

Requirements:
- Questions must be directly based on the provided content
- Vary difficulty: {difficulty_mix}
- For MCQ: provide exactly 4 options labeled A, B, C, D
- Include a brief explanation for each answer
- Cover different topics from the material
- Make questions educationally valuable for exam preparation
- CRITICAL: If the question involves code (e.g. "What is the output of...", "Trace this program", "Debug this code"),
  you MUST include the complete, working code in the question body (10-20 lines).
  Never reference "the given program" or "the following code" without actually showing it.
  Generate a realistic, compilable program in the relevant language (C, Python, Java, JavaScript, etc.)

Return ONLY valid JSON in this exact format:
{{
  "questions": [
    {{
      "question": "Question text here (include full code block if code question)",
      "type": "mcq",
      "topic": "Topic name",
      "difficulty": "easy|medium|hard",
      "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
      "correct_answer": "A",
      "explanation": "Brief explanation of the correct answer",
      "marks": 2
    }}
  ]
}}

For short answer questions, omit "options" and set correct_answer to a model answer (3-5 sentences).
For long answer questions, set marks to 8-16 and correct_answer to a detailed model answer (150-300 words).
Generate the JSON now:"""


MOCK_PROMPT = """You are Revora AI. Generate exactly {count} exam-style questions for a timed mock test.

Study Materials Content:
{content}

Instructions:
- Create realistic exam-style questions similar to actual assessments
- Include a mix of difficulty levels
- Focus on the most important and frequently tested concepts
- Mix question types: mostly MCQ with some short answer
- Each question should test meaningful understanding
- CRITICAL: If the question involves code, ALWAYS include the complete code in the question body.
  Never say "the given program" without showing the actual code.

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "type": "mcq",
      "topic": "Topic name",
      "difficulty": "easy|medium|hard",
      "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
      "correct_answer": "A",
      "explanation": "Explanation",
      "marks": 2
    }}
  ]
}}"""


PAST_PAPER_MOCK_PROMPT = """You are Revora AI. Generate exactly {count} exam questions modelled on the past paper content below.

Past Paper Content:
{content}

Instructions:
- Mirror the style, format, and difficulty of questions from the past papers
- Cover the same topic areas that appear frequently in the past papers
- Include the same mix of question types (MCQ, short answer) as seen in the papers
- Focus on concepts that appear repeatedly across different papers — these are likely exam favourites
- Each question should feel like it could genuinely appear in the real exam
- CRITICAL: If the question involves code (output, trace, debug), ALWAYS include the complete code in the question.
  Generate a realistic program in the appropriate language. Never reference unseen code.

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "Question text",
      "type": "mcq",
      "topic": "Topic name",
      "difficulty": "easy|medium|hard",
      "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
      "correct_answer": "A",
      "explanation": "Explanation",
      "marks": 2
    }}
  ]
}}"""


GRADE_WRITTEN_PROMPT = """You are an expert academic examiner grading a student's written answer.

Question: {question}

Maximum marks: {max_marks}

Model answer (what a perfect answer looks like):
{correct_answer}

Student's answer:
{user_answer}

Grade the student's answer strictly but fairly:
- Full marks ({max_marks}): Answer is correct and demonstrates clear understanding. Key concepts present.
- Partial marks: Answer is partially correct, or conveys the right meaning in different words, or covers some but not all required points.
- Zero marks: Answer is completely wrong, irrelevant, or blank.

Be lenient with wording — if the student shows understanding of the concept even with different phrasing, award marks.
Award partial credit proportionally based on how many key points are covered.

Return ONLY valid JSON:
{{
  "marks_awarded": <number, can be decimal like 2.5>,
  "max_marks": {max_marks},
  "percentage": <0-100>,
  "feedback": "<1-2 sentence feedback explaining the grade>",
  "is_correct": <true if >= 60% marks awarded>,
  "key_points_hit": ["point 1", "point 2"],
  "key_points_missed": ["point 3"]
}}"""


# ─── Core generators ──────────────────────────────────────────────────────────

def generate_quiz(
    db: Session,
    user_id: int,
    material_id: Optional[int],
    content_sample: str,
    count: int = 10,
    quiz_type: str = "mcq",
) -> List[Dict[str, Any]]:
    difficulty_mix = "30% easy, 50% medium, 20% hard"

    max_chars = 6000
    content = content_sample[:max_chars] if len(content_sample) > max_chars else content_sample

    if not content.strip():
        chunks = search_chunks(db, user_id, "main topics and key concepts", n_results=8, material_id=material_id)
        content = "\n\n".join([c["text"] for c in chunks])

    prompt = QUIZ_PROMPT.format(
        count=count,
        quiz_type="Multiple Choice (MCQ)" if quiz_type == "mcq" else "Short Answer" if quiz_type == "short" else "Mixed MCQ and Short Answer",
        content=content,
        difficulty_mix=difficulty_mix,
    )

    raw = generate(prompt, temperature=0.5)
    return _parse_quiz_json(raw, count, quiz_type)


def generate_mock_test_questions(
    db: Session,
    user_id: int,
    material_ids: List[int],
    count: int = 10,
) -> List[Dict[str, Any]]:
    import models

    all_chunks = []
    has_past_papers = False

    for mid in material_ids:
        chunks = search_chunks(
            db, user_id,
            "exam questions important concepts key topics definitions",
            n_results=6,
            material_id=mid,
        )
        all_chunks.extend(chunks)

        mat = db.query(models.StudyMaterial).filter(models.StudyMaterial.id == mid).first()
        if mat and mat.material_type == "past_paper":
            has_past_papers = True

    if not all_chunks:
        all_chunks = search_chunks(db, user_id, "key topics and concepts", n_results=10)

    content = "\n\n".join([c["text"] for c in all_chunks[:15]])[:7000]

    template = PAST_PAPER_MOCK_PROMPT if has_past_papers else MOCK_PROMPT
    prompt = template.format(count=count, content=content)

    raw = generate(prompt, temperature=0.4)
    return _parse_quiz_json(raw, count, "mixed")


# ─── JSON parser ──────────────────────────────────────────────────────────────

def _parse_quiz_json(raw: str, count: int, quiz_type: str) -> List[Dict[str, Any]]:
    # Strip markdown fences
    clean = re.sub(r'```(?:json)?\s*', '', raw).strip().rstrip('`').strip()

    # Try full parse
    try:
        data = json.loads(clean)
        if "questions" in data:
            return data["questions"][:count]
    except Exception:
        pass

    # Try extracting outer {...}
    try:
        m = re.search(r'\{.*\}', clean, re.DOTALL)
        if m:
            data = json.loads(m.group())
            if "questions" in data:
                return data["questions"][:count]
    except Exception:
        pass

    # Salvage individual question objects
    questions = []
    for m in re.finditer(r'\{[^{}]*\}', clean, re.DOTALL):
        try:
            obj = json.loads(m.group())
            if "question" in obj:
                questions.append(obj)
        except Exception:
            pass
    return questions[:count]


# ─── Grading ──────────────────────────────────────────────────────────────────

def grade_written_answer(
    question: str,
    correct_answer: str,
    user_answer: str,
    max_marks: int = 5,
) -> Dict[str, Any]:
    """
    Use LLM to grade a written (short/long) answer with partial credit.
    Returns dict with marks_awarded, percentage, feedback, is_correct.
    """
    if not user_answer or not user_answer.strip():
        return {
            "marks_awarded": 0,
            "max_marks": max_marks,
            "percentage": 0,
            "feedback": "No answer provided.",
            "is_correct": False,
            "key_points_hit": [],
            "key_points_missed": [],
        }

    prompt = GRADE_WRITTEN_PROMPT.format(
        question=question,
        correct_answer=correct_answer,
        user_answer=user_answer,
        max_marks=max_marks,
    )

    try:
        raw = generate(prompt, temperature=0.1, large=True)
        clean = re.sub(r'```(?:json)?\s*', '', raw).strip().rstrip('`').strip()

        # Try full parse
        try:
            result = json.loads(clean)
        except Exception:
            m = re.search(r'\{.*\}', clean, re.DOTALL)
            result = json.loads(m.group()) if m else {}

        # Clamp marks to valid range
        awarded = float(result.get("marks_awarded", 0))
        awarded = max(0.0, min(float(max_marks), awarded))

        return {
            "marks_awarded": round(awarded, 1),
            "max_marks": max_marks,
            "percentage": round((awarded / max_marks) * 100, 1) if max_marks > 0 else 0,
            "feedback": result.get("feedback", ""),
            "is_correct": bool(result.get("is_correct", awarded >= max_marks * 0.6)),
            "key_points_hit": result.get("key_points_hit", []),
            "key_points_missed": result.get("key_points_missed", []),
        }
    except Exception as e:
        print(f"[WARN] grade_written_answer LLM error: {e}")
        # Fallback: basic keyword overlap scoring
        return _fallback_grade(user_answer, correct_answer, max_marks)


def _fallback_grade(user_answer: str, correct_answer: str, max_marks: int) -> Dict[str, Any]:
    """Simple keyword overlap fallback if LLM grading fails."""
    ua_words = set(user_answer.lower().split())
    ca_words = set(correct_answer.lower().split())
    stop = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'in', 'of', 'to', 'for'}
    ua_kw = ua_words - stop
    ca_kw = ca_words - stop
    overlap = len(ua_kw & ca_kw) / max(len(ca_kw), 1)
    awarded = round(min(float(max_marks), overlap * max_marks * 1.2), 1)
    return {
        "marks_awarded": awarded,
        "max_marks": max_marks,
        "percentage": round((awarded / max_marks) * 100, 1) if max_marks > 0 else 0,
        "feedback": "Graded based on keyword similarity (LLM grading unavailable).",
        "is_correct": awarded >= max_marks * 0.6,
        "key_points_hit": [],
        "key_points_missed": [],
    }


# ─── Attempt scorer ───────────────────────────────────────────────────────────

def score_attempt(
    questions: List[Dict],
    answers: Dict,
    grade_written: bool = True,
) -> Dict[str, Any]:
    """
    Score a quiz/mock attempt.
    - MCQ: binary first-char match
    - Short/Long answer: LLM semantic partial credit grading
    Returns summary + per-question detail list.
    """
    total_marks_possible = 0
    total_marks_awarded  = 0
    wrong_topics: Dict[str, int] = {}
    question_grades: List[Dict] = []

    for i, q in enumerate(questions):
        user_ans    = answers.get(str(i), answers.get(i, ""))
        if isinstance(user_ans, str):
            user_ans = user_ans.strip()
        else:
            user_ans = str(user_ans).strip()

        correct_ans = q.get("correct_answer", "").strip()
        q_type      = q.get("question_type", q.get("type", "mcq"))
        max_marks   = int(q.get("marks", 2 if q_type == "mcq" else 5 if q_type == "short_answer" else 10))
        total_marks_possible += max_marks
        topic = q.get("topic", "General")

        has_options = bool(q.get("options"))
        is_mcq = (q_type == "mcq") or has_options

        if is_mcq:
            # MCQ: compare first character (letter)
            ua = user_ans.upper()[:1]
            ca = correct_ans.upper()[:1]
            is_correct = bool(ua and ua == ca)
            awarded    = float(max_marks) if is_correct else 0.0
            feedback   = ""
            points_hit: List[str] = []
            points_missed: List[str] = []
        else:
            # Written: LLM partial-credit grading
            if grade_written and user_ans:
                grade = grade_written_answer(
                    question=q.get("question", ""),
                    correct_answer=correct_ans,
                    user_answer=user_ans,
                    max_marks=max_marks,
                )
                awarded      = grade["marks_awarded"]
                is_correct   = grade["is_correct"]
                feedback     = grade["feedback"]
                points_hit   = grade.get("key_points_hit", [])
                points_missed= grade.get("key_points_missed", [])
            elif not user_ans:
                awarded = 0.0
                is_correct = False
                feedback = "No answer provided."
                points_hit = []
                points_missed = []
            else:
                # grade_written disabled: simple presence check
                awarded = float(max_marks) * 0.5  # give 50% for attempting
                is_correct = False
                feedback = ""
                points_hit = []
                points_missed = []

        total_marks_awarded += awarded

        if not is_correct:
            wrong_topics[topic] = wrong_topics.get(topic, 0) + 1

        question_grades.append({
            "index":         i,
            "marks_awarded": awarded,
            "max_marks":     max_marks,
            "is_correct":    is_correct,
            "feedback":      feedback,
            "key_points_hit":   points_hit,
            "key_points_missed":points_missed,
        })

    score_pct   = round((total_marks_awarded / total_marks_possible) * 100, 1) if total_marks_possible > 0 else 0
    correct_cnt = sum(1 for g in question_grades if g["is_correct"])
    weak_topics = [t for t, _ in sorted(wrong_topics.items(), key=lambda x: -x[1])]

    return {
        "correct":           correct_cnt,
        "total":             len(questions),
        "total_marks":       total_marks_possible,
        "marks_awarded":     round(total_marks_awarded, 1),
        "score_percentage":  score_pct,
        "weak_topics":       weak_topics,
        "question_grades":   question_grades,
    }
