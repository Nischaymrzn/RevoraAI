import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare, ClipboardList, Timer, AlertCircle, BarChart2, GraduationCap,
  Loader2, Mic, MicOff, Send, Volume2, VolumeX, CheckCircle, XCircle,
  ChevronRight, RefreshCw, FolderOpen, BookOpen, History, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi, mockTestsApi, qaApi, quizzesApi, coursesApi } from '../services/api';
import { QuizQuestion, StudyMaterial, Course, AnalysisHistoryItem } from '../types';
import { cn } from '../lib/utils';

// Shared error-detail extractor
function extractDetail(err: unknown, fallback: string): string {
  if (
    typeof err === 'object' && err !== null &&
    'response' in err &&
    typeof (err as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
  ) {
    return (err as { response?: { data?: { detail?: string } } }).response!.data!.detail!;
  }
  return fallback;
}

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
          ? 'bg-zinc-900 hover:bg-black text-white'
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
    <div className="h-1.5 bg-green-50 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-400 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function FreqBar({
  value,
  label,
  papers,
  totalPapers,
  count,
  marks,
  badge,
  badgeClass,
}: {
  value: number;
  label: string;
  papers: number;
  totalPapers: number;
  count: number;
  marks?: number;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {badge && (
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0', badgeClass)}>
            {badge}
          </span>
        )}
        <span className="text-[12.5px] font-medium text-gray-800 flex-1">{label}</span>
        <span className="text-[11px] font-semibold text-green-700 tabular-nums">
          {papers}/{totalPapers} papers
        </span>
        <span className="text-[11px] font-bold text-green-600 w-9 text-right tabular-nums">
          {value}%
        </span>
      </div>
      <div className="h-2 bg-green-50 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-400 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <div className="flex items-center gap-2 text-[10.5px] text-gray-400">
        <span>{count} question{count !== 1 ? 's' : ''}</span>
        {marks != null && marks > 0 && <span>· {marks} marks</span>}
      </div>
    </div>
  );
}

