import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare, ClipboardList, Timer, AlertCircle, BarChart2, GraduationCap,
} from 'lucide-react';
import { materialsApi } from '../services/api';
import { StudyMaterial } from '../types';
import { cn } from '../lib/utils';

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
  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5">
        <EmptyState
          icon={BarChart2}
          title="Analysis panel coming together"
          sub="This workspace will show likely questions, topic weight, and exam pattern insights"
        />
      </div>
    </div>
  );
}

function QuizPanel({ materials }: { materials: StudyMaterial[] }) {
  const ready = materials.filter((m) => m.processing_status === 'completed');

  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5">
        {ready.length === 0 && <NoMaterialsBanner />}
        <EmptyState
          icon={ClipboardList}
          title="Quiz workspace prepared"
          sub="Simple quiz generation and attempt views will be added here for processed materials"
        />
      </div>
    </div>
  );
}

function MockPanel({ materials }: { materials: StudyMaterial[] }) {
  const ready = materials.filter((m) => m.processing_status === 'completed');

  return (
    <div className="overflow-y-auto h-full w-full">
      <div className="p-5">
        {ready.length === 0 && <NoMaterialsBanner />}
        <EmptyState
          icon={Timer}
          title="Mock test area prepared"
          sub="Timed mock test creation, answering, and readiness summaries will live here"
        />
      </div>
    </div>
  );
}

function TutorPanel({ materials }: { materials: StudyMaterial[] }) {
  const ready = materials.filter((m) => m.processing_status === 'completed');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
            <GraduationCap size={22} className="text-gray-400" />
          </div>
          <p className="font-semibold text-gray-800 text-[14px]">AI tutor shell is ready</p>
          <p className="text-[12.5px] text-gray-400 mt-1">This tab will answer questions from your uploaded materials</p>
          {ready.length === 0 && (
            <p className="mt-3 text-[12px] text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg">
              Upload and process materials first
            </p>
          )}
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
