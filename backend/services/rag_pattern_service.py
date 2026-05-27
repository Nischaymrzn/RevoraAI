"""
True RAG-based exam pattern analysis.

Instead of dumping the first N chunks into a prompt (stuffing), we:
1. Run multiple semantic queries against the vector store — one per topic domain.
2. Retrieve the most relevant chunks from ACROSS all selected papers.
3. Group results by topic and label each chunk with its source paper + year.
4. Send this structured, retrieved context to the LLM for cross-paper pattern analysis.

This is proper RAG: Retrieve → Augment → Generate.
"""

import json
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from services.vector_store import search_chunks
from services.ai_client import generate
import models

SUBJECT_PROBES: Dict[str, Dict[str, str]] = {
    "Computer Science": {
        "Database & SQL":         "database SQL DDL DML normalization primary key foreign key query join",
        "OOP & Programming":      "class object inheritance polymorphism encapsulation abstraction OOP constructor",
        "Web Technologies":       "HTML CSS JavaScript PHP web page form function script",
        "Networking":             "network protocol IP address TCP HTTP transmission medium router switch",
        "C Programming":          "C program function array structure pointer scanf printf void main",
        "Software Engineering":   "SDLC software development life cycle requirement gathering feasibility",
        "Cloud & AI":             "cloud computing IaaS PaaS SaaS artificial intelligence machine learning",
        "Data Structures":        "array linked list stack queue sorting searching algorithm",
    },
    "Mathematics": {
        "Algebra":                "algebra equation polynomial matrix determinant linear",
        "Calculus":               "derivative integral differentiation limit continuity",
        "Trigonometry":           "trigonometry sine cosine tangent angle radian",
        "Statistics":             "probability statistics mean median mode standard deviation",
        "Geometry":               "geometry circle triangle proof coordinate vector",
    },
    "Physics": {
        "Mechanics":              "force motion velocity acceleration Newton law momentum",
        "Electricity":            "electric current voltage resistance circuit Ohm law",
        "Waves":                  "wave frequency amplitude wavelength sound light",
        "Thermodynamics":         "heat temperature entropy thermodynamics gas law",
        "Modern Physics":         "quantum atom nuclear radioactivity photoelectric",
    },
    "Chemistry": {
        "Organic Chemistry":      "organic compound carbon alkane alkene functional group",
        "Inorganic Chemistry":    "metal acid base salt reaction periodic table",
        "Physical Chemistry":     "thermodynamics equilibrium kinetics electrochemistry",
        "Analytical Chemistry":   "titration concentration solution molarity",
    },
    "Biology": {
        "Cell Biology":           "cell membrane organelle mitosis meiosis",
        "Genetics":               "DNA gene chromosome heredity mutation",
        "Ecology":                "ecosystem food chain population community",
        "Human Biology":          "heart blood circulation nervous system",
    },
}

GENERIC_PROBES = {
    "Core Concepts":      "definition explain describe what is concept theory",
    "Problem Solving":    "calculate solve find prove show derive",
    "Applied Knowledge":  "application example advantage disadvantage compare difference",
    "Higher Order":       "analyze evaluate discuss critically assess",
}


