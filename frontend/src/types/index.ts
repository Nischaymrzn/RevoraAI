export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Course {
  id: number;
  name: string;
  code?: string | null;
  grade_level?: string | null;
  exam_board?: string | null;
  description?: string | null;
  created_at: string;
  material_count: number;
  past_paper_count: number;
}

export interface StudyMaterial {
  id: number;
  original_name: string;
  file_type: string;
  file_size: number;
  upload_date: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  material_type: 'general' | 'past_paper' | 'lesson' | 'notes' | 'textbook';
  course_id?: number | null;
  exam_year?: number | null;
  exam_board?: string | null;
  grade_level?: string | null;
  subject?: string | null;
  page_count: number;
  chunk_count: number;
  word_count: number;
  has_summary: boolean;
  summary?: string;
  storage_url?: string | null;
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
  past_paper_count: number;
  questions_asked: number;
  quiz_attempt_count: number;
  mock_attempt_count: number;
  avg_score: number;
  readiness_score: number;
  courses_count: number;
}

export interface ActivityEvent {
  id: number;
  type: string;
  description: string;
  created_at: string;
}

export interface PatternAnalysis {
  analysis_summary: string;
  main_topics: Array<{
    name: string;
    frequency: 'high' | 'medium' | 'low';
    importance: number;
    paper_count?: number;
    exam_weight_estimate: string;
    subtopics?: string[];
  }>;
  recurring_patterns?: Array<{
    pattern: string;
    frequency_count: number;
    topics: string[];
    example_question: string;
  }>;
  likely_questions: Array<{
    question: string;
    topic: string;
    type: string;
    marks?: number;
    likelihood: number;
    appears_in_papers?: number;
    reasoning?: string;
  }>;
  key_concepts: string[];
  revision_priority: string[];
  topic_distribution: Record<string, number>;
}

export interface QuestionCluster {
  topic: string;
  chapter?: string | null;
  representative_question: string;
  section_types: string[];
  paper_count: number;
  occurrence_count: number;
  material_ids: number[];
  questions: Array<{
    material_id: number;
    section: string;
    question_number?: number | null;
    question_text: string;
    marks?: number | null;
    chapter?: string | null;
    topic?: string | null;
  }>;
}

export interface SectionInfo {
  section: string;
  count: number;
  total_marks: number;
  topics: Record<string, number>;
  chapters: Record<string, number>;
}

export interface AnalysisHistoryItem {
  id: number;
  label: string;
  is_past_paper: boolean;
  material_ids: number[];
  papers_analyzed?: Array<{ id: number; name: string; year?: number | null; board?: string | null; subject?: string | null }> | null;
  course_id?: number | null;
  topics?: string[];
  cluster_count: number;
  analysis_text?: string;
  created_at: string;
}
