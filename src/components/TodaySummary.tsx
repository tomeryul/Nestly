import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, RefreshCw, Sparkles } from "lucide-react";
import { readCache, writeCache } from "../lib/cache";
import { AiError, aiErrorText, callAi } from "../lib/ai";
import { toISODate } from "../lib/dates";
import { openAssistant } from "./QuickAdd";

/**
 * "Today at home" in two or three sentences, on the home screen. Written by the
 * AI once a day for the whole home — the first phone to open the screen that day
 * has it written, everyone else gets the same text from the server — and kept on
 * the device, so opening the app again costs nothing. Refresh writes a new one
 * for everyone. Until the AI is connected (or when its credit runs out) the card
 * simply isn't there.
 */
export default function TodaySummary({ homeId, ready, cleanLeft, mealCount }: { homeId: string; ready: boolean; cleanLeft: number; mealCount: number }) {
  const key = `ai.summary.${homeId}.${toISODate(new Date())}`;
  const [text, setText] = useState<string | null>(() => readCache<string>(key) ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);
  const tried = useRef(false);

  const run = useCallback(async (force: boolean) => {
    setBusy(true);
    setError("");
    try {
      const r = await callAi<{ text: string }>("summary", homeId, { clean_left: cleanLeft, meals_this_week: mealCount, force });
      setText(r.text);
      writeCache(key, r.text);
    } catch (e) {
      // Not set up (or out of credit): stay out of the way rather than nag on every visit.
      if (e instanceof AiError && ["no_key", "bad_key", "credit"].includes(e.code)) setHidden(true);
      else setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  }, [homeId, key, cleanLeft, mealCount]);

  useEffect(() => {
    if (ready && !text && !tried.current) {
      tried.current = true;
      run(false);
    }
  }, [ready, text, run]);

  if (hidden || (!text && !busy && !error)) return null;
  return (
    <div className="nst-card nst-ai-summary" aria-live="polite">
      <div className="nst-subhead" style={{ paddingTop: 0 }}>
        <Sparkles size={13} /> היום בקצרה
        <button className="nst-del" style={{ marginInlineStart: "auto", padding: 6 }} onClick={() => run(true)} disabled={busy} title="סיכום מחדש" aria-label="סיכום מחדש">
          <RefreshCw size={15} className={busy ? "nst-ai-pulse" : undefined} />
        </button>
      </div>
      {text ? (
        <p className="nst-ai-summary-text" style={{ opacity: busy ? 0.5 : 1 }}>{text}</p>
      ) : busy ? (
        <p className="section-sub">מסכם את היום…</p>
      ) : (
        <p className="section-sub">{error}</p>
      )}
      <button className="btn btn-sm nst-ai-btn" style={{ alignSelf: "flex-start" }} onClick={() => openAssistant("ask")}>
        <MessageCircleQuestion size={15} /> שאלה על הבית
      </button>
    </div>
  );
}
