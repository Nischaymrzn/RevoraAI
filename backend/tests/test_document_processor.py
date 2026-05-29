"""
Unit tests for services/document_processor.py

Tests pure utility functions: clean_text and chunk_text.
No database, no API calls, no file I/O required.
"""
import pytest
from services.document_processor import clean_text, chunk_text


# ─── clean_text ───────────────────────────────────────────────────────────────

class TestCleanText:
    def test_collapses_multiple_spaces(self):
        result = clean_text("hello   world")
        assert result == "hello world"

    def test_collapses_newlines_and_tabs(self):
        result = clean_text("hello\n\n\tworld")
        assert result == "hello world"

    def test_strips_leading_trailing_whitespace(self):
        result = clean_text("   hello world   ")
        assert result == "hello world"

    def test_removes_non_ascii_characters(self):
        # Non-ASCII characters should be replaced by a space
        result = clean_text("café menu")  # 'café menu'
        assert "caf" in result
        assert "é" not in result

    def test_collapses_long_ellipsis(self):
        result = clean_text("wait.......")
        assert result == "wait..."

    def test_collapses_long_dashes(self):
        result = clean_text("one---two")
        assert result == "one--two"

    def test_empty_string(self):
        result = clean_text("")
        assert result == ""

    def test_already_clean_text_unchanged(self):
        text = "This is already clean text."
        result = clean_text(text)
        assert result == text


# ─── chunk_text ───────────────────────────────────────────────────────────────

class TestChunkText:
    def test_short_text_returns_single_chunk(self):
        # chunk_text filters out chunks shorter than 50 chars, so use a sentence > 50 chars
        text = "This is a sentence that is definitely longer than fifty characters total."
        chunks = chunk_text(text, chunk_size=800, overlap=100)
        assert len(chunks) == 1
        assert text in chunks[0]

    def test_empty_text_returns_empty_list(self):
        chunks = chunk_text("", chunk_size=800, overlap=100)
        assert chunks == []

    def test_long_text_is_split_into_multiple_chunks(self):
        # Build text longer than chunk_size
        sentence = "The quick brown fox jumps over the lazy dog. "
        text = sentence * 30  # ~1350 chars
        chunks = chunk_text(text, chunk_size=400, overlap=50)
        assert len(chunks) > 1

    def test_chunks_are_non_empty_strings(self):
        sentence = "Python is a high-level programming language. "
        text = sentence * 40
        chunks = chunk_text(text, chunk_size=300, overlap=50)
        for chunk in chunks:
            assert isinstance(chunk, str)
            assert len(chunk) > 0

    def test_all_content_is_represented(self):
        # Use sentences long enough to survive the 50-char filter and a chunk_size
        # small enough to force splitting into multiple chunks.
        s1 = "Neural networks learn representations from raw data automatically."
        s2 = "Gradient descent optimises the weights by minimising the loss function."
        s3 = "Backpropagation computes gradients efficiently through the chain rule."
        text = f"{s1} {s2} {s3}"
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        combined = " ".join(chunks)
        for keyword in ["Neural", "Gradient", "Backpropagation"]:
            assert keyword in combined

    def test_default_parameters_work(self):
        text = "First sentence here. Second sentence here. Third sentence here."
        chunks = chunk_text(text)
        assert isinstance(chunks, list)
        assert len(chunks) >= 1