/* ── DonutChart — SVG-based, no dependency ─────────────────────────────────── */
function DonutChart({
  segments,
  size = 120,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
}) {
  const r = size * 0.37;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  let cumulative = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0fdf4" strokeWidth={size * 0.13} />
      {/* Segments */}
      {segments.map((seg, i) => {
        const segLen = (seg.value / total) * C;
        const dashOffset = C - cumulative;
        cumulative += segLen;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={size * 0.13}
            strokeDasharray={`${segLen} ${C}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        );
      })}
      {/* White centre */}
      <circle cx={cx} cy={cy} r={r * 0.58} fill="white" />
    </svg>
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
    <div className="flex items-center gap-2 text-[12px] text-gray-700 bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg mb-4">
      <AlertCircle size={13} className="flex-shrink-0" />
      Process at least one material first
    </div>
  );
}

// Section display helpers
const SEC_LABEL: Record<string, string> = {
  mcq: 'MCQ',
  short_answer: 'Short Ans',
  long_answer: 'Long Ans',
  unknown: 'Other',
};
const SEC_COLOR: Record<string, string> = {
  mcq: 'bg-blue-50 text-blue-700',
  short_answer: 'bg-emerald-50 text-emerald-700',
  long_answer: 'bg-orange-50 text-orange-700',
  unknown: 'bg-gray-100 text-gray-500',
};

type QuestionTypeFreq = {
  papers: number;
  total_papers: number;
  pct: number;
  question_count: number;
  total_marks: number;
};

type AnalysisData = {
  analysis_id?: number;
  analysis_summary?: string;
  main_topics?: Array<{ name: string; exam_weight_estimate?: string; importance: number; frequency?: string; paper_count?: number }>;
  likely_questions?: Array<{ question: string; likelihood: number; topic?: string; type?: string; marks?: number; appears_in_papers?: number }>;
  recurring_patterns?: Array<{ pattern: string; frequency_count: number; topics?: string[] }>;
  key_concepts?: string[];
  revision_priority?: string[];
  question_clusters?: Array<{
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
    }>;
  }>;
  section_breakdown?: Record<string, {
    section: string;
    count: number;
    total_marks: number;
    topics: Record<string, number>;
  }>;
  question_type_frequency?: Record<string, QuestionTypeFreq>;
  papers_analyzed?: Array<{ id: number; name: string; year?: number | null }>;
};

function AnalysisPanel() {
  const [view, setView] = useState<'run' | 'history'>('run');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  // History
  const [historyItems, setHistoryItems] = useState<AnalysisHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Clusters
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(new Set());

  const ready = materials.filter((m) => m.processing_status === 'completed');

  useEffect(() => {
    Promise.all([materialsApi.list(), coursesApi.list()])
      .then(([matRes, crsRes]) => {
        setMaterials(matRes.data);
        setCourses(crsRes.data);
      })
      .catch(() => { });
  }, []);

  const loadHistory = () => {
    setLoadingHistory(true);
    qaApi.analysisHistory()
      .then((res) => setHistoryItems(res.data))
      .catch(() => { })
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => {
    if (view === 'history') loadHistory();
  }, [view]);

  const toggle = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const selectCourse = (courseId: number) => {
    const courseMatIds = ready.filter((m) => m.course_id === courseId).map((m) => m.id);
    const allSelected = courseMatIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !courseMatIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...courseMatIds])]);
    }
  };

  const run = async () => {
    if (selectedIds.length === 0) { setError('Select at least one material to analyse'); return; }
    setError('');
    setLoading(true);
    setAnalysis(null);
    setExpandedClusters(new Set());
    try {
      const res = await qaApi.analyzePapers(selectedIds);
      setAnalysis(res.data);
    } catch (err) {
      setError(extractDetail(err, 'Analysis failed'));
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = async (id: number) => {
    try {
      const res = await qaApi.analysisDetail(id);
      const full = res.data.full_result as AnalysisData;
      full.analysis_id = res.data.id;
      setAnalysis(full);
      setExpandedClusters(new Set());
      setView('run');
    } catch {
      toast.error('Failed to load analysis');
    }
  };

  const toggleCluster = (idx: number) =>
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });

  const hasPastPaper = selectedIds.some(
    (id) => ready.find((m) => m.id === id)?.material_type === 'past_paper'
  );
  const ungrouped = ready.filter((m) => !m.course_id);
  const grouped = courses
    .map((c) => ({ course: c, mats: ready.filter((m) => m.course_id === c.id) }))
    .filter((g) => g.mats.length > 0);

  const paperLabel = (materialId: number) => {
    const m = materials.find((x) => x.id === materialId);
    if (!m) return `Paper #${materialId}`;
    return m.exam_year ? String(m.exam_year) : m.original_name.slice(0, 20);
  };

  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5 space-y-4">

        {/* View switcher */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-lg p-1 w-fit">
          {([
            { key: 'run', label: 'Analyse', icon: BarChart2 },
            { key: 'history', label: 'History', icon: History },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-colors',
                view === key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <Icon size={11} />{label}
            </button>
          ))}
        </div>

        {/* ─── HISTORY VIEW ─── */}
        {view === 'history' && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Past Analyses</p>
            {loadingHistory ? (
              <div className="py-10 flex justify-center">
                <Loader2 size={20} className="animate-spin text-gray-300" />
              </div>
            ) : historyItems.length === 0 ? (
              <EmptyState icon={History} title="No history yet" sub="Run your first analysis to see it here" />
            ) : (
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => void loadFromHistory(item.id)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-gray-800 flex-1 truncate">{item.label}</span>
                      {item.is_past_paper && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">PP</span>
                      )}
                      {item.cluster_count > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                          {item.cluster_count} repeats
                        </span>
                      )}
                      <ChevronRight size={13} className="text-gray-300 flex-shrink-0 group-hover:text-gray-500" />
                    </div>
                    <p className="text-[11.5px] text-gray-400 mt-0.5">
                      {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {item.papers_analyzed && item.papers_analyzed.length > 0 && (
                        <> · {item.papers_analyzed.map((p) => p.year || p.name.slice(0, 12)).join(', ')}</>
                      )}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── RUN VIEW ─── */}
        {view === 'run' && (
          <>
            {/* Material picker */}
            {ready.length === 0 ? (
              <NoMaterialsBanner />
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest">Select materials</p>
                  {hasPastPaper && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      RAG · Past paper mode
                    </span>
                  )}
                </div>

                {grouped.map(({ course, mats }) => {
                  const allSel = mats.every((m) => selectedIds.includes(m.id));
                  const someSel = mats.some((m) => selectedIds.includes(m.id));
                  return (
                    <div key={course.id} className="mb-3">
                      <button onClick={() => selectCourse(course.id)} className="flex items-center gap-2 w-full mb-1.5 group">
                        <BookOpen size={12} className="text-gray-400" />
                        <span className="text-[11.5px] font-semibold text-gray-500 uppercase tracking-wider flex-1 text-left">{course.name}</span>
                        <span className={cn('text-[10.5px] px-1.5 py-0.5 rounded font-medium', allSel ? 'bg-gray-900 text-white' : someSel ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200')}>
                          {allSel ? 'all selected' : someSel ? 'partial' : 'select all'}
                        </span>
                      </button>
                      <div className="space-y-1 ml-4">
                        {mats.map((m) => (
                          <label key={m.id} className={cn('flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-all', selectedIds.includes(m.id) ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50')}>
                            <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)} className="accent-gray-900 w-4 h-4 flex-shrink-0" />
                            <span className="text-[12.5px] text-gray-800 flex-1 truncate">{m.original_name}</span>
                            {m.exam_year && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex-shrink-0">{m.exam_year}</span>}
                            {m.material_type === 'past_paper' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">PP</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {ungrouped.length > 0 && (
                  <div className={cn('space-y-1.5', grouped.length > 0 && 'mt-3 pt-3 border-t border-gray-50')}>
                    {grouped.length > 0 && <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Other</p>}
                    {ungrouped.map((m) => (
                      <label key={m.id} className={cn('flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all', selectedIds.includes(m.id) ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50')}>
                        <input type="checkbox" checked={selectedIds.includes(m.id)} onChange={() => toggle(m.id)} className="accent-gray-900 w-4 h-4 flex-shrink-0" />
                        <span className="text-[13px] text-gray-800 flex-1 truncate">{m.original_name}</span>
                        {m.exam_year && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex-shrink-0">{m.exam_year}</span>}
                        {m.material_type === 'past_paper' && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">PP</span>}
                      </label>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <Btn onClick={() => void run()} disabled={selectedIds.length === 0 || loading}>
                    {loading
                      ? <><Loader2 size={12} className="animate-spin" />Analysing…</>
                      : <><RefreshCw size={12} />Analyse {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</>}
                  </Btn>
                  {selectedIds.length > 0 && (
                    <button onClick={() => { setSelectedIds([]); setAnalysis(null); }} className="text-[12px] text-gray-400 hover:text-gray-600">Clear</button>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-[12.5px] text-red-500">{error}</p>}

            {loading && (
              <div className="bg-white rounded-xl border border-gray-100 py-14 text-center">
                <Loader2 size={24} className="text-gray-300 mx-auto mb-3 animate-spin" />
                <p className="text-[13px] text-gray-400">
                  {hasPastPaper ? 'Finding patterns across past papers — extracting questions & clustering…' : 'Analysing content patterns…'}
                </p>
                <p className="text-[12px] text-gray-300 mt-1">This may take 30–90 seconds</p>
              </div>
            )}

            {!analysis && !loading && ready.length > 0 && (
              <EmptyState icon={BarChart2} title="No analysis yet" sub="Select past papers or materials above, then click Analyse" />
            )}

            {analysis && !loading && (
              <div className="space-y-4 fade-in">

                {/* Papers row */}
                {analysis.papers_analyzed && analysis.papers_analyzed.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {analysis.papers_analyzed.map((p) => (
                      <span key={p.id} className="text-[11.5px] font-medium text-gray-700 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                        {p.year ?? p.name.slice(0, 18)}
                      </span>
                    ))}
                    <span className="text-[11px] text-gray-400">{analysis.papers_analyzed.length} papers analysed</span>
                  </div>
                )}

                {/* Summary */}
                {analysis.analysis_summary && (
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Summary</p>
                    <p className="text-[13px] text-gray-700 leading-relaxed">{analysis.analysis_summary}</p>
                  </div>
                )}

                {/* ── Charts ────────────────────────────────────────────────────── */}
                {(() => {
                  const freq = analysis.question_type_frequency ?? {};
                  const breakdown = analysis.section_breakdown ?? {};
                  const topics = analysis.main_topics ?? [];
                  const totalPapers = analysis.papers_analyzed?.length ?? 1;

                  // Donut segments from section_breakdown (actual question counts)
                  const SEC_COLORS_DONUT: Record<string, string> = {
                    mcq: '#4ade80',  // green-400
                    short_answer: '#34d399',  // emerald-400
                    long_answer: '#a78bfa',  // violet-400
                    code: '#818cf8',  // indigo-400
                    unknown: '#d1d5db',  // gray-300
                  };

                  const donutSegments = Object.entries(breakdown)
                    .filter(([, d]) => d.count > 0)
                    .map(([sec, d]) => ({
                      label: sec === 'mcq' ? 'MCQ' : sec === 'short_answer' ? 'Short' : sec === 'long_answer' ? 'Long' : 'Other',
                      value: d.count,
                      color: SEC_COLORS_DONUT[sec] ?? '#d1d5db',
                    }));

                  const totalQs = donutSegments.reduce((s, d) => s + d.value, 0);

                  // Topic bars — show paper_count / totalPapers
                  const topicBars = topics
                    .filter(t => t.name)
                    .slice(0, 8)
                    .map(t => ({
                      name: t.name,
                      pct: t.paper_count ? Math.round((t.paper_count / totalPapers) * 100) : t.importance,
                      freq: t.frequency,
                      papers: t.paper_count ?? null,
                    }));

                  if (donutSegments.length === 0 && topicBars.length === 0) return null;

                  return (
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Analysis Charts</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                        {/* Left: Question type donut */}
                        {donutSegments.length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-400 font-medium mb-3">Question Distribution</p>
                            <div className="flex items-center gap-4">
                              <div className="relative flex-shrink-0">
                                <DonutChart segments={donutSegments} size={110} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className="text-[18px] font-bold text-gray-800">{totalQs}</span>
                                  <span className="text-[9px] text-gray-400">questions</span>
                                </div>
                              </div>
                              <div className="space-y-1.5 flex-1">
                                {donutSegments.map((seg, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                                    <span className="text-[11.5px] text-gray-700 flex-1">{seg.label}</span>
                                    <span className="text-[11px] text-gray-500 tabular-nums">{seg.value}</span>
                                    <span className="text-[10.5px] text-green-600 font-semibold tabular-nums w-9 text-right">
                                      {Math.round(seg.value / totalQs * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Right: Topic frequency chart */}
                        {topicBars.length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-400 font-medium mb-3">Topic Frequency Across Papers</p>
                            <div className="space-y-2.5">
                              {topicBars.map((t, i) => (
                                <div key={i}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[11px] text-gray-700 truncate flex-1 pr-2">{t.name}</span>
                                    <span className="text-[10.5px] font-bold text-green-600 tabular-nums flex-shrink-0">
                                      {t.papers != null ? `${t.papers}/${totalPapers}` : `${t.pct}%`}
                                    </span>
                                  </div>
                                  <div className="h-1.5 bg-green-50 rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        'h-full rounded-full',
                                        t.freq === 'high' ? 'bg-green-500' :
                                          t.freq === 'medium' ? 'bg-green-400' : 'bg-green-300'
                                      )}
                                      style={{ width: `${Math.min(t.pct, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                              {/* Legend */}
                              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50">
                                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> High
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Medium
                                </span>
                                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                  <span className="w-2 h-2 rounded-full bg-green-300 inline-block" /> Low
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Paper summary row */}
                      {Object.keys(freq).length > 0 && (() => {
                        const SEC_COLORS_BAR: Record<string, string> = {
                          mcq: '#4ade80', short_answer: '#34d399', long_answer: '#a78bfa', code: '#818cf8'
                        };
                        const secKeys = ['mcq', 'short_answer', 'long_answer', 'code'].filter(k => freq[k]);
                        if (secKeys.length === 0) return null;
                        return (
                          <div className="mt-4 pt-4 border-t border-gray-50">
                            <p className="text-[11px] text-gray-400 font-medium mb-3">Question Type Consistency</p>
                            <div className="flex gap-2 flex-wrap">
                              {secKeys.map(k => {
                                const d = freq[k];
                                const label = { mcq: 'MCQ', short_answer: 'Short', long_answer: 'Long', code: 'Code' }[k] ?? k;
                                return (
                                  <div key={k} className="flex-1 min-w-[80px] bg-green-50/60 rounded-lg p-2.5 text-center border border-green-100">
                                    <div className="text-[18px] font-bold text-green-700">{d.pct}%</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                                    <div className="text-[10px] text-gray-400">{d.papers}/{d.total_papers} papers</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                    </div>
                  );
                })()}

                {/* Recurring patterns */}
                {analysis.recurring_patterns && analysis.recurring_patterns.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Recurring Question Patterns</p>
                    <div className="space-y-3">
                      {analysis.recurring_patterns.map((rp, i) => (
                        <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold flex items-center justify-center">{rp.frequency_count}×</span>
                          <div>
                            <p className="text-[12.5px] text-gray-700 leading-snug">{rp.pattern}</p>
                            {rp.topics && rp.topics.length > 0 && <p className="text-[11px] text-gray-400 mt-0.5">{rp.topics.join(' · ')}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Topic coverage — green bars show paper coverage % */}
                  {analysis.main_topics && analysis.main_topics.length > 0 && (() => {
                    const totalPapers = analysis.papers_analyzed?.length ?? 1;
                    return (
                      <div className="bg-white rounded-xl border border-gray-100 p-5">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Topic Coverage</p>
                        <div className="space-y-4">
                          {analysis.main_topics!.map((topic, i) => {
                            // Use paper_count for the bar if available, else fall back to importance
                            const barPct = topic.paper_count
                              ? Math.round((topic.paper_count / totalPapers) * 100)
                              : topic.importance;
                            const freqColor =
                              topic.frequency === 'high' ? 'text-green-600 bg-green-50' :
                                topic.frequency === 'medium' ? 'text-amber-600 bg-amber-50' :
                                  'text-gray-400 bg-gray-50';
                            return (
                              <div key={i}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[13px] font-medium text-gray-800 flex-1 leading-snug">{topic.name}</span>
                                  {topic.paper_count != null && (
                                    <span className="text-[10.5px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded flex-shrink-0">
                                      {topic.paper_count}/{totalPapers}
                                    </span>
                                  )}
                                  {topic.frequency && (
                                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize flex-shrink-0', freqColor)}>
                                      {topic.frequency}
                                    </span>
                                  )}
                                </div>
                                <Bar value={barPct} />
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-[10.5px] text-gray-400">{topic.exam_weight_estimate}</span>
                                  <span className="text-[10.5px] text-green-600 font-semibold">{barPct}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Likely questions */}
                  {analysis.likely_questions && analysis.likely_questions.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Likely Exam Questions</p>
                      <div className="space-y-3">
                        {analysis.likely_questions.slice(0, 6).map((q, i) => (
                          <div key={i} className="flex items-start gap-2.5 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                            <div className="flex-shrink-0 mt-0.5">
                              <span className="text-[11px] font-bold text-green-600">{q.likelihood}%</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] text-gray-700 leading-snug">{q.question}</p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {q.topic && <span className="text-[10.5px] text-gray-500">{q.topic}</span>}
                                {q.type && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">{q.type.replace('_', ' ')}</span>}
                                {q.marks ? <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{q.marks}m</span> : null}
                                {q.appears_in_papers ? <span className="text-[10px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{q.appears_in_papers} papers</span> : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analysis.key_concepts && analysis.key_concepts.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Key Concepts</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.key_concepts.map((concept) => (
                          <span key={concept} className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-md">{concept}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.revision_priority && analysis.revision_priority.length > 0 && (
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Revision Priority</p>
                      <ol className="space-y-2">
                        {analysis.revision_priority.map((p, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-gray-700">
                            <span className="w-5 h-5 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                            {p}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                {/* ── Question Type Frequency ───────────────────────────────────── */}
                {analysis.question_type_frequency && Object.keys(analysis.question_type_frequency).length > 0 && (() => {
                  const freq = analysis.question_type_frequency!;
                  // Render order: mcq → short_answer → long_answer → code → unknown
                  const ORDER = ['mcq', 'short_answer', 'long_answer', 'code', 'unknown'];
                  const entries = [
                    ...ORDER.filter((k) => freq[k]),
                    ...Object.keys(freq).filter((k) => !ORDER.includes(k)),
                  ];
                  const TYPE_META: Record<string, { label: string; badge: string; cls: string }> = {
                    mcq: { label: 'MCQ', badge: 'MCQ', cls: 'bg-blue-50 text-blue-700' },
                    short_answer: { label: 'Short Answer', badge: 'SA', cls: 'bg-emerald-50 text-emerald-700' },
                    long_answer: { label: 'Long Answer', badge: 'LA', cls: 'bg-orange-50 text-orange-700' },
                    code: { label: 'Code / Program', badge: '</>', cls: 'bg-indigo-50 text-indigo-700' },
                    theory: { label: 'Theory / Concept', badge: 'TH', cls: 'bg-purple-50 text-purple-700' },
                    numerical: { label: 'Numerical', badge: '#', cls: 'bg-cyan-50 text-cyan-700' },
                    diagram: { label: 'Diagram / Draw', badge: '□', cls: 'bg-pink-50 text-pink-700' },
                    unknown: { label: 'Other', badge: '?', cls: 'bg-gray-100 text-gray-500' },
                  };
                  return (
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
                        Question Type Frequency
                      </p>
                      <p className="text-[12px] text-gray-400 mb-5">
                        How consistently each question type appears across the selected papers
                      </p>
                      <div className="space-y-5">
                        {entries.map((key) => {
                          const d = freq[key];
                          const meta = TYPE_META[key] ?? { label: key, badge: key.slice(0, 2).toUpperCase(), cls: 'bg-gray-100 text-gray-500' };
                          return (
                            <FreqBar
                              key={key}
                              label={meta.label}
                              value={d.pct}
                              papers={d.papers}
                              totalPapers={d.total_papers}
                              count={d.question_count}
                              marks={d.total_marks > 0 ? d.total_marks : undefined}
                              badge={meta.badge}
                              badgeClass={meta.cls}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Section breakdown (topic distribution per section) ────────── */}
                {analysis.section_breakdown && Object.keys(analysis.section_breakdown).length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Section Topic Breakdown</p>
                    <p className="text-[12px] text-gray-400 mb-4">Topics covered in each section across all selected papers</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {Object.entries(analysis.section_breakdown).map(([sec, info]) => (
                        <div key={sec} className="rounded-xl border border-green-100 bg-green-50/30 p-3">
                          <div className="flex items-center gap-2 mb-3">
                            <span className={cn('text-[10.5px] font-semibold px-1.5 py-0.5 rounded', SEC_COLOR[sec] || 'bg-gray-100 text-gray-500')}>
                              {SEC_LABEL[sec] || sec}
                            </span>
                            <span className="text-[11px] text-gray-500 font-medium">{info.count} q</span>
                            {info.total_marks > 0 && (
                              <span className="text-[11px] text-gray-400 ml-auto">{info.total_marks}m total</span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {Object.entries(info.topics).slice(0, 6).map(([topic, cnt]) => {
                              const pct = Math.round((cnt / info.count) * 100);
                              return (
                                <div key={topic}>
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[11px] text-gray-700 truncate flex-1 leading-tight">{topic}</span>
                                    <span className="text-[10.5px] text-gray-400 ml-1.5 flex-shrink-0">{cnt}</span>
                                  </div>
                                  <div className="h-1 bg-green-50 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-green-400 rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Repeated questions (question clusters) ───────────────────── */}
                {analysis.question_clusters && analysis.question_clusters.length > 0 && (() => {
                  const totalPapers = analysis.papers_analyzed?.length ?? 1;
                  return (
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <Layers size={13} className="text-green-500" />
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Repeated Questions</p>
                        <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          {analysis.question_clusters.length} clusters
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-400 mb-4">
                        Questions appearing across multiple papers — highest priority to revise
                      </p>
                      <div className="space-y-2">
                        {analysis.question_clusters.map((cluster, idx) => {
                          const freqPct = Math.round((cluster.paper_count / totalPapers) * 100);
                          return (
                            <div key={idx} className="border border-green-100 rounded-xl overflow-hidden">
                              <button
                                onClick={() => toggleCluster(idx)}
                                className="w-full text-left px-4 py-3 hover:bg-green-50/40 transition-colors"
                              >
                                <div className="flex items-start gap-3">
                                  {/* Frequency circle */}
                                  <div className="flex-shrink-0 flex flex-col items-center mt-0.5">
                                    <span className="w-9 h-9 rounded-full bg-green-100 text-green-700 text-[12px] font-bold flex items-center justify-center">
                                      {freqPct}%
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    {/* Section type badges */}
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                      {cluster.section_types.map((sec) => (
                                        <span key={sec} className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', SEC_COLOR[sec] || 'bg-gray-100 text-gray-500')}>
                                          {SEC_LABEL[sec] || sec}
                                        </span>
                                      ))}
                                      {cluster.chapter && (
                                        <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{cluster.chapter}</span>
                                      )}
                                    </div>
                                    {/* Question */}
                                    <p className="text-[12.5px] font-medium text-gray-800 leading-snug">{cluster.representative_question}</p>
                                    {/* Meta + mini green bar */}
                                    <div className="mt-1.5 space-y-1">
                                      <p className="text-[11px] text-gray-400">
                                        <span className="text-green-600 font-semibold">{cluster.paper_count}/{totalPapers} papers</span>
                                        {' · '}{cluster.occurrence_count} occurrence{cluster.occurrence_count !== 1 ? 's' : ''}
                                        {' · '}{cluster.topic}
                                      </p>
                                      <div className="h-1 bg-green-50 rounded-full overflow-hidden w-full">
                                        <div className="h-full bg-green-400 rounded-full" style={{ width: `${freqPct}%` }} />
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronRight size={14} className={cn('flex-shrink-0 text-gray-300 mt-2 transition-transform', expandedClusters.has(idx) && 'rotate-90')} />
                                </div>
                              </button>
                              {expandedClusters.has(idx) && (
                                <div className="border-t border-green-50 bg-green-50/30 px-4 py-3 space-y-2.5">
                                  {cluster.questions.map((q, qi) => (
                                    <div key={qi} className="flex items-start gap-2.5">
                                      <span className={cn('flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5', SEC_COLOR[q.section] || 'bg-gray-100 text-gray-500')}>
                                        {SEC_LABEL[q.section] || q.section}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] text-gray-700 leading-snug">{q.question_text}</p>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                          <span className="font-medium text-gray-500">{paperLabel(q.material_id)}</span>
                                          {q.question_number != null ? ` · Q${q.question_number}` : ''}
                                          {q.marks != null ? <span className="text-green-600"> · {q.marks}m</span> : null}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}


              </div>
            )}
          </>
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
    if (!genData.material_id) { setError('Select a material'); return; }
    setError('');
    setGenerating(true);
    try {
      const res = await quizzesApi.generate(genData);
      loadQuizzes();
      setView('list');
      toast.success(`Quiz generated — ${res.data.questions_count} questions ready`);
    } catch (fetchError: unknown) {
      setError(extractDetail(fetchError, 'Generation failed'));
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
      setError(extractDetail(submitError, 'Submit failed'));
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
              <div className="h-full bg-gray-900 rounded-full" style={{ width: `${(answered / Math.max(total, 1)) * 100}%` }} />
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
                  type="number" min={5} max={20}
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
          <EmptyState icon={FolderOpen} title="No quizzes yet" sub="Generate a quiz from your processed materials to start practising" />
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

// ── Mock assessment helpers ────────────────────────────────────────────────────

const SG = 'Space Grotesk, system-ui, sans-serif';
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'];
const TYPE_TIMER: Record<string, number> = { mcq: 90, short_answer: 240, long_answer: 480 };

function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function parseSegments(text: string): Array<{ type: 'text' | 'code'; content: string; lang?: string }> {
  const out: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', content: text.slice(last, m.index) });
    out.push({ type: 'code', content: m[2].trimEnd(), lang: m[1] || undefined });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', content: text.slice(last) });
  return out.length ? out : [{ type: 'text', content: text }];
}

function MockRingTimer({ value, max }: { value: number; max: number }) {
  const r = 15, C = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, value / max) : 0;
  const critical = pct < 0.2;
  return (
    <svg width={38} height={38} viewBox="0 0 38 38" style={{ flexShrink: 0 }}>
      <circle cx={19} cy={19} r={r} fill="none" stroke="#e4e4e7" strokeWidth={2.5} />
      <circle cx={19} cy={19} r={r} fill="none"
        stroke={critical ? '#ef4444' : '#18181b'} strokeWidth={2.5} strokeLinecap="round"
        strokeDasharray={`${pct * C} ${C}`} strokeDashoffset={0}
        transform="rotate(-90 19 19)"
        style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.3s' }}
      />
    </svg>
  );
}

function MockQText({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: SG }}>
      {parseSegments(text).map((s, i) =>
        s.type === 'code' ? (
          <pre key={i} style={{
            fontFamily: '"JetBrains Mono","Fira Code","Consolas",monospace',
            fontSize: 12.5, background: '#f4f4f5', border: '1px solid #e4e4e7',
            borderRadius: 10, padding: '12px 16px', overflowX: 'auto', margin: '10px 0',
            lineHeight: 1.6, color: '#18181b', whiteSpace: 'pre',
          }}>
            {s.lang && <span style={{ display: 'block', fontSize: 9, color: '#a1a1aa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{s.lang}</span>}
            {s.content}
          </pre>
        ) : (
          <p key={i} style={{ fontSize: 15, lineHeight: 1.7, color: '#18181b', margin: 0, whiteSpace: 'pre-wrap' }}>{s.content}</p>
        )
      )}
    </div>
  );
}

// ── MockPanel ─────────────────────────────────────────────────────────────────

type MockQ = { id: number; question: string; type: string; options: string[] | null; topic: string; difficulty: string; marks: number };
type MockQuizData = { id: number; title: string; quiz_type: string; questions: MockQ[] };
type MockDetailedResult = {
  question: string; user_answer: string; correct_answer: string;
  is_correct: boolean; marks_awarded: number; max_marks: number;
  feedback: string; key_points_hit: string[]; key_points_missed: string[];
  explanation: string; topic: string; options: string[] | null; question_type: string;
};
type MockResultData = {
  score: number; correct: number; total: number;
  total_marks: number; marks_awarded: number;
  weak_topics: string[]; detailed_results: MockDetailedResult[];
};

function MockPanel({ materials }: { materials: StudyMaterial[] }) {
  const [view, setView]             = useState<'list' | 'create' | 'attempt' | 'results'>('list');
  const [mocks, setMocks]           = useState<Array<{ id: number; title: string; quiz_type: string; questions_count: number; best_score: number }>>([]);
  // create
  const [selectedMats, setSelectedMats] = useState<number[]>([]);
  const [cfg, setCfg]               = useState({ title: 'Mock Test', count: 10 });
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');
  // attempt
  const [quiz, setQuiz]             = useState<MockQuizData | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [idx, setIdx]               = useState(0);
  const [answers, setAnswers]       = useState<Record<string, string>>({});
  const [flagged, setFlagged]       = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft]     = useState(90);
  const [perQ, setPerQ]             = useState(90);
  const [timeLocked, setTimeLocked] = useState(false);
  const timerRef                    = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt                   = useRef(Date.now());
  // submit / results
  const [submitting, setSubmitting] = useState(false);
  const [resultData, setResultData] = useState<MockResultData | null>(null);
  // review expand
  const [openReview, setOpenReview] = useState<number | null>(null);

  const ready = materials.filter((m) => m.processing_status === 'completed');

  const loadMocks = () => {
    quizzesApi.list()
      .then((res) => setMocks((res.data as Array<{ id: number; title: string; quiz_type: string; questions_count: number; best_score: number }>).filter((q) => q.quiz_type === 'mock_test')))
      .catch(() => {});
  };

  useEffect(() => {
    loadMocks();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // per-question timer
  useEffect(() => {
    if (view !== 'attempt' || !quiz) return;
    const q = quiz.questions[idx];
    if (!q) return;
    const hasOpts = Array.isArray(q.options) && q.options.length > 0;
    const effType = hasOpts ? 'mcq' : (q.type ?? 'short_answer');
    const budget = TYPE_TIMER[effType] ?? 120;
    setPerQ(budget); setTimeLeft(budget); setTimeLocked(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => { if (t <= 1) { clearInterval(timerRef.current!); setTimeLocked(true); return 0; } return t - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, quiz?.id, view]);

  // create mock test
  const create = async () => {
    if (selectedMats.length === 0) { setCreateError('Select at least one material'); return; }
    setCreateError(''); setCreating(true);
    try {
      const res = await quizzesApi.generateMock({ material_ids: selectedMats, title: cfg.title, count: cfg.count });
      loadMocks(); setView('list');
      toast.success(`Mock test generated — ${res.data.questions_count} questions ready`);
    } catch (err) {
      setCreateError(extractDetail(err, 'Generation failed'));
    } finally { setCreating(false); }
  };

  // start an existing mock test
  const startMock = async (id: number) => {
    setLoadingQuiz(true);
    try {
      const res = await quizzesApi.get(id);
      setQuiz(res.data as MockQuizData);
      setIdx(0); setAnswers({}); setFlagged(new Set());
      setResultData(null); setOpenReview(null);
      startedAt.current = Date.now();
      setView('attempt');
    } catch { toast.error('Failed to load mock test'); }
    finally { setLoadingQuiz(false); }
  };

  // submit
  const submitAll = useCallback(async () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    const timeTaken = Math.floor((Date.now() - startedAt.current) / 1000);
    try {
      const res = await quizzesApi.submit(quiz.id, answers, timeTaken);
      setResultData(res.data as MockResultData);
      setView('results'); loadMocks();
    } catch { alert('Submission failed — please try again.'); setSubmitting(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, submitting, answers]);

  const advance = useCallback(() => {
    if (!quiz) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (idx < quiz.questions.length - 1) setIdx((i) => i + 1);
    else void submitAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, idx, submitAll]);

  const goBack = () => {
    if (idx === 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setIdx((i) => i - 1);
  };

  // ── Results view ────────────────────────────────────────────────────────────
  if (view === 'results' && resultData) {
    const pct   = Math.round(resultData.score);
    const grade = pct >= 80 ? 'Distinction' : pct >= 60 ? 'Credit' : pct >= 40 ? 'Pass' : 'Below Pass';
    return (
      <div className="overflow-y-auto h-full w-full" style={{ background: '#FAFAFA', fontFamily: SG }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px 80px' }}>

          {/* Score block */}
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 20, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '36px 28px 28px', textAlign: 'center', borderBottom: '1px solid #f4f4f5' }}>
              <div style={{ fontSize: 11, color: '#71717a', fontWeight: 600, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Mock Test Complete</div>
              <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1, color: '#18181b', letterSpacing: '-2px' }}>{pct}%</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#52525b', marginTop: 6 }}>{grade}</div>
              {resultData.total_marks > 0 && (
                <div style={{ fontSize: 12, color: '#a1a1aa', marginTop: 5 }}>
                  {resultData.marks_awarded} / {resultData.total_marks} marks
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {[
                { label: 'Correct',   value: resultData.correct },
                { label: 'Wrong',     value: resultData.total - resultData.correct },
                { label: 'Questions', value: resultData.total },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: '18px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid #f4f4f5' : undefined }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#18181b' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weak topics */}
          {resultData.weak_topics?.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, padding: '18px 22px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Topics to Review</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {resultData.weak_topics.map((t) => (
                  <span key={t} style={{ fontSize: 12, padding: '4px 11px', borderRadius: 999, border: '1px solid #e4e4e7', color: '#52525b', background: '#fafafa' }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Question review */}
          {resultData.detailed_results?.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 14, overflow: 'hidden', marginBottom: 18 }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid #f4f4f5', fontSize: 12, fontWeight: 600, color: '#52525b' }}>
                Review — {resultData.total} Questions
              </div>
              {resultData.detailed_results.map((d, i) => {
                const isOpen = openReview === i;
                const isMCQ  = d.question_type === 'mcq' || Boolean(d.options?.length);
                return (
                  <div key={i} style={{ borderBottom: i < resultData.detailed_results.length - 1 ? '1px solid #f4f4f5' : undefined }}>
                    <button
                      onClick={() => setOpenReview(isOpen ? null : i)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 22px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: SG }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: d.is_correct ? '#18181b' : '#d4d4d8' }} />
                      <span style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, flexShrink: 0, width: 18 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.question.replace(/```[\s\S]*?```/g, '[code]')}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, flexShrink: 0, color: d.is_correct ? '#18181b' : '#a1a1aa' }}>
                        {d.marks_awarded ?? (d.is_correct ? d.max_marks : 0)}/{d.max_marks}
                      </span>
                      <span style={{ fontSize: 10, color: '#a1a1aa', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 22px 18px', borderTop: '1px solid #f9f9f9' }}>
                        <div style={{ marginBottom: 14, paddingTop: 14 }}><MockQText text={d.question} /></div>

                        {/* MCQ options */}
                        {isMCQ && d.options && d.options.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                            {d.options.map((opt, oi) => {
                              const letter     = OPTION_LETTERS[oi] ?? String(oi + 1);
                              const display    = opt.replace(/^[A-E]\.\s*/, '');
                              const isUserAns  = d.user_answer === opt || d.user_answer?.trim().toUpperCase()[0] === letter;
                              const isCorrect  = d.correct_answer?.trim().toUpperCase()[0] === letter;
                              return (
                                <div key={oi} style={{
                                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 13px', borderRadius: 10, fontSize: 13,
                                  border: `1px solid ${isCorrect ? '#18181b' : isUserAns && !isCorrect ? '#d4d4d8' : '#f4f4f5'}`,
                                  background: isCorrect ? '#18181b' : 'transparent', color: isCorrect ? '#fff' : '#3f3f46',
                                }}>
                                  <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: isCorrect ? 'rgba(255,255,255,0.15)' : '#f4f4f5', color: isCorrect ? '#fff' : '#71717a' }}>{letter}</span>
                                  <span style={{ flex: 1 }}>{display}</span>
                                  {isCorrect && <span style={{ fontSize: 11, opacity: 0.7 }}>✓ Correct</span>}
                                  {isUserAns && !isCorrect && <span style={{ fontSize: 11, color: '#a1a1aa' }}>Your answer</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Written answer */}
                        {!isMCQ && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                            {d.user_answer && (
                              <div style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fafafa' }}>
                                <div style={{ fontSize: 9.5, color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Your Answer</div>
                                <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.6 }}>{d.user_answer}</p>
                              </div>
                            )}
                            <div style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid #18181b' }}>
                              <div style={{ fontSize: 9.5, color: '#18181b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Model Answer</div>
                              <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.6 }}>{d.correct_answer}</p>
                            </div>
                          </div>
                        )}

                        {/* Marks + feedback (written) */}
                        {!isMCQ && d.marks_awarded !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, background: '#f4f4f5', marginBottom: 8, fontSize: 12, color: '#52525b' }}>
                            <span style={{ fontWeight: 700, color: '#18181b' }}>{d.marks_awarded}/{d.max_marks} marks</span>
                            <span>·</span><span>{Math.round((d.marks_awarded / (d.max_marks || 1)) * 100)}%</span>
                            {d.feedback && <><span>·</span><span style={{ flex: 1 }}>{d.feedback}</span></>}
                          </div>
                        )}

                        {/* Key points */}
                        {(d.key_points_hit?.length > 0 || d.key_points_missed?.length > 0) && (
                          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                            {d.key_points_hit?.length > 0 && (
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Covered</div>
                                {d.key_points_hit.map((p, pi) => <div key={pi} style={{ fontSize: 12, color: '#3f3f46', marginBottom: 2 }}>· {p}</div>)}
                              </div>
                            )}
                            {d.key_points_missed?.length > 0 && (
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Missed</div>
                                {d.key_points_missed.map((p, pi) => <div key={pi} style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 2 }}>· {p}</div>)}
                              </div>
                            )}
                          </div>
                        )}

                        {d.explanation && <p style={{ fontSize: 12, color: '#a1a1aa', margin: 0, lineHeight: 1.6 }}>{d.explanation}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setView('list'); setResultData(null); }}
              style={{ flex: 1, height: 44, borderRadius: 12, border: 'none', background: '#18181b', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: SG }}
            >
              Back to Mock Tests
            </button>
            {quiz && (
              <button
                onClick={() => void startMock(quiz.id)}
                style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid #e4e4e7', background: '#fff', color: '#3f3f46', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: SG }}
              >
                Retake
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Attempt view ────────────────────────────────────────────────────────────
  if (view === 'attempt' && quiz) {
    const q           = quiz.questions[idx];
    const isLast      = idx === quiz.questions.length - 1;
    const hasAnswer   = Boolean(answers[String(idx)]?.trim());
    const progressPct = ((idx + 1) / quiz.questions.length) * 100;
    const critical    = timeLeft <= 10;
    const almostDone  = timeLeft <= perQ * 0.35 && !critical;
    const hasOpts     = Array.isArray(q.options) && q.options.length > 0;
    const effType     = hasOpts ? 'mcq' : (q.type === 'long_answer' ? 'long_answer' : 'short_answer');

    if (!q) return null;

    return (
      <div className="overflow-y-auto h-full w-full" style={{ background: '#FAFAFA', fontFamily: SG }}>
        {/* Sticky top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20, background: '#18181b',
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 46,
        }}>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 12.5, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quiz.title}
          </span>
          <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }}>
            <div style={{ height: '100%', background: '#fff', borderRadius: 2, width: `${progressPct}%`, transition: 'width 0.4s' }} />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{idx + 1}/{quiz.questions.length}</span>
          <button
            onClick={() => setFlagged((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}
            style={{ fontSize: 11, padding: '3px 9px', borderRadius: 7, border: `1px solid ${flagged.has(idx) ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.15)'}`, background: flagged.has(idx) ? 'rgba(251,191,36,0.1)' : 'transparent', color: flagged.has(idx) ? '#fbbf24' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: SG }}
          >
            ⚑ {flagged.has(idx) ? 'Flagged' : 'Flag'}
          </button>
          <button
            onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setView('list'); }}
            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >✕</button>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px 60px' }}>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {(['mcq', 'short_answer', 'long_answer'] as const).map((t) => (
                <span key={t} style={{
                  fontSize: 10.5, padding: '2px 9px', borderRadius: 999, fontWeight: 600,
                  border: '1px solid', borderColor: effType === t ? '#18181b' : '#e4e4e7',
                  background: effType === t ? '#18181b' : 'transparent',
                  color: effType === t ? '#fff' : '#a1a1aa',
                }}>
                  {t === 'mcq' ? 'MCQ' : t === 'short_answer' ? 'Short Answer' : 'Long Answer'}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {q.topic && <span style={{ fontSize: 10.5, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.topic}</span>}
              <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 6, border: '1px solid #e4e4e7', color: '#a1a1aa' }}>
                {q.marks ?? 2} {(q.marks ?? 2) === 1 ? 'mark' : 'marks'}
              </span>
            </div>
          </div>

          {/* Timer + advance */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11.5, color: '#a1a1aa' }}>Q{idx + 1} <span style={{ color: '#d4d4d8' }}>of {quiz.questions.length}</span></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <MockRingTimer value={timeLeft} max={perQ} />
                <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', color: critical ? '#ef4444' : almostDone ? '#78716c' : '#18181b' }}>
                  {fmtTime(timeLeft)}
                </span>
              </div>
              <button
                onClick={advance}
                disabled={submitting || (!hasAnswer && !timeLocked)}
                style={{
                  height: 36, padding: '0 18px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, border: 'none',
                  cursor: submitting || (!hasAnswer && !timeLocked) ? 'not-allowed' : 'pointer',
                  background: submitting ? '#d4d4d8' : hasAnswer ? '#18181b' : timeLocked ? '#52525b' : '#e4e4e7',
                  color: submitting ? '#a1a1aa' : hasAnswer || timeLocked ? '#fff' : '#a1a1aa',
                  fontFamily: SG, transition: 'background 0.15s',
                }}
              >
                {submitting ? 'Grading…' : isLast ? 'Submit ✓' : timeLocked ? 'Skip →' : 'Next →'}
              </button>
            </div>
          </div>

          {/* Question card */}
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, padding: '22px 24px', marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
            <MockQText text={q.question} />
          </div>

          {/* Time locked banner */}
          {timeLocked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderRadius: 10, marginBottom: 12, border: '1px solid #e4e4e7', background: '#fafafa' }}>
              <span style={{ fontSize: 16 }}>⏱</span>
              <div>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#3f3f46' }}>Time's up for this question</p>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: '#a1a1aa' }}>
                  {hasAnswer ? 'Answer recorded. Click Next to continue.' : 'No answer. Click Skip to continue.'}
                </p>
              </div>
            </div>
          )}

          {/* MCQ options */}
          {effType === 'mcq' && q.options && q.options.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {q.options.map((opt, oi) => {
                const selected    = answers[String(idx)] === opt;
                const letter      = OPTION_LETTERS[oi] ?? String(oi + 1);
                const displayText = opt.replace(/^[A-E]\.\s*/, '');
                return (
                  <button
                    key={oi}
                    onClick={() => { if (!timeLocked) setAnswers((prev) => ({ ...prev, [String(idx)]: opt })); }}
                    disabled={timeLocked}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 13, textAlign: 'left',
                      border: `1px solid ${selected ? '#18181b' : '#e4e4e7'}`,
                      background: selected ? '#18181b' : '#fff',
                      cursor: timeLocked ? 'not-allowed' : 'pointer',
                      opacity: timeLocked ? 0.5 : 1, transition: 'all 0.12s', fontFamily: SG,
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: selected ? 'rgba(255,255,255,0.12)' : '#f4f4f5', color: selected ? '#fff' : '#71717a' }}>
                      {letter}
                    </div>
                    <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5, color: selected ? '#fff' : '#3f3f46' }}>{displayText}</span>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, border: `1px solid ${selected ? 'rgba(255,255,255,0.2)' : '#e4e4e7'}`, color: selected ? 'rgba(255,255,255,0.5)' : '#d4d4d8', fontFamily: 'monospace' }}>{oi + 1}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Written answer */}
          {(effType === 'short_answer' || effType === 'long_answer') && (
            <div style={{ background: '#fff', borderRadius: 13, overflow: 'hidden', border: `1px solid ${timeLocked ? '#e4e4e7' : '#d4d4d8'}`, boxShadow: '0 1px 6px rgba(0,0,0,0.04)', marginBottom: 12, opacity: timeLocked ? 0.6 : 1 }}>
              <textarea
                disabled={timeLocked}
                value={answers[String(idx)] ?? ''}
                onChange={(e) => { if (!timeLocked) setAnswers((prev) => ({ ...prev, [String(idx)]: e.target.value })); }}
                placeholder={effType === 'long_answer' ? 'Write a detailed, structured answer here…' : 'Type your answer here…'}
                style={{ width: '100%', padding: '18px 22px', fontSize: 13.5, color: '#3f3f46', lineHeight: 1.75, resize: 'vertical', outline: 'none', border: 'none', background: 'transparent', minHeight: effType === 'long_answer' ? 200 : 120, fontFamily: SG, boxSizing: 'border-box' }}
              />
              <div style={{ padding: '7px 22px 12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f4f4f5' }}>
                <span style={{ fontSize: 10.5, color: '#d4d4d8' }}>{effType === 'long_answer' ? 'Aim for a detailed, structured response' : 'Be concise and precise'}</span>
                <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>{(answers[String(idx)] ?? '').split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
            <button onClick={goBack} disabled={idx === 0} style={{ fontSize: 12.5, color: '#a1a1aa', background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontFamily: SG }}>
              ← Previous
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {quiz.questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setIdx(i); }}
                  style={{ borderRadius: 999, width: i === idx ? 18 : 8, height: 8, background: i === idx ? '#18181b' : answers[String(i)] ? '#71717a' : flagged.has(i) ? '#d4d4d8' : '#e4e4e7', border: 'none', cursor: 'pointer', transition: 'width 0.25s, background 0.2s', padding: 0 }}
                />
              ))}
            </div>
            <span style={{ fontSize: 10.5, color: '#d4d4d8' }}>{effType === 'mcq' ? `Press 1–${q.options?.length ?? 4}` : 'Enter submits'}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Create view ─────────────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="overflow-y-auto h-full w-full">
        <div className="p-5">
          <p className="font-semibold text-gray-900 text-[14px] mb-5">Generate Mock Test</p>
          {createError && <p className="text-[12.5px] text-red-500 mb-3">{createError}</p>}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Title</label>
              <input
                type="text" value={cfg.title}
                onChange={(e) => setCfg({ ...cfg, title: e.target.value })}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 transition"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-2 uppercase tracking-wide">Materials</label>
              {ready.length === 0 ? <NoMaterialsBanner /> : (
                <div className="space-y-2">
                  {ready.map((m) => (
                    <label key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={selectedMats.includes(m.id)}
                        onChange={(e) => setSelectedMats(e.target.checked ? [...selectedMats, m.id] : selectedMats.filter((id) => id !== m.id))}
                        className="accent-gray-800 w-4 h-4"
                      />
                      <span className="text-[13px] text-gray-700 truncate">{m.original_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
                Questions — <strong className="text-gray-900">{cfg.count}</strong>
              </label>
              <input type="range" min={5} max={20} step={1} value={cfg.count}
                onChange={(e) => setCfg({ ...cfg, count: Number(e.target.value) })}
                className="w-full accent-gray-800"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">Mixed format — MCQ, short answer, and long answer questions</p>
            </div>
            <div className="flex gap-2 pt-1">
              <Btn onClick={() => void create()} disabled={creating || ready.length === 0} className="flex-1 justify-center">
                {creating ? <><Loader2 size={13} className="animate-spin" />Generating...</> : <><Timer size={13} />Generate</>}
              </Btn>
              <Btn variant="outline" onClick={() => setView('list')}>Cancel</Btn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900 text-[14px]">Mock Tests</p>
          <Btn onClick={() => setView('create')} disabled={ready.length === 0 || loadingQuiz}>
            <Timer size={12} />New Mock Test
          </Btn>
        </div>
        {ready.length === 0 && <NoMaterialsBanner />}
        {mocks.length === 0 ? (
          <EmptyState icon={Timer} title="No mock tests yet" sub="Generate a timed mixed-format assessment from your materials" />
        ) : (
          <div className="space-y-2">
            {mocks.map((mock) => (
              <div key={mock.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13.5px] text-gray-900 truncate">{mock.title}</p>
                  <p className="text-[11.5px] text-gray-400 mt-0.5">
                    {mock.questions_count} questions · mixed format
                    {mock.best_score > 0 && <> · <ScoreTag score={mock.best_score} /></>}
                  </p>
                </div>
                <Btn variant="outline" onClick={() => void startMock(mock.id)} disabled={loadingQuiz}>
                  {loadingQuiz ? <Loader2 size={12} className="animate-spin" /> : <>Start <ChevronRight size={12} /></>}
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
  const [selectedMatIds, setSelectedMatIds] = useState<number[]>([]);
  const [showMatPicker, setShowMatPicker] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string; sources?: Array<{ preview?: string }> }>>([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{
    stop?: () => void;
  } | null>(null);

  const toggleMat = (id: number) =>
    setSelectedMatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

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
      const response = await qaApi.ask(
        currentQuestion,
        undefined,
        selectedMatIds.length > 0 ? selectedMatIds : undefined
      );
      const answer = response.data.answer;
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, sources: response.data.sources }]);
      speak(answer);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${extractDetail(err, 'Could not get answer')}` }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'What are the main topics?',
    'Explain key concepts',
    'What should I focus on for the exam?',
  ];

  const matLabel =
    selectedMatIds.length === 0
      ? 'All materials'
      : selectedMatIds.length === 1
        ? ready.find((m) => m.id === selectedMatIds[0])?.original_name ?? '1 material'
        : `${selectedMatIds.length} materials`;

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="relative flex-1 min-w-0">
          <button
            onClick={() => setShowMatPicker((p) => !p)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white text-[12.5px] text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors max-w-xs truncate"
          >
            <FolderOpen size={12} className="flex-shrink-0 text-gray-400" />
            <span className="truncate">{matLabel}</span>
            <ChevronRight size={11} className={cn('flex-shrink-0 text-gray-400 transition-transform', showMatPicker && 'rotate-90')} />
          </button>

          {showMatPicker && ready.length > 0 && (
            <div className="absolute top-10 left-0 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-64 p-2">
              <label className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMatIds.length === 0}
                  onChange={() => setSelectedMatIds([])}
                  className="accent-gray-900 w-3.5 h-3.5"
                />
                <span className="text-[12.5px] text-gray-700 font-medium">All materials</span>
              </label>
              <div className="border-t border-gray-100 my-1" />
              {ready.map((m) => (
                <label key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMatIds.includes(m.id)}
                    onChange={() => toggleMat(m.id)}
                    className="accent-gray-900 w-3.5 h-3.5"
                  />
                  <span className="text-[12.5px] text-gray-700 flex-1 truncate">{m.original_name}</span>
                  {m.material_type === 'past_paper' && (
                    <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-violet-100 text-violet-700 flex-shrink-0">PP</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setTtsEnabled((prev) => !prev)}
          className={cn(
            'h-7 w-7 flex items-center justify-center rounded-lg transition-colors flex-shrink-0',
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
                  ? 'border-zinc-900 text-gray-900 font-semibold'
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
