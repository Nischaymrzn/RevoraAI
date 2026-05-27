import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PieChart, Pie, Cell,
  Tooltip as RechartsTip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Label,
} from 'recharts';
import {
  ClipboardList, Timer, AlertCircle, BarChart2, GraduationCap,
  Loader2, CheckCircle, XCircle,
  ChevronRight, ChevronLeft, ArrowLeft, RefreshCw, FolderOpen, BookOpen, History, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi, qaApi, quizzesApi, mockTestsApi, coursesApi } from '../services/api';
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
        'inline-flex items-center gap-1.5 h-9 px-4 text-[14px] font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
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

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 bg-green-50 rounded-full overflow-hidden">
      <div
        className="h-full bg-green-400 rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}


/* ── Chart constants ─────────────────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  mcq:          '#6DEB74',   // system primary green
  short_answer: '#10B981',   // emerald
  long_answer:  '#F59E0B',   // amber (warm contrast)
  code:         '#14B8A6',   // teal
  theory:       '#22C55E',   // green-500
  numerical:    '#84CC16',   // lime
  diagram:      '#34D399',   // emerald-400
  unknown:      '#94A3B8',   // slate neutral
};
const TYPE_LABELS: Record<string, string> = {
  mcq:          'MCQ',
  short_answer: 'Short Answer',
  long_answer:  'Long Answer',
  code:         'Code',
  theory:       'Theory',
  numerical:    'Numerical',
  diagram:      'Diagram',
  unknown:      'Other',
};
const PALETTE = ['#6DEB74','#10B981','#F59E0B','#14B8A6','#22C55E','#84CC16','#34D399','#94A3B8'];

/* ── Shared tooltip style ───────────────────────────────────────────────────── */
const TIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' };

