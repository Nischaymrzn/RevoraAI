/**
 * MockTest — full-screen exam page, no sidebar / navbar.
 * Route: /mock/:quizId
 *
 * One question per page · per-type timer (MCQ 90s / Short 240s / Long 480s)
 * Rich results: marks, feedback, key points, collapsible review
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mockTestsApi } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type QType = 'mcq' | 'short_answer' | 'long_answer';

interface RawQ {
  id: number;
  question: string;
  type: QType;
  options: string[] | null;
  topic: string;
  difficulty?: string;
  marks: number;
}

interface QuizData {
  id: number;
  title: string;
  quiz_type?: string;
  time_limit?: number;
  questions: RawQ[];
}

interface DetailedResult {
  question: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  marks_awarded: number;
  max_marks: number;
  feedback: string;
  key_points_hit: string[];
  key_points_missed: string[];
  explanation: string;
  topic: string;
  options: string[] | null;
  question_type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SG = 'Space Grotesk, system-ui, sans-serif';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const TYPE_TIMER: Record<string, number> = { mcq: 90, short_answer: 240, long_answer: 480 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function parseSegs(text: string) {
  const out: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', content: text.slice(last, m.index) });
    out.push({ type: 'code', content: m[2].trimEnd(), lang: m[1] || undefined });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', content: text.slice(last) });
  return out.length ? out : [{ type: 'text' as const, content: text }];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RingTimer({ value, max }: { value: number; max: number }) {
  const r = 17, C = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, value / max) : 0;
  const critical = pct < 0.2;
  return (
    <svg width={42} height={42} viewBox="0 0 42 42" style={{ flexShrink: 0 }}>
      <circle cx={21} cy={21} r={r} fill="none" stroke="#e4e4e7" strokeWidth={2.5} />
      <circle cx={21} cy={21} r={r} fill="none"
        stroke={critical ? '#ef4444' : '#18181b'} strokeWidth={2.5} strokeLinecap="round"
        strokeDasharray={`${pct * C} ${C}`} strokeDashoffset={0}
        transform="rotate(-90 21 21)"
        style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.3s' }}
      />
    </svg>
  );
}

function QText({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: SG }}>
      {parseSegs(text).map((s, i) =>
        s.type === 'code' ? (
          <pre key={i} style={{
            fontFamily: '"JetBrains Mono","Fira Code","Consolas",monospace',
            fontSize: 13, background: '#f4f4f5', border: '1px solid #e4e4e7',
            borderRadius: 10, padding: '14px 18px', overflowX: 'auto',
            margin: '12px 0', lineHeight: 1.65, color: '#18181b', whiteSpace: 'pre',
          }}>
            {s.lang && <span style={{ display: 'block', fontSize: 10, color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{s.lang}</span>}
            {s.content}
          </pre>
        ) : (
          <p key={i} style={{ fontSize: 16, lineHeight: 1.7, color: '#18181b', margin: 0, whiteSpace: 'pre-wrap' }}>{s.content}</p>
        )
      )}
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  score, total, correct, marksAwarded, totalMarks, weakTopics, detailed, quiz, onBack, onRetry,
}: {
  score: number; total: number; correct: number; marksAwarded: number; totalMarks: number;
  weakTopics: string[]; detailed: DetailedResult[]; quiz: QuizData;
  onBack: () => void; onRetry: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const pct   = Math.round(score);
  const grade = pct >= 80 ? 'Distinction' : pct >= 60 ? 'Credit' : pct >= 40 ? 'Pass' : 'Below Pass';

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', fontFamily: SG }}>
      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, background: '#18181b', zIndex: 50, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12 }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quiz.title}</span>
        <button onClick={onBack} style={{ color: '#a1a1aa', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: SG }}>
          ← Back to Mock Tests
        </button>
      </div>

      <div style={{ paddingTop: 48 }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '36px 16px 80px' }}>

          {/* Score block */}
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 20, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '40px 32px 32px', textAlign: 'center', borderBottom: '1px solid #f4f4f5' }}>
              <div style={{ fontSize: 13, color: '#71717a', fontWeight: 500, marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Mock Test Complete</div>
              <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, color: '#18181b', letterSpacing: '-2px' }}>{pct}%</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#52525b', marginTop: 8 }}>{grade}</div>
              {totalMarks > 0 && <div style={{ fontSize: 13, color: '#a1a1aa', marginTop: 6 }}>{marksAwarded} / {totalMarks} marks</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {[{ label: 'Correct', value: correct }, { label: 'Wrong', value: total - correct }, { label: 'Questions', value: total }].map((s, i) => (
                <div key={s.label} style={{ padding: '20px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid #f4f4f5' : undefined }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#18181b' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weak topics */}
          {weakTopics.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Topics to Review</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {weakTopics.map((t) => (
                  <span key={t} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: '1px solid #e4e4e7', color: '#52525b', background: '#fafafa' }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Question review */}
          {detailed.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f4f4f5', fontSize: 13, fontWeight: 600, color: '#52525b' }}>
                Review — {total} Questions
              </div>
              {detailed.map((d, i) => {
                const isOpen = open === i;
                const isMCQ  = d.question_type === 'mcq' || Boolean(d.options?.length);
                return (
                  <div key={i} style={{ borderBottom: i < detailed.length - 1 ? '1px solid #f4f4f5' : undefined }}>
                    <button
                      onClick={() => setOpen(isOpen ? null : i)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: SG }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: d.is_correct ? '#18181b' : '#d4d4d8' }} />
                      <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600, flexShrink: 0, width: 20 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 13, color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.question.replace(/```[\s\S]*?```/g, '[code]')}
                      </span>
                      <span style={{ fontSize: 12, color: d.is_correct ? '#18181b' : '#a1a1aa', fontWeight: 600, flexShrink: 0 }}>
                        {d.marks_awarded ?? (d.is_correct ? d.max_marks : 0)}/{d.max_marks}
                      </span>
                      <span style={{ fontSize: 11, color: '#a1a1aa', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 24px 20px', borderTop: '1px solid #f9f9f9' }}>
                        <div style={{ marginBottom: 16, paddingTop: 16 }}><QText text={d.question} /></div>

                        {isMCQ && d.options && d.options.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                            {d.options.map((opt, oi) => {
                              const letter    = LETTERS[oi] ?? String(oi + 1);
                              const display   = opt.replace(/^[A-E]\.\s*/, '');
                              const isUserAns = d.user_answer === opt || d.user_answer?.trim().toUpperCase()[0] === letter;
                              const isCorrect = d.correct_answer?.trim().toUpperCase()[0] === letter;
                              return (
                                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, fontSize: 13, border: `1px solid ${isCorrect ? '#18181b' : isUserAns && !isCorrect ? '#d4d4d8' : '#f4f4f5'}`, background: isCorrect ? '#18181b' : 'transparent', color: isCorrect ? '#fff' : '#3f3f46' }}>
                                  <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: isCorrect ? 'rgba(255,255,255,0.15)' : '#f4f4f5', color: isCorrect ? '#fff' : '#71717a' }}>{letter}</span>
                                  <span style={{ flex: 1 }}>{display}</span>
                                  {isCorrect && <span style={{ fontSize: 11, opacity: 0.7 }}>✓ Correct</span>}
                                  {isUserAns && !isCorrect && <span style={{ fontSize: 11, color: '#a1a1aa' }}>Your answer</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {!isMCQ && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                            {d.user_answer && (
                              <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e4e4e7', background: '#fafafa' }}>
                                <div style={{ fontSize: 10, color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Your Answer</div>
                                <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.6 }}>{d.user_answer}</p>
                              </div>
                            )}
                            <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #18181b' }}>
                              <div style={{ fontSize: 10, color: '#18181b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Model Answer</div>
                              <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.6 }}>{d.correct_answer}</p>
                            </div>
                          </div>
                        )}

                        {!isMCQ && d.marks_awarded !== undefined && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: '#f4f4f5', marginBottom: 10, fontSize: 12, color: '#52525b' }}>
                            <span style={{ fontWeight: 700, color: '#18181b' }}>{d.marks_awarded}/{d.max_marks} marks</span>
                            <span>·</span><span>{Math.round((d.marks_awarded / (d.max_marks || 1)) * 100)}%</span>
                            {d.feedback && <><span>·</span><span style={{ flex: 1 }}>{d.feedback}</span></>}
                          </div>
                        )}

                        {(d.key_points_hit?.length > 0 || d.key_points_missed?.length > 0) && (
                          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                            {d.key_points_hit?.length > 0 && (
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Covered</div>
                                {d.key_points_hit.map((p, pi) => <div key={pi} style={{ fontSize: 12, color: '#3f3f46', marginBottom: 3 }}>· {p}</div>)}
                              </div>
                            )}
                            {d.key_points_missed?.length > 0 && (
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Missed</div>
                                {d.key_points_missed.map((p, pi) => <div key={pi} style={{ fontSize: 12, color: '#a1a1aa', marginBottom: 3 }}>· {p}</div>)}
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
            <button onClick={onRetry} style={{ flex: 1, height: 46, borderRadius: 14, border: '1px solid #e4e4e7', background: '#fff', color: '#3f3f46', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: SG }}>
              Retake
            </button>
            <button onClick={onBack} style={{ flex: 1, height: 46, borderRadius: 14, border: 'none', background: '#18181b', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: SG }}>
              Back to Mock Tests
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MockTest() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();

  const [quiz,       setQuiz]       = useState<QuizData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState('');
  const [idx,        setIdx]        = useState(0);
  const [answers,    setAnswers]    = useState<Record<string, string>>({});
  const [flagged,    setFlagged]    = useState<Set<number>>(new Set());
  const [timeLeft,   setTimeLeft]   = useState(90);
  const [perQ,       setPerQ]       = useState(90);
  const [timeLocked, setTimeLocked] = useState(false);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt  = useRef(Date.now());
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [resultData,  setResultData]  = useState<any>(null);

  const goBack = useCallback(() => navigate('/study?tab=mock'), [navigate]);

  // Load
  useEffect(() => {
    if (!quizId) { navigate('/study?tab=mock'); return; }
    mockTestsApi.get(Number(quizId))
      .then((res) => setQuiz(res.data))
      .catch(() => setLoadError('Could not load mock test.'))
      .finally(() => setLoading(false));
  }, [quizId]);

  // Per-question timer
  useEffect(() => {
    if (!quiz || submitted) return;
    const q = quiz.questions[idx];
    if (!q) return;
    const hasOpts  = Array.isArray(q.options) && q.options.length > 0;
    const effType  = hasOpts ? 'mcq' : (q.type ?? 'short_answer');
    const budget   = TYPE_TIMER[effType] ?? 120;
    setPerQ(budget); setTimeLeft(budget); setTimeLocked(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => { if (t <= 1) { clearInterval(timerRef.current!); setTimeLocked(true); return 0; } return t - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, quiz?.id, submitted]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (submitted) return;
      const q = quiz?.questions[idx];
      if (!q) return;
      const hasOpts = Array.isArray(q.options) && q.options.length > 0;
      if (hasOpts && !timeLocked) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= q.options!.length) { setAnswers((prev) => ({ ...prev, [String(idx)]: q.options![n - 1] })); return; }
      }
      if (e.key === 'Enter' && answers[String(idx)]) advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, idx, timeLocked, answers, submitted]);

  const submitAll = useCallback(async () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    const timeTaken = Math.floor((Date.now() - startedAt.current) / 1000);
    try {
      const res = await mockTestsApi.submit(quiz.id, answers, timeTaken);
      setResultData(res.data); setSubmitted(true);
    } catch { setSubmitting(false); alert('Submission failed — please try again.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, submitting, answers]);

  const advance = useCallback(() => {
    if (!quiz) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (idx < quiz.questions.length - 1) setIdx((i) => i + 1);
    else void submitAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, idx, submitAll]);

  const goBackQ = () => {
    if (idx === 0) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setIdx((i) => i - 1);
  };

  // Guards
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFA', fontFamily: SG }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #18181b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p style={{ color: '#a1a1aa', fontSize: 14 }}>Loading mock test…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (loadError || !quiz) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFA', fontFamily: SG }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#71717a', marginBottom: 16 }}>{loadError || 'Mock test not found.'}</p>
        <button onClick={goBack} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: SG }}>← Go back</button>
      </div>
    </div>
  );

  if (submitted && resultData) return (
    <ResultsScreen
      score={resultData.score} total={resultData.total} correct={resultData.correct}
      marksAwarded={resultData.marks_awarded ?? resultData.correct}
      totalMarks={resultData.total_marks ?? resultData.total}
      weakTopics={resultData.weak_topics ?? []}
      detailed={resultData.detailed_results ?? []}
      quiz={quiz}
      onBack={goBack}
      onRetry={() => { setSubmitted(false); setResultData(null); setIdx(0); setAnswers({}); setFlagged(new Set()); startedAt.current = Date.now(); }}
    />
  );

  const q           = quiz.questions[idx];
  const isLast      = idx === quiz.questions.length - 1;
  const hasAnswer   = Boolean(answers[String(idx)]?.trim());
  const progressPct = ((idx + 1) / quiz.questions.length) * 100;
  const critical    = timeLeft <= 10;
  const almostDone  = timeLeft <= perQ * 0.35 && !critical;
  const hasOpts     = Array.isArray(q.options) && q.options.length > 0;
  const effType: QType = hasOpts ? 'mcq' : (q.type === 'long_answer' ? 'long_answer' : 'short_answer');
  const qMarks      = q.marks ?? (effType === 'mcq' ? 2 : effType === 'long_answer' ? 10 : 5);

  const TYPE_LABEL = { mcq: 'Multiple Choice', short_answer: 'Short Answer', long_answer: 'Long Answer' };

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', fontFamily: SG }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, background: '#18181b', zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quiz.title}</span>
        <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }}>
          <div style={{ height: '100%', background: '#fff', borderRadius: 2, width: `${progressPct}%`, transition: 'width 0.4s' }} />
        </div>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{idx + 1}/{quiz.questions.length}</span>
        <button
          onClick={() => setFlagged((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; })}
          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: `1px solid ${flagged.has(idx) ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.15)'}`, background: flagged.has(idx) ? 'rgba(251,191,36,0.1)' : 'transparent', color: flagged.has(idx) ? '#fbbf24' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: SG }}
        >⚑ {flagged.has(idx) ? 'Flagged' : 'Flag'}</button>
        <button onClick={goBack} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      {/* Content */}
      <div style={{ paddingTop: 48, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 700, paddingTop: 28, paddingBottom: 60, paddingLeft: 16, paddingRight: 16 }}>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(['mcq', 'short_answer', 'long_answer'] as QType[]).map((t) => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, fontWeight: 600, border: '1px solid', borderColor: effType === t ? '#18181b' : '#e4e4e7', background: effType === t ? '#18181b' : 'transparent', color: effType === t ? '#fff' : '#a1a1aa' }}>
                  {TYPE_LABEL[t]}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {q.topic && <span style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.06em', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.topic}</span>}
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid #e4e4e7', color: '#a1a1aa' }}>{qMarks} {qMarks === 1 ? 'mark' : 'marks'}</span>
            </div>
          </div>

          {/* Timer + advance */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#a1a1aa' }}>Q{idx + 1} <span style={{ color: '#d4d4d8' }}>of {quiz.questions.length}</span></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RingTimer value={timeLeft} max={perQ} />
                <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px', color: critical ? '#ef4444' : almostDone ? '#78716c' : '#18181b' }}>
                  {fmt(timeLeft)}
                </span>
              </div>
              <button
                onClick={advance}
                disabled={submitting || (!hasAnswer && !timeLocked)}
                style={{ height: 38, padding: '0 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', cursor: submitting || (!hasAnswer && !timeLocked) ? 'not-allowed' : 'pointer', background: submitting ? '#d4d4d8' : hasAnswer ? '#18181b' : timeLocked ? '#52525b' : '#e4e4e7', color: submitting ? '#a1a1aa' : hasAnswer || timeLocked ? '#fff' : '#a1a1aa', fontFamily: SG, transition: 'background 0.15s' }}
              >
                {submitting ? 'Grading…' : isLast ? 'Submit ✓' : timeLocked ? 'Skip →' : 'Next →'}
              </button>
            </div>
          </div>

          {/* Question card */}
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '24px 28px', marginBottom: 14, boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
            <QText text={q.question} />
          </div>

          {/* Time locked banner */}
          {timeLocked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderRadius: 12, marginBottom: 14, border: '1px solid #e4e4e7', background: '#fafafa' }}>
              <span style={{ fontSize: 18 }}>⏱</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#3f3f46' }}>Time's up for this question</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#a1a1aa' }}>{hasAnswer ? 'Answer recorded. Click Next to continue.' : 'No answer. Click Skip to continue.'}</p>
              </div>
            </div>
          )}

          {/* MCQ options */}
          {effType === 'mcq' && q.options && q.options.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {q.options.map((opt, oi) => {
                const selected = answers[String(idx)] === opt;
                const letter   = LETTERS[oi] ?? String(oi + 1);
                return (
                  <button key={oi} onClick={() => { if (!timeLocked) setAnswers((prev) => ({ ...prev, [String(idx)]: opt })); }} disabled={timeLocked}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderRadius: 14, textAlign: 'left', border: `1px solid ${selected ? '#18181b' : '#e4e4e7'}`, background: selected ? '#18181b' : '#fff', cursor: timeLocked ? 'not-allowed' : 'pointer', opacity: timeLocked ? 0.5 : 1, transition: 'all 0.12s', fontFamily: SG }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: selected ? 'rgba(255,255,255,0.12)' : '#f4f4f5', color: selected ? '#fff' : '#71717a' }}>{letter}</div>
                    <span style={{ flex: 1, fontSize: 14, lineHeight: 1.5, color: selected ? '#fff' : '#3f3f46' }}>{opt.replace(/^[A-E]\.\s*/, '')}</span>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, border: `1px solid ${selected ? 'rgba(255,255,255,0.2)' : '#e4e4e7'}`, color: selected ? 'rgba(255,255,255,0.5)' : '#d4d4d8', fontFamily: 'monospace' }}>{oi + 1}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Written answer */}
          {(effType === 'short_answer' || effType === 'long_answer') && (
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: `1px solid ${timeLocked ? '#e4e4e7' : '#d4d4d8'}`, boxShadow: '0 1px 8px rgba(0,0,0,0.04)', marginBottom: 14, opacity: timeLocked ? 0.6 : 1 }}>
              <textarea
                disabled={timeLocked}
                value={answers[String(idx)] ?? ''}
                onChange={(e) => { if (!timeLocked) setAnswers((prev) => ({ ...prev, [String(idx)]: e.target.value })); }}
                placeholder={effType === 'long_answer' ? 'Write a detailed, structured answer here…' : 'Type your answer here…'}
                style={{ width: '100%', padding: '20px 24px', fontSize: 14, color: '#3f3f46', lineHeight: 1.75, resize: 'vertical', outline: 'none', border: 'none', background: 'transparent', minHeight: effType === 'long_answer' ? 220 : 130, fontFamily: SG, boxSizing: 'border-box' }}
              />
              <div style={{ padding: '8px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f4f4f5' }}>
                <span style={{ fontSize: 11, color: '#d4d4d8' }}>{effType === 'long_answer' ? 'Aim for a structured, detailed response' : 'Be concise and precise'}</span>
                <span style={{ fontSize: 11, color: '#a1a1aa' }}>{(answers[String(idx)] ?? '').split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
            <button onClick={goBackQ} disabled={idx === 0} style={{ fontSize: 13, color: '#a1a1aa', background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontFamily: SG }}>
              ← Previous
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {quiz.questions.map((_, i) => (
                <button key={i} onClick={() => { if (timerRef.current) clearInterval(timerRef.current); setIdx(i); }}
                  style={{ borderRadius: 999, width: i === idx ? 20 : 9, height: 9, background: i === idx ? '#18181b' : answers[String(i)] ? '#71717a' : flagged.has(i) ? '#d4d4d8' : '#e4e4e7', border: 'none', cursor: 'pointer', transition: 'width 0.25s, background 0.2s', padding: 0 }}
                />
              ))}
            </div>
            <span style={{ fontSize: 11, color: '#d4d4d8' }}>{effType === 'mcq' ? `Press 1–${q.options?.length ?? 4} to pick` : 'Enter to advance'}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
