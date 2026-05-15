import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare, ClipboardList, Timer, AlertCircle, BarChart2, GraduationCap,
  Loader2, Mic, MicOff, Send, Volume2, VolumeX, CheckCircle, XCircle,
  ChevronRight, RefreshCw, FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi, mockTestsApi, qaApi, quizzesApi } from '../services/api';
import { QuizQuestion, StudyMaterial } from '../types';
import { cn } from '../lib/utils';

function Btn({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-4 text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900'
          : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-700',
        className
      )}
    >
      {children}
    </button>
  );
}

function ScoreTag({ score }: { score: number }) {
  const cls =
    score >= 70 ? 'text-green-700 bg-green-50' :
    score >= 40 ? 'text-orange-600 bg-orange-50' :
    'text-red-600 bg-red-50';
  return <span className={cn('text-[11.5px] font-semibold px-2 py-0.5 rounded-md', cls)}>{score}%</span>;
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full bg-gray-300 rounded-full transition-all duration-500" style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center">
      <Icon size={30} className="text-gray-200 mb-3" />
      <p className="font-semibold text-gray-700 text-[14px]">{title}</p>
      <p className="text-[12.5px] text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

function NoMaterialsBanner() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg mb-4">
      <AlertCircle size={13} className="flex-shrink-0" />
      Process at least one material first
    </div>
  );
}

