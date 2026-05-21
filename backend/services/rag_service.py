from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from services.vector_store import search_chunks
from services.ai_client import generate


RAG_PROMPT = """You are Revora AI, an intelligent revision assistant. Answer the student's question using ONLY the provided context from their study materials.

Context from study materials:
{context}

Student's Question: {question}

Instructions:
- Answer directly and clearly based on the context provided
- If the context doesn't contain enough information, say so honestly
- Cite relevant parts of the material when helpful
- Keep the answer focused and educational
- Format your answer clearly with proper structure if needed

Answer:"""


def answer_question(
    db: Session,
    user_id: int,
    question: str,
    material_id: Optional[int] = None,
    material_type: Optional[str] = None,
    n_chunks: int = 5,
) -> Dict[str, Any]:
    chunks = search_chunks(
        db,
        user_id,
        question,
        n_results=n_chunks,
        material_id=material_id,
        material_type=material_type,
    )

    if not chunks:
        return {
            "answer": "I couldn't find relevant content in your uploaded materials to answer this question. Please make sure your materials have been processed, or try rephrasing your question.",
            "sources": [],
            "retrieved_chunks": 0,
        }

    context = "\n\n---\n\n".join([c["text"] for c in chunks])
    prompt = RAG_PROMPT.format(context=context, question=question)

    answer = generate(prompt, temperature=0.3, large=False)

    sources = [
        {
            "material_id": c["material_id"],
            "chunk_index": c["chunk_index"],
            "relevance": c["relevance"],
            "preview": c["text"][:200] + "..." if len(c["text"]) > 200 else c["text"],
        }
        for c in chunks[:3]
    ]

    return {
        "answer": answer,
        "sources": sources,
        "retrieved_chunks": len(chunks),
    }


SUMMARY_PROMPT = """You are Revora AI, an intelligent revision assistant. Create a comprehensive but concise summary of the following study material.

Study Material Content:
{content}

Instructions:
- Identify and summarize the main topics and key concepts
- Highlight important definitions, formulas, or facts
- Structure the summary with clear headings
- Make it useful for exam revision
- Keep it concise but complete

Summary:"""


def summarize_material(content: str) -> str:
    max_chars = 8000
    truncated = content[:max_chars] if len(content) > max_chars else content
    prompt = SUMMARY_PROMPT.format(content=truncated)
    return generate(prompt, temperature=0.3, large=True)
