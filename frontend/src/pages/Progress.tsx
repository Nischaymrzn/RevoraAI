import { useEffect, useState } from 'react';
import { TrendingUp, Target, AlertTriangle, CheckCircle, Award, FolderOpen, Activity } from 'lucide-react';
import { analyticsApi } from '../services/api';
import { Progress as ProgressBar } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';

function ProgressSkeleton() {
  return (
    <div className="space-y-5 p-7">
      <Skeleton className="h-10 w-40" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function ScoreRow({ label, value, color = 'blue' }: {
  label: string; value: number; color?: 'blue' | 'indigo' | 'violet';
}) {
  const indicatorClass =
    color === 'indigo' ? '[&>div]:bg-indigo-400' :
    color === 'violet' ? '[&>div]:bg-violet-400' :
    '[&>div]:bg-blue-400';
  return (
    <div>
      <div className="flex justify-between text-[14.5px] mb-2">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-900">{value}%</span>
      </div>
      <ProgressBar value={value} className={cn('h-2', indicatorClass)} />
    </div>
  );
}

// ── Radar Chart ──────────────────────────────────────────────────────────────
interface RadarDim { label: string; value: number; }

function RadarChart({ dims }: { dims: RadarDim[] }) {
  const cx = 130, cy = 130, r = 90;
  const n = dims.length;

  const pt = (i: number, pct: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI / n) * i;
    return { x: cx + r * pct * Math.cos(angle), y: cy + r * pct * Math.sin(angle) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const gridPoly = (pct: number) =>
    dims.map((_, i) => { const p = pt(i, pct); return `${p.x},${p.y}`; }).join(' ');

  const dataPoly =
    dims.map((d, i) => { const p = pt(i, Math.max(d.value / 100, 0.03)); return `${p.x},${p.y}`; }).join(' ');

  return (
    <svg viewBox="0 0 260 260" className="w-full max-w-[240px] mx-auto">
      {/* Grid polygons */}
      {gridLevels.map((pct, gi) => (
        <polygon key={gi} points={gridPoly(pct)}
          fill={gi === gridLevels.length - 1 ? 'rgba(241,245,249,0.6)' : 'none'}
          stroke="#E2E8F0" strokeWidth="1.2" />
      ))}
      {/* Axis lines */}
      {dims.map((_, i) => {
        const end = pt(i, 1.0);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#E2E8F0" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon points={dataPoly}
        fill="rgba(99,102,241,0.12)" stroke="#6366F1" strokeWidth="2" strokeLinejoin="round" />
      {/* Data dots */}
      {dims.map((d, i) => {
        const p = pt(i, Math.max(d.value / 100, 0.03));
        return <circle key={i} cx={p.x} cy={p.y} r={4} fill="#6366F1" />;
      })}
      {/* Labels */}
      {dims.map((d, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI / n) * i;
        const lx = cx + (r + 26) * Math.cos(angle);
        const ly = cy + (r + 26) * Math.sin(angle);
        const anchor = Math.abs(lx - cx) < 12 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={i}>
            <text x={lx} y={ly - 5} textAnchor={anchor as 'middle' | 'start' | 'end'}
              dominantBaseline="middle" fontSize="10" fill="#6B7280"
              fontFamily="Space Grotesk, system-ui, sans-serif" fontWeight="600">
              {d.label}
            </text>
            <text x={lx} y={ly + 8} textAnchor={anchor as 'middle' | 'start' | 'end'}
              dominantBaseline="middle" fontSize="9.5" fill="#94A3B8"
              fontFamily="Space Grotesk, system-ui, sans-serif">
              {d.value}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Progress() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [progress, setProgress]   = useState<any>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.dashboard(),
      analyticsApi.readiness(),
      analyticsApi.progress(),
    ]).then(([d, r, p]) => {
      setDashboard(d.data);
      setReadiness(r.data);
      setProgress(p.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <ProgressSkeleton />;

  const stats          = dashboard?.stats || {};
  const readinessScore = stats.readiness_score || 0;
  const readinessColor =
    readinessScore >= 70 ? '#16a34a' :
    readinessScore >= 40 ? '#f97316' :
    readinessScore > 0   ? '#ef4444' : '#D1D5DB';
  const readinessLabel =
    readinessScore >= 70 ? 'Exam Ready'      :
    readinessScore >= 40 ? 'Partially Ready' :
    readinessScore > 0   ? 'Needs Work'      : 'Not assessed';
  const readinessBadge =
    readinessScore >= 70 ? 'bg-green-100 text-green-700'   :
    readinessScore >= 40 ? 'bg-orange-100 text-orange-600' :
    readinessScore > 0   ? 'bg-red-100 text-red-600'       : 'bg-gray-100 text-gray-500';

  const allScores = [
    ...(progress?.quiz_trend || []).map((t: any) => t.score),
    ...(progress?.mock_trend || []).map((t: any) => t.score),
  ];

  // Radar dimensions
  const totalAttempts   = (stats.quiz_attempt_count || 0) + (stats.mock_attempt_count || 0);
  const activityScore   = Math.min(100, Math.round(totalAttempts * 5));
  const materialScore   = stats.materials_count > 0
    ? Math.round((stats.processed_count / stats.materials_count) * 100)
    : 0;
  const aiScore = Math.min(100, Math.round((stats.questions_asked || 0) * 2));

  const radarDims: RadarDim[] = [
    { label: 'Quiz',       value: stats.avg_quiz_score  || 0 },
    { label: 'Mock Tests', value: stats.avg_mock_score  || 0 },
    { label: 'AI Use',     value: aiScore                    },
    { label: 'Materials',  value: materialScore              },
    { label: 'Activity',   value: activityScore              },
  ];

  const hasAnyData = totalAttempts > 0 || (stats.questions_asked || 0) > 0;

  return (
    <div className="fade-in w-full space-y-5 p-7">
      {/* Header */}
      <div>
        <h1 className="text-[30px] font-bold text-gray-900">My Progress</h1>
        <p className="text-[15.5px] text-gray-500 mt-1.5">Revision analytics and exam readiness overview</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Quizzes taken', value: stats.quiz_attempt_count || 0 },
          { label: 'Mock tests',    value: stats.mock_attempt_count  || 0 },
          { label: 'AI questions',  value: stats.questions_asked     || 0 },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-border p-5 text-center">
            <p className="text-[28px] font-bold text-gray-900">{value}</p>
            <p className="text-[14px] text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Readiness gauge */}
        <div className="bg-white rounded-xl border border-border p-7">
          <div className="flex items-center gap-2 mb-6">
            <Target size={17} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-[16px]">Exam Readiness</h3>
          </div>
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-[96px] overflow-hidden mb-2">
              <svg viewBox="0 0 176 88" className="w-full">
                {/* Background arc */}
                <path d="M 12 88 A 76 76 0 0 1 164 88" fill="none" stroke="#F0F2F5" strokeWidth="13" strokeLinecap="round" />
                {/* Filled arc — always show, opacity reflects score */}
                <path
                  d="M 12 88 A 76 76 0 0 1 164 88"
                  fill="none" stroke={readinessScore > 0 ? readinessColor : '#E5E7EB'}
                  strokeWidth="13" strokeLinecap="round"
                  strokeDasharray={`${(readinessScore / 100) * 239} 239`}
                  style={{ transition: 'stroke-dasharray 1.2s ease' }}
                />
                {/* Needle */}
                <line
                  x1="88" y1="88"
                  x2={88 + 58 * Math.cos((((readinessScore / 100) * 180 - 180) * Math.PI) / 180)}
                  y2={88 + 58 * Math.sin((((readinessScore / 100) * 180 - 180) * Math.PI) / 180)}
                  stroke={readinessScore > 0 ? readinessColor : '#D1D5DB'} strokeWidth="2.5" strokeLinecap="round"
                />
                <circle cx="88" cy="88" r="5" fill={readinessScore > 0 ? readinessColor : '#D1D5DB'} />
              </svg>
            </div>
            <p className="text-[44px] font-bold mt-1 leading-none" style={{ color: readinessScore > 0 ? readinessColor : '#9CA3AF' }}>
              {readinessScore > 0 ? `${readinessScore}%` : '—'}
            </p>
            <span className={cn('text-[12px] font-semibold px-3 py-0.5 rounded-full mt-2', readinessBadge)}>
              {readinessLabel}
            </span>
          </div>
          <p className="text-[14px] text-gray-500 text-center mt-5 leading-relaxed bg-gray-50 rounded-lg px-4 py-3 border border-border/50">
            {readiness?.recommendation || 'Take quizzes and mock tests to build your readiness score.'}
          </p>
        </div>

        {/* Performance */}
        <div className="bg-white rounded-xl border border-border p-7">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp size={17} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-[16px]">Performance Breakdown</h3>
          </div>
          <div className="space-y-5">
            <ScoreRow label="Overall average"   value={stats.avg_score      || 0} color="blue"   />
            <ScoreRow label="Quiz average"      value={stats.avg_quiz_score || 0} color="indigo" />
            <ScoreRow label="Mock test average" value={stats.avg_mock_score || 0} color="violet" />
          </div>

          {allScores.length > 0 && (
            <div className="mt-7">
              <p className="text-[12.5px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Score History</p>
              <div className="flex items-end gap-1 h-24">
                {allScores.slice(-20).map((score: number, i: number) => (
                  <div key={i} className="flex-1">
                    <div
                      className="w-full rounded-t transition-all duration-500"
                      style={{
                        height: `${Math.max((score / 100) * 88, 4)}px`,
                        backgroundColor: score >= 70 ? '#22c55e' : score >= 40 ? '#f97316' : '#ef4444',
                        opacity: 0.4 + (i / allScores.length) * 0.6,
                      }}
                      title={`${score}%`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1.5 text-[11.5px] text-gray-400">
                <span>oldest</span>
                <span>most recent</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Performance Radar */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-5">
          <Activity size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-[16px]">Performance Radar</h3>
        </div>
        {hasAnyData ? (
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="w-full max-w-[260px] mx-auto lg:mx-0">
              <RadarChart dims={radarDims} />
            </div>
            <div className="space-y-3">
              {radarDims.map((d) => (
                <div key={d.label}>
                  <div className="flex justify-between text-[13.5px] mb-1.5">
                    <span className="text-gray-600 font-medium">{d.label}</span>
                    <span className="font-semibold text-gray-800">{d.value}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${d.value}%`,
                        background: 'linear-gradient(90deg, #818CF8, #6366F1)',
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[12.5px] text-gray-400 pt-2 leading-relaxed">
                Activity score based on total quiz &amp; mock attempts · AI Use based on questions asked · Materials based on processed ratio
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[14.5px] text-gray-400 text-center py-8">
            Start taking quizzes and asking AI questions to see your performance radar.
          </p>
        )}
      </div>

      {/* Strengths & Areas to improve */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle size={16} className="text-green-500" />
            <h3 className="font-semibold text-gray-900 text-[16px]">Strengths</h3>
          </div>
          {readiness?.strengths?.length > 0 ? (
            <div className="space-y-3">
              {readiness.strengths.map((s: string, i: number) => (
                <div key={i} className="flex items-start gap-3 text-[14.5px]">
                  <CheckCircle size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">{s}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14.5px] text-gray-400">Take quizzes and mock tests to identify your strengths.</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={16} className="text-orange-400" />
            <h3 className="font-semibold text-gray-900 text-[16px]">Areas to Improve</h3>
          </div>
          {(dashboard?.weak_topics?.length > 0 || readiness?.areas_to_improve?.length > 0) ? (
            <div className="space-y-3">
              {[...(dashboard?.weak_topics || []), ...(readiness?.areas_to_improve || [])].slice(0, 5).map((t: string, i: number) => (
                <div key={i} className="flex items-start gap-3 text-[14.5px]">
                  <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0 mt-1.5" />
                  <span className="text-gray-700">{t}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14.5px] text-gray-400">No weak areas identified yet — keep going!</p>
          )}
        </div>
      </div>

      {/* AI Study Plan */}
      {readiness?.study_plan?.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <Award size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-[16px]">AI Study Plan</h3>
          </div>
          <div className="space-y-3">
            {readiness.study_plan.map((step: string, i: number) => (
              <div key={i} className="flex items-start gap-3.5">
                <span className="w-7 h-7 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-[14.5px] text-gray-700 leading-relaxed pt-0.5">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials summary */}
      <div className="bg-white rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-5">
          <FolderOpen size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-[16px]">Materials Summary</h3>
        </div>
        <div className="grid grid-cols-3 gap-6 text-center">
          {[
            { label: 'Total uploaded',     value: stats.materials_count || 0, highlight: false },
            { label: 'Processed & ready',  value: stats.processed_count || 0, highlight: true  },
            { label: 'AI questions asked', value: stats.questions_asked  || 0, highlight: false },
          ].map(({ label, value, highlight }) => (
            <div key={label}>
              <p className={cn('text-[30px] font-bold', highlight ? 'text-[#16a34a]' : 'text-gray-900')}>{value}</p>
              <p className="text-[14px] text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
        {stats.materials_count === 0 && (
          <p className="text-[14.5px] text-gray-400 text-center mt-5">Upload materials to start tracking your progress.</p>
        )}
      </div>
    </div>
  );
}
