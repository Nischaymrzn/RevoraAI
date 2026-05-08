import json
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from services.vector_store import search_chunks
from services.ai_client import generate


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

Return ONLY valid JSON in this exact format:
{{
  "questions": [
    {{
      "question": "Question text here",
      "type": "mcq",
      "topic": "Topic name",
      "difficulty": "easy|medium|hard",
      "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
      "correct_answer": "A",
      "explanation": "Brief explanation of the correct answer"
    }}
  ]
}}

For short answer questions, omit "options" and set correct_answer to a brief model answer.
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

    # Fallback: use vector search if no content passed
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

        # Check if this material is a past paper
        mat = db.query(models.StudyMaterial).filter(models.StudyMaterial.id == mid).first()
        if mat and mat.material_type == "past_paper":
            has_past_papers = True

    # Fallback: search across all user materials if specific ones gave nothing
    if not all_chunks:
        all_chunks = search_chunks(db, user_id, "key topics and concepts", n_results=10)

    content = "\n\n".join([c["text"] for c in all_chunks[:15]])[:7000]

    # Use past-paper-specific prompt when past papers are included
    template = PAST_PAPER_MOCK_PROMPT if has_past_papers else MOCK_PROMPT
    prompt = template.format(count=count, content=content)

    raw = generate(prompt, temperature=0.4)
    return _parse_quiz_json(raw, count, "mixed")


def _parse_quiz_json(raw: str, count: int, quiz_type: str) -> List[Dict[str, Any]]:
    try:
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            questions = data.get("questions", [])
            return questions[:count]
    except Exception:
        pass
    return []


def score_attempt(questions: List[Dict], answers: Dict[int, str]) -> Dict[str, Any]:
    """Score a quiz/mock attempt and identify weak topics."""
    correct = 0
    total = len(questions)
    wrong_topics = {}

    for i, q in enumerate(questions):
        user_ans = answers.get(str(i), answers.get(i, "")).strip().upper()
        correct_ans = q.get("correct_answer", "").strip().upper()

        if user_ans and user_ans[0] == correct_ans[0]:
            correct += 1
        else:
            topic = q.get("topic", "General")
            wrong_topics[topic] = wrong_topics.get(topic, 0) + 1

    score_pct = round((correct / total) * 100, 1) if total > 0 else 0
    weak_topics = [t for t, c in sorted(wrong_topics.items(), key=lambda x: -x[1])]

    return {
        "correct": correct,
        "total": total,
        "score_percentage": score_pct,
        "weak_topics": weak_topics,
    }
