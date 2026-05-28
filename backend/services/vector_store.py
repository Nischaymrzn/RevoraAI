"""
Vector store using pgvector (PostgreSQL) + Gemini API embeddings.

Uses gemini-embedding-001 which natively outputs 3072-dimensional vectors.
Embeddings are stored directly in the material_chunks table. Similarity
search uses cosine distance via pgvector's HNSW index — no local model,
no PyTorch.
"""

from typing import List, Dict, Any, Optional
import google.generativeai as genai
from config import GEMINI_API_KEY, EMBEDDING_DIMS

# Configure Gemini once at module load
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

_EMBED_MODEL = "models/gemini-embedding-001"


def embed_text(text: str, task_type: str = "retrieval_document") -> List[float]:
    """
    Embed a single text using Gemini gemini-embedding-001.
    Returns a list of 3072 floats (EMBEDDING_DIMS).

    task_type: "retrieval_document" when indexing, "retrieval_query" when searching.
    """
    result = genai.embed_content(
        model=_EMBED_MODEL,
        content=text,
        task_type=task_type,
    )
    return result["embedding"]


def search_chunks(
    db,
    user_id: int,
    query: str,
    n_results: int = 5,
    material_id: Optional[int] = None,
    material_ids: Optional[List[int]] = None,
    material_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search for the most relevant chunks using pgvector cosine similarity.

    Filters:
      - user_id:       always applied (user isolation)
      - material_id:   narrow to a specific document
      - material_ids:  narrow to a list of documents
      - material_type: narrow by type (past_paper / lesson / notes / textbook)

    Returns list of dicts: {text, material_id, chunk_index, relevance}
    """
    import models

    try:
        query_embedding = embed_text(query, task_type="retrieval_query")
    except Exception:
        return []

    try:
        distance_expr = models.MaterialChunk.embedding.cosine_distance(query_embedding).label("distance")

        q = (
            db.query(models.MaterialChunk, distance_expr)
            .join(
                models.StudyMaterial,
                models.MaterialChunk.material_id == models.StudyMaterial.id,
            )
            .filter(
                models.StudyMaterial.user_id == user_id,
                models.MaterialChunk.embedding.isnot(None),
            )
        )

        if material_id is not None:
            q = q.filter(models.MaterialChunk.material_id == material_id)
        elif material_ids is not None and len(material_ids) > 0:
            q = q.filter(models.MaterialChunk.material_id.in_(material_ids))

        if material_type is not None:
            q = q.filter(models.StudyMaterial.material_type == material_type)

        rows = q.order_by(distance_expr).limit(n_results).all()

        return [
            {
                "text": chunk.chunk_text,
                "material_id": chunk.material_id,
                "chunk_index": chunk.chunk_index,
                "relevance": round(max(0.0, 1.0 - float(dist)), 3),
            }
            for chunk, dist in rows
        ]

    except Exception:
        return []
