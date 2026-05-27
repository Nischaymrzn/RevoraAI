-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add material_type and storage_url to study_materials
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS material_type VARCHAR DEFAULT 'general';
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS storage_url TEXT;

-- 3. Add embedding column to material_chunks (384 dims)
ALTER TABLE material_chunks ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 4. Create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS material_chunks_embedding_idx
ON material_chunks USING hnsw (embedding vector_cosine_ops);