function AnalysisPanel() {
  const [matId, setMatId] = useState('');
  const [analysis, setAnalysis] = useState<{
    analysis_summary?: string;
    main_topics?: Array<{
      name: string;
      exam_weight_estimate?: string;
      importance: number;
      frequency?: string;
    }>;
    likely_questions?: Array<{
      question: string;
      likelihood: number;
      topic?: string;
      type?: string;
      marks?: number;
    }>;
    key_concepts?: string[];
    revision_priority?: string[];
  } | null>(null);
  const [existing, setExisting] = useState<typeof analysis>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const ready = materials.filter((m) => m.processing_status === 'completed');

  useEffect(() => {
    materialsApi.list().then((res) => setMaterials(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!matId) {
      setExisting(null);
      return;
    }

    qaApi.getPatternAnalysis(Number(matId)).then((res) => setExisting(res.data)).catch(() => {});
  }, [matId]);

  const run = async () => {
    if (!matId) {
      setError('Select a material');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await qaApi.analyzePatterns(Number(matId));
      setAnalysis(res.data);
    } catch (fetchError: unknown) {
      const detail =
        typeof fetchError === 'object' &&
        fetchError !== null &&
        'response' in fetchError &&
        typeof (fetchError as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
          ? (fetchError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Analysis failed';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const data = analysis || existing;

  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          {ready.length > 0 ? (
            <select
              value={matId}
              onChange={(e) => { setMatId(e.target.value); setAnalysis(null); }}
              className="h-8 text-[12.5px] bg-white border border-gray-200 rounded-lg px-3 max-w-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <option value="">Select a material...</option>
              {ready.map((material) => (
                <option key={material.id} value={String(material.id)}>
                  {material.original_name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[12.5px] text-gray-400 flex items-center gap-1.5">
              <FolderOpen size={13} />
              No processed materials yet
            </p>
          )}

          <Btn onClick={() => void run()} disabled={!matId || loading}>
            {loading ? <><Loader2 size={12} className="animate-spin" />Analysing...</> : <><RefreshCw size={12} />Analyse</>}
          </Btn>

          {existing && !analysis && <span className="text-[11px] text-gray-400 ml-1">Previous results shown</span>}
        </div>

        {error && <p className="text-[12.5px] text-red-500">{error}</p>}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-100 py-14 text-center">
            <Loader2 size={24} className="text-gray-300 mx-auto mb-3 animate-spin" />
            <p className="text-[13px] text-gray-400">Analysing patterns and exam trends...</p>
          </div>
        )}

        {!data && !loading && (
          <EmptyState
            icon={BarChart2}
            title="No analysis yet"
            sub="Select a past paper or material and click Analyse to see exam patterns and likely questions"
          />
        )}

        {data && !loading && (
          <div className="space-y-4 fade-in">
            {data.analysis_summary && (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Summary</p>
                <p className="text-[13px] text-gray-700 leading-relaxed">{data.analysis_summary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.main_topics && data.main_topics.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Topic Coverage</p>
                  <div className="space-y-4">
                    {data.main_topics.map((topic, index) => (
                      <div key={index}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[13px] font-medium text-gray-800">{topic.name}</span>
                          <span className="text-[11px] text-gray-400">{topic.exam_weight_estimate}</span>
                        </div>
                        <Bar value={topic.importance} />
                        {topic.frequency && (
                          <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{topic.frequency} frequency</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.likely_questions && data.likely_questions.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Likely Questions</p>
                  <div className="space-y-3">
                    {data.likely_questions.slice(0, 6).map((question, index) => (
                      <div key={index} className="flex items-start gap-2.5 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                        <span className="text-[11px] font-semibold text-gray-400 w-8 flex-shrink-0 mt-0.5">{question.likelihood}%</span>
                        <div>
                          <p className="text-[12.5px] text-gray-700 leading-snug">{question.question}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5 capitalize">
                            {question.topic} · {question.type}{question.marks ? ` · ${question.marks}m` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.key_concepts && data.key_concepts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Key Concepts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.key_concepts.map((concept) => (
                      <span key={concept} className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-md">
                        {concept}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {data.revision_priority && data.revision_priority.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Revision Priority</p>
                  <ol className="space-y-2">
                    {data.revision_priority.map((priority, index) => (
                      <li key={index} className="flex items-start gap-2.5 text-[12.5px] text-gray-700">
                        <span className="w-5 h-5 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        {priority}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuizPanel({ materials }: { materials: StudyMaterial[] }) {
  const [view, setView] = useState<'list' | 'generate' | 'attempt' | 'results'>('list');
  const [quizzes, setQuizzes] = useState<Array<{
    id: number;
    title: string;
    quiz_type: string;
    questions_count: number;
    best_score: number;
  }>>([]);
  const [genData, setGenData] = useState({ material_id: 0, title: 'Practice Quiz', quiz_type: 'mcq', count: 10 });
  const [generating, setGenerating] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<{
    id: number;
    title: string;
    questions?: QuizQuestion[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{
    score: number;
    correct: number;
    total: number;
    weak_topics?: string[];
    detailed_results?: Array<{
      question: string;
      user_answer?: string;
      correct_answer: string;
      is_correct: boolean;
      explanation?: string;
    }>;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [startTime] = useState<number>(Date.now());
  const ready = materials.filter((m) => m.processing_status === 'completed');
  const loadQuizzes = () => {
    quizzesApi.list().then((res) => setQuizzes(res.data)).catch(() => {});
  };

  useEffect(() => {
    loadQuizzes();
  }, []);

  const generate = async () => {
    if (!genData.material_id) {
      setError('Select a material');
      return;
    }

    setError('');
    setGenerating(true);

    try {
      const res = await quizzesApi.generate(genData);
      loadQuizzes();
      setView('list');
      toast.success(`Quiz generated — ${res.data.questions_count} questions ready`);
    } catch (fetchError: unknown) {
      const detail =
        typeof fetchError === 'object' &&
        fetchError !== null &&
        'response' in fetchError &&
        typeof (fetchError as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
          ? (fetchError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Generation failed';
      setError(detail);
    } finally {
      setGenerating(false);
    }
  };

  const startQuiz = async (id: number) => {
    const res = await quizzesApi.get(id);
    setCurrentQuiz(res.data);
    setAnswers({});
    setResults(null);
    setView('attempt');
  };

  const submitQuiz = async () => {
    if (!currentQuiz) return;
    setSubmitting(true);

    try {
      const timeTaken = Math.floor((Date.now() - startTime) / 1000);
      const res = await quizzesApi.submit(currentQuiz.id, answers, timeTaken);
      setResults(res.data);
      setView('results');
      loadQuizzes();
    } catch (submitError: unknown) {
      const detail =
        typeof submitError === 'object' &&
        submitError !== null &&
        'response' in submitError &&
        typeof (submitError as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
          ? (submitError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Submit failed';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  if (view === 'results' && results) {
    const scoreColor = results.score >= 70 ? '#16a34a' : results.score >= 40 ? '#ea580c' : '#dc2626';

    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5 space-y-3">
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
            <p className="text-5xl font-bold" style={{ color: scoreColor }}>{results.score}%</p>
            <p className="text-[13px] text-gray-400 mt-1">{results.correct} / {results.total} correct</p>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${results.score}%`, backgroundColor: scoreColor }} />
            </div>
            {results.weak_topics && results.weak_topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                {results.weak_topics.slice(0, 4).map((topic) => (
                  <span key={topic} className="text-[11.5px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">{topic}</span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {results.detailed_results?.map((result, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3">
                {result.is_correct
                  ? <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                  : <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="text-[13px] font-medium text-gray-900">{result.question}</p>
                  {!result.is_correct && <p className="text-[12px] text-red-500 mt-0.5">Your answer: {result.user_answer || '—'}</p>}
                  <p className="text-[12px] text-gray-500 mt-0.5">Correct: {result.correct_answer}</p>
                  {result.explanation && <p className="text-[11.5px] text-gray-400 italic mt-0.5">{result.explanation}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Btn onClick={() => { setView('list'); loadQuizzes(); }}>Back to quizzes</Btn>
            <Btn variant="outline" onClick={() => { if (currentQuiz) void startQuiz(currentQuiz.id); }}>Retry</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'attempt' && currentQuiz) {
    const answered = Object.keys(answers).length;
    const total = currentQuiz.questions?.length || 0;

    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-semibold text-gray-900 text-[14px]">{currentQuiz.title}</p>
              <p className="text-[12px] text-gray-400 mt-0.5">{answered} / {total} answered</p>
            </div>
            <div className="h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#6DEB74] rounded-full" style={{ width: `${(answered / Math.max(total, 1)) * 100}%` }} />
            </div>
          </div>

          {error && <p className="text-[12.5px] text-red-500 mb-4">{error}</p>}

          <div className="space-y-3">
            {currentQuiz.questions?.map((question, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-6 h-6 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0">{index + 1}</span>
                  <p className="text-[13.5px] font-medium text-gray-900">{question.question}</p>
                </div>

                {question.options ? (
                  <div className="space-y-2 ml-9">
                    {question.options.map((option, optionIndex) => {
                      const letter = option.charAt(0);
                      const selected = answers[String(index)] === letter;

                      return (
                        <button
                          key={optionIndex}
                          onClick={() => setAnswers((prev) => ({ ...prev, [String(index)]: letter }))}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg border text-[13px] transition-all',
                            selected
                              ? 'border-gray-900 bg-gray-900 text-white font-medium'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="ml-9 w-[calc(100%-2.25rem)] px-3 py-2 rounded-lg border border-gray-200 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 transition"
                    placeholder="Your answer..."
                    value={answers[String(index)] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [String(index)]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-5">
            <Btn onClick={() => void submitQuiz()} disabled={submitting}>
              {submitting ? <><Loader2 size={13} className="animate-spin" />Submitting...</> : <><CheckCircle size={13} />Submit</>}
            </Btn>
            <Btn variant="outline" onClick={() => setView('list')}>Cancel</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'generate') {
    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5">
          <p className="font-semibold text-gray-900 text-[14px] mb-5">Generate Quiz</p>
          {error && <p className="text-[12.5px] text-red-500 mb-3">{error}</p>}

          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Material</label>
              <select
                value={String(genData.material_id || '')}
                onChange={(e) => setGenData({ ...genData, material_id: Number(e.target.value) })}
                className="w-full h-9 text-[13px] bg-gray-50 border border-gray-200 rounded-lg px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">Select...</option>
                {ready.map((material) => (
                  <option key={material.id} value={String(material.id)}>{material.original_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Title</label>
              <input
                type="text"
                value={genData.title}
                onChange={(e) => setGenData({ ...genData, title: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Type</label>
                <select
                  value={genData.quiz_type}
                  onChange={(e) => setGenData({ ...genData, quiz_type: e.target.value })}
                  className="w-full h-9 text-[13px] bg-gray-50 border border-gray-200 rounded-lg px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  <option value="mcq">Multiple choice</option>
                  <option value="short_answer">Short answer</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Questions</label>
                <input
                  type="number"
                  min={5}
                  max={20}
                  value={genData.count}
                  onChange={(e) => setGenData({ ...genData, count: Number(e.target.value) })}
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Btn onClick={() => void generate()} disabled={generating} className="flex-1 justify-center">
                {generating ? <><Loader2 size={13} className="animate-spin" />Generating...</> : <><RefreshCw size={13} />Generate</>}
              </Btn>
              <Btn variant="outline" onClick={() => setView('list')}>Cancel</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900 text-[14px]">Quizzes</p>
          <Btn onClick={() => setView('generate')} disabled={ready.length === 0}>
            <ClipboardList size={12} />New Quiz
          </Btn>
        </div>

        {ready.length === 0 && <NoMaterialsBanner />}
        {quizzes.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No quizzes yet"
            sub="Generate a quiz from your processed materials to start practicing"
          />
        ) : (
          <div className="space-y-2">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 flex items-center">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13.5px] text-gray-900 truncate">{quiz.title}</p>
                  <p className="text-[11.5px] text-gray-400 mt-0.5">
                    {quiz.quiz_type} · {quiz.questions_count} questions
                    {quiz.best_score > 0 && <> · <ScoreTag score={quiz.best_score} /></>}
                  </p>
                </div>
                <Btn variant="outline" onClick={() => void startQuiz(quiz.id)}>
                  Start <ChevronRight size={12} />
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MockPanel({ materials }: { materials: StudyMaterial[] }) {
  const [view, setView] = useState<'list' | 'create' | 'attempt' | 'results'>('list');
  const [mocks, setMocks] = useState<Array<{
    id: number;
    title: string;
    questions_count: number;
    time_limit: number;
    best_score: number;
  }>>([]);
  const [selectedMats, setSelectedMats] = useState<number[]>([]);
  const [cfg, setCfg] = useState({ title: 'Mock Test', questions_count: 10, time_limit: 30 });
  const [creating, setCreating] = useState(false);
  const [currentMock, setCurrentMock] = useState<{
    id: number;
    title: string;
    time_limit: number;
    questions?: Array<{
      question: string;
      options?: string[];
    }>;
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{
    score: number;
    correct: number;
    total: number;
    readiness?: {
      readiness_score: number;
      readiness_level: string;
      recommendation: string;
    };
    detailed_results?: Array<{
      question: string;
      user_answer?: string;
      correct_answer: string;
      is_correct: boolean;
      explanation?: string;
    }>;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ready = materials.filter((m) => m.processing_status === 'completed');
  const loadMocks = () => {
    mockTestsApi.list().then((res) => setMocks(res.data)).catch(() => {});
  };

  useEffect(() => {
    loadMocks();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const create = async () => {
    if (selectedMats.length === 0) {
      setError('Select at least one material');
      return;
    }

    setError('');
    setCreating(true);

    try {
      const res = await mockTestsApi.create({
        title: cfg.title,
        material_ids: selectedMats,
        questions_count: cfg.questions_count,
        time_limit: cfg.time_limit,
      });
      loadMocks();
      setView('list');
      toast.success(`Mock test created — ${res.data.questions_count} questions ready`);
    } catch (createError: unknown) {
      const detail =
        typeof createError === 'object' &&
        createError !== null &&
        'response' in createError &&
        typeof (createError as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
          ? (createError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Creation failed';
      setError(detail);
    } finally {
      setCreating(false);
    }
  };

  const startMock = async (id: number) => {
    const res = await mockTestsApi.get(id);
    setCurrentMock(res.data);
    setAnswers({});
    setResults(null);
    setView('attempt');
    setTimeLeft((res.data.time_limit || 30) * 60);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const submitMock = async () => {
    if (!currentMock) return;
    setSubmitting(true);

    try {
      const timeTaken = Math.max(((currentMock.time_limit || 30) * 60) - timeLeft, 0);
      const res = await mockTestsApi.submit(currentMock.id, answers, timeTaken);
      if (timerRef.current) clearInterval(timerRef.current);
      setResults(res.data);
      setView('results');
      loadMocks();
    } catch (submitError: unknown) {
      const detail =
        typeof submitError === 'object' &&
        submitError !== null &&
        'response' in submitError &&
        typeof (submitError as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
          ? (submitError as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Submit failed';
      setError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  if (view === 'results' && results) {
    const scoreColor = results.score >= 70 ? '#16a34a' : results.score >= 40 ? '#ea580c' : '#dc2626';

    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5 space-y-3">
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
            <p className="text-5xl font-bold" style={{ color: scoreColor }}>{results.score}%</p>
            <p className="text-[13px] text-gray-400 mt-1">{results.correct} / {results.total} correct</p>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${results.score}%`, backgroundColor: scoreColor }} />
            </div>
            {results.readiness && (
              <div className="mt-4 pt-4 border-t border-gray-100 text-left">
                <p className="text-[12.5px] font-semibold text-gray-700">
                  Readiness: {results.readiness.readiness_score}% — {results.readiness.readiness_level}
                </p>
                <p className="text-[12px] text-gray-400 mt-0.5">{results.readiness.recommendation}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {results.detailed_results?.slice(0, 8).map((result, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-start gap-3">
                {result.is_correct
                  ? <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                  : <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />}
                <div>
                  <p className="text-[13px] font-medium text-gray-900">{result.question}</p>
                  {!result.is_correct && <p className="text-[12px] text-red-500 mt-0.5">Your: {result.user_answer || '—'}</p>}
                  <p className="text-[12px] text-gray-500 mt-0.5">Correct: {result.correct_answer}</p>
                  {result.explanation && <p className="text-[11.5px] text-gray-400 italic mt-0.5">{result.explanation}</p>}
                </div>
              </div>
            ))}
          </div>

          <Btn onClick={() => { setView('list'); loadMocks(); }}>Back to mock tests</Btn>
        </div>
      </div>
    );
  }

  if (view === 'attempt' && currentMock) {
    const answered = Object.keys(answers).length;
    const total = currentMock.questions?.length || 0;
    const isWarning = timeLeft <= 300;

    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5">
          <div className="sticky top-0 bg-[#F7F8FA]/95 backdrop-blur-sm -mx-5 px-5 py-3 mb-5 border-b border-gray-100 flex items-center justify-between z-10">
            <div>
              <p className="font-semibold text-gray-900 text-[13.5px]">{currentMock.title}</p>
              <p className="text-[11.5px] text-gray-400">{answered} / {total} answered</p>
            </div>
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-[13px] border',
              isWarning ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-800 border-gray-200'
            )}>
              <Timer size={12} />
              {formatTime(timeLeft)}
            </div>
          </div>

          {error && <p className="text-[12.5px] text-red-500 mb-4">{error}</p>}

          <div className="space-y-3">
            {currentMock.questions?.map((question, index) => (
              <div key={index} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="w-6 h-6 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0">{index + 1}</span>
                  <p className="text-[13.5px] font-medium text-gray-900">{question.question}</p>
                </div>

                {question.options ? (
                  <div className="space-y-2 ml-9">
                    {question.options.map((option, optionIndex) => {
                      const letter = option.charAt(0);
                      const selected = answers[String(index)] === letter;

                      return (
                        <button
                          key={optionIndex}
                          onClick={() => setAnswers((prev) => ({ ...prev, [String(index)]: letter }))}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg border text-[13px] transition-all',
                            selected
                              ? 'border-gray-900 bg-gray-900 text-white font-medium'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type="text"
                    className="ml-9 w-[calc(100%-2.25rem)] px-3 py-2 rounded-lg border border-gray-200 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200"
                    placeholder="Your answer..."
                    value={answers[String(index)] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [String(index)]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-5">
            <Btn onClick={() => void submitMock()} disabled={submitting}>
              {submitting ? <><Loader2 size={13} className="animate-spin" />Submitting...</> : 'Submit Mock Test'}
            </Btn>
            <Btn variant="outline" onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setView('list'); }}>Cancel</Btn>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5">
          <p className="font-semibold text-gray-900 text-[14px] mb-5">Create Mock Test</p>
          {error && <p className="text-[12.5px] text-red-500 mb-3">{error}</p>}

          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Title</label>
              <input
                type="text"
                value={cfg.title}
                onChange={(e) => setCfg({ ...cfg, title: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-2 uppercase tracking-wide">Materials</label>
              <div className="space-y-2">
                {ready.map((material) => (
                  <label key={material.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMats.includes(material.id)}
                      onChange={(e) =>
                        setSelectedMats(
                          e.target.checked
                            ? [...selectedMats, material.id]
                            : selectedMats.filter((id) => id !== material.id)
                        )
                      }
                      className="accent-gray-800 w-4 h-4"
                    />
                    <span className="text-[13px] text-gray-700 truncate">{material.original_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Questions — <strong className="text-gray-900">{cfg.questions_count}</strong>
              </label>
              <input
                type="range"
                min={5}
                max={20}
                step={1}
                value={cfg.questions_count}
                onChange={(e) => setCfg({ ...cfg, questions_count: Number(e.target.value) })}
                className="w-full accent-gray-800"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Time limit — <strong className="text-gray-900">{cfg.time_limit} min</strong>
              </label>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={cfg.time_limit}
                onChange={(e) => setCfg({ ...cfg, time_limit: Number(e.target.value) })}
                className="w-full accent-gray-800"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Btn onClick={() => void create()} disabled={creating} className="flex-1 justify-center">
                {creating ? <><Loader2 size={13} className="animate-spin" />Creating...</> : <><Timer size={13} />Create</>}
              </Btn>
              <Btn variant="outline" onClick={() => setView('list')}>Cancel</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900 text-[14px]">Mock Tests</p>
          <Btn onClick={() => setView('create')} disabled={ready.length === 0}>
            <Timer size={12} />New Mock Test
          </Btn>
        </div>

        {ready.length === 0 && <NoMaterialsBanner />}
        {mocks.length === 0 ? (
          <EmptyState icon={Timer} title="No mock tests yet" sub="Create a timed exam from your processed materials" />
        ) : (
          <div className="space-y-2">
            {mocks.map((mock) => (
              <div key={mock.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 flex items-center">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13.5px] text-gray-900 truncate">{mock.title}</p>
                  <p className="text-[11.5px] text-gray-400 mt-0.5">
                    {mock.time_limit} min · {mock.questions_count} questions
                    {mock.best_score > 0 && <> · <ScoreTag score={mock.best_score} /></>}
                  </p>
                </div>
                <Btn variant="outline" onClick={() => void startMock(mock.id)}>
                  Start <ChevronRight size={12} />
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TutorPanel({ materials }: { materials: StudyMaterial[] }) {
  const ready = materials.filter((m) => m.processing_status === 'completed');
  const [question, setQuestion] = useState('');
  const [matId, setMatId] = useState('');
  const [messages, setMessages] = useState<Array<{ role: string; content: string; sources?: Array<{ preview?: string }> }>>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{
    stop?: () => void;
  } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const speak = (text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast.error('Voice input is not supported in this browser');
      return;
    }

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => setQuestion(event.results[0][0].transcript);
    recognition.onend = () => setListening(false);
    recognition.start();

    recognitionRef.current = recognition;
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop?.();
    setListening(false);
  };

  const handleSend = async () => {
    if (!question.trim() || loading) return;

    const currentQuestion = question.trim();
    setQuestion('');
    setMessages((prev) => [...prev, { role: 'user', content: currentQuestion }]);
    setLoading(true);

    try {
      const response = await qaApi.ask(currentQuestion, matId ? Number(matId) : undefined);
      const answer = response.data.answer;
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, sources: response.data.sources }]);
      speak(answer);
    } catch (error: unknown) {
      const fallback =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
          ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : 'Could not get answer';

      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${fallback}` }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'What are the main topics?',
    'Explain key concepts',
    'What should I focus on for the exam?',
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        {ready.length > 0 ? (
          <select
            value={matId}
            onChange={(e) => setMatId(e.target.value)}
            className="h-8 text-[12.5px] bg-white border border-gray-200 rounded-lg px-3 max-w-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200"
          >
            <option value="">All materials</option>
            {ready.map((material) => (
              <option key={material.id} value={String(material.id)}>
                {material.original_name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[12px] text-gray-400">All materials</span>
        )}

        <button
          onClick={() => setTtsEnabled((prev) => !prev)}
          className={cn(
            'ml-auto h-7 w-7 flex items-center justify-center rounded-lg transition-colors',
            ttsEnabled ? 'text-gray-700 bg-gray-100' : 'text-gray-300 hover:text-gray-500'
          )}
        >
          {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
              <GraduationCap size={22} className="text-gray-400" />
            </div>
            <p className="font-semibold text-gray-800 text-[14px]">Ask anything from your materials</p>
            <p className="text-[12.5px] text-gray-400 mt-1">Answers are grounded in your uploaded documents</p>
            {ready.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setQuestion(suggestion)}
                    className="text-[12px] bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg">
                Upload and process materials first
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={index} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed',
                  message.role === 'user'
                    ? 'bg-gray-900 text-white rounded-br-sm'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200/40 space-y-0.5">
                    {message.sources.slice(0, 2).map((source, sourceIndex) => (
                      <p key={sourceIndex} className="text-[11px] text-gray-400 truncate">
                        {source.preview?.slice(0, 80)}...
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm flex items-center gap-2 text-[13px] text-gray-400">
                <Loader2 size={13} className="animate-spin" />
                Searching your materials...
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            placeholder="Ask a question about your materials..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            className="flex-1 text-[13.5px] resize-none px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 transition min-h-[52px] max-h-32"
          />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={listening ? stopListening : startListening}
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
                listening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'
              )}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              onClick={() => void handleSend()}
              disabled={!question.trim() || loading}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-gray-900 hover:bg-gray-800 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { value: 'analysis', label: 'Analysis', icon: BarChart2 },
  { value: 'quiz', label: 'Quiz', icon: ClipboardList },
  { value: 'mock', label: 'Mock Test', icon: Timer },
  { value: 'tutor', label: 'AI Tutor', icon: MessageSquare },
] as const;

export default function StudyAI() {
  const [searchParams] = useSearchParams();
  const initTab = (() => {
    const t = searchParams.get('tab');
    if (t === 'quiz') return 'quiz';
    if (t === 'mock') return 'mock';
    if (t === 'qa' || t === 'tutor') return 'tutor';
    return 'analysis';
  })();
  const [activeTab, setActiveTab] = useState(initTab);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);

  useEffect(() => {
    materialsApi.list().then((res) => setMaterials(res.data));
  }, []);

  return (
    <div className="fade-in flex flex-col flex-1 min-h-0">
      <div className="bg-white border-b border-gray-100 px-6 pt-5 pb-0 flex-shrink-0">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Knowledge AI</h1>
          <p className="text-[13px] text-gray-400 mt-1">Analyse past papers, take assessments, and ask your AI tutor</p>
        </div>

        <div className="flex">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[13px] border-b-2 transition-colors',
                activeTab === value
                  ? 'border-[#6DEB74] text-gray-900 font-semibold'
                  : 'border-transparent text-gray-400 font-medium hover:text-gray-600'
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-[#F7F8FA]">
        {activeTab === 'analysis' && <AnalysisPanel />}
        {activeTab === 'quiz' && <QuizPanel materials={materials} />}
        {activeTab === 'mock' && <MockPanel materials={materials} />}
        {activeTab === 'tutor' && <TutorPanel materials={materials} />}
      </div>
    </div>
  );
}
