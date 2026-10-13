import { supabase } from "./supabase";
import { callAi } from "./ai";
import { applyPlan } from "./quickAdd";

/**
 * "Ask the home": a question about the household's own data, answered by the
 * AI from a snapshot the server builds. When the person asks to change
 * something, the answer carries proposed actions — the app shows each one and
 * writes it only when they confirm it, with an undo.
 */
export type AskAction =
  | { type: "reschedule"; id: string; title: string; date: string; time: string | null; from_date: string; from_time: string | null }
  | { type: "done"; table: "schedule_tasks" | "personal_tasks" | "shopping_items"; id: string; title: string }
  | { type: "add_shopping"; name: string; category: string };

export type AskReply = { answer: string; actions: AskAction[] };
export type AskTurn = { role: "user" | "assistant"; text: string };

export const askHome = (homeId: string, question: string, history: AskTurn[], categories: string[]) =>
  callAi<AskReply>("ask", homeId, { question, history: history.slice(-6), categories });

/**
 * Carry out one confirmed action, the way its own screen would, and return how
 * to take it back. The undo puts back exactly what was there before.
 */
export async function applyAction(a: AskAction, opts: { homeId: string; userId: string | null; listId: string | null }): Promise<() => Promise<void>> {
  if (a.type === "reschedule") {
    const { data: before, error } = await supabase.from("schedule_tasks").select("scheduled_date, start_time, carried_from, reminded").eq("id", a.id).single();
    if (error) throw error;
    // A new day is a fresh plan: no longer "carried over", and its reminder goes out again.
    const { error: e } = await supabase.from("schedule_tasks").update({ scheduled_date: a.date, start_time: a.time, carried_from: null, reminded: false }).eq("id", a.id);
    if (e) throw e;
    return async () => {
      const { error: u } = await supabase.from("schedule_tasks").update(before).eq("id", a.id);
      if (u) throw u;
    };
  }
  if (a.type === "done") {
    // The linked twin (schedule ⇄ tasks) follows by itself, through the database triggers.
    if (a.table === "shopping_items") {
      const { data: before, error } = await supabase.from("shopping_items").select("is_checked").eq("id", a.id).single();
      if (error) throw error;
      const { error: e } = await supabase.from("shopping_items").update({ is_checked: true }).eq("id", a.id);
      if (e) throw e;
      return async () => {
        const { error: u } = await supabase.from("shopping_items").update({ is_checked: before.is_checked }).eq("id", a.id);
        if (u) throw u;
      };
    }
    const table = a.table;
    const { data: before, error } = await supabase.from(table).select("is_done").eq("id", a.id).single();
    if (error) throw error;
    const { error: e } = await supabase.from(table).update({ is_done: true }).eq("id", a.id);
    if (e) throw e;
    return async () => {
      const { error: u } = await supabase.from(table).update({ is_done: before.is_done }).eq("id", a.id);
      if (u) throw u;
    };
  }
  if (!opts.listId) throw new Error("no shopping list");
  const { undo } = await applyPlan({ shopping: [{ name: a.name, quantity: 1, category: a.category }], schedule: [], tasks: [], unclear: "" }, opts);
  return undo;
}