/* ── AnalysisResult — recharts-based dashboard ──────────────────────────────── */
function AnalysisResult({
  analysis,
  expandedClusters,
  toggleCluster,
  paperLabel,
}: {
  analysis: AnalysisData;
  expandedClusters: Set<number>;
  toggleCluster: (idx: number) => void;
  paperLabel: (id: number) => string;
}) {
  const freq       = analysis.question_type_frequency ?? {};
  const breakdown  = analysis.section_breakdown       ?? {};
  const topics     = analysis.main_topics             ?? [];
  const totalPapers = analysis.papers_analyzed?.length ?? 1;

  /* ── Data transforms ─────────────────────────────────────────────────── */

  // 1. Donut — question type breakdown
  const donutData = (() => {
    const fromBD = Object.entries(breakdown)
      .filter(([, d]) => d.count > 0)
      .map(([k, d]) => ({ name: TYPE_LABELS[k] ?? k, value: d.count, fill: TYPE_COLORS[k] ?? '#94A3B8' }));
    if (fromBD.length) return fromBD;
    return Object.entries(freq)
      .filter(([, d]) => d.question_count > 0)
      .map(([k, d]) => ({ name: TYPE_LABELS[k] ?? k, value: d.question_count, fill: TYPE_COLORS[k] ?? '#94A3B8' }));
  })();
  const totalQs = donutData.reduce((s, d) => s + d.value, 0);

  // 2. Horizontal bar — topic frequency across papers
  const topicBarData = topics
    .filter(t => t.name)
    .slice(0, 8)
    .map(t => ({
      name: t.name.length > 16 ? t.name.slice(0, 14) + '…' : t.name,
      value: t.paper_count ? Math.round((t.paper_count / totalPapers) * 100) : t.importance,
    }));

  // 3. Radar — topic importance (top 6)
  const radarData = topics.slice(0, 6).map(t => ({
    topic: t.name.length > 13 ? t.name.slice(0, 11) + '…' : t.name,
    value: t.importance,
  }));

  // 4. Vertical bar — question type consistency (% papers)
  const ORDER = ['mcq','short_answer','long_answer','code','theory','numerical','diagram','unknown'];
  const consistencyData = [
    ...ORDER.filter(k => freq[k]),
    ...Object.keys(freq).filter(k => !ORDER.includes(k)),
  ].map((k, i) => ({
    name:   TYPE_LABELS[k] ?? k,
    value:  freq[k].pct,
    papers: freq[k].papers,
    total:  freq[k].total_papers,
    fill:   TYPE_COLORS[k] ?? PALETTE[i % PALETTE.length],
  }));

  const topType = [...consistencyData].sort((a, b) => b.value - a.value)[0];

  // Custom donut center label
  const DonutCenter = ({ viewBox }: any) => {
    const { cx, cy } = viewBox ?? { cx: 0, cy: 0 };
    return (
      <g>
        <text x={cx} y={cy - 7} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={700} fill="#111827">{totalQs}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#9CA3AF">total</text>
      </g>
    );
  };

  return (
    <div className="space-y-4 fade-in">

      {/* Papers chips */}
      {analysis.papers_analyzed && analysis.papers_analyzed.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {analysis.papers_analyzed.map((p) => (
            <span key={p.id} className="text-[12px] font-medium text-gray-700 bg-white border border-gray-200 px-3 py-1 rounded-lg">
              {p.year ?? p.name.slice(0, 18)}
            </span>
          ))}
          <span className="text-[12px] text-gray-400">{analysis.papers_analyzed.length} papers analysed</span>
        </div>
      )}

      {/* Summary */}
      {analysis.analysis_summary && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">AI Summary</p>
          <p className="text-[14px] text-gray-700 leading-relaxed">{analysis.analysis_summary}</p>
        </div>
      )}

      {/* Stat chips */}
      {totalQs > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Questions', value: totalQs },
            { label: 'Papers Analysed', value: totalPapers },
            { label: 'Top Type', value: topType?.name ?? '—' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
              <p className="text-[22px] font-bold text-gray-900 truncate">{s.value}</p>
              <p className="text-[12px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Row 1: Donut + Topic Frequency Horizontal Bar */}
      {(donutData.length > 0 || topicBarData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Donut */}
          {donutData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Question Distribution</p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" cx="50%" cy="50%"
                    innerRadius={62} outerRadius={90} paddingAngle={3}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    <Label content={<DonutCenter />} position="center" />
                  </Pie>
                  <RechartsTip
                    formatter={(v: number, name: string) => [`${v} questions`, name]}
                    contentStyle={TIP_STYLE}
                  />
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: 12, color: '#6B7280' }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Topic Frequency — horizontal bars */}
          {topicBarData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Topic Frequency</p>
              <p className="text-[12px] text-gray-400 mb-2">Coverage across analysed papers</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topicBarData} layout="vertical" margin={{ top: 0, right: 28, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} width={88} />
                  <RechartsTip formatter={(v: number) => [`${v}%`, 'Coverage']} contentStyle={TIP_STYLE} />
                  <Bar dataKey="value" fill="#6DEB74" radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Row 2: Radar + Type Consistency */}
      {(radarData.length > 2 || consistencyData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Radar — topic importance */}
          {radarData.length > 2 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Topic Importance</p>
              <p className="text-[12px] text-gray-400 mb-1">Relative exam importance per topic</p>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData} margin={{ top: 10, right: 28, left: 28, bottom: 10 }}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="topic" tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke="#22C55E" fill="#22C55E" fillOpacity={0.15} strokeWidth={2}
                    dot={{ fill: '#22C55E', r: 3 } as any} />
                  <RechartsTip formatter={(v: number) => [v, 'Importance']} contentStyle={TIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Vertical bar — type consistency */}
          {consistencyData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Type Consistency</p>
              <p className="text-[12px] text-gray-400 mb-1">% of papers each question type appears in</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={consistencyData} margin={{ top: 8, right: 8, left: -12, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false}
                    angle={-30} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} unit="%" />
                  <RechartsTip
                    formatter={(v: number, _: any, props: any) =>
                      [`${v}% (${props.payload.papers}/${props.payload.total} papers)`, 'Consistency']}
                    contentStyle={TIP_STYLE}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                    {consistencyData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Likely Questions + Key Concepts / Revision Priority */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {analysis.likely_questions && analysis.likely_questions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Likely Exam Questions</p>
            <div className="space-y-3">
              {analysis.likely_questions.slice(0, 6).map((q, i) => (
                <div key={i} className="flex items-start gap-2.5 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <span className="text-[11px] font-bold text-green-600 flex-shrink-0 w-8 pt-0.5">{q.likelihood}%</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-gray-700 leading-snug">{q.question}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {q.topic && <span className="text-[10.5px] text-gray-400">{q.topic}</span>}
                      {q.type && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">{q.type.replace('_',' ')}</span>}
                      {q.marks != null && <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{q.marks}m</span>}
                      {q.appears_in_papers != null && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{q.appears_in_papers} papers</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {analysis.key_concepts && analysis.key_concepts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Key Concepts</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.key_concepts.map((c) => (
                  <span key={c} className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">{c}</span>
                ))}
              </div>
            </div>
          )}
          {analysis.revision_priority && analysis.revision_priority.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Revision Priority</p>
              <ol className="space-y-2">
                {analysis.revision_priority.map((p, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-gray-700">
                    <span className="w-5 h-5 bg-green-50 text-green-700 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i+1}</span>
                    {p}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Recurring Patterns */}
      {analysis.recurring_patterns && analysis.recurring_patterns.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Recurring Patterns</p>
          <div className="space-y-3">
            {analysis.recurring_patterns.map((rp, i) => (
              <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-green-50 text-green-700 text-[11px] font-bold flex items-center justify-center">{rp.frequency_count}×</span>
                <div>
                  <p className="text-[13px] text-gray-700 leading-snug">{rp.pattern}</p>
                  {rp.topics && rp.topics.length > 0 && <p className="text-[11px] text-gray-400 mt-0.5">{rp.topics.join(' · ')}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Repeated Questions (clusters) */}
      {analysis.question_clusters && analysis.question_clusters.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={13} className="text-green-500" />
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Repeated Questions</p>
            <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">
              {analysis.question_clusters.length} clusters
            </span>
          </div>
          <p className="text-[12px] text-gray-400 mb-4">Questions appearing in multiple papers — highest revision priority</p>
          <div className="space-y-2">
            {analysis.question_clusters.map((cluster, idx) => {
              const freqPct = Math.round((cluster.paper_count / totalPapers) * 100);
              return (
                <div key={idx} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => toggleCluster(idx)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50/60 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-9 h-9 rounded-full bg-green-50 text-green-700 text-[12px] font-bold flex items-center justify-center mt-0.5">
                        {freqPct}%
                      </span>
                      <div className="flex-1 min-w-0">
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
                        <p className="text-[13px] font-medium text-gray-800 leading-snug">{cluster.representative_question}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          <span className="text-green-600 font-semibold">{cluster.paper_count}/{totalPapers} papers</span>
                          {' · '}{cluster.occurrence_count} occurrence{cluster.occurrence_count !== 1 ? 's' : ''}
                          {' · '}{cluster.topic}
                        </p>
                      </div>
                      <ChevronRight size={14} className={cn('flex-shrink-0 text-gray-300 mt-2 transition-transform', expandedClusters.has(idx) && 'rotate-90')} />
                    </div>
                  </button>
                  {expandedClusters.has(idx) && (
                    <div className="border-t border-gray-50 bg-gray-50/30 px-4 py-3 space-y-2.5">
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
      )}
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
  mcq: 'bg-green-50 text-green-700',
  short_answer: 'bg-emerald-50 text-emerald-700',
  long_answer: 'bg-amber-50 text-amber-700',
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
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PP</span>
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
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
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
                            {m.material_type === 'past_paper' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PP</span>}
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
                        {m.material_type === 'past_paper' && <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">PP</span>}
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
              <AnalysisResult
                analysis={analysis}
                expandedClusters={expandedClusters}
                toggleCluster={toggleCluster}
                paperLabel={paperLabel}
              />
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
    quizzesApi.list().then((res) =>
      setQuizzes((res.data as Array<{ id: number; title: string; quiz_type: string; questions_count: number; best_score: number }>)
        .filter((q) => q.quiz_type !== 'mock_test'))
    ).catch(() => {});
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
                  <p className="font-semibold text-[15px] text-gray-900 truncate">{quiz.title}</p>
                  <p className="text-[13px] text-gray-400 mt-0.5">
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

// ── MockPanel ─────────────────────────────────────────────────────────────────

function MockPanel({ materials }: { materials: StudyMaterial[] }) {
  const navigate = useNavigate();
  const [view, setView]         = useState<'list' | 'create'>('list');
  const [mocks, setMocks]       = useState<Array<{ id: number; title: string; questions_count: number; time_limit: number; attempt_count: number; best_score: number }>>([]);
  const [selectedMats, setSelectedMats] = useState<number[]>([]);
  const [cfg, setCfg]           = useState({ title: 'Mock Test', count: 10 });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const ready = materials.filter((m) => m.processing_status === 'completed');

  const loadMocks = () => {
    mockTestsApi.list()
      .then((res) => setMocks(res.data))
      .catch(() => {});
  };

  useEffect(() => { loadMocks(); }, []);

  const create = async () => {
    if (selectedMats.length === 0) { setCreateError('Select at least one material'); return; }
    setCreateError(''); setCreating(true);
    try {
      const res = await mockTestsApi.create({ material_ids: selectedMats, title: cfg.title, questions_count: cfg.count });
      loadMocks(); setView('list');
      toast.success(`Mock test generated — ${res.data.questions_count} questions ready`);
    } catch (err) {
      setCreateError(extractDetail(err, 'Generation failed'));
    } finally { setCreating(false); }
  };

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
          <Btn onClick={() => setView('create')} disabled={ready.length === 0}>
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
                  <p className="font-semibold text-[15px] text-gray-900 truncate">{mock.title}</p>
                  <p className="text-[13px] text-gray-400 mt-0.5">
                    {mock.questions_count} questions · mixed format
                    {mock.best_score > 0 && <> · <ScoreTag score={mock.best_score} /></>}
                  </p>
                </div>
                <Btn variant="outline" onClick={() => navigate(`/mock/${mock.id}`)}>
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

// ── FlashcardsPanel ──────────────────────────────────────────────────────────

interface Flashcard     { front: string; back: string; hint?: string }
interface FlashcardDeck { id: string; ts: number; materialName: string; materialId: number; count: number; cards: Flashcard[]; }
const FC_KEY = 'revora_flashcard_decks';
const MAX_FC = 15;

function FlashcardsPanel({ materials }: { materials: StudyMaterial[] }) {
  const ready = materials.filter(m => m.processing_status === 'completed');

  const [decks, setDecks] = useState<FlashcardDeck[]>(() => {
    try { return JSON.parse(localStorage.getItem(FC_KEY) || '[]'); } catch { return []; }
  });
  const [selectedId, setSelectedId] = useState<number>(ready[0]?.id ?? 0);
  const [count, setCount]           = useState(10);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [cardIdx, setCardIdx]       = useState(0);
  const [flipped, setFlipped]       = useState(false);
  const [showHint, setShowHint]     = useState(false);
  const [known, setKnown]           = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!selectedId && ready.length > 0) setSelectedId(ready[0].id);
  }, [ready, selectedId]);

  const generate = async () => {
    if (!selectedId) { setError('Select a material first'); return; }
    setError(''); setLoading(true);
    try {
      const res = await materialsApi.flashcards(selectedId, count);
      const cards: Flashcard[] = Array.isArray(res.data?.flashcards)
        ? res.data.flashcards : Array.isArray(res.data) ? res.data : [];
      if (cards.length === 0) { setError('No flashcards returned — try a different material'); return; }
      const mat = ready.find(m => m.id === selectedId);
      const deck: FlashcardDeck = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        ts: Date.now(),
        materialName: mat?.original_name ?? 'Material',
        materialId: selectedId,
        count: cards.length,
        cards,
      };
      setDecks(p => {
        const u = [deck, ...p].slice(0, MAX_FC);
        try { localStorage.setItem(FC_KEY, JSON.stringify(u)); } catch { /* */ }
        return u;
      });
      loadDeck(deck);
    } catch (err) {
      setError(extractDetail(err, 'Failed to generate flashcards'));
    } finally { setLoading(false); }
  };

  const loadDeck = (deck: FlashcardDeck) => {
    setActiveDeck(deck); setCardIdx(0); setFlipped(false); setShowHint(false); setKnown(new Set());
  };

  const goTo = (i: number) => { setCardIdx(i); setFlipped(false); setShowHint(false); };
  const prev = () => goTo(Math.max(0, cardIdx - 1));
  const next = () => goTo(Math.min((activeDeck?.cards.length ?? 1) - 1, cardIdx + 1));

  const markKnown = () => {
    setKnown(s => new Set([...s, cardIdx]));
    if (activeDeck && cardIdx < activeDeck.cards.length - 1) goTo(cardIdx + 1);
  };
  const markUnknown = () => {
    setKnown(s => { const n = new Set(s); n.delete(cardIdx); return n; });
    if (activeDeck && cardIdx < activeDeck.cards.length - 1) goTo(cardIdx + 1);
  };

  const card     = activeDeck?.cards[cardIdx];
  const total    = activeDeck?.cards.length ?? 0;
  const progress = total > 0 ? Math.round((known.size / total) * 100) : 0;
  const allKnown = total > 0 && known.size === total;

  // ── HOME VIEW (no active deck) ────────────────────────────────────────────
  if (!activeDeck) {
    return (
      <div className="h-full overflow-y-auto bg-[#F7F8FA]">
        <div className="max-w-3xl mx-auto px-8 py-10">

          {/* Page header */}
          <div className="mb-8">
            <h2 className="text-[28px] font-bold text-gray-900 tracking-tight">Flashcards</h2>
            <p className="text-[14.5px] text-gray-400 mt-1">Generate AI flashcards from your materials and study smarter</p>
          </div>

          {/* Generator card */}
          <div className="bg-white border border-gray-100 rounded-2xl p-7 mb-8 shadow-sm">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-5">Generate New Deck</p>
            {ready.length === 0 ? (
              <NoMaterialsBanner />
            ) : (
              <div className="space-y-5">
                <div>
                  <label className="block text-[12.5px] font-semibold text-gray-600 mb-2">Material</label>
                  <select value={selectedId} onChange={e => setSelectedId(Number(e.target.value))}
                    className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-[14px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 transition">
                    {ready.map(m => <option key={m.id} value={m.id}>{m.original_name}</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[12.5px] font-semibold text-gray-600">Number of cards</label>
                    <span className="text-[22px] font-bold text-gray-900 tabular-nums">{count}</span>
                  </div>
                  <input type="range" min={5} max={20} step={1} value={count}
                    onChange={e => setCount(Number(e.target.value))}
                    className="w-full h-1.5" style={{ accentColor: '#6DEB74' }} />
                  <div className="flex justify-between mt-1">
                    <span className="text-[11px] text-gray-300">5</span>
                    <span className="text-[11px] text-gray-300">20</span>
                  </div>
                </div>
                {error && <p className="text-[13px] text-red-500">{error}</p>}
                <button onClick={() => void generate()} disabled={loading || !selectedId}
                  className="w-full h-12 rounded-xl bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" />Generating flashcards…</>
                    : <><BookOpen size={16} />Generate Flashcards</>}
                </button>
              </div>
            )}
          </div>

          {/* Past decks grid */}
          {decks.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Recent Decks</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {decks.map(deck => (
                  <button key={deck.id} onClick={() => loadDeck(deck)}
                    className="text-left bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition-all group">
                    <div className="w-10 h-10 bg-gray-100 group-hover:bg-gray-200 rounded-xl flex items-center justify-center mb-3 transition-colors">
                      <BookOpen size={18} className="text-gray-500" />
                    </div>
                    <p className="text-[14.5px] font-semibold text-gray-900 truncate leading-snug">{deck.materialName}</p>
                    <p className="text-[13px] text-gray-400 mt-1">{deck.count} cards</p>
                    <p className="text-[11px] text-gray-300 mt-0.5">
                      {new Date(deck.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── CARD VIEWER (active deck) ─────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F7F8FA]">

      {/* Header bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-3.5 flex items-center gap-5">
        <button onClick={() => setActiveDeck(null)}
          className="text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1.5 flex-shrink-0">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-gray-900 truncate">{activeDeck.materialName}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[12.5px] text-gray-500 tabular-nums">{known.size}/{total} known</span>
          <div className="w-36 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#6DEB74] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[13px] font-bold text-gray-700 tabular-nums w-9 text-right">{progress}%</span>
        </div>
        <span className="text-[13px] text-gray-400 tabular-nums flex-shrink-0">{cardIdx + 1} / {total}</span>
      </div>

      {/* Card area — vertically centered */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-8 py-6 gap-5">

        {/* Dot progress */}
        <div className="flex items-center justify-center gap-2 flex-wrap max-w-2xl w-full">
          {activeDeck.cards.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className="rounded-full transition-all duration-200 flex-shrink-0"
              style={{
                width: i === cardIdx ? 22 : 8, height: 8,
                background: known.has(i) ? '#6DEB74' : i === cardIdx ? '#18181b' : '#e4e4e7',
              }} />
          ))}
        </div>

        {/* BIG Flip card */}
        <div onClick={() => setFlipped(f => !f)}
          className="cursor-pointer select-none w-full max-w-2xl"
          style={{ perspective: 1400 }}>
          <div style={{
            position: 'relative', height: 340,
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}>
            {/* Front — dark */}
            <div style={{
              position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
              background: '#18181b', borderRadius: 24,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '48px 64px', gap: 18,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Question — tap to reveal
              </span>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#fff', textAlign: 'center', lineHeight: 1.55, wordBreak: 'break-word' }}>
                {card?.front}
              </p>
            </div>
            {/* Back — light */}
            <div style={{
              position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: '#fff', border: '2px solid #e4e4e7', borderRadius: 24,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '48px 64px', gap: 18,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Answer
              </span>
              <p style={{ margin: 0, fontSize: 20, color: '#18181b', textAlign: 'center', lineHeight: 1.65, wordBreak: 'break-word' }}>
                {card?.back}
              </p>
            </div>
          </div>
        </div>

        {/* Hint */}
        {card?.hint && (
          <div className="text-center">
            {!showHint
              ? <button onClick={() => setShowHint(true)}
                  className="text-[13px] text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors">
                  Show hint
                </button>
              : <p className="text-[14px] text-gray-500 italic">💡 {card.hint}</p>
            }
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3 w-full max-w-2xl">
          <button onClick={prev} disabled={cardIdx === 0}
            className="h-12 w-12 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-25 transition-colors flex items-center justify-center flex-shrink-0">
            <ChevronLeft size={20} />
          </button>
          <button onClick={markUnknown}
            className="flex-1 h-12 rounded-xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Don't Know
          </button>
          <button onClick={markKnown}
            className="flex-1 h-12 rounded-xl bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 text-[14px] font-semibold transition-colors">
            Know
          </button>
          <button onClick={next} disabled={cardIdx === total - 1}
            className="h-12 w-12 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-25 transition-colors flex items-center justify-center flex-shrink-0">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Finish button — shown on last card */}
        {cardIdx === total - 1 && !allKnown && (
          <button onClick={() => setActiveDeck(null)}
            className="w-full max-w-2xl h-12 rounded-xl bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 text-[14px] font-semibold transition-colors">
            Finish Deck
          </button>
        )}

        {/* All done */}
        {allKnown && (
          <div className="bg-white border border-gray-100 rounded-2xl px-10 py-6 text-center shadow-sm w-full max-w-2xl">
            <p className="text-[20px] font-bold text-gray-900">All {total} cards known!</p>
            <p className="text-[14px] text-gray-400 mt-1">You've mastered this deck.</p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button onClick={() => { setCardIdx(0); setFlipped(false); setKnown(new Set()); }}
                className="h-10 px-6 rounded-xl border border-gray-200 text-[13.5px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Review again
              </button>
              <button onClick={() => setActiveDeck(null)}
                className="h-10 px-6 rounded-xl bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 text-[13.5px] font-semibold transition-colors">
                Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const TABS = [
  { value: 'analysis', label: 'Analysis', icon: BarChart2 },
  { value: 'quiz', label: 'Quiz', icon: ClipboardList },
  { value: 'mock', label: 'Mock Test', icon: Timer },
  { value: 'flashcards', label: 'Flashcards', icon: BookOpen },
] as const;

export default function StudyAI() {
  const [searchParams] = useSearchParams();
  const initTab = (() => {
    const t = searchParams.get('tab');
    if (t === 'quiz') return 'quiz';
    if (t === 'mock') return 'mock';
    if (t === 'flashcards') return 'flashcards';
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
          <h1 className="text-[28px] font-bold text-gray-900">Knowledge AI</h1>
          <p className="text-[14.5px] text-gray-400 mt-1">Analyse past papers, practise with quizzes, and review with flashcards</p>
        </div>

        <div className="flex">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[14px] border-b-2 transition-colors',
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
        {activeTab === 'flashcards' && <FlashcardsPanel materials={materials} />}
      </div>
    </div>
  );
}
