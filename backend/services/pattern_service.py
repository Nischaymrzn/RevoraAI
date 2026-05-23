import json
import re
from typing import Dict, Any, List
from services.ai_client import generate


PAST_PAPER_PROMPT = """You are Revora AI, an expert exam question analyst. The following contains questions from {paper_count} past exam paper(s).
Analyse the question patterns, recurring topics, and common exam styles across these papers.

Past Paper Content:
{content}

Provide analysis in the following JSON format:
{{
  "main_topics": [
    {{
      "name": "Topic Name",
      "frequency": "high|medium|low",
      "importance": 90,
      "paper_count": 3,
      "subtopics": ["subtopic1", "subtopic2"],
      "exam_weight_estimate": "35%"
    }}
  ],
  "likely_questions": [
    {{
      "question": "Specific predicted exam question based on recurring patterns",
      "topic": "Topic name",
      "type": "essay|short_answer|mcq|calculation|definition|diagram",
      "marks": 10,
      "likelihood": 95,
      "appears_in_papers": 3
    }}
  ],
  "recurring_patterns": [
    {{
      "pattern": "Description of a question pattern seen repeatedly across papers",
      "frequency_count": 4,
      "topics": ["topic1", "topic2"]
    }}
  ],
  "key_concepts": ["concept1", "concept2", "concept3"],
  "revision_priority": ["Highest priority topic", "Second priority topic"],
  "analysis_summary": "Concise summary of the recurring exam patterns found across these past papers and which topics to prioritise for the next exam",
  "topic_distribution": {{
    "Topic1": 40,
    "Topic2": 30,
    "Topic3": 20,
    "Other": 10
  }}
}}

Focus on what comes up REPEATEDLY and what the patterns predict for future exams. Return only valid JSON:"""


def analyze_past_papers(content: str, paper_count: int = 1) -> Dict[str, Any]:
    """Specialized analysis for past exam papers — finds recurring question patterns."""
    max_chars = 9000
    truncated = content[:max_chars] if len(content) > max_chars else content

    prompt = PAST_PAPER_PROMPT.format(content=truncated, paper_count=paper_count)

    try:
        raw = generate(prompt, temperature=0.3, large=True)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return data
    except Exception:
        pass

    return {
        "main_topics": [],
        "likely_questions": [],
        "recurring_patterns": [],
        "key_concepts": [],
        "revision_priority": [],
        "analysis_summary": "Pattern analysis could not be completed. Please try again.",
        "topic_distribution": {},
    }


PATTERN_PROMPT = """You are Revora AI, an expert academic analyst. Analyze the following study material and identify exam patterns, repeated topics, and likely questions.

Study Material:
{content}

Provide a detailed analysis in the following JSON format:
{{
  "main_topics": [
    {{
      "name": "Topic Name",
      "frequency": "high|medium|low",
      "importance": 85,
      "subtopics": ["subtopic1", "subtopic2"],
      "exam_weight_estimate": "30%"
    }}
  ],
  "likely_questions": [
    {{
      "question": "Likely exam question",
      "topic": "Topic name",
      "type": "essay|short_answer|mcq|problem",
      "marks": 10,
      "likelihood": 90
    }}
  ],
  "key_concepts": ["concept1", "concept2", "concept3"],
  "revision_priority": ["Topic to study first", "Topic to study second"],
  "analysis_summary": "Overall analysis of the material and exam preparation advice",
  "topic_distribution": {{
    "Topic1": 35,
    "Topic2": 25,
    "Topic3": 20,
    "Other": 20
  }}
}}

Be specific to the actual content provided. Return only valid JSON:"""


def analyze_patterns(content: str, material_name: str = "") -> Dict[str, Any]:
    max_chars = 7000
    truncated = content[:max_chars] if len(content) > max_chars else content

    prompt = PATTERN_PROMPT.format(content=truncated)

    try:
        raw = generate(prompt, temperature=0.3, large=True)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return data
    except Exception as e:
        pass

    return {
        "main_topics": [],
        "likely_questions": [],
        "key_concepts": [],
        "revision_priority": [],
        "analysis_summary": "Pattern analysis could not be completed. Please try again.",
        "topic_distribution": {},
    }


READINESS_PROMPT = """You are Revora AI. Based on the student's performance data, provide a readiness assessment.

Performance Data:
- Quiz attempts: {quiz_attempts}
- Average quiz score: {avg_score}%
- Mock test scores: {mock_scores}
- Weak topics: {weak_topics}
- Materials uploaded: {materials_count}
- Total questions asked: {questions_asked}

Provide assessment in JSON format:
{{
  "readiness_score": 72,
  "readiness_level": "Partially Ready|Not Ready|Ready|Well Prepared",
  "strengths": ["strength1", "strength2"],
  "areas_to_improve": ["area1", "area2"],
  "recommendation": "Specific actionable advice for this student",
  "study_plan": ["Action 1", "Action 2", "Action 3"]
}}

Return only valid JSON:"""


def calculate_readiness(performance_data: Dict) -> Dict[str, Any]:
    prompt = READINESS_PROMPT.format(**performance_data)

    try:
        raw = generate(prompt, temperature=0.3)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return data
    except Exception:
        pass

    avg = performance_data.get("avg_score", 0)
    score = min(100, max(0, int(avg * 0.8 + 20)))
    return {
        "readiness_score": score,
        "readiness_level": "Partially Ready" if score < 70 else "Ready",
        "strengths": [],
        "areas_to_improve": performance_data.get("weak_topics", [])[:3],
        "recommendation": "Keep practicing with more quizzes and mock tests.",
        "study_plan": ["Review weak topics", "Take more mock tests", "Ask AI questions"],
    }
