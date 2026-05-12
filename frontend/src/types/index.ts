export interface User {
  id: number;
  name: string;
  email: string;
}

export interface StudyMaterial {
  id: number;
  original_name: string;
  file_type: string;
  file_size: number;
  upload_date: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  page_count: number;
  chunk_count: number;
  word_count: number;
  has_summary: boolean;
  summary?: string;
}

export interface QueryHistory {
  id: number;
  question: string;
  answer: string;
  material_id: number | null;
  sources: Array<{ material_id: number; preview: string; relevance: number }>;
  created_at: string;
}

export interface Quiz {
  id: number;
  title: string;
  quiz_type: string;
  questions_count: number;
  material_id: number;
  created_at: string;
  attempt_count: number;
  best_score: number;
}

export interface QuizQuestion {
  id: number;
  question: string;
  type: string;
  options: string[] | null;
  topic: string;
  difficulty: string;
}

export interface MockTest {
  id: number;
  title: string;
  questions_count: number;
  time_limit: number;
  created_at: string;
  attempt_count: number;
  best_score: number;
}

export interface DashboardStats {
  materials_count: number;
  processed_count: number;
  questions_asked: number;
  quiz_attempt_count: number;
  mock_attempt_count: number;
  avg_score: number;
  readiness_score: number;
}

export interface ActivityEvent {
  id: number;
  type: string;
  description: string;
  created_at: string;
}

export interface PatternAnalysis {
  main_topics: Array<{
    name: string;
    frequency: string;
    importance: number;
    exam_weight_estimate: string;
  }>;
  likely_questions: Array<{
    question: string;
    topic: string;
    type: string;
    likelihood: number;
  }>;
  key_concepts: string[];
  revision_priority: string[];
  analysis_summary: string;
  topic_distribution: Record<string, number>;
}
