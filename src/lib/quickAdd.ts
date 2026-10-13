import { supabase } from "./supabase";
import { newId } from "./optimistic";
import { callAi } from "./ai";
import type { AiImage } from "./images";
import type { Tables } from "../types/database";

/** What the quick-add function understood from one sentence — a proposal, nothing written yet. */
export type QuickPlan = {
  shopping: { name: string; quantity: number; category: string }[];
  schedule: { title: string; date: string; start_time: string | null; assigned_to: string | null }[];
  tasks: { title: string; owner_id: string | null }[];
  unclear: string;
};

/** Ask the server (and Claude Haiku behind it) what the sentence — and any pictures — mean. */
export const understand = (text: string, homeId: string, categories: string[], images: AiImage[] = []) =>
  callAi<QuickPlan>("quick_add", homeId, { text, categories, images: images.map(({ media_type, data }) => ({ media_type, data })) });

/**
 * Write the parts of a plan the person kept, the way each screen would: an item
 * already on the list isn't added twice (a bought one goes back on the list), a
 * schedule entry takes its day's next position, a task goes to the end of its
 * list. Returns how many things changed and an undo that takes them all back.
 */
export async function applyPlan(
  plan: QuickPlan,
  opts: { homeId: string; userId: string | null; listId: string | null },
): Promise<{ added: number; undo: () => Promise<void> }> {
  const { homeId, userId, listId } = opts;
  const created = { shopping: [] as string[], schedule: [] as string[], tasks: [] as string[] };
  const reticked: string[] = [];
  const undo = async () => {
    await Promise.all([
      created.shopping.length && supabase.from("shopping_items").delete().in("id", created.shopping),
      created.schedule.length && supabase.from("schedule_tasks").delete().in("id", created.schedule),
      created.tasks.length && supabase.from("personal_tasks").delete().in("id", created.tasks),
      reticked.length && supabase.from("shopping_items").update({ is_checked: true }).in("id", reticked),
    ]);
  };

  try {
    if (plan.shopping.length && listId) {
      const { data: existing, error } = await supabase.from("shopping_items").select("id, name, is_checked").eq("list_id", listId);
      if (error) throw error;
      const byName = new Map((existing ?? []).map((i) => [i.name.trim().toLowerCase(), i]));
      const rows: Partial<Tables<"shopping_items">>[] = [];
      for (const s of plan.shopping) {
        const have = byName.get(s.name.trim().toLowerCase());
        if (have?.is_checked) reticked.push(have.id);
        if (have) continue;
        const id = newId();
        created.shopping.push(id);
        rows.push({ id, list_id: listId, home_id: homeId, name: s.name, quantity: s.quantity, category: s.category, source: "manual", position: (existing?.length ?? 0) + rows.length, created_by: userId });
      }
      if (reticked.length) {
        const { error: e } = await supabase.from("shopping_items").update({ is_checked: false }).in("id", reticked);
        if (e) throw e;
      }
      if (rows.length) {
        const { error: e } = await supabase.from("shopping_items").insert(rows as Tables<"shopping_items">[]);
        if (e) throw e;
      }
    }

    if (plan.schedule.length) {
      // The schedule's rule: an untouched day stays in time order (0); a day
      // someone has reordered takes new tasks at the end.
      const next = new Map<string, number>();
      for (const date of new Set(plan.schedule.map((s) => s.date))) {
        const { data: top } = await supabase.from("schedule_tasks").select("position").eq("home_id", homeId).eq("scheduled_date", date).order("position", { ascending: false }).limit(1);
        const max = top?.[0]?.position ?? 0;
        next.set(date, max === 0 ? 0 : max + 1);
      }
      const rows = plan.schedule.map((s) => {
        const id = newId();
        created.schedule.push(id);
        const position = next.get(s.date) ?? 0;
        if (position) next.set(s.date, position + 1);
        return { id, home_id: homeId, title: s.title, category: "general", scheduled_date: s.date, start_time: s.start_time, assigned_to: s.assigned_to, position, created_by: userId };
      });
      const { error } = await supabase.from("schedule_tasks").insert(rows);
      if (error) throw error;
    }

    if (plan.tasks.length) {
      const rows = plan.tasks.map((t, i) => {
        const id = newId();
        created.tasks.push(id);
        // Large positions sort after the existing tasks; the page renumbers on the next drag.
        return { id, home_id: homeId, scope: t.owner_id ? "personal" : "general", owner_id: t.owner_id, title: t.title, position: 1000 + i, created_by: userId };
      });
      const { error } = await supabase.from("personal_tasks").insert(rows);
      if (error) throw error;
    }
  } catch (e) {
    await undo().catch(() => {});
    throw e;
  }

  return { added: created.shopping.length + reticked.length + created.schedule.length + created.tasks.length, undo };
}
