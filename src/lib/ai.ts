import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { toISODate } from "./dates";

/**
 * Client for the `ai` edge function — every AI feature in the app (quick add,
 * recipe ingredients, task steps, weekly menu, today's summary) goes through it.
 * The function only proposes; callers show the proposal and write what's kept.
 */

const MESSAGES: Record<string, string> = {
  no_key: "ה-AI עוד לא מחובר: צריך להגדיר מפתח Anthropic בהגדרות השרת.",
  bad_key: "מפתח ה-AI בשרת לא תקין.",
  credit: "נגמר הקרדיט של ה-AI.",
  rate: "הרבה בקשות AI בשעה האחרונה — נסו שוב מאוחר יותר.",
  busy: "ה-AI עמוס כרגע. נסו שוב בעוד רגע.",
  refusal: "ה-AI לא עיבד את הבקשה הזו. נסו לנסח אחרת.",
  too_long: "הבקשה ארוכה מדי — נסו לקצר.",
  no_dishes: "קודם צריך מאכלים קבועים — ה-AI בוחר מתוכם.",
  offline: "אין חיבור כרגע. נסו שוב כשיחזור.",
};

export class AiError extends Error {
  constructor(public code: string) {
    super(MESSAGES[code] ?? "לא הצלחנו לקבל תשובה מה-AI. נסו שוב.");
  }
}

export async function callAi<T>(action: string, homeId: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new AiError("offline");
  const now = new Date();
  const { data, error } = await supabase.functions.invoke("ai", {
    body: { action, home_id: homeId, today: toISODate(now), now: now.toTimeString().slice(0, 5), ...payload },
  });
  if (error) {
    let code = "unknown";
    if (error instanceof FunctionsHttpError) {
      try {
        code = (await error.context.json())?.error ?? code;
      } catch {
        /* not json */
      }
    }
    throw new AiError(code);
  }
  return data as T;
}

/** The message to show for anything an AI call threw. */
export const aiErrorText = (e: unknown) => (e instanceof AiError ? e.message : "לא הצלחנו להתחבר. בדקו את החיבור ונסו שוב.");
