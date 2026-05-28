import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload, FolderOpen, MessageSquare, ClipboardList, Timer,
  TrendingUp, AlertTriangle, ChevronRight, Plus,
} from 'lucide-react';
import { analyticsApi, materialsApi } from '../services/api';
import { StudyMaterial } from '../types';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const FILE_COLORS: Record<string, string> = {
  '.pdf':  'bg-zinc-900 text-white',
  '.docx': 'bg-zinc-100 text-zinc-600',
  '.doc':  'bg-zinc-100 text-zinc-600',
  '.pptx': 'bg-zinc-100 text-zinc-600',
  '.txt':  'bg-zinc-100 text-zinc-500',
};

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-7">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-11 w-40 rounded-lg" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon }: {
  label: string; value: string | number; sub?: string; icon: any;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-gray-400" />
      </div>
      <div>
        <p className="text-[14px] text-gray-500 font-medium">{label}</p>
        <p className="text-[26px] font-bold text-gray-900 leading-none mt-1">{value}</p>
        {sub && <p className="text-[13px] text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {

  const [dashboard, setDashboard] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.dashboard(),
      analyticsApi.readiness(),
      materialsApi.list(),
    ]).then(([d, r, m]) => {
      setDashboard(d.data);
      setReadiness(r.data);
      setMaterials(m.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;

  const stats    = dashboard?.stats || {};
  const pending  = materials.filter((m) => ['pending', 'processing'].includes(m.processing_status));
  const recent   = materials.slice(0, 5);

  const readinessScore = stats.readiness_score || 0;
  const readinessColor =
    readinessScore >= 70 ? '#16a34a' :
    readinessScore >= 40 ? '#3f3f46' :
    readinessScore > 0   ? '#18181b' : '#D1D5DB';
  const readinessLabel =
    readinessScore >= 70 ? 'Exam Ready' :
    readinessScore >= 40 ? 'Partially Ready' :
    readinessScore > 0   ? 'Needs Work' : 'Not assessed';

  return (
    <div className="fade-in space-y-6 w-full p-7">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-gray-900">Dashboard</h1>
          <p className="text-[15.5px] text-gray-500 mt-1.5">Your personalized study dashboard</p>
        </div>
        <Link
          to="/materials"
          className="flex items-center gap-1.5 h-9 px-4 bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 font-semibold text-[13px] rounded-lg transition-colors flex-shrink-0"
        >
          <Plus size={14} strokeWidth={2.5} />
          Upload material
        </Link>
      </div>

      {/* Alert: pending processing */}
      {pending.length > 0 && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-5 py-3.5 flex items-center gap-3">
          <AlertTriangle size={17} className="text-zinc-500 flex-shrink-0" />
          <p className="text-[14.5px] text-zinc-700 font-medium">
            {pending.length} material{pending.length > 1 ? 's' : ''} being processed — they'll be ready shortly
          </p>
          <Link to="/materials" className="ml-auto text-[13px] font-semibold text-zinc-600 hover:underline">View →</Link>
        </div>
      )}

      {/* Empty state CTA */}
      {stats.materials_count === 0 && (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-7 flex items-center gap-5">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Upload size={24} className="text-gray-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-[16px]">Drop notes, papers, slides here</p>
            <p className="text-[14px] text-gray-500 mt-1">Supports PDF · DOCX · PPTX · TXT — max 50 MB each</p>
          </div>
          <Link
            to="/materials"
            className="flex items-center gap-1.5 h-9 px-4 bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 font-semibold text-[13px] rounded-lg transition-colors"
          >
            Browse files <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Documents"    value={stats.materials_count    || 0} sub={`${stats.processed_count || 0} processed`} icon={FolderOpen}    />
        <StatCard label="AI Questions" value={stats.questions_asked    || 0} icon={MessageSquare} />
        <StatCard label="Quizzes"      value={stats.quiz_attempt_count || 0} icon={ClipboardList} />
        <StatCard label="Mock Tests"   value={stats.mock_attempt_count || 0} icon={Timer} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent materials */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-[16px]">Recent Documents</h3>
            <Link to="/materials" className="text-[13.5px] text-gray-500 font-medium hover:text-gray-800 hover:underline">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <FolderOpen size={36} className="text-gray-200 mx-auto mb-3" />
              <p className="text-[15px] text-gray-400 font-medium">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((m) => (
                <div key={m.id} className="px-5 py-4 flex items-center gap-3.5">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0', FILE_COLORS[m.file_type] || 'bg-gray-100 text-gray-500')}>
                    {m.file_type.replace('.', '').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-gray-900 truncate">{m.original_name}</p>
                    <p className="text-[13px] text-gray-400 mt-0.5">{formatSize(m.file_size)} · {timeAgo(m.upload_date)}</p>
                  </div>
                  <span className={cn(
                    'text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0',
                    m.processing_status === 'completed'  ? 'bg-green-100 text-green-700' :
                    m.processing_status === 'processing' ? 'bg-zinc-100 text-zinc-600'   :
                    m.processing_status === 'failed'     ? 'bg-zinc-100 text-zinc-700'   :
                    'bg-zinc-100 text-zinc-500'
                  )}>
                    {m.processing_status === 'completed'  ? 'Ready'      :
                     m.processing_status === 'processing' ? 'Processing' :
                     m.processing_status === 'failed'     ? 'Failed'     : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Readiness gauge */}
          <div className="bg-white rounded-xl border border-border p-5">
            <p className="text-[12.5px] font-semibold text-gray-400 uppercase tracking-wider mb-4">Exam Readiness</p>
            <div className="flex flex-col items-center">
              <div className="relative w-40 h-[80px] overflow-hidden mb-1">
                <svg viewBox="0 0 144 72" className="w-full">
                  <path d="M 10 72 A 62 62 0 0 1 134 72" fill="none" stroke="#F0F2F5" strokeWidth="11" strokeLinecap="round" />
                  {readinessScore > 0 && (
                    <path
                      d="M 10 72 A 62 62 0 0 1 134 72"
                      fill="none" stroke={readinessColor} strokeWidth="11" strokeLinecap="round"
                      strokeDasharray={`${(readinessScore / 100) * 195} 195`}
                      style={{ transition: 'stroke-dasharray 1.2s ease' }}
                    />
                  )}
                </svg>
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-0.5">
                  <span className="text-[24px] font-bold leading-none" style={{ color: readinessColor }}>{readinessScore}%</span>
                </div>
              </div>
              <span className={cn(
                'text-[11.5px] font-semibold px-2.5 py-0.5 rounded-full mt-1',
                readinessScore >= 70 ? 'bg-green-100 text-green-700' :
                readinessScore >= 40 ? 'bg-zinc-100 text-zinc-700'   :
                readinessScore > 0   ? 'bg-zinc-100 text-zinc-700'   : 'bg-zinc-100 text-zinc-500'
              )}>
                {readinessLabel}
              </span>
            </div>
            <p className="text-[13px] text-gray-500 text-center mt-3 leading-relaxed line-clamp-3">
              {readiness?.recommendation || 'Take quizzes and mock tests to build your score.'}
            </p>
            <Link to="/progress" className="mt-4 flex items-center justify-center gap-1 text-[13.5px] font-medium text-gray-500 hover:text-gray-800 hover:underline">
              Full analytics <ChevronRight size={13} />
            </Link>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-border p-5">
            <p className="text-[12.5px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
            <div className="space-y-0.5">
              {[
                { to: '/study',          icon: MessageSquare, label: 'Ask AI tutor',     sub: 'Answers from your docs'   },
                { to: '/study?tab=quiz', icon: ClipboardList, label: 'Generate a quiz',  sub: 'Auto-MCQ from materials'  },
                { to: '/study?tab=mock', icon: Timer,         label: 'Take a mock test', sub: 'Timed exam + readiness'   },
                { to: '/progress',       icon: TrendingUp,    label: 'View analytics',   sub: 'Strengths & weak areas'   },
              ].map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
                    <a.icon size={16} className="text-gray-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-gray-800">{a.label}</p>
                    <p className="text-[12px] text-gray-400">{a.sub}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Study Plan */}
      {readiness?.study_plan?.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900 text-[16px]">AI Study Plan</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {readiness.study_plan.slice(0, 3).map((step: string, i: number) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg p-4 border border-border/60">
                <span className="w-6 h-6 bg-gray-200 text-gray-600 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-[14px] text-gray-700 leading-snug">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
