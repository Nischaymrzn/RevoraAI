"""
Unit tests for quiz_service.py parser and grading utilities.

Tests: _parse_quiz_json (JSON parsing), _fallback_grade (keyword overlap grading).
These are pure functions with no database or LLM calls.
"""
import json
import pytest

from services.quiz_service import _parse_quiz_json, _fallback_grade


# ─── _parse_quiz_json ─────────────────────────────────────────────────────────

class TestParseQuizJson:

    def _make_raw(self, questions: list) -> str:
        return json.dumps({"questions": questions})

    def test_clean_json_is_parsed_correctly(self):
        q = {"question": "What is 2+2?", "type": "mcq", "correct_answer": "B", "marks": 2}
        raw = self._make_raw([q])
        result = _parse_quiz_json(raw, count=5, quiz_type="mcq")
        assert len(result) == 1
        assert result[0]["question"] == "What is 2+2?"

    def test_count_limit_is_applied(self):
        questions = [
            {"question": f"Q{i}", "type": "mcq", "correct_answer": "A", "marks": 1}
            for i in range(10)
        ]
        raw = self._make_raw(questions)
        result = _parse_quiz_json(raw, count=3, quiz_type="mcq")
        assert len(result) == 3

    def test_json_wrapped_in_markdown_fences_is_parsed(self):
        q = {"question": "What is Python?", "type": "short", "correct_answer": "A language", "marks": 3}
        inner = json.dumps({"questions": [q]})
        raw = f"```json\n{inner}\n```"
        result = _parse_quiz_json(raw, count=5, quiz_type="short")
        assert len(result) == 1
        assert result[0]["question"] == "What is Python?"

    def test_returns_empty_list_for_completely_invalid_input(self):
        result = _parse_quiz_json("this is not json at all!!!!", count=5, quiz_type="mcq")
        assert result == []

    def test_salvages_individual_question_objects_from_malformed_json(self):
        # Malformed outer structure but individual objects are valid JSON
        raw = (
            '{ "questions": broken stuff here }\n'
            '{"question": "Salvaged question", "type": "mcq", "correct_answer": "A", "marks": 2}'
        )
        result = _parse_quiz_json(raw, count=5, quiz_type="mcq")
        # Should recover the individual question object
        assert any(q.get("question") == "Salvaged question" for q in result)

    def test_empty_string_returns_empty_list(self):
        result = _parse_quiz_json("", count=5, quiz_type="mcq")
        assert result == []

    def test_multiple_valid_questions_all_returned_within_count(self):
        questions = [
            {"question": "Q1", "type": "mcq", "correct_answer": "A", "marks": 2},
            {"question": "Q2", "type": "mcq", "correct_answer": "B", "marks": 2},
            {"question": "Q3", "type": "mcq", "correct_answer": "C", "marks": 2},
        ]
        raw = self._make_raw(questions)
        result = _parse_quiz_json(raw, count=10, quiz_type="mcq")
        assert len(result) == 3


# ─── _fallback_grade ──────────────────────────────────────────────────────────

class TestFallbackGrade:

    def test_returns_dict_with_required_keys(self):
        result = _fallback_grade("My answer", "Correct answer", max_marks=5)
        for key in ("marks_awarded", "max_marks", "percentage", "feedback", "is_correct",
                    "key_points_hit", "key_points_missed"):
            assert key in result

    def test_max_marks_is_preserved(self):
        result = _fallback_grade("answer", "answer", max_marks=10)
        assert result["max_marks"] == 10

    def test_exact_match_scores_high(self):
        answer = "photosynthesis converts sunlight into energy"
        result = _fallback_grade(answer, answer, max_marks=5)
        assert result["marks_awarded"] > 3.0

    def test_completely_wrong_answer_scores_zero_or_low(self):
        result = _fallback_grade("xyzzy blorp quux", "photosynthesis sunlight chlorophyll", max_marks=5)
        assert result["marks_awarded"] <= 1.0

    def test_empty_answer_scores_zero(self):
        result = _fallback_grade("", "photosynthesis converts sunlight into energy", max_marks=5)
        assert result["marks_awarded"] == 0.0

    def test_marks_never_exceed_max_marks(self):
        result = _fallback_grade("photosynthesis converts sunlight into energy using chlorophyll",
                                  "photosynthesis converts sunlight into energy", max_marks=4)
        assert result["marks_awarded"] <= 4.0

    def test_marks_never_negative(self):
        result = _fallback_grade("completely wrong answer here", "something totally different", max_marks=5)
        assert result["marks_awarded"] >= 0.0

    def test_percentage_matches_marks(self):
        result = _fallback_grade("answer", "correct answer test", max_marks=10)
        expected_pct = round((result["marks_awarded"] / 10) * 100, 1)
        assert result["percentage"] == expected_pct

    def test_is_correct_true_when_marks_above_60_percent(self):
        # Perfect match → should be is_correct = True
        answer = "machine learning gradient descent neural network"
        result = _fallback_grade(answer, answer, max_marks=5)
        assert result["is_correct"] is True

    def test_is_correct_false_when_marks_below_60_percent(self):
        result = _fallback_grade("wrong wrong wrong", "correct answer here deep learning", max_marks=5)
        assert result["is_correct"] is False
