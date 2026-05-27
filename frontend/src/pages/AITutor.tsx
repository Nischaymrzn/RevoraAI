import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send, GraduationCap, Loader2,
  Plus, Clock, Mic, PhoneOff, BarChart2, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi, qaApi } from '../services/api';
import type { StudyMaterial } from '../types';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

const SG = 'Space Grotesk, system-ui, sans-serif';
const CHAT_KEY  = 'revora_chat_sessions';
const VIVA_KEY  = 'revora_viva_sessions';
const TUTOR_KEY = 'revora_tutor_sessions';
const MAX_CHAT  = 40;
const MAX_VIVA  = 20;
const MAX_TUTOR = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode       = 'chat' | 'tutor';
type TutorPhase = 'setup' | 'learning' | 'viva' | 'analysis';

interface ChatMsg     { id: string; role: 'user' | 'assistant'; content: string; sources?: Array<{ preview?: string }>; }
interface ChatSession { id: string; ts: number; title: string; messages: ChatMsg[]; materialIds: number[]; }
interface ConvItem    { id: string; from: 'tutor' | 'student'; kind: 'text' | 'lesson'; text: string; ts: number; }
interface VivaTurn    { role: 'ai' | 'user'; text: string; ts: number; }
interface VivaSkills  { Comprehension: number; Communication: number; Accuracy: number; Depth: number; Confidence: number; }
interface VivaAnalysis {
  overallScore: number;
  grade: string;
  skills: VivaSkills;
  questionBreakdown: Array<{ question: string; answer: string; score: number; feedback: string }>;
  summary: string;
  strengths?: string[];
  areasForImprovement?: string[];
}
interface VivaSession  { id: string; ts: number; materialName: string; questionCount: number; transcript: VivaTurn[]; analysis: VivaAnalysis | null; }
interface TutorSession { id: string; ts: number; materialName: string; materialIds: number[]; vivaId?: string; conv?: ConvItem[]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function extractDetail(err: unknown, fb: string) {
  const e = err as { response?: { data?: { detail?: string } } };
  return typeof e?.response?.data?.detail === 'string' ? e.response!.data!.detail! : fb;
}
function gradeColor(pct: number) {
  if (pct >= 75) return { text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' };
  if (pct >= 60) return { text: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  if (pct >= 45) return { text: '#c2410c', bg: '#fff7ed', border: '#fed7aa' };
  return { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
}
function fmtDate(ts: number) {
  const d = new Date(ts), n = new Date();
  if (d.toDateString() === n.toDateString()) return 'Today';
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtTimer(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function group<T extends { ts: number }>(items: T[]) {
  return items.reduce<{ label: string; items: T[] }[]>((acc, s) => {
    const l = fmtDate(s.ts); const g = acc.find(x => x.label === l);
    if (g) g.items.push(s); else acc.push({ label: l, items: [s] });
    return acc;
  }, []);
}
function extractJson(raw: string): string | null {
  const code = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (code) return code[1];
  const obj = raw.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : null;
}
function buildFallback(pairs: Array<{ question: string; answer: string }>): VivaAnalysis {
  return {
    overallScore: 0, grade: 'Analysis Unavailable',
    skills: { Comprehension: 0, Communication: 0, Accuracy: 0, Depth: 0, Confidence: 0 },
    questionBreakdown: pairs.map(p => ({ question: p.question, answer: p.answer, score: 0, feedback: 'Automated analysis could not be completed.' })),
    summary: 'The viva was completed but automated analysis could not be generated. Your answers are preserved below.',
  };
}

// ─── Radar Chart ──────────────────────────────────────────────────────────────

function RadarChart({ skills, size = 170 }: { skills: VivaSkills; size?: number }) {
  const keys = Object.keys(skills) as (keyof VivaSkills)[];
  const vals = keys.map(k => skills[k]);
  const n = keys.length, cx = size / 2, cy = size / 2, r = size * 0.35;
  const step = (2 * Math.PI) / n;
  const ax = (i: number, v: number) => ({ x: cx + r * (v / 10) * Math.cos(i * step - Math.PI / 2), y: cy + r * (v / 10) * Math.sin(i * step - Math.PI / 2) });
  const dp = vals.map((v, i) => ax(i, v));
  const poly = dp.map(p => `${p.x},${p.y}`).join(' ');
  const lp = keys.map((k, i) => { const a = i * step - Math.PI / 2; return { x: cx + (r + 17) * Math.cos(a), y: cy + (r + 17) * Math.sin(a), k }; });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ fontFamily: SG }}>
      {[0.25, 0.5, 0.75, 1].map(lv => (
        <polygon key={lv}
          points={keys.map((_, i) => { const a = i * step - Math.PI / 2; return `${cx + r * lv * Math.cos(a)},${cy + r * lv * Math.sin(a)}`; }).join(' ')}
          fill="none" stroke="#e4e4e7" strokeWidth="1" />
      ))}
      {keys.map((_, i) => { const a = i * step - Math.PI / 2; return <line key={i} x1={cx} y1={cy} x2={cx + r * Math.cos(a)} y2={cy + r * Math.sin(a)} stroke="#e4e4e7" strokeWidth="1" />; })}
      <polygon points={poly} fill="rgba(24,24,27,0.1)" stroke="#18181b" strokeWidth="1.5" />
      {dp.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#18181b" />)}
      {lp.map(({ x, y, k }) => <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#71717a">{k}</text>)}
    </svg>
  );
}

// ─── Lesson Content ───────────────────────────────────────────────────────────

function LessonContent({ text }: { text: string }) {
  return (
    <div className="space-y-2" style={{ fontFamily: SG }}>
      {text.split('\n').map((line, i) => {
        const hm = line.match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
        if (hm) return <div key={i} className={i > 0 ? 'pt-2' : ''}><h3 className="text-[14.5px] font-bold text-zinc-900 mb-0.5">{hm[1]}</h3>{hm[2] && <p className="text-[14px] text-zinc-700 leading-relaxed">{hm[2]}</p>}</div>;
        if (line.match(/^[-•]\s/)) return <div key={i} className="flex gap-2 items-start"><span className="w-1.5 h-1.5 rounded-full bg-zinc-400 mt-[7px] flex-shrink-0" /><p className="text-[14px] text-zinc-700 leading-relaxed">{line.slice(2)}</p></div>;
        const nm = line.match(/^(\d+)\.\s(.+)$/);
        if (nm) return <div key={i} className="flex gap-2 items-start"><span className="text-[12px] font-bold text-zinc-400 mt-0.5 flex-shrink-0">{nm[1]}.</span><p className="text-[14px] text-zinc-700 leading-relaxed">{nm[2]}</p></div>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="text-[14px] text-zinc-700 leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0"><GraduationCap size={12} className="text-white" /></div>
      <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm flex gap-1.5 items-center">
        {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }} />)}
      </div>
    </div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-3 items-end', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', isUser ? 'bg-zinc-200' : 'bg-zinc-900')}>
        {isUser ? <span className="text-[9px] font-bold text-zinc-600">You</span> : <GraduationCap size={12} className="text-white" />}
      </div>
      <div className={cn('max-w-[76%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap',
        isUser ? 'bg-zinc-900 text-white rounded-br-sm' : 'bg-white border border-zinc-100 text-zinc-800 rounded-bl-sm shadow-sm'
      )} style={{ fontFamily: SG }}>
        {msg.content}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-100">
            <p className="text-[11px] text-zinc-400 truncate">{msg.sources[0].preview?.slice(0, 80)}…</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared Conv Renderer ─────────────────────────────────────────────────────

function ConvMessages({ conv }: { conv: ConvItem[] }) {
  return (
    <>
      {conv.map(item => {
        if (item.from === 'student') return (
          <div key={item.id} className="flex justify-end items-end gap-2.5">
            <div className="max-w-[72%] bg-zinc-900 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ fontFamily: SG }}>{item.text}</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-zinc-200 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-zinc-600">You</span>
            </div>
          </div>
        );
        if (item.kind === 'lesson') return (
          <div key={item.id} className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0 mt-0.5"><GraduationCap size={12} className="text-white" /></div>
            <div className="flex-1 min-w-0 bg-white border border-zinc-100 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-50 bg-zinc-50">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Your Lesson</span>
              </div>
              <div className="px-5 py-5"><LessonContent text={item.text} /></div>
            </div>
          </div>
        );
        return (
          <div key={item.id} className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0 mt-0.5"><GraduationCap size={12} className="text-white" /></div>
            <div className="max-w-[78%] bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <p className="text-[15px] text-zinc-800 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: SG }}>
                {item.text.split(/(\*\*[^*]+\*\*)/).map((seg, i) => { const b = seg.match(/^\*\*(.+)\*\*$/); return b ? <strong key={i}>{b[1]}</strong> : seg; })}
              </p>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Viva Screen ──────────────────────────────────────────────────────────────

interface VivaScreenProps {
  materialName: string;
  materialIds: number[];
  questions: string[];
  userName: string;
  userInitials: string;
  onComplete: (s: Omit<VivaSession, 'id' | 'ts'>) => void;
  onCancel: () => void;
}

function VivaScreen({ materialName, materialIds: _materialIds, questions, userName, userInitials, onComplete, onCancel }: VivaScreenProps) {
  type CS = 'idle' | 'connecting' | 'active' | 'ended' | 'analyzing';
  const vapiRef       = useRef<{ stop: () => void } | null>(null);
  const turnsBuf      = useRef<VivaTurn[]>([]);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cs, setCs]              = useState<CS>('idle');
  const [aiSpeaking, setAiSpeak] = useState(false);
  const [userVol, setUserVol]    = useState(0);
  const [turns, setTurns]        = useState<VivaTurn[]>([]);
  const [elapsed, setElapsed]    = useState(0);
  const [currentQ, setCurrentQ]  = useState(0);

  useEffect(() => {
    if (cs === 'active') { timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000); }
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cs]);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns]);

  const push = (t: VivaTurn) => { turnsBuf.current = [...turnsBuf.current, t]; setTurns([...turnsBuf.current]); };

  const analyze = async () => {
    setCs('analyzing');
    const transcript = turnsBuf.current;

    // If the user ended immediately with no answers, return a zero score directly
    // without calling the AI (which would otherwise use RAG context and return
    // a score from the material rather than from the student's actual answers).
    const userTurnsInTranscript = transcript.filter(t => t.role === 'user');
    if (userTurnsInTranscript.length === 0) {
      const emptyPairs = questions.map(q => ({ question: q, answer: 'No answer provided' }));
      onComplete({ materialName, questionCount: questions.length, transcript: [], analysis: buildFallback(emptyPairs) });
      return;
    }

    // Group all user utterances between consecutive AI turns to form each answer.
    // Deepgram sends multiple "final" events per answer (one per pause) so we
    // concatenate all utterances that fall between examiner turn i and i+1.
    const aiTurns = transcript.filter(t => t.role === 'ai');
    const qaPairs = questions.map((q, qi) => {
      const afterTs  = aiTurns[qi]?.ts ?? 0;
      const beforeTs = aiTurns[qi + 1]?.ts ?? Infinity;
      const answerTurns = transcript.filter(
        t => t.role === 'user' && t.ts > afterTs && t.ts < beforeTs
      );
      const answer = answerTurns.map(t => t.text.trim()).filter(Boolean).join(' ');
      return { question: q, answer: answer || 'No answer provided' };
    });

    const qaBlock = qaPairs.map((p, i) =>
      `QUESTION ${i + 1}: ${p.question}\nSTUDENT ANSWER: ${p.answer}`
    ).join('\n\n');

    const prompt =
      `You are a rigorous academic viva examiner assessing a student on the topic: "${materialName}".\n\n` +
      `The student was asked ${questions.length} formal examination questions. Here are the exact questions and the student's verbatim answers:\n\n` +
      `${qaBlock}\n\n` +
      `IMPORTANT: Base your grading ONLY on what the student actually said in their answers above. ` +
      `If answers are empty or "No answer provided", give a score of 0 for those questions.\n\n` +
      `Grade scale: Distinction (90-100) = exceptional, Merit (75-89) = strong with minor gaps, ` +
      `Pass (60-74) = adequate with some gaps, Borderline (45-59) = basic but major gaps, Fail (0-44) = insufficient.\n\n` +
      `Provide a rigorous, fair, detailed academic assessment. For each question, evaluate whether the answer is correct, complete, and demonstrates genuine understanding.\n\n` +
      `Return ONLY valid JSON — no markdown, no text before or after:\n` +
      `{"overallScore":72,"grade":"Merit","skills":{"Comprehension":7,"Communication":8,"Accuracy":7,"Depth":6,"Confidence":8},` +
      `"questionBreakdown":[{"question":"exact question text","answer":"exact student answer","score":8,"feedback":"specific feedback: what was correct, what was missing or incorrect, and what would improve the answer"}],` +
      `"summary":"2-3 sentence academic summary of overall performance","strengths":["specific strength 1","specific strength 2"],"areasForImprovement":["specific improvement area 1","specific improvement area 2"]}`;

    try {
      // Do NOT pass materialIds — grading must be based purely on the student's
      // answers, not RAG context, to prevent previous-session scores bleeding in.
      const res = await qaApi.ask(prompt, undefined, undefined);
      const raw = res.data.answer as string;
      const jsonStr = extractJson(raw);
      const analysis = jsonStr ? JSON.parse(jsonStr) as VivaAnalysis : buildFallback(qaPairs);
      onComplete({ materialName, questionCount: questions.length, transcript: turnsBuf.current, analysis });
    } catch {
      onComplete({ materialName, questionCount: questions.length, transcript: turnsBuf.current, analysis: buildFallback(qaPairs) });
    }
  };

  const startCall = async () => {
    setCs('connecting');
    try {
      const mod = await import('@vapi-ai/web');
      const Vapi = (mod as unknown as { default: new (k: string) => { start: (c: object) => Promise<unknown>; stop: () => void; on: (e: string, cb: (...a: unknown[]) => void) => void } }).default;
      const vapi = new Vapi(import.meta.env.VITE_VAPI_PUBLIC_KEY as string);
      vapiRef.current = vapi;
      vapi.on('call-start',   () => setCs('active'));
      vapi.on('call-end',     () => { setCs('ended'); void analyze(); });
      vapi.on('speech-start', () => setAiSpeak(true));
      vapi.on('speech-end',   () => setAiSpeak(false));
      vapi.on('volume-level', (v: unknown) => setUserVol(typeof v === 'number' ? v : 0));
      vapi.on('message', (msg: unknown) => {
        const m = msg as { type?: string; role?: string; transcript?: string; transcriptType?: string };
        if (m.type === 'transcript' && m.transcriptType === 'final' && m.transcript) {
          push({ role: m.role === 'assistant' ? 'ai' : 'user', text: m.transcript, ts: Date.now() });
          if (m.role === 'user') setCurrentQ(q => Math.min(q + 1, questions.length - 1));
        }
      });

      // Build numbered question list; Q1 is delivered in firstMessage so system lists Q2+
      const remainingQs = questions.slice(1).map((q, i) => `Question ${i + 2}: ${q}`).join('\n');
      await vapi.start({
        model: {
          provider: 'openai', model: 'gpt-4o-mini',
          messages: [{ role: 'system', content:
            `You are a strict formal academic viva examiner for the topic: "${materialName}".\n\n` +
            `You have already asked Question 1: "${questions[0]}"\n\n` +
            `Your remaining questions to ask in EXACT ORDER are:\n${remainingQs || '(no more questions)'}\n\n` +
            `STRICT EXAMINATION RULES — follow these precisely:\n` +
            `1. After the student answers each question, respond with ONLY a brief neutral acknowledgment: "Thank you", "I see", or "Noted" (3 words maximum). Nothing else.\n` +
            `2. Immediately ask the NEXT question from your list, word for word.\n` +
            `3. NEVER ask follow-up questions, probes, or clarifications.\n` +
            `4. NEVER offer hints, feedback, encouragement, or corrections during the viva.\n` +
            `5. NEVER rephrase or modify the questions — ask them exactly as written.\n` +
            `6. After Question ${questions.length} is answered, say: "Thank you for completing the viva assessment. Your responses have been recorded." Then end.\n` +
            `7. You have exactly ${questions.length} questions total. Do not add any more.` }],
          temperature: 0.1,
        },
        voice: { provider: 'openai', voiceId: 'nova' },
        transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en-US' },
        firstMessage:
          `Good day, ${userName}. I am your viva examiner for "${materialName}". ` +
          `This is a formal assessment. I will ask you ${questions.length} examination questions. ` +
          `Please answer each one clearly and in detail. ` +
          `First question: ${questions[0]}`,
      });
    } catch {
      toast.error('Could not start viva — check microphone permissions.');
      setCs('idle');
    }
  };

  const userSpeaking = userVol > 0.08;

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden pt-1.5" style={{ fontFamily: SG }}>
      {/* Top bar */}
      <div className="bg-gray-50 border-b border-gray-200 flex items-center justify-center flex-shrink-0 relative" style={{ height: 52 }}>
        <div className="flex items-center">
          {[{ l: 'Duration', v: fmtTimer(elapsed) }, { l: 'Questions', v: String(questions.length) }, { l: 'Topic', v: materialName }].map(({ l, v }, i) => (
            <div key={l} className={cn('flex flex-col items-center px-6', i > 0 ? 'border-l border-gray-200' : '')}>
              <span className="text-[9.5px] text-gray-400 uppercase tracking-widest">{l}</span>
              <span className="text-[12.5px] font-semibold text-gray-800 truncate max-w-[160px]">{v}</span>
            </div>
          ))}
        </div>
        {cs === 'active' && (
          <div className="absolute right-14 flex items-center gap-2 text-[12px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Q {currentQ + 1} / {questions.length}
          </div>
        )}
        <button onClick={onCancel} className="absolute right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-[14px]">✕</button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-6 pt-5 pb-4 gap-4 overflow-hidden">
        {/* Panels */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* AI panel */}
          <div className="flex-1 rounded-2xl bg-zinc-900 flex flex-col items-center justify-center relative overflow-hidden">
            {aiSpeaking && (
              <>
                <div className="absolute w-36 h-36 rounded-full bg-white/[0.03] animate-ping pointer-events-none" />
                <div className="absolute w-28 h-28 rounded-full bg-white/[0.05] animate-ping pointer-events-none" style={{ animationDelay: '0.3s' }} />
              </>
            )}
            <div className={cn('w-20 h-20 rounded-full bg-white flex items-center justify-center z-10 transition-transform duration-300', aiSpeaking ? 'scale-110' : 'scale-100')}>
              <GraduationCap size={30} className="text-zinc-900" strokeWidth={1.6} />
            </div>
            <p className="text-white font-semibold text-[14px] mt-3 z-10">AI Examiner</p>
            <p className={cn('text-[12px] mt-1 z-10', aiSpeaking && cs === 'active' ? 'text-emerald-400' : 'text-zinc-500')}>
              {cs === 'connecting' ? 'Connecting…' : cs === 'active' ? (aiSpeaking ? 'Speaking…' : 'Listening…') : cs === 'analyzing' ? 'Analysing…' : 'Ready'}
            </p>
            {aiSpeaking && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-0.5 items-end z-10">
                {[3, 5, 8, 11, 8, 5, 3].map((h, i) => (
                  <div key={i} className="w-0.5 rounded-full bg-white/50 animate-bounce" style={{ height: h * 2, animationDelay: `${i * 0.07}s`, animationDuration: '0.5s' }} />
                ))}
              </div>
            )}
            <div className="absolute top-3 left-3 bg-black/40 rounded-lg px-2 py-0.5">
              <span className="text-[9.5px] text-zinc-400 font-medium">AI Examiner</span>
            </div>
          </div>

          {/* User panel */}
          <div className="flex-1 rounded-2xl bg-zinc-50 border border-zinc-100 flex flex-col items-center justify-center relative overflow-hidden">
            {userSpeaking && <div className="absolute w-32 h-32 rounded-full bg-zinc-200/40 animate-ping pointer-events-none" />}
            <div className={cn('w-20 h-20 rounded-full bg-white border-2 flex items-center justify-center z-10 transition-all duration-300', userSpeaking ? 'border-zinc-500 scale-110' : 'border-zinc-200 scale-100')}>
              <span className="text-[22px] font-bold text-zinc-700">{userInitials}</span>
            </div>
            <p className="text-zinc-800 font-semibold text-[14px] mt-3 z-10">{userName}</p>
            <p className={cn('text-[12px] mt-1 z-10', userSpeaking ? 'text-zinc-700 font-medium' : 'text-zinc-400')}>
              {cs === 'active' ? (userSpeaking ? 'Speaking…' : 'Listening…') : 'Ready'}
            </p>
            {cs === 'active' && (
              <div className={cn('absolute bottom-4 right-4 w-7 h-7 rounded-full flex items-center justify-center', userSpeaking ? 'bg-zinc-900' : 'bg-zinc-200')}>
                <Mic size={13} className={userSpeaking ? 'text-white' : 'text-zinc-400'} />
              </div>
            )}
            <div className="absolute top-3 left-3 bg-white border border-zinc-100 rounded-lg px-2 py-0.5">
              <span className="text-[9.5px] text-zinc-500 font-medium">{userName}</span>
            </div>
          </div>
        </div>

        {/* Call control */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
          {cs === 'idle' && (
            <button onClick={() => void startCall()}
              className="w-full max-w-sm h-12 rounded-xl bg-[#6DEB74] hover:bg-[#52e05a] text-gray-900 font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors">
              <Mic size={16} /> Start Viva Assessment
            </button>
          )}
          {cs === 'connecting' && (
            <button disabled className="w-full max-w-sm h-12 rounded-xl bg-zinc-700 text-zinc-400 font-semibold text-[14px] flex items-center justify-center gap-2 cursor-not-allowed">
              <Loader2 size={16} className="animate-spin" /> Connecting…
            </button>
          )}
          {cs === 'active' && (
            <button onClick={() => vapiRef.current?.stop()}
              className="w-full max-w-sm h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-colors">
              <PhoneOff size={16} /> End Viva
            </button>
          )}
          {(cs === 'ended' || cs === 'analyzing') && (
            <div className="h-12 flex items-center gap-2 text-zinc-500">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[13px]">Analysing your responses…</span>
            </div>
          )}
          <p className="text-[11px] text-zinc-400">Use a quiet environment and speak clearly</p>
        </div>

        {/* Live transcript */}
        <div className="flex-shrink-0 bg-white border border-zinc-100 rounded-xl overflow-hidden" style={{ maxHeight: 120 }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-100">
            <div className="flex items-center gap-1.5">
              {cs === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              <span className="text-[11.5px] font-semibold text-zinc-600">Live Transcript</span>
            </div>
            <span className="text-[10px] text-zinc-400">Real-time</span>
          </div>
          <div className="px-4 py-2.5 overflow-y-auto" style={{ maxHeight: 74 }}>
            {turns.length === 0
              ? <p className="text-[12px] text-zinc-400 italic">Transcript will appear here after the viva starts.</p>
              : <div className="space-y-1">
                  {turns.map((t, i) => (
                    <p key={i} className="text-[12px] leading-relaxed">
                      <span className={cn('font-semibold mr-1', t.role === 'ai' ? 'text-zinc-900' : 'text-zinc-600')}>{t.role === 'ai' ? 'Examiner:' : 'You:'}</span>
                      <span className="text-zinc-600">{t.text}</span>
                    </p>
                  ))}
                  <div ref={transcriptEnd} />
                </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Analysis View ────────────────────────────────────────────────────────────

function AnalysisView({ session }: { session: VivaSession }) {
  const { analysis, materialName, transcript } = session;
  const isUnavailable = !analysis || analysis.grade === 'Analysis Unavailable';
  const pct = analysis?.overallScore ?? 0;
  const gc  = gradeColor(pct);
  return (
    <div className="flex-1 overflow-y-auto bg-[#F7F8FA] px-6 py-6 min-h-0">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Score + radar */}
        <div className="bg-white border border-zinc-100 rounded-2xl p-5 flex gap-5 items-start">
          {!isUnavailable && analysis?.skills && <div className="flex-shrink-0"><RadarChart skills={analysis.skills} size={160} /></div>}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Viva Analysis · {materialName}</p>
            {isUnavailable ? (
              <div className="py-2">
                <p className="text-[14px] font-semibold text-zinc-500">Analysis Unavailable</p>
                <p className="text-[12.5px] text-zinc-400 mt-1 leading-relaxed">The viva was completed and your answers are recorded below. Automated scoring could not be generated.</p>
              </div>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2"
                  style={{ background: gc.bg, border: `2px solid ${gc.border}` }}>
                  <span className="text-[22px] font-black" style={{ color: gc.text }}>{pct}%</span>
                </div>
                <p className="text-[15px] font-bold text-zinc-900">{analysis?.grade}</p>
                {analysis?.summary && <p className="text-[13.5px] text-zinc-500 mt-1.5 leading-relaxed">{analysis.summary}</p>}
              </>
            )}
          </div>
        </div>

        {/* Skills bars */}
        {!isUnavailable && analysis?.skills && (
          <div className="bg-white border border-zinc-100 rounded-2xl p-5">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Skill Breakdown</p>
            <div className="space-y-2.5">
              {Object.entries(analysis.skills).map(([s, v]) => (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13.5px] font-medium text-zinc-700">{s}</span>
                    <span className="text-[13.5px] font-bold text-zinc-900">{v}/10</span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-zinc-900 rounded-full transition-all" style={{ width: `${(v as number) * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths + Areas for improvement */}
        {!isUnavailable && (analysis?.strengths?.length || analysis?.areasForImprovement?.length) ? (
          <div className="grid grid-cols-2 gap-3">
            {(analysis?.strengths?.length ?? 0) > 0 && (
              <div className="bg-white border border-zinc-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2.5">Strengths</p>
                <ul className="space-y-1.5">
                  {analysis!.strengths!.map((s, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-[5px] flex-shrink-0" />
                      <span className="text-[12px] text-zinc-700 leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(analysis?.areasForImprovement?.length ?? 0) > 0 && (
              <div className="bg-white border border-zinc-100 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2.5">To Improve</p>
                <ul className="space-y-1.5">
                  {analysis!.areasForImprovement!.map((s, i) => (
                    <li key={i} className="flex gap-2 items-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-[5px] flex-shrink-0" />
                      <span className="text-[12px] text-zinc-700 leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {/* Q breakdown */}
        {(analysis?.questionBreakdown ?? []).length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Question-by-Question Breakdown</p>
            {analysis!.questionBreakdown.map((item, i) => {
              const scoreColor = item.score >= 7 ? '#15803d' : item.score >= 5 ? '#b45309' : '#b91c1c';
              const scoreBg   = item.score >= 7 ? '#f0fdf4' : item.score >= 5 ? '#fffbeb' : '#fef2f2';
              return (
                <div key={i} className="bg-white border border-zinc-100 rounded-xl overflow-hidden">
                  {/* Q header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Q{i + 1}</span>
                      <p className="text-[14px] font-semibold text-zinc-800">{item.question}</p>
                    </div>
                    {item.score > 0 && (
                      <span className="text-[13px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ml-3"
                        style={{ color: scoreColor, background: scoreBg }}>
                        {item.score}/10
                      </span>
                    )}
                  </div>
                  {/* Student answer */}
                  <div className="px-4 pt-3 pb-0">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Your Answer</p>
                    <div className="bg-zinc-50 rounded-lg px-3 py-2.5 border-l-2 border-zinc-300">
                      <p className="text-[13.5px] text-zinc-700 leading-relaxed italic">
                        {item.answer && item.answer !== 'No answer provided'
                          ? `"${item.answer}"`
                          : <span className="text-zinc-400 not-italic">No answer recorded</span>
                        }
                      </p>
                    </div>
                  </div>
                  {/* Feedback */}
                  <div className="px-4 pt-3 pb-4">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Examiner Feedback</p>
                    <p className="text-[13.5px] text-zinc-600 leading-relaxed">{item.feedback}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full transcript (collapsible) */}
        {transcript.length > 0 && (
          <details className="bg-white border border-zinc-100 rounded-xl overflow-hidden group">
            <summary className="px-4 py-3 text-[12px] font-semibold text-zinc-600 cursor-pointer select-none list-none flex items-center justify-between">
              Full Viva Transcript
              <ChevronRight size={12} className="text-zinc-400 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-4 pb-4 pt-2 border-t border-zinc-100 space-y-1.5">
              {transcript.map((t, i) => (
                <p key={i} className="text-[12px] leading-relaxed">
                  <span className={cn('font-semibold mr-1', t.role === 'ai' ? 'text-zinc-900' : 'text-zinc-600')}>{t.role === 'ai' ? 'Examiner:' : 'You:'}</span>
                  <span className="text-zinc-600">{t.text}</span>
                </p>
              ))}
            </div>
          </details>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}

// ─── History View ─────────────────────────────────────────────────────────────

type HistTab = 'lesson' | 'viva' | 'analysis';

function HistoryView({ session, viva, onBack }: { session: TutorSession; viva: VivaSession | null; onBack: () => void }) {
  const hasLesson = (session.conv?.length ?? 0) > 0;
  const hasViva   = (viva?.transcript?.length ?? 0) > 0;
  const hasAnalysis = !!viva?.analysis;

  const defaultTab: HistTab = hasAnalysis ? 'analysis' : hasViva ? 'viva' : 'lesson';
  const [tab, setTab] = useState<HistTab>(defaultTab);

  const tabs: Array<{ id: HistTab; label: string }> = [
    ...(hasLesson   ? [{ id: 'lesson'   as HistTab, label: 'Lesson' }]   : []),
    ...(hasViva     ? [{ id: 'viva'     as HistTab, label: 'Viva' }]     : []),
    ...(hasAnalysis ? [{ id: 'analysis' as HistTab, label: 'Analysis' }] : []),
  ];

  const pct = viva?.analysis?.overallScore;
  const gc  = pct !== undefined ? gradeColor(pct) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-zinc-100 bg-white flex items-center gap-3 px-5 flex-shrink-0">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-800 transition-colors flex-shrink-0">
          <ArrowLeft size={14} />
          <span className="text-[12px] font-medium">Back</span>
        </button>
        <div className="h-4 w-px bg-zinc-200 flex-shrink-0" />
        <span className="font-semibold text-[14px] text-zinc-800 truncate min-w-0">{session.materialName}</span>
        {gc && pct !== undefined && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ml-auto"
            style={{ color: gc.text, background: gc.bg }}>
            {pct}% · {viva?.analysis?.grade}
          </span>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex border-b border-zinc-100 bg-white flex-shrink-0 px-5 gap-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('h-10 px-4 text-[12.5px] font-medium border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400 hover:text-zinc-600')}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Lesson tab */}
      {tab === 'lesson' && session.conv && (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F7F8FA]">
          <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
            <ConvMessages conv={session.conv} />
          </div>
        </div>
      )}

      {/* Viva tab */}
      {tab === 'viva' && viva && (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F7F8FA]">
          <div className="max-w-2xl mx-auto px-5 py-6 space-y-3">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1 mb-3">
              Viva Transcript · {viva.materialName}
            </p>
            {viva.transcript.map((t, i) => (
              <div key={i} className={cn('flex gap-3', t.role === 'user' ? 'flex-row-reverse' : '')}>
                <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                  t.role === 'ai' ? 'bg-zinc-900' : 'bg-zinc-200')}>
                  {t.role === 'ai' ? <GraduationCap size={12} className="text-white" /> : <span className="text-[9px] font-bold text-zinc-600">You</span>}
                </div>
                <div className={cn('max-w-[76%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed',
                  t.role === 'ai'
                    ? 'bg-white border border-zinc-100 text-zinc-800 rounded-tl-sm shadow-sm'
                    : 'bg-zinc-900 text-white rounded-tr-sm')}>
                  <p className="text-[9.5px] font-bold uppercase tracking-wider mb-1 opacity-50">
                    {t.role === 'ai' ? 'Examiner' : 'You'}
                  </p>
                  {t.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis tab */}
      {tab === 'analysis' && viva && <AnalysisView session={viva} />}
    </div>
  );
}

// ─── Checkbox helper ──────────────────────────────────────────────────────────

function MatCheckbox({ m, checked, onToggle, disabled }: { m: StudyMaterial; checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled}
      className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors mb-0.5',
        checked ? 'bg-zinc-900' : disabled ? 'opacity-40 cursor-default' : 'hover:bg-zinc-50')}>
      <div className={cn('w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0', checked ? 'bg-white border-white' : 'border-zinc-300')}>
        {checked && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5.5L7 1" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <p className={cn('text-[12.5px] font-medium truncate', checked ? 'text-white' : 'text-zinc-700')}>{m.original_name}</p>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AITutor() {
  const { user } = useAuthStore();
  const initials = user?.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
  const userName = user?.name ?? 'Student';

  // shared
  const [mode, setMode]             = useState<Mode>('chat');
  const [materials, setMaterials]   = useState<StudyMaterial[]>([]);
  const [selectedMats, setSelectedMats] = useState<number[]>([]);
  const ready = materials.filter(m => m.processing_status === 'completed');

  // chat
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatMsgs, setChatMsgs]         = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput]       = useState('');
  const [chatLoading, setChatLoading]   = useState(false);

  // tutor
  const [phase, setPhase]                   = useState<TutorPhase>('setup');
  const [conv, setConv]                     = useState<ConvItem[]>([]);
  const [lessonInput, setLessonInput]       = useState('');
  const [lessonLoading, setLessonLoading]   = useState(false);
  const [startingLesson, setStartingLesson] = useState(false);
  const [vivaQuestions, setVivaQuestions]   = useState<string[]>([]);

  // history
  const [vivaSessions, setVivaSessions]   = useState<VivaSession[]>([]);
  const [tutorSessions, setTutorSessions] = useState<TutorSession[]>([]);
  const [activeViva, setActiveViva]       = useState<VivaSession | null>(null);
  const [historyItem, setHistoryItem]     = useState<{ session: TutorSession; viva: VivaSession | null } | null>(null);

  const currentTutorIdRef = useRef<string | null>(null);
  const convRef           = useRef<ConvItem[]>([]);
  const convEnd   = useRef<HTMLDivElement>(null);
  const chatEnd   = useRef<HTMLDivElement>(null);
  const chatRef   = useRef<HTMLTextAreaElement>(null);
  const lessonRef = useRef<HTMLTextAreaElement>(null);

  // Keep convRef in sync for use in useCallback closures
  useEffect(() => { convRef.current = conv; }, [conv]);

  // Prevent body scroll while this page is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Bootstrap
  useEffect(() => {
    materialsApi.list().then(r => setMaterials(r.data)).catch(() => {});
    try {
      const cs = localStorage.getItem(CHAT_KEY);  if (cs) setChatSessions(JSON.parse(cs));
      const vs = localStorage.getItem(VIVA_KEY);  if (vs) setVivaSessions(JSON.parse(vs));
      const ts = localStorage.getItem(TUTOR_KEY); if (ts) setTutorSessions(JSON.parse(ts));
    } catch { /* */ }
  }, []);

  useEffect(() => { convEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv, lessonLoading, startingLesson]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs, chatLoading]);

  // ── Chat ──────────────────────────────────────────────────────────────────

  const newChat = () => { setActiveChatId(genId()); setChatMsgs([]); setChatInput(''); };

  const saveChat = useCallback((id: string, msgs: ChatMsg[], mats: number[]) => {
    if (msgs.length < 2) return;
    const s: ChatSession = { id, ts: Date.now(), title: msgs[0].content.slice(0, 55), messages: msgs, materialIds: mats };
    setChatSessions(p => {
      const u = [s, ...p.filter(x => x.id !== id)].slice(0, MAX_CHAT);
      try { localStorage.setItem(CHAT_KEY, JSON.stringify(u)); } catch { /* */ }
      return u;
    });
  }, []);

  const sendChat = async () => {
    const text = chatInput.trim(); if (!text || chatLoading) return;
    const id = activeChatId ?? (() => { const i = genId(); setActiveChatId(i); return i; })();
    setChatInput('');
    const um: ChatMsg = { id: genId(), role: 'user', content: text };
    const msgs = [...chatMsgs, um];
    setChatMsgs(msgs); setChatLoading(true);
    try {
      const res = await qaApi.ask(text, undefined, selectedMats.length > 0 ? selectedMats : undefined);
      const am: ChatMsg = { id: genId(), role: 'assistant', content: res.data.answer as string, sources: res.data.sources };
      const final = [...msgs, am];
      setChatMsgs(final);
      saveChat(id, final, selectedMats);
    } catch (err) {
      setChatMsgs(p => [...p, { id: genId(), role: 'assistant', content: `Error: ${extractDetail(err, 'Please try again.')}` }]);
    } finally { setChatLoading(false); }
  };

  // ── Tutor ─────────────────────────────────────────────────────────────────

  const addT = useCallback((text: string, kind: 'text' | 'lesson' = 'text') => {
    setConv(p => [...p, { id: genId(), from: 'tutor', kind, text, ts: Date.now() }]);
  }, []);
  const addS = useCallback((text: string) => {
    setConv(p => [...p, { id: genId(), from: 'student', kind: 'text', text, ts: Date.now() }]);
  }, []);

  const startLesson = async () => {
    if (selectedMats.length === 0) { toast.error('Select a material first'); return; }
    const mat  = ready.find(m => m.id === selectedMats[0]);
    const name = mat?.original_name ?? 'the material';
    const sessionId = genId();
    currentTutorIdRef.current = sessionId;
    setStartingLesson(true); setConv([]); setHistoryItem(null);
    addS(`I'd like to learn about "${name}".`);
    try {
      const prompt =
        `You are an expert, encouraging university tutor speaking directly to your student.\n` +
        `Deliver a well-structured, comprehensive lesson on the material. Structure it as:\n` +
        `**Introduction** — introduce the topic, its importance, and real-world relevance.\n` +
        `**Key Concepts** — 3–5 most important concepts with clear explanations, examples, and exam relevance.\n` +
        `**Common Misconceptions** — 1–2 frequent mistakes students make.\n` +
        `**Summary** — 5 bullet-point takeaways that would be useful in an exam.\n\n` +
        `Write as a human teacher who is engaging and enthusiastic. Use clear language.`;
      const res = await qaApi.ask(prompt, undefined, selectedMats);
      addT(res.data.answer as string, 'lesson');
      addT('Take your time with the lesson above. Ask me any questions to deepen your understanding — and when you\'re ready for your formal assessment, click **Start Viva** below.');
      setPhase('learning');
      const ts: TutorSession = { id: sessionId, ts: Date.now(), materialName: name, materialIds: selectedMats };
      setTutorSessions(p => {
        const u = [ts, ...p.filter(x => x.id !== sessionId)].slice(0, MAX_TUTOR);
        try { localStorage.setItem(TUTOR_KEY, JSON.stringify(u)); } catch { /* */ }
        return u;
      });
    } catch (err) { toast.error(extractDetail(err, 'Failed to start lesson')); }
    finally { setStartingLesson(false); }
  };

  const askQuestion = async () => {
    const q = lessonInput.trim(); if (!q || lessonLoading) return;
    setLessonInput(''); addS(q); setLessonLoading(true);
    try {
      const res = await qaApi.ask(
        `The student asks: "${q}"\nAnswer clearly and thoroughly as their tutor. Ground your answer in the material content.`,
        undefined, selectedMats
      );
      addT(res.data.answer as string);
    } catch (err) { toast.error(extractDetail(err, 'Failed to answer')); }
    finally { setLessonLoading(false); }
  };

  const prepareViva = async () => {
    if (selectedMats.length === 0) return;
    setLessonLoading(true);
    try {
      const mat     = ready.find(m => m.id === selectedMats[0]);
      const matName = mat?.original_name ?? 'the material';
      const prompt =
        `You are a university viva examiner creating formal examination questions for the topic: "${matName}".\n\n` +
        `Generate exactly 5 viva examination questions. Requirements:\n` +
        `- Questions must test deep conceptual understanding and application — NOT surface-level recall or memorisation\n` +
        `- Use analytical question types: "Explain the significance of...", "How does X relate to Y...", "What would happen if...", "Compare and contrast...", "Critically evaluate..."\n` +
        `- Each question should require a detailed, substantive answer (not yes/no)\n` +
        `- Questions must be directly based on the specific content of the material\n` +
        `- Questions should be suitable for a formal academic viva examination\n` +
        `- Vary the topics covered — do not ask similar questions\n\n` +
        `Return ONLY valid JSON — no markdown, no explanation, no text before or after:\n` +
        `{"questions":["Question 1?","Question 2?","Question 3?","Question 4?","Question 5?"]}`;
      const res = await qaApi.ask(prompt, undefined, selectedMats);
      const raw = res.data.answer as string;
      const jsonStr = extractJson(raw);
      if (!jsonStr) throw new Error('No JSON in response');
      const parsed = JSON.parse(jsonStr) as { questions: string[] };
      if (!parsed.questions?.length) throw new Error('No questions returned');
      setVivaQuestions(parsed.questions.slice(0, 5));
      setPhase('viva');
    } catch (err) { toast.error(extractDetail(err, 'Failed to generate viva questions')); }
    finally { setLessonLoading(false); }
  };

  const onVivaComplete = useCallback((partial: Omit<VivaSession, 'id' | 'ts'>) => {
    const vivaId = genId();
    const s: VivaSession = { ...partial, id: vivaId, ts: Date.now() };
    setActiveViva(s);
    setVivaSessions(p => {
      const u = [s, ...p].slice(0, MAX_VIVA);
      try { localStorage.setItem(VIVA_KEY, JSON.stringify(u)); } catch { /* */ }
      return u;
    });
    const tid = currentTutorIdRef.current;
    const savedConv = convRef.current;
    if (tid) {
      setTutorSessions(p => {
        const u = p.map(ts => ts.id === tid ? { ...ts, vivaId, conv: savedConv } : ts);
        try { localStorage.setItem(TUTOR_KEY, JSON.stringify(u)); } catch { /* */ }
        return u;
      });
    }
    setHistoryItem(null);
    setPhase('analysis');
  }, []);

  const resetTutor = () => {
    setPhase('setup'); setConv([]); setSelectedMats([]); setVivaQuestions([]); setActiveViva(null);
    setHistoryItem(null);
    currentTutorIdRef.current = null;
  };

  // Grouping helpers
  const chatGroups  = group(chatSessions);
  const tutorGroups = group(tutorSessions);

  const matName = selectedMats.length === 1
    ? (ready.find(m => m.id === selectedMats[0])?.original_name ?? '1 material')
    : selectedMats.length > 1 ? `${selectedMats.length} materials` : '';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex overflow-hidden" style={{ fontFamily: SG, height: 'calc(100vh - 64px)' }}>

      {/* ══ LEFT PANEL ══════════════════════════════════════════════════════ */}
      <aside className="w-60 flex-shrink-0 border-r border-zinc-100 bg-white flex flex-col overflow-hidden">

        {/* Mode toggle */}
        <div className="px-3 pt-3 pb-2 flex-shrink-0">
          <div className="flex rounded-lg bg-zinc-100 p-0.5 gap-0.5">
            {(['chat', 'tutor'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={cn('flex-1 h-7 rounded-md text-[13px] font-semibold transition-all',
                  mode === m ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700')}>
                {m === 'chat' ? 'Chat' : 'AI Tutor'}
              </button>
            ))}
          </div>
        </div>

        {/* ── CHAT sidebar ─────────────────────────────────────────────── */}
        {mode === 'chat' && (
          <>
            <div className="px-3 pb-2 flex-shrink-0">
              <button onClick={newChat}
                className="w-full h-8 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-[12px] font-medium text-zinc-600 flex items-center justify-center gap-1.5 transition-colors">
                <Plus size={12} /> New Chat
              </button>
            </div>

            {ready.length > 0 && (
              <div className="px-3 pb-2 flex-shrink-0">
                <p className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest px-1 mb-1">Ground in material</p>
                {ready.slice(0, 4).map(m => (
                  <MatCheckbox key={m.id} m={m} checked={selectedMats.includes(m.id)}
                    onToggle={() => setSelectedMats(p => p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id])} />
                ))}
              </div>
            )}

            <div className="h-px bg-zinc-100 mx-3 flex-shrink-0" />

            <div className="flex-1 overflow-y-auto px-3 pt-2 pb-2 min-h-0">
              {chatGroups.length === 0
                ? <p className="text-[11.5px] text-zinc-400 text-center py-4">No chats yet</p>
                : chatGroups.map(g => (
                  <div key={g.label} className="mb-3">
                    <p className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest px-2 mb-1">{g.label}</p>
                    {g.items.map(s => (
                      <button key={s.id}
                        onClick={() => { setActiveChatId(s.id); setChatMsgs(s.messages); setSelectedMats(s.materialIds ?? []); }}
                        className={cn('w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors',
                          activeChatId === s.id ? 'bg-zinc-100' : '')}>
                        <p className="text-[11.5px] text-zinc-700 truncate">{s.title}</p>
                      </button>
                    ))}
                  </div>
                ))
              }
            </div>
          </>
        )}

        {/* ── TUTOR sidebar ────────────────────────────────────────────── */}
        {mode === 'tutor' && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 px-3 pt-1 pb-2">

              <p className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest px-1 mb-1.5 mt-1">
                {phase === 'setup' ? 'Materials' : 'Studying'}
              </p>

              {phase === 'setup' ? (
                ready.length === 0
                  ? <p className="text-[11.5px] text-zinc-400 text-center py-3">No processed materials</p>
                  : ready.map(m => (
                    <MatCheckbox key={m.id} m={m} checked={selectedMats.includes(m.id)}
                      onToggle={() => setSelectedMats(p => p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id])} />
                  ))
              ) : (
                <div className="px-2 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 mb-2">
                  <p className="text-[11.5px] font-medium text-zinc-700 truncate">{matName || 'Material'}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5 capitalize">{phase}</p>
                </div>
              )}

              {/* Tutor session history */}
              {tutorSessions.length > 0 && (
                <>
                  <div className="h-px bg-zinc-100 my-3" />
                  <div className="flex items-center gap-1.5 px-1 mb-1.5">
                    <Clock size={9} className="text-zinc-400" />
                    <p className="text-[9.5px] font-bold text-zinc-400 uppercase tracking-widest">History</p>
                  </div>
                  {tutorGroups.map(g => (
                    <div key={g.label} className="mb-2">
                      <p className="text-[9px] text-zinc-400 px-2 mb-0.5">{g.label}</p>
                      {g.items.map(ts => {
                        const viva = ts.vivaId ? vivaSessions.find(v => v.id === ts.vivaId) ?? null : null;
                        const isActive = historyItem?.session.id === ts.id;
                        return (
                          <button key={ts.id}
                            onClick={() => setHistoryItem({ session: ts, viva })}
                            className={cn('w-full text-left px-2 py-1.5 rounded-lg transition-colors mb-0.5 hover:bg-zinc-50',
                              isActive ? 'bg-zinc-100' : '')}>
                            <p className="text-[12.5px] font-medium text-zinc-700 truncate">{ts.materialName}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-zinc-400">{fmtDate(ts.ts)}</span>
                              {viva?.analysis
                                ? <span className="text-[10px] font-bold" style={{ color: gradeColor(viva.analysis.overallScore).text }}>{viva.analysis.overallScore}%</span>
                                : viva
                                  ? <span className="text-[10px] text-zinc-400">Viva done</span>
                                  : <span className="text-[10px] text-zinc-300">Learning</span>
                              }
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Fixed controls at bottom */}
            <div className="flex-shrink-0 px-3 pt-2.5 pb-5 border-t border-zinc-100 space-y-1.5">
              {phase === 'setup' && (
                <button onClick={() => void startLesson()} disabled={selectedMats.length === 0 || startingLesson}
                  className={cn('w-full h-9 rounded-xl font-semibold text-[12.5px] flex items-center justify-center gap-2 transition-all',
                    selectedMats.length > 0 && !startingLesson ? 'bg-zinc-900 hover:bg-black text-white' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed')}>
                  {startingLesson ? <><Loader2 size={13} className="animate-spin" /><span className="text-[13.5px]">Preparing…</span></> : <span className="text-[13.5px]">Start Learning Session</span>}
                </button>
              )}
              {phase === 'learning' && (
                <>
                  <button onClick={() => void prepareViva()} disabled={lessonLoading}
                    className="w-full h-9 rounded-xl font-semibold text-[12.5px] bg-zinc-900 hover:bg-black text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                    {lessonLoading ? <><Loader2 size={13} className="animate-spin" /><span className="text-[13.5px]">Preparing…</span></> : <><Mic size={13} /><span className="text-[13.5px]">Start Viva</span></>}
                  </button>
                  <button onClick={resetTutor} className="w-full h-7 text-[11.5px] text-zinc-400 hover:text-zinc-600 transition-colors">New session</button>
                </>
              )}
              {(phase === 'viva' || phase === 'analysis') && (
                <button onClick={resetTutor}
                  className="w-full h-9 rounded-xl border border-zinc-200 text-[12.5px] font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
                  New Session
                </button>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ══ RIGHT AREA ══════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden">

        {/* ── CHAT ─────────────────────────────────────────────────────── */}
        {mode === 'chat' && (
          <>
            <div className="h-12 border-b border-zinc-100 bg-white flex items-center gap-2.5 px-5 flex-shrink-0">
              <GraduationCap size={14} className="text-zinc-400" />
              <span className="font-semibold text-[14px] text-zinc-800">Chat</span>
              {matName && <span className="text-[11px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md truncate max-w-[180px]">{matName}</span>}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-[#F7F8FA]">
              {chatMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                  <div className="w-11 h-11 bg-zinc-900 rounded-2xl flex items-center justify-center mb-3"><GraduationCap size={20} className="text-white" /></div>
                  <h2 className="font-bold text-zinc-900 text-[17px] mb-1">Ask anything</h2>
                  <p className="text-[13px] text-zinc-400 max-w-xs leading-relaxed">
                    {selectedMats.length > 0 ? `Answers grounded in ${matName}` : 'General Q&A — select materials from the panel for document-grounded answers'}
                  </p>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
                  {chatMsgs.map(m => <ChatBubble key={m.id} msg={m} />)}
                  {chatLoading && (
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center"><GraduationCap size={12} className="text-white" /></div>
                      <div className="bg-white border border-zinc-100 rounded-2xl px-4 py-3.5 shadow-sm flex gap-1.5">
                        {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>
              )}
            </div>
            <div className="flex-shrink-0 border-t border-zinc-100 bg-white px-5 py-3.5">
              <div className="max-w-2xl mx-auto flex items-end bg-white rounded-2xl border border-zinc-200 shadow-sm focus-within:ring-2 focus-within:ring-zinc-200 transition">
                <textarea ref={chatRef} rows={1} value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendChat(); } }}
                  placeholder="Message…"
                  className="flex-1 resize-none px-4 py-3.5 bg-transparent text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none min-h-[52px] max-h-36"
                  style={{ fontFamily: SG }} />
                <button onClick={() => void sendChat()} disabled={!chatInput.trim() || chatLoading}
                  className="m-2 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-black text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
                  {chatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── TUTOR: HISTORY VIEW ───────────────────────────────────────── */}
        {mode === 'tutor' && historyItem && (
          <HistoryView
            session={historyItem.session}
            viva={historyItem.viva}
            onBack={() => setHistoryItem(null)}
          />
        )}

        {/* ── TUTOR: SETUP ─────────────────────────────────────────────── */}
        {mode === 'tutor' && !historyItem && phase === 'setup' && (
          <div className="flex-1 min-h-0 flex items-center justify-center bg-[#F7F8FA] px-8">
            <div className="text-center max-w-sm">
              <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <GraduationCap size={26} className="text-white" strokeWidth={1.6} />
              </div>
              <h1 className="font-bold text-zinc-900 text-[21px] mb-2">AI Tutor</h1>
              <p className="text-[14px] text-zinc-400 leading-relaxed">
                Select a study material from the panel, then click <strong className="text-zinc-600">Start Learning Session</strong>. The tutor will teach the material, answer your questions, then conduct a formal voice viva and analyse your performance with detailed feedback.
              </p>
              {selectedMats.length === 0 && <p className="text-[12px] text-zinc-300 mt-5">← Select a material to begin</p>}
            </div>
          </div>
        )}

        {/* ── TUTOR: LEARNING ──────────────────────────────────────────── */}
        {mode === 'tutor' && !historyItem && phase === 'learning' && (
          <>
            <div className="h-12 border-b border-zinc-100 bg-white flex items-center gap-2.5 px-5 flex-shrink-0">
              <GraduationCap size={14} className="text-zinc-400" />
              <span className="font-semibold text-[14px] text-zinc-800">AI Tutor</span>
              {matName && <span className="text-[11px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md truncate max-w-[160px]">{matName}</span>}
              <span className="text-[11px] font-semibold text-white bg-zinc-800 px-2 py-0.5 rounded-md">Learning</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-[#F7F8FA]">
              <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
                <ConvMessages conv={conv} />
                {(startingLesson || lessonLoading) && <TypingDots />}
                <div ref={convEnd} />
              </div>
            </div>
            <div className="flex-shrink-0 border-t border-zinc-100 bg-white px-5 py-3.5">
              <div className="max-w-2xl mx-auto flex items-end bg-white rounded-2xl border border-zinc-200 shadow-sm focus-within:ring-2 focus-within:ring-zinc-200 transition">
                <textarea ref={lessonRef} rows={1} value={lessonInput}
                  onChange={e => setLessonInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askQuestion(); } }}
                  placeholder="Ask a question about the lesson…"
                  className="flex-1 resize-none px-4 py-3.5 bg-transparent text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none min-h-[52px] max-h-32"
                  style={{ fontFamily: SG }} />
                <button onClick={() => void askQuestion()} disabled={!lessonInput.trim() || lessonLoading}
                  className="m-2 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-black text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
                  {lessonLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── TUTOR: VIVA ──────────────────────────────────────────────── */}
        {mode === 'tutor' && !historyItem && phase === 'viva' && (
          <VivaScreen
            materialName={ready.find(m => m.id === selectedMats[0])?.original_name ?? 'your material'}
            materialIds={selectedMats}
            questions={vivaQuestions}
            userName={userName}
            userInitials={initials}
            onComplete={onVivaComplete}
            onCancel={() => setPhase('learning')}
          />
        )}

        {/* ── TUTOR: ANALYSIS ──────────────────────────────────────────── */}
        {mode === 'tutor' && !historyItem && phase === 'analysis' && activeViva && (
          <>
            <div className="h-12 border-b border-zinc-100 bg-white flex items-center gap-2.5 px-5 flex-shrink-0">
              <BarChart2 size={14} className="text-zinc-400" />
              <span className="font-semibold text-[14px] text-zinc-800">Viva Analysis</span>
              <span className="text-[11px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-md truncate max-w-[160px]">{activeViva.materialName}</span>
              {activeViva.analysis && activeViva.analysis.grade !== 'Analysis Unavailable' && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                  style={{ color: gradeColor(activeViva.analysis.overallScore).text, background: gradeColor(activeViva.analysis.overallScore).bg }}>
                  {activeViva.analysis.overallScore}% · {activeViva.analysis.grade}
                </span>
              )}
            </div>
            <AnalysisView session={activeViva} />
          </>
        )}
      </div>
    </div>
  );
}
