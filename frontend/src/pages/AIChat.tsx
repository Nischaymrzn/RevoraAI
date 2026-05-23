/**
 * Chat — clean general-purpose AI chat with optional material context
 * Route: /chat (with Layout)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Send, Mic, MicOff, Volume2, VolumeX, RotateCcw,
  GraduationCap, Loader2, ChevronDown, Check, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { materialsApi, qaApi } from '../services/api';
import type { StudyMaterial } from '../types';
import { cn } from '../lib/utils';

const SG = 'Space Grotesk, system-ui, sans-serif';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ preview?: string }>;
  timestamp: Date;
}

type Seg = { type: 'text' | 'code'; content: string; lang?: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDetail(err: unknown, fallback: string): string {
  if (
    typeof err === 'object' && err !== null && 'response' in err &&
    typeof (err as { response?: { data?: { detail?: string } } }).response?.data?.detail === 'string'
  ) {
    return (err as { response?: { data?: { detail?: string } } }).response!.data!.detail!;
  }
  return fallback;
}

function parseSegs(text: string): Seg[] {
  const out: Seg[] = [];
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

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const segs = parseSegs(msg.content);
  return (
    <div className={cn('flex gap-3 items-start', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser ? 'bg-zinc-200' : 'bg-zinc-900'
      )}>
        {isUser
          ? <span className="text-[10px] font-bold text-zinc-600">You</span>
          : <GraduationCap size={13} className="text-white" />}
      </div>
      <div className={cn(
        'max-w-[78%] rounded-2xl px-4 py-3',
        isUser
          ? 'bg-zinc-900 text-white rounded-tr-sm'
          : 'bg-white border border-zinc-100 text-zinc-800 rounded-tl-sm shadow-sm'
      )}>
        {segs.map((s, i) => s.type === 'code' ? (
          <pre key={i} style={{
            fontFamily: '"JetBrains Mono","Fira Code",monospace',
            fontSize: 12.5,
            background: isUser ? 'rgba(255,255,255,0.08)' : '#f4f4f5',
            border: `1px solid ${isUser ? 'rgba(255,255,255,0.12)' : '#e4e4e7'}`,
            borderRadius: 10, padding: '12px 16px', overflowX: 'auto',
            margin: '8px 0', lineHeight: 1.6,
            color: isUser ? '#fff' : '#18181b', whiteSpace: 'pre',
          }}>
            {s.lang && <span style={{ display: 'block', fontSize: 9, opacity: 0.45, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{s.lang}</span>}
            {s.content}
          </pre>
        ) : (
          <p key={i} className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
            style={{ color: isUser ? '#fff' : '#1a1a1a', margin: 0, fontFamily: SG }}>
            {s.content}
          </p>
        ))}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-100 space-y-0.5">
            {msg.sources.slice(0, 2).map((src, i) => (
              <p key={i} className="text-[11px] text-zinc-400 truncate">{src.preview?.slice(0, 90)}…</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0">
        <GraduationCap size={13} className="text-white" />
      </div>
      <div className="bg-white border border-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }} />
        ))}
      </div>
    </div>
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Explain the most important concepts',
  'What should I focus on for the exam?',
  'Summarise the main themes',
  'What are the most common question types?',
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AIChat() {
  const [materials, setMaterials]         = useState<StudyMaterial[]>([]);
  const [selectedMats, setSelectedMats]   = useState<number[]>([]);
  const [contextOpen, setContextOpen]     = useState(false);
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [listening, setListening]         = useState(false);
  const [ttsEnabled, setTtsEnabled]       = useState(false);

  const bottomRef      = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<{ stop?: () => void } | null>(null);
  const contextRef     = useRef<HTMLDivElement>(null);

  const ready = materials.filter((m) => m.processing_status === 'completed');

  useEffect(() => {
    materialsApi.list().then((res) => setMaterials(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Close context dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 600));
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }, [ttsEnabled]);

  const addMsg = (role: 'user' | 'assistant', content: string, sources?: Message['sources']) =>
    setMessages((prev) => [...prev, { id: `${Date.now()}-${role}-${Math.random()}`, role, content, sources, timestamp: new Date() }]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    addMsg('user', text);
    setLoading(true);
    try {
      const matIds = selectedMats.length > 0 ? selectedMats : undefined;
      const res = await qaApi.ask(text, undefined, matIds);
      const answer = res.data.answer as string;
      addMsg('assistant', answer, res.data.sources);
      speak(answer);
    } catch (err) {
      addMsg('assistant', `Sorry, I hit an error: ${extractDetail(err, 'Please try again.')}`);
    } finally {
      setLoading(false);
    }
  }, [input, loading, selectedMats, speak]);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Voice input not supported in this browser'); return; }
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.onresult = (e: any) => { setInput(e.results[0][0].transcript); textareaRef.current?.focus(); };
    r.onend = () => setListening(false);
    r.onerror = () => { toast.error('Voice input failed'); setListening(false); };
    r.start();
    recognitionRef.current = r;
    setListening(true);
  };
  const stopListening = () => { recognitionRef.current?.stop?.(); setListening(false); };

  const contextLabel = selectedMats.length === 0
    ? 'All materials'
    : selectedMats.length === 1
      ? (ready.find((m) => m.id === selectedMats[0])?.original_name ?? '1 material')
      : `${selectedMats.length} materials`;

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ fontFamily: SG }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="h-12 border-b border-zinc-100 bg-white flex items-center gap-3 px-5 flex-shrink-0">
        <MessageSquare size={14} className="text-zinc-400 flex-shrink-0" />
        <span className="font-semibold text-[14px] text-zinc-800">Chat</span>
        <div className="flex-1" />

        {/* Context picker */}
        <div ref={contextRef} className="relative">
          <button
            onClick={() => setContextOpen((o) => !o)}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-zinc-200 text-[12px] text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
          >
            <span className="max-w-[150px] truncate">{contextLabel}</span>
            <ChevronDown size={11} className={cn('transition-transform', contextOpen && 'rotate-180')} />
          </button>

          {contextOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-68 bg-white border border-zinc-200 rounded-xl shadow-xl z-50 py-1.5 max-h-72 overflow-y-auto" style={{ width: 260 }}>
              <div className="px-3 py-1.5">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Context</p>
              </div>
              {/* All materials */}
              <button
                onClick={() => { setSelectedMats([]); setContextOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 transition-colors text-left"
              >
                <div className={cn(
                  'w-4 h-4 rounded flex items-center justify-center border flex-shrink-0',
                  selectedMats.length === 0 ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-300'
                )}>
                  {selectedMats.length === 0 && <Check size={9} className="text-white" />}
                </div>
                <span className="text-[12.5px] text-zinc-700 font-medium">All materials</span>
              </button>

              {ready.length > 0 && <div className="border-t border-zinc-100 mx-3 my-1" />}

              {ready.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMats((prev) =>
                    prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                  )}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-50 transition-colors text-left"
                >
                  <div className={cn(
                    'w-4 h-4 rounded flex items-center justify-center border flex-shrink-0',
                    selectedMats.includes(m.id) ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-300'
                  )}>
                    {selectedMats.includes(m.id) && <Check size={9} className="text-white" />}
                  </div>
                  <span className="text-[12.5px] text-zinc-700 truncate">{m.original_name}</span>
                </button>
              ))}

              {ready.length === 0 && (
                <p className="text-[12px] text-zinc-400 text-center py-4 px-3">No processed materials yet</p>
              )}
            </div>
          )}
        </div>

        {/* TTS toggle */}
        <button
          onClick={() => setTtsEnabled((e) => !e)}
          title={ttsEnabled ? 'Disable read-aloud' : 'Enable read-aloud'}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
            ttsEnabled ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100 text-zinc-400'
          )}
        >
          {ttsEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
        </button>

        {/* Clear */}
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setInput(''); }}
            title="Clear conversation"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-400 transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-[#F7F8FA]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-13 h-13 bg-zinc-900 rounded-2xl flex items-center justify-center mb-4" style={{ width: 52, height: 52 }}>
              <GraduationCap size={24} className="text-white" />
            </div>
            <h2 className="font-bold text-zinc-900 text-[20px] mb-1.5">Ask anything</h2>
            <p className="text-[13px] text-zinc-400 mb-6 max-w-xs leading-relaxed">
              {selectedMats.length > 0
                ? `Answers grounded in ${contextLabel}`
                : 'General study assistant — pick materials from the top bar for document-grounded answers'}
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="text-[12.5px] bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-sm text-zinc-600 px-3.5 py-1.5 rounded-lg transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
            {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input ────────────────────────────────────────────────────────────── */}
      <div className="border-t border-zinc-100 bg-white px-4 py-3 flex-shrink-0">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
            }}
            placeholder="Ask anything… (Shift+Enter for new line)"
            className="flex-1 text-[14px] resize-none px-4 py-3 rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 transition min-h-[56px] max-h-40"
            style={{ fontFamily: SG }}
          />
          <div className="flex flex-col gap-1.5">
            <button
              onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop listening' : 'Voice input'}
              className={cn(
                'w-10 h-10 flex items-center justify-center rounded-xl transition-all',
                listening ? 'bg-zinc-900 text-white animate-pulse' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500'
              )}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || loading}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-black text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
        {selectedMats.length > 0 && (
          <p className="text-center text-[11px] text-zinc-400 mt-2">Answers grounded in {contextLabel}</p>
        )}
      </div>
    </div>
  );
}
