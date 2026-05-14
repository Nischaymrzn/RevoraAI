import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare, ClipboardList, Timer, AlertCircle, BarChart2, GraduationCap,
  Loader2, Mic, MicOff, Send, Volume2, VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi, qaApi } from '../services/api';
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
