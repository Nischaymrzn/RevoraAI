/**
 * Quiz — full-screen, all-at-once MCQ experience.
 *
 * - No timer — answer questions in any order, any pace
 * - All questions visible at once in a scrollable list
 * - Submit when ready → inline results
 *
 * Font: Space Grotesk only · Palette: monochrome
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { quizzesApi } from '../services/api';

const SG = 'Space Grotesk, system-ui, sans-serif';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawQ {
  id: number;
  question: string;
  type: string;
  options: string[] | null;
  topic: string;
  difficulty: string;
  marks: number;
}

interface QuizData {
  id: number;
  title: string;
  quiz_type: string;
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
  explanation: string;
  topic: string;
  options: string[] | null;
}

// ─── Code-block renderer ─────────────────────────────────────────────────────

function QuestionText({ text }: { text: string }) {
  const parts: Array<{ code: boolean; lang?: string; content: string }> = [];
  const fence = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) parts.push({ code: false, content: text.slice(last, m.index) });
    parts.push({ code: true, lang: m[1] || undefined, content: m[2].trimEnd() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ code: false, content: text.slice(last) });
  if (!parts.length) parts.push({ code: false, content: text });

  return (
    <div>
      {parts.map((p, i) =>
        p.code ? (
          <pre key={i} style={{
            fontFamily: '"JetBrains Mono","Fira Code",monospace',
            fontSize: 12.5, lineHeight: 1.65,
            background: '#f4f4f5', border: '1px solid #e4e4e7',
            borderRadius: 8, padding: '12px 16px',
            overflowX: 'auto', margin: '10px 0', color: '#18181b', whiteSpace: 'pre',
          }}>
            {p.lang && <span style={{ display: 'block', fontSize: 9, color: '#a1a1aa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{p.lang}</span>}
            {p.content}
          </pre>
        ) : (
          <p key={i} style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: '#18181b', whiteSpace: 'pre-wrap' }}>{p.content}</p>
        )
      )}
    </div>
  );
}

// ─── Results screen ───────────────────────────────────────────────────────────

function ResultsScreen({
  score, correct, total, detailed, quiz, onRetry, onBack,
}: {
  score: number; correct: number; total: number;
  detailed: DetailedResult[]; quiz: QuizData;
  onRetry: () => void; onBack: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const pct = Math.round(score);
  const grade = pct >= 80 ? 'Distinction' : pct >= 60 ? 'Credit' : pct >= 40 ? 'Pass' : 'Below Pass';

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', fontFamily: SG }}>
      {/* Bar */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, background: '#18181b', zIndex: 50, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12 }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quiz.title}</span>
        <button onClick={onBack} style={{ color: '#a1a1aa', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← Back to Study</button>
      </div>

      <div style={{ paddingTop: 48 }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 80px' }}>

          {/* Score */}
          <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 20, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '36px 32px 28px', textAlign: 'center', borderBottom: '1px solid #f4f4f5' }}>
              <div style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Quiz Complete</div>
              <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1, color: '#18181b', letterSpacing: '-2px' }}>{pct}%</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#52525b', marginTop: 8 }}>{grade}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              {[
                { label: 'Correct', value: correct },
                { label: 'Wrong',   value: total - correct },
                { label: 'Total',   value: total },
              ].map((s, i) => (
                <div key={s.label} style={{ padding: '18px 0', textAlign: 'center', borderRight: i < 2 ? '1px solid #f4f4f5' : undefined }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#18181b' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-question review */}
          {detailed.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid #f4f4f5', fontSize: 13, fontWeight: 600, color: '#52525b' }}>
                Review — {total} Questions
              </div>
              {detailed.map((d, i) => {
                const isOpen = expanded.has(i);
                const toggle = () => setExpanded(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
                return (
                  <div key={i} style={{ borderBottom: i < detailed.length - 1 ? '1px solid #f4f4f5' : undefined }}>
                    <button onClick={toggle} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 22px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: d.is_correct ? '#18181b' : '#d4d4d8' }} />
                      <span style={{ fontSize: 12, color: '#a1a1aa', fontWeight: 600, width: 18, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 13, color: '#3f3f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.question.replace(/```[\s\S]*?```/g, '[code]')}
                      </span>
                      <span style={{ fontSize: 12, color: d.is_correct ? '#18181b' : '#a1a1aa', fontWeight: 600, flexShrink: 0 }}>
                        {d.is_correct ? '✓' : '✗'}
                      </span>
                      <span style={{ fontSize: 11, color: '#a1a1aa', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '4px 22px 18px', borderTop: '1px solid #f9f9f9' }}>
                        <div style={{ marginBottom: 14, paddingTop: 12 }}><QuestionText text={d.question} /></div>
                        {d.options && d.options.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                            {d.options.map((opt, oi) => {
                              const letter = LETTERS[oi] ?? String(oi + 1);
                              const display = opt.replace(/^[A-E]\.\s*/, '');
                              const isUserAns = d.user_answer === opt || d.user_answer?.trim().toUpperCase()[0] === letter;
                              const isCorrectAns = d.correct_answer?.trim().toUpperCase()[0] === letter;
                              return (
                                <div key={oi} style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 13px', borderRadius: 9, fontSize: 13,
                                  border: `1px solid ${isCorrectAns ? '#18181b' : isUserAns ? '#d4d4d8' : '#f4f4f5'}`,
                                  background: isCorrectAns ? '#18181b' : 'transparent',
                                  color: isCorrectAns ? '#fff' : '#3f3f46',
                                }}>
                                  <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: isCorrectAns ? 'rgba(255,255,255,0.15)' : '#f4f4f5', color: isCorrectAns ? '#fff' : '#71717a' }}>{letter}</span>
                                  <span style={{ flex: 1 }}>{display}</span>
                                  {isCorrectAns && <span style={{ fontSize: 11, opacity: 0.7 }}>✓</span>}
                                  {isUserAns && !isCorrectAns && <span style={{ fontSize: 11, color: '#a1a1aa' }}>your answer</span>}
                                </div>
                              );
                            })}
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
            <button onClick={onRetry} style={{ flex: 1, height: 44, borderRadius: 14, border: '1px solid #e4e4e7', background: '#fff', color: '#3f3f46', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: SG }}>Retake Quiz</button>
            <button onClick={onBack}  style={{ flex: 1, height: 44, borderRadius: 14, border: 'none', background: '#18181b', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: SG }}>Back to Study</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Quiz page ───────────────────────────────────────────────────────────

export default function Quiz() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate   = useNavigate();

  const [quiz,       setQuiz]       = useState<QuizData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState('');
  const [answers,    setAnswers]    = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const startedAt = useRef(Date.now());

  // Load
  useEffect(() => {
    if (!quizId) { navigate('/study'); return; }
    quizzesApi.get(Number(quizId))
      .then(res => setQuiz(res.data))
      .catch(() => setLoadError('Could not load quiz.'))
      .finally(() => setLoading(false));
  }, [quizId]);

  const submitQuiz = useCallback(async () => {
    if (!quiz || submitting) return;
    setSubmitting(true);
    const timeTaken = Math.floor((Date.now() - startedAt.current) / 1000);
    try {
      const res = await quizzesApi.submit(quiz.id, answers, timeTaken);
      setResultData(res.data);
    } catch {
      setSubmitting(false);
      alert('Submission failed — please try again.');
    }
  }, [quiz, submitting, answers]);

  const retry = () => {
    setResultData(null);
    setAnswers({});
    startedAt.current = Date.now();
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFA', fontFamily: SG }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 30, height: 30, border: '2px solid #18181b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' }} />
        <p style={{ color: '#a1a1aa', fontSize: 13 }}>Loading quiz…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (loadError || !quiz) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAFA', fontFamily: SG }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#71717a', marginBottom: 14 }}>{loadError || 'Quiz not found.'}</p>
        <button onClick={() => navigate('/study')} style={{ color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>← Go back</button>
      </div>
    </div>
  );

  if (resultData) return (
    <ResultsScreen
      score={resultData.score}
      correct={resultData.correct}
      total={resultData.total}
      detailed={resultData.detailed_results ?? []}
      quiz={quiz}
      onRetry={retry}
      onBack={() => navigate('/study')}
    />
  );

  const answeredCount = Object.values(answers).filter(a => a?.trim()).length;
  const total = quiz.questions.length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA', fontFamily: SG }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Top bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 52,
        background: '#18181b', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px',
      }}>
        <button onClick={() => navigate('/study')} style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quiz.title}</span>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {answeredCount}/{total} answered
        </span>
        <button
          onClick={submitQuiz}
          disabled={submitting}
          style={{
            height: 34, padding: '0 18px', borderRadius: 9,
            background: submitting ? '#3f3f46' : '#fff',
            color: submitting ? '#a1a1aa' : '#18181b',
            border: 'none', fontWeight: 700, fontSize: 13,
            cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: SG,
            flexShrink: 0,
          }}
        >
          {submitting ? 'Grading…' : 'Submit Quiz'}
        </button>
      </div>

      {/* Question list */}
      <div style={{ paddingTop: 52, maxWidth: 720, margin: '0 auto', padding: '52px 16px 80px' }}>

        {/* Header */}
        <div style={{ padding: '24px 0 20px' }}>
          <p style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
            Multiple Choice · {total} Questions · No Time Limit
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {quiz.questions.map((q, i) => {
            const hasOpts = Array.isArray(q.options) && q.options.length > 0;
            const currentAnswer = answers[String(i)];

            return (
              <div
                key={i}
                style={{
                  background: '#fff',
                  border: '1px solid #e4e4e7',
                  borderRadius: 18,
                  overflow: 'hidden',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                {/* Question header */}
                <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: currentAnswer ? '#18181b' : '#f4f4f5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                    color: currentAnswer ? '#fff' : '#71717a',
                    marginTop: 2,
                  }}>
                    {currentAnswer ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <QuestionText text={q.question} />
                    {q.topic && (
                      <p style={{ fontSize: 11, color: '#a1a1aa', margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {q.topic}
                      </p>
                    )}
                  </div>
                </div>

                {/* MCQ Options */}
                {hasOpts && (
                  <div style={{ padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {q.options!.map((opt, oi) => {
                      const letter = LETTERS[oi] ?? String(oi + 1);
                      const display = opt.replace(/^[A-E]\.\s*/, '');
                      const selected = currentAnswer === opt;
                      return (
                        <button
                          key={oi}
                          onClick={() => setAnswers(prev => ({ ...prev, [String(i)]: opt }))}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                            padding: '11px 16px', borderRadius: 11, textAlign: 'left',
                            border: `1px solid ${selected ? '#18181b' : '#e4e4e7'}`,
                            background: selected ? '#18181b' : '#fff',
                            cursor: 'pointer', transition: 'border-color 0.1s, background 0.1s',
                            fontFamily: SG,
                          }}
                        >
                          <div style={{
                            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700,
                            background: selected ? 'rgba(255,255,255,0.12)' : '#f4f4f5',
                            color: selected ? '#fff' : '#71717a',
                          }}>
                            {letter}
                          </div>
                          <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5, color: selected ? '#fff' : '#3f3f46' }}>
                            {display}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Fallback text input for non-MCQ */}
                {!hasOpts && (
                  <div style={{ padding: '0 24px 20px' }}>
                    <textarea
                      value={answers[String(i)] ?? ''}
                      onChange={e => setAnswers(prev => ({ ...prev, [String(i)]: e.target.value }))}
                      placeholder="Type your answer…"
                      style={{
                        width: '100%', padding: '12px 16px',
                        border: '1px solid #e4e4e7', borderRadius: 10,
                        fontSize: 13.5, color: '#3f3f46', lineHeight: 1.65,
                        resize: 'vertical', outline: 'none', fontFamily: SG,
                        minHeight: 90, boxSizing: 'border-box', background: '#fafafa',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom submit */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={() => navigate('/study')}
            style={{ height: 44, padding: '0 22px', borderRadius: 12, border: '1px solid #e4e4e7', background: '#fff', color: '#52525b', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: SG }}
          >
            Cancel
          </button>
          <button
            onClick={submitQuiz}
            disabled={submitting || answeredCount === 0}
            style={{
              height: 44, padding: '0 28px', borderRadius: 12, border: 'none',
              background: answeredCount > 0 ? '#18181b' : '#e4e4e7',
              color: answeredCount > 0 ? '#fff' : '#a1a1aa',
              fontWeight: 700, fontSize: 13,
              cursor: submitting || answeredCount === 0 ? 'not-allowed' : 'pointer',
              fontFamily: SG,
            }}
          >
            {submitting ? 'Grading…' : `Submit Quiz (${answeredCount}/${total})`}
          </button>
        </div>
      </div>
    </div>
  );
}
