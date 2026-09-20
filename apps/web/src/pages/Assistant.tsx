import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { askAssistant, sendAssistantFeedback, type AssistantTurn } from '@/lib/api';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  logId?: number;
  sql?: string[];
  model?: string;
  costInr?: number;
  fromMemory?: boolean;
  rating?: 1 | -1;
  isError?: boolean;
};

const SUGGESTIONS: Record<string, string[]> = {
  finance: [
    'Who are our top 5 customers by outstanding amount?',
    'What were our total sales in FY 2025-26?',
    'How much do we owe vendors in bills older than 45 days?',
    'What was our net profit last financial year?',
  ],
  sales: [
    'How many orders did we raise this month?',
    'How many orders are in each status right now?',
    'Which orders are approved but not yet dispatched?',
  ],
  ops: [
    'Which items are below their minimum stock level?',
    'How many purchase orders are open and not yet received?',
    'Which purchase indents are pending approval?',
  ],
};

function suggestionsFor(role: string | undefined): string[] {
  if (role === 'admin' || role === 'manager' || role === 'accountant') return SUGGESTIONS.finance;
  if (role === 'salesperson') return SUGGESTIONS.sales;
  return SUGGESTIONS.ops;
}

export default function Assistant() {
  const { user } = useAuth();
  const access = user?.agent_access;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [deep, setDeep] = useState(false);
  const [web, setWeb] = useState(false);
  const [openSql, setOpenSql] = useState<Record<number, boolean>>({});
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    const history: AssistantTurn[] = messages
      .filter((m) => !m.isError)
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { id: nextId.current++, role: 'user', content: question }]);
    setInput('');
    setLoading(true);
    try {
      const r = await askAssistant({ question, history, deep: deep && !!access?.deep, allow_web: web && !!access?.web });
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++, role: 'assistant', content: r.answer, logId: r.log_id, sql: r.sql,
          model: r.model, costInr: r.cost_inr, fromMemory: r.used_saved_answer,
        },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: nextId.current++, role: 'assistant', content: e?.message || 'Something went wrong. Please try again.', isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function rate(m: Message, rating: 1 | -1) {
    if (!m.logId || m.rating) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, rating } : x)));
    try {
      await sendAssistantFeedback(m.logId, rating);
    } catch {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, rating: undefined } : x)));
    }
  }

  function reset() {
    setMessages([]);
    setOpenSql({});
    setInput('');
  }

  if (!access?.enabled) {
    return <div className="py-24 text-center text-gray-400">The data assistant is not enabled for your role.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 11rem)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-800">Ask your data</h1>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
            <RotateCcw className="w-3.5 h-3.5" /> New chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm text-gray-600 mb-3">
              Ask in plain English. I look up the answer in your live data and tell you how I got it.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestionsFor(user?.role).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%] w-full">
                <div
                  className={`rounded-2xl rounded-bl-sm px-4 py-3 text-sm whitespace-pre-wrap border ${
                    m.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-800'
                  }`}
                >
                  {m.content}
                </div>

                {!m.isError && (
                  <div className="mt-1.5 ml-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    {m.sql && m.sql.length > 0 && (
                      <button
                        onClick={() => setOpenSql((o) => ({ ...o, [m.id]: !o[m.id] }))}
                        className="flex items-center gap-0.5 hover:text-gray-700"
                      >
                        {openSql[m.id] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        How I got this
                      </button>
                    )}
                    {m.logId && (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => rate(m, 1)}
                          disabled={!!m.rating}
                          title="Correct: remember this way of answering"
                          className={`p-1 rounded hover:bg-gray-100 ${m.rating === 1 ? 'text-green-600' : ''}`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => rate(m, -1)}
                          disabled={!!m.rating}
                          title="Wrong or unhelpful"
                          className={`p-1 rounded hover:bg-gray-100 ${m.rating === -1 ? 'text-red-600' : ''}`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        {m.rating === 1 && <span className="text-green-600">Saved for next time</span>}
                        {m.rating === -1 && <span>Thanks, noted</span>}
                      </span>
                    )}
                    {m.fromMemory && <span>Used a saved answer</span>}
                    {user?.role === 'admin' && m.costInr != null && (
                      <span>{m.model} · ₹{m.costInr.toFixed(2)}</span>
                    )}
                  </div>
                )}

                {openSql[m.id] && m.sql && (
                  <pre className="mt-1.5 ml-1 p-3 rounded-lg bg-gray-900 text-gray-100 text-xs overflow-x-auto whitespace-pre-wrap">
                    {m.sql.join('\n\n')}
                  </pre>
                )}
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 ml-1">
            <Loader2 className="w-4 h-4 animate-spin" /> Looking that up…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 bg-gray-50 pt-2 pb-3">
        {(access.deep || access.web) && (
          <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
            {access.deep && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
                Deep analysis (slower, more thorough)
              </label>
            )}
            {access.web && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />
                Also search the web
              </label>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Ask a question about your sales, purchases, outstanding, profit…"
            className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          Answers come from your live data. Check important numbers before acting on them. Tax and legal points should be confirmed with your CA.
        </p>
      </div>
    </div>
  );
}