def analyze_papers_rag(
    db: Session,
    user_id: int,
    material_ids: List[int],
    subject: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full RAG pipeline for exam pattern analysis across multiple past papers.

    Steps:
    1. Load material metadata (name, year, board) for labelling.
    2. Select topic probes for this subject.
    3. For each probe: semantic search across all selected papers.
    4. Group retrieved chunks by topic + label with source paper.
    5. Build a structured RAG context string.
    6. Send to LLM → parse JSON analysis.
    """

    # 1. Load material metadata
    materials: List[models.StudyMaterial] = (
        db.query(models.StudyMaterial)
        .filter(models.StudyMaterial.id.in_(material_ids))
        .all()
    )
    mat_info: Dict[int, Dict] = {
        m.id: {
            "name": m.original_name,
            "year": m.exam_year or "Unknown year",
            "board": m.exam_board or "",
            "subject": m.subject or subject or "",
        }
        for m in materials
    }

    paper_count = len(materials)
    past_papers = [m for m in materials if m.material_type == "past_paper"]
    is_past_paper = len(past_papers) > 0

    # Resolve subject from materials if not passed explicitly
    if not subject:
        subjects = {m.subject for m in materials if m.subject}
        subject = next(iter(subjects), None)

    # 2. Select probes
    probes = SUBJECT_PROBES.get(subject, GENERIC_PROBES) if subject else GENERIC_PROBES

    # 3. Retrieve chunks per topic (RAG retrieval step)
    # For each probe: retrieve top 4 chunks PER PAPER separately.
    # This guarantees each paper gets a fair representation — we don't
    # let one paper dominate the top-6 global results.
    topic_retrieved: Dict[str, List[Dict]] = {}

    for topic, query in probes.items():
        all_chunks: List[Dict] = []
        for mid in material_ids:
            chunks = search_chunks(
                db,
                user_id,
                query,
                n_results=4,            # top 4 per individual paper
                material_ids=[mid],     # locked to this paper only
            )
            all_chunks.extend(chunks)
        if all_chunks:
            topic_retrieved[topic] = all_chunks

    if not topic_retrieved:
        return _fallback_analysis()

    # 4. Compute REAL pattern
    # For each topic we now know exactly which papers returned chunks and
    # at what average relevance score — no LLM estimation needed.
    topic_stats: Dict[str, Dict] = {}
    for topic, chunks in topic_retrieved.items():
        # Which unique papers contributed at least one chunk for this topic?
        paper_ids_present = {c["material_id"] for c in chunks}
        avg_relevance = sum(c["relevance"] for c in chunks) / len(chunks)
        best_relevance = max(c["relevance"] for c in chunks)

        topic_stats[topic] = {
            "paper_ids": paper_ids_present,
            "paper_count": len(paper_ids_present),   # REAL count, not LLM guess
            "total_papers": paper_count,
            "coverage_pct": round(len(paper_ids_present) / paper_count * 100),
            "avg_relevance": round(avg_relevance, 3),
            "best_relevance": round(best_relevance, 3),
            # Frequency label derived algorithmically from coverage
            "frequency": (
                "high"   if len(paper_ids_present) == paper_count else
                "medium" if len(paper_ids_present) >= paper_count / 2 else
                "low"
            ),
        }

    # Sort topics by: (1) how many papers they appear in, (2) avg relevance
    sorted_topics = sorted(
        topic_stats.items(),
        key=lambda kv: (kv[1]["paper_count"], kv[1]["avg_relevance"]),
        reverse=True,
    )

    # 5. Build structured context — label each chunk with source paper
    # Include computed stats in the header so the LLM sees ground truth
    context_sections = []
    for topic, chunks in topic_retrieved.items():
        stats = topic_stats[topic]
        papers_with_topic = [
            f"{mat_info[mid]['name']} ({mat_info[mid]['year']})"
            for mid in stats["paper_ids"]
            if mid in mat_info
        ]
        header = (
            f"TOPIC: {topic} "
            f"[appears in {stats['paper_count']}/{paper_count} papers: "
            f"{', '.join(papers_with_topic)}]"
        )
        lines = [header]
        for c in chunks:
            info = mat_info.get(c["material_id"], {})
            paper_label = f"{info.get('name', 'Unknown')} ({info.get('year', '?')})"
            preview = c["text"][:350].replace("\n", " ").strip()
            relevance_pct = int(c["relevance"] * 100)
            lines.append(f"  [{paper_label} | similarity {relevance_pct}%] {preview}")
        context_sections.append("\n".join(lines))

    rag_context = "\n\n".join(context_sections)

    # Build computed topic coverage table for the LLM prompt header
    coverage_table = "\n".join(
        f"  {topic}: {stats['paper_count']}/{paper_count} papers "
        f"({stats['coverage_pct']}% coverage) — {stats['frequency']} frequency"
        for topic, stats in sorted_topics
    )

    # Build paper list summary for the prompt
    paper_list = "\n".join(
        f"- {info['name']} ({info['year']})" for info in mat_info.values()
    )

    # 6. LLM generation step — LLM refines and enriches the computed stats,
    #    does NOT invent them from scratch
    analysis = _generate_analysis(
        rag_context=rag_context,
        paper_list=paper_list,
        coverage_table=coverage_table,
        paper_count=paper_count,
        subject=subject or "General",
        is_past_paper=is_past_paper,
        topic_stats=topic_stats,
    )

    return analysis


# ── LLM prompts ───────────────────────────────────────────────────────────────

RAG_ANALYSIS_PROMPT = """You are Revora AI, an expert exam analyst.

Below is semantically retrieved content from {paper_count} exam paper(s) for {subject}.

Papers analysed:
{paper_list}

COMPUTED TOPIC COVERAGE (algorithmically calculated — trust these numbers):
{coverage_table}

Retrieved exam content (grouped by topic, each chunk tagged with source paper):
{rag_context}

Your job:
1. The topic coverage table above already tells you which topics appear in how many papers.
   Use those EXACT paper_count values — do NOT guess or change them.
2. Read the actual question text in each chunk to identify the specific question patterns
   and subtopics being tested.
3. Predict likely future questions based on what questions actually appear repeatedly.

Return a JSON object with this exact schema:
{{
  "analysis_summary": "2-3 sentence summary of recurring patterns and what to expect in the next exam",
  "main_topics": [
    {{
      "name": "Topic Name",
      "frequency": "high|medium|low",
      "importance": 85,
      "paper_count": 3,
      "exam_weight_estimate": "30%",
      "subtopics": ["specific subtopic seen in questions", "another subtopic"]
    }}
  ],
  "recurring_patterns": [
    {{
      "pattern": "Specific question pattern seen repeatedly (e.g. 'Define X and give an example')",
      "frequency_count": 3,
      "topics": ["Database", "SQL"],
      "example_question": "Exact or paraphrased question from the retrieved text"
    }}
  ],
  "likely_questions": [
    {{
      "question": "Predicted exam question based on what actually repeats",
      "topic": "Topic name",
      "type": "short_answer|essay|mcq|calculation|definition",
      "marks": 5,
      "likelihood": 90,
      "appears_in_papers": 3,
      "reasoning": "Appeared in all 3 papers in similar form"
    }}
  ],
  "key_concepts": ["exact concept terms from the questions"],
  "revision_priority": ["Most important topic", "Second topic"],
  "topic_distribution": {{"Topic1": 35, "Topic2": 25}}
}}

Return only valid JSON."""


def _generate_analysis(
    rag_context: str,
    paper_list: str,
    coverage_table: str,
    paper_count: int,
    subject: str,
    is_past_paper: bool,
    topic_stats: Dict[str, Dict],
) -> Dict[str, Any]:
    prompt = RAG_ANALYSIS_PROMPT.format(
        rag_context=rag_context[:6000],
        paper_list=paper_list,
        coverage_table=coverage_table,
        paper_count=paper_count,
        subject=subject,
    )

    try:
        raw = generate(prompt, temperature=0.2, large=True)
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            # ── Post-process: overwrite LLM-guessed numbers with real computed ones ──
            data = _apply_computed_stats(data, topic_stats, paper_count)
            return data
    except Exception as e:
        print(f"[rag_pattern_service] LLM error: {e}")

    return _fallback_analysis()


def _apply_computed_stats(
    data: Dict[str, Any],
    topic_stats: Dict[str, Dict],
    paper_count: int,
) -> Dict[str, Any]:
    """
    Replace LLM-generated paper_count / frequency / importance with
    values computed directly from the retrieval data.
    The LLM is good at understanding question content and writing descriptions;
    it is NOT reliable for numerical statistics — we compute those ourselves.
    """
    # Normalise topic names to lowercase for fuzzy matching
    stats_lower = {k.lower(): v for k, v in topic_stats.items()}

    def _find_stats(topic_name: str) -> Optional[Dict]:
        name_lower = topic_name.lower()
        # Exact match first
        if name_lower in stats_lower:
            return stats_lower[name_lower]
        # Partial match — probe name contains topic name or vice versa
        for probe_name, stats in stats_lower.items():
            if name_lower in probe_name or probe_name in name_lower:
                return stats
        return None

    # Fix main_topics
    for topic in data.get("main_topics", []):
        stats = _find_stats(topic.get("name", ""))
        if stats:
            real_count = stats["paper_count"]
            topic["paper_count"] = real_count   # real, not LLM guess
            topic["frequency"]   = stats["frequency"]  # computed from coverage
            # Importance: 100 if all papers, scaled down proportionally
            topic["importance"]  = round((real_count / paper_count) * 100)

    # Compute real topic_distribution from coverage percentages
    covered = {
        topic: stats["coverage_pct"]
        for topic, stats in topic_stats.items()
        if stats["paper_count"] > 0
    }
    if covered:
        total_cov = sum(covered.values())
        data["topic_distribution"] = {
            t: round(pct / total_cov * 100)
            for t, pct in sorted(covered.items(), key=lambda x: -x[1])
        }

    # Fix likely_questions — appears_in_papers should match the topic's real count
    for q in data.get("likely_questions", []):
        stats = _find_stats(q.get("topic", ""))
        if stats:
            real_count = stats["paper_count"]
            q["appears_in_papers"] = real_count
            # Likelihood: floor at 50, ceiling at 95, scaled by paper coverage
            base = round((real_count / paper_count) * 95)
            q["likelihood"] = max(50, min(95, base))

    return data


def _fallback_analysis() -> Dict[str, Any]:
    return {
        "analysis_summary": "Pattern analysis could not be completed. Ensure materials are processed and try again.",
        "main_topics": [],
        "recurring_patterns": [],
        "likely_questions": [],
        "key_concepts": [],
        "revision_priority": [],
        "topic_distribution": {},
    }
