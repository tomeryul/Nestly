import { useEffect, useRef, useState } from "react";
import { ArrowUp, CalendarClock, Check, CircleCheck, ShoppingCart, Sparkles, TriangleAlert } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { announceDataChanged } from "../lib/cache";
import { dayLabel } from "../lib/dates";
import { aiErrorText } from "../lib/ai";
import { applyAction, askHome, type AskAction } from "../lib/askHome";

type ActionState = { action: AskAction; state: "idle" | "busy" | "done" | "failed"; undo?: () => Promise<void> };
type Msg = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; text: string; actions: ActionState[] };

const SUGGESTIONS = ["מה יש לי היום?", "מה מחכה לנו השבוע?", "מה חסר ברשימת הקניות?", "מה אוכלים השבוע?", "אילו חבילות מחכות לאיסוף?", "מה נשאר לנקות השבוע?"];

// The conversation outlives the sheet for as long as the app is open, so
// closing it to check something and coming back doesn't lose the thread.
const memory = new Map<string, Msg[]>();

const DONE_LABEL = { schedule_tasks: "לסמן כבוצע", personal_tasks: "לסמן כבוצעה", shopping_items: "לסמן כנקנה" } as const;

function describe(a: AskAction) {
  if (a.type === "reschedule") return { icon: <CalendarClock />, title: a.title, detail: `${dayLabel(a.from_date, a.from_time)} ← ${dayLabel(a.date, a.time)}` };
  if (a.type === "done") return { icon: <CircleCheck />, title: a.title, detail: DONE_LABEL[a.table] };
  return { icon: <ShoppingCart />, title: a.name, detail: `להוסיף לקניות · ${a.category}` };
}

/**
 * Questions about the home, answered from its own data. When the person asks
 * for a change, each proposed change shows as a row they confirm on its own —
 * nothing is written until they do, and each can be taken back.
 */
export default function AskHome({ homeId, listId, categories }: { homeId: string; listId: string | null; categories: string[] }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>(() => memory.get(homeId) ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastQuestion = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    memory.set(homeId, msgs);
  }, [homeId, msgs]);

  // Keep the latest question at the top of the view, with its answer under it.
  const count = msgs.length;
  useEffect(() => {
    if (!count) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastQuestion.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [count]);

  const send = async (q = draft.trim()) => {
    if (!q || busy) return;
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    const id = Date.now();
    setMsgs((m) => [...m, { id, role: "user", text: q }]);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const r = await askHome(homeId, q, history, categories);
      setMsgs((m) => [...m, { id: id + 1, role: "assistant", text: r.answer || "לא מצאתי תשובה לזה.", actions: r.actions.map((action) => ({ action, state: "idle" as const })) }]);
    } catch (e) {
      // Nothing came back: put the question back in the field to try again.
      setMsgs((m) => m.filter((x) => x.id !== id));
      setDraft(q);
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const patch = (msgId: number, i: number, p: Partial<ActionState>) =>
    setMsgs((all) => all.map((m) => (m.id === msgId && m.role === "assistant" ? { ...m, actions: m.actions.map((s, j) => (j === i ? { ...s, ...p } : s)) } : m)));

  const confirm = async (msgId: number, i: number, a: AskAction) => {
    patch(msgId, i, { state: "busy" });
    try {
      const undo = await applyAction(a, { homeId, userId: user?.id ?? null, listId });
      announceDataChanged();
      patch(msgId, i, { state: "done", undo });
    } catch (e) {
      console.error("[nestly] ask action failed", e);
      patch(msgId, i, { state: "failed" });
    }
  };

  const takeBack = async (msgId: number, i: number, undo: () => Promise<void>) => {
    patch(msgId, i, { state: "busy" });
    try {
      await undo();
      announceDataChanged();
      patch(msgId, i, { state: "idle", undo: undefined });
    } catch (e) {
      console.error("[nestly] ask undo failed", e);
      patch(msgId, i, { state: "done" });
    }
  };

  const lastUserId = [...msgs].reverse().find((m) => m.role === "user")?.id;

  return (
    <div className="ask">
      {msgs.length > 0 && (
        <button
          className="ask-new"
          onClick={() => {
            setMsgs([]);
            setError("");
          }}
          disabled={busy}
        >
          שיחה חדשה
        </button>
      )}
      {msgs.length === 0 ? (
        <div className="ask-intro">
          <p className="section-sub">
            שאלו כל דבר על הבית — הלוז, המשימות, הקניות, הארוחות, הניקיון והחבילות. התשובה נבנית רק מהנתונים שלכם. אפשר גם לבקש שינוי, כמו ״תעביר את רופא השיניים ליום חמישי״, ולאשר אותו.
          </p>
          <div className="ask-chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="nst-chip" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="ask-log" aria-live="polite">
          {msgs.map((m) =>
            m.role === "user" ? (
              <p key={m.id} className="ask-q" ref={m.id === lastUserId ? lastQuestion : undefined}>
                {m.text}
              </p>
            ) : (
              <div key={m.id} className="ask-a">
                <p className="ask-a-text">
                  <Sparkles size={14} aria-hidden /> {m.text}
                </p>
                {m.actions.length > 0 && (
                  <div className="nst-group ask-actions">
                    {m.actions.map((s, i) => {
                      const d = describe(s.action);
                      return (
                        <div key={i} className="nst-row ask-action" data-state={s.state}>
                          <span className="ask-action-ico" aria-hidden>
                            {s.state === "done" ? <Check /> : d.icon}
                          </span>
                          <span className="qa-row-body">
                            <span className="qa-row-title">{d.title}</span>
                            <span className="nst-meta">{s.state === "failed" ? "לא הצלחנו — נסו שוב" : s.state === "done" ? `בוצע · ${d.detail}` : d.detail}</span>
                          </span>
                          {s.state === "done" && s.undo ? (
                            <button className="btn btn-sm" onClick={() => takeBack(m.id, i, s.undo!)}>
                              ביטול
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-primary" onClick={() => confirm(m.id, i, s.action)} disabled={s.state === "busy"}>
                              {s.state === "busy" ? "…" : s.state === "failed" ? "שוב" : "אישור"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ),
          )}
          {busy && (
            <p className="ask-a-text ask-thinking">
              <Sparkles size={14} className="nst-ai-pulse" aria-hidden /> בודק בבית…
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="alert qa-error" role="alert">
          <TriangleAlert /> {error}
        </p>
      )}

      <form
        className="ask-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="מה תרצו לדעת?"
          enterKeyHint="send"
          maxLength={500}
          aria-label="שאלה על הבית"
        />
        <button type="submit" className="ask-send" disabled={!draft.trim() || busy} aria-label="שליחה">
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
