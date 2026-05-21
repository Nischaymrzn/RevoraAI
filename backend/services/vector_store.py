"""
Vector store using pgvector (PostgreSQL) + sentence-transformers (local embeddings).

Embeddings (384 dims, all-MiniLM-L6-v2) are stored directly in the
material_chunks table. Similarity search uses cosine distance via pgvector's
HNSW index — no external embedding API needed.
"""

from typing import List, Dict, Any, Optional
from sentence_transformers import SentenceTransformer
from config import EMBEDDING_MODEL

_model: Optional[SentenceTransformer] = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def embed_text(text: str, task_type: str = "retrieval_document") -> List[float]:
    """
    Embed a single text using sentence-transformers.
    Returns a list of 384 floats.
    task_type is kept as a parameter for API compatibility but is ignored
    (sentence-transformers uses the same model for both indexing and querying).
    """
    model = _get_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def search_chunks(
    db,
    user_id: int,
    query: str,
    n_results: int = 5,
    material_id: Optional[int] = None,
    material_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search for the most relevant chunks using pgvector cosine similarity.

    Filters:
      - user_id:       always applied (user isolation)
      - material_id:   narrow to a specific document
      - material_type: narrow by type (past_paper / lesson / notes / textbook)

    Returns list of dicts: {text, material_id, chunk_index, relevance}
    """
    import models

    try:
        query_embedding = embed_text(query)
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
