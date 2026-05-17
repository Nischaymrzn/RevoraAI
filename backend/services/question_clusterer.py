"""
Cross-paper question similarity clustering.

This is the "I collected 5 papers and underlined the same questions" feature.

Algorithm:
  1. Load all PaperQuestion rows for the selected papers (with embeddings).
  2. Build an N×N cosine similarity matrix (embeddings already L2-normalised).
  3. Union-Find clustering: connect questions from DIFFERENT papers when
     similarity ≥ SIMILARITY_THRESHOLD.
  4. Discard single-paper clusters (those are just repeats within one paper).
  5. Return clusters sorted by paper_count desc — most repeated = most important.

A question about "normalization" appearing as:
  - MCQ option in 2022 paper
  - 5-mark short answer in 2023 paper
  - Opening clause of a long answer in 2024 paper
...will all land in the same cluster because the embedding of the question text
is semantically identical regardless of section type or phrasing variation.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import models

# Similarity threshold: questions above this are considered the "same"
# 0.82 catches paraphrases; 0.90 would only catch near-identical phrasing
SIMILARITY_THRESHOLD = 0.82


def cluster_questions(
    db: Session,
    user_id: int,
    material_ids: List[int],
) -> List[Dict[str, Any]]:
    """
    Find recurring questions across the selected papers.
    Returns a list of cluster dicts, sorted by paper_count descending.
    """
    # Load all extracted questions for these papers that have embeddings
    all_questions = (
        db.query(models.PaperQuestion)
        .filter(
            models.PaperQuestion.material_id.in_(material_ids),
            models.PaperQuestion.user_id == user_id,
            models.PaperQuestion.embedding.isnot(None),
        )
        .order_by(models.PaperQuestion.material_id, models.PaperQuestion.question_number)
        .all()
    )

    if len(all_questions) < 2:
        return []

    try:
        import numpy as np
    except ImportError:
        print("[question_clusterer] numpy not available — skipping clustering")
        return []

    n = len(all_questions)

    # Build embedding matrix (n × 384)
    embeddings = np.array(
        [list(q.embedding) for q in all_questions], dtype=np.float32
    )

    # Cosine similarity matrix — embeddings are already L2-normalised by sentence-transformers
    sim_matrix = embeddings @ embeddings.T   # shape: (n, n), range [−1, 1]

    # ── Union-Find ────────────────────────────────────────────────────────────
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path compression
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        parent[find(x)] = find(y)

    for i in range(n):
        for j in range(i + 1, n):
            # Only merge questions from DIFFERENT papers
            if (
                all_questions[i].material_id != all_questions[j].material_id
                and float(sim_matrix[i, j]) >= SIMILARITY_THRESHOLD
            ):
                union(i, j)

    # ── Group by cluster root ─────────────────────────────────────────────────
    clusters: Dict[int, List[int]] = {}
    for i in range(n):
        root = find(i)
        clusters.setdefault(root, []).append(i)

    # ── Build result ──────────────────────────────────────────────────────────
    result: List[Dict[str, Any]] = []

    for root, member_indices in clusters.items():
        member_qs = [all_questions[i] for i in member_indices]
        paper_ids = list({q.material_id for q in member_qs})

        # Must span at least 2 different papers to be a "pattern"
        if len(paper_ids) < 2:
            continue

        # Pick the most representative question (highest avg similarity to all others)
        avg_sims = [
            float(np.mean([sim_matrix[i, j] for j in member_indices if j != i]))
            for i in member_indices
        ]
        rep_idx = member_indices[int(np.argmax(avg_sims))]
        rep = all_questions[rep_idx]

        section_types = sorted(set(q.section for q in member_qs))

        result.append({
            "topic":                  rep.detected_topic or "Unknown topic",
            "chapter":                rep.detected_chapter,
            "representative_question": rep.question_text,
            "section_types":          section_types,
            "paper_count":            len(paper_ids),
            "occurrence_count":       len(member_qs),
            "material_ids":           paper_ids,
            "questions": [
                {
                    "material_id":     q.material_id,
                    "section":         q.section,
                    "question_number": q.question_number,
                    "question_text":   q.question_text,
                    "marks":           q.marks,
                    "chapter":         q.detected_chapter,
                    "topic":           q.detected_topic,
                }
                for q in sorted(member_qs, key=lambda x: (x.material_id, x.question_number or 0))
            ],
        })

    # Sort: most papers first, then most occurrences
    result.sort(key=lambda x: (-x["paper_count"], -x["occurrence_count"]))
    return result


def has_extracted_questions(db: Session, user_id: int, material_ids: List[int]) -> bool:
    """Return True if at least one of the papers already has extracted questions."""
    count = (
        db.query(models.PaperQuestion)
        .filter(
            models.PaperQuestion.material_id.in_(material_ids),
            models.PaperQuestion.user_id == user_id,
        )
        .count()
    )
    return count > 0
