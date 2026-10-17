import { supabase } from "./supabase";
import { callAi } from "./ai";
import { newId } from "./optimistic";
import { aiCategory, knownCategory } from "./categorize";
import type { Tables } from "../types/database";

/**
 * "Update with AI" on the shopping lists, the pantry included:
 * "תוסיף למחסן 4 רסק עגבניות ותוריד אורז אחד". The AI only says what to change
 * and by how much; the app shows it, and on confirm works the new amounts out
 * from the rows as they are at that moment (another phone may have changed them).
 */
export type ListChange = {
  op: "add" | "decrease" | "set" | "delete";
  list_id: string;
  list_name: string;
  item_id: string | null; // null: a product not on that list yet
  name: string;
  quantity: number;
  before: number | null;
  checked: boolean;
};
export type ListUpdatePlan = { changes: ListChange[]; unclear: string };

export const understandUpdate = (homeId: string, text: string, listId: string | null) =>
  callAi<ListUpdatePlan>("list_update", homeId, { text, list_id: listId });

/** The amount after the change; 0 or less means the item comes off the list. */
export function amountAfter(c: { op: ListChange["op"]; quantity: number; checked: boolean }, current: number) {
  if (c.op === "delete") return 0;
  if (c.op === "set") return c.quantity;
  if (c.op === "decrease") return current - c.quantity;
  // Adding to something already ticked as bought puts it back on with this amount.
  return c.checked ? c.quantity : current + c.quantity;
}

const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : `${Math.round(n * 100) / 100}`);

/** What the review shows for a change: "2 → 6", "חדש ×4", "יורד מהרשימה". */
export function describeChange(c: ListChange) {
  if (!c.item_id) return `חדש ×${fmt(c.quantity)}`;
  const after = amountAfter(c, c.before ?? 0);
  if (after <= 0) return "יורד מהרשימה";
  if (c.op === "add" && c.checked) return `חוזר לרשימה ×${fmt(after)}`;
  return `${fmt(c.before ?? 0)} ← ${fmt(after)}`;
}

/**
 * Write the confirmed changes. Returns an undo that puts every row back exactly
 * as it was. If a write fails halfway, what was already done is undone first.
 */
export async function applyChanges(
  changes: ListChange[],
  ctx: { homeId: string; userId: string | null; categories: string[]; history: { name: string; category: string | null }[] },
): Promise<() => Promise<void>> {
  const undos: (() => PromiseLike<unknown>)[] = [];
  const undo = async () => {
    for (const u of [...undos].reverse()) await u();
  };
  const ok = async (op: PromiseLike<{ error: unknown }>) => {
    const { error } = await op;
    if (error) throw error;
  };
  try {
    for (const c of changes) {
      if (!c.item_id) {
        const id = newId();
        const category = knownCategory(c.name, ctx.history, ctx.categories);
        const { count } = await supabase.from("shopping_items").select("id", { count: "exact", head: true }).eq("list_id", c.list_id);
        await ok(
          supabase.from("shopping_items").insert({ id, list_id: c.list_id, home_id: ctx.homeId, name: c.name, quantity: c.quantity, category, source: "manual", position: count ?? 0, created_by: ctx.userId }),
        );
        undos.push(() => supabase.from("shopping_items").delete().eq("id", id));
        // Categories are the app's to set: a product it doesn't know goes to the AI,
        // with the next batch (no answer: the shopping list asks again when opened).
        if (!category)
          void aiCategory(ctx.homeId, c.name, ctx.categories).then((picked) =>
            picked ? supabase.from("shopping_items").update({ category: picked }).eq("id", id).is("category", null) : undefined,
          );
        continue;
      }
      const { data: row, error } = await supabase.from("shopping_items").select("*").eq("id", c.item_id).maybeSingle();
      if (error) throw error;
      if (!row) continue; // gone meanwhile
      const before: Tables<"shopping_items"> = row;
      const after = amountAfter({ ...c, checked: before.is_checked }, before.quantity);
      if (after <= 0) {
        await ok(supabase.from("shopping_items").delete().eq("id", before.id));
        undos.push(() => supabase.from("shopping_items").insert(before));
      } else {
        const revive = c.op === "add" && before.is_checked;
        await ok(supabase.from("shopping_items").update({ quantity: Math.round(after * 100) / 100, ...(revive ? { is_checked: false } : {}) }).eq("id", before.id));
        undos.push(() => supabase.from("shopping_items").update({ quantity: before.quantity, is_checked: before.is_checked }).eq("id", before.id));
      }
    }
  } catch (e) {
    await undo().catch(() => {});
    throw e;
  }
  return undo;
}
