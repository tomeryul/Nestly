import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ChevronRight, ChevronLeft, ShoppingCart, Check, X, CalendarPlus, ChefHat, UtensilsCrossed, Info, ArrowDownAZ, Clock, Repeat, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AiButton, PickRow, usePicks } from "../components/AiParts";
import { aiErrorText, callAi } from "../lib/ai";
import { supabase } from "../lib/supabase";
import { readCache, useOnResume, useSeedFromCache, writeCache } from "../lib/cache";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Modal, EmptyState, FullPageSpinner, SegLens } from "../components/ui";
import { CATEGORIES, DAYS_HE, MEAL_TYPES } from "../lib/constants";
import { addDays, formatDayMonth, startOfWeek, toISODate } from "../lib/dates";
import { bgWrite, newId } from "../lib/optimistic";
import { aiCategory, knownCategory } from "../lib/categorize";
import type { Tables } from "../types/database";

type Dish = Tables<"dishes">;
type Ingredient = Tables<"dish_ingredients">;
type Meal = Tables<"weekly_meals"> & { dishes?: { name: string } | null };
type List = Tables<"shopping_lists">;

export default function Cooking() {
  const [tab, setTab] = useState<"week" | "dishes">("week");
  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1 className="page-title">בישולים</h1>
      <div className="nst-seg">
        <SegLens />
        <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}>
          התפריט השבועי
        </button>
        <button className={tab === "dishes" ? "active" : ""} onClick={() => setTab("dishes")}>
          מאכלים קבועים
        </button>
      </div>
      {tab === "week" ? <WeekTab /> : <DishesTab />}
    </section>
  );
}

function DishesTab() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Dish | null>(null);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("dishes").select("*").eq("home_id", homeId).order("name");
    setDishes(data ?? []);
    const { data: ings } = await supabase.from("dish_ingredients").select("dish_id").eq("home_id", homeId);
    const c: Record<string, number> = {};
    (ings ?? []).forEach((i) => (c[i.dish_id] = (c[i.dish_id] ?? 0) + 1));
    setCounts(c);
    setLoading(false);
    writeCache(`dishes.${homeId}`, { dishes: data ?? [], counts: c });
  }, [homeId]);
  useSeedFromCache<{ dishes: Dish[]; counts: Record<string, number> }>(homeId && `dishes.${homeId}`, (s) => {
    setDishes(s.dishes);
    setCounts(s.counts);
    setLoading(false);
  });
  useEffect(() => {
    load();
  }, [load]);
  useOnResume(load);

  const add = () => {
    if (!name.trim() || !homeId) return;
    const id = newId();
    const row: Dish = { id, home_id: homeId, name: name.trim(), description: null, created_by: user?.id ?? null, created_at: new Date().toISOString() };
    setDishes((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name, "he")));
    setName("");
    bgWrite(supabase.from("dishes").insert({ id, home_id: homeId, name: row.name, created_by: user?.id ?? null }), load);
  };
  const remove = (id: string) => {
    setDishes((prev) => prev.filter((d) => d.id !== id));
    bgWrite(supabase.from("dishes").delete().eq("id", id), load);
  };

  if (loading) return <FullPageSpinner />;

  return (
    <>
      <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", gap: 8 }}>
        <input style={{ flex: 1 }} placeholder="שם מאכל חדש…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={add}>
          <Plus size={18} />
        </button>
      </div>
      {dishes.length === 0 ? (
        <EmptyState icon={<ChefHat size={42} />} title="אין מאכלים עדיין" hint="הוסיפו מאכל וקבעו לו מצרכים" />
      ) : (
        <div className="nst-group">
          {dishes.map((d) => (
            <div className="nst-row" key={d.id}>
              <button style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, border: "none", background: "transparent", textAlign: "right", cursor: "pointer" }} onClick={() => setEditing(d)}>
                <span className="nst-tile" style={{ background: "var(--cat-3-bg)", color: "var(--cat-3-fg)" }}>
                  <ChefHat size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "400 17px var(--font-body)", color: "var(--text-bright)" }}>{d.name}</span>
                  <span style={{ display: "block", fontSize: 13, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>{counts[d.id] ?? 0} מצרכים · הקשה לעריכה</span>
                </span>
                <ChevronLeft size={18} style={{ color: "var(--text-faint)" }} />
              </button>
              <button className="nst-del" onClick={() => remove(d.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
      {editing && <IngredientsModal dish={editing} onClose={() => { setEditing(null); load(); }} />}
    </>
  );
}

function IngredientsModal({ dish, onClose }: { dish: Dish; onClose: () => void }) {
  const [rows, setRows] = useState<Ingredient[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("");
  const [isSpice, setIsSpice] = useState(false);
  const [sortMode, setSortMode] = useState<"added" | "alpha">("added");

  const load = useCallback(async () => {
    const { data } = await supabase.from("dish_ingredients").select("*").eq("dish_id", dish.id).order("name");
    setRows(data ?? []);
  }, [dish.id]);
  useEffect(() => {
    load();
  }, [load]);

  // The category is the app's to set, as on the shopping list: known products at
  // once, a new one by the AI just after (spices never reach the list, so they skip it).
  const add = async () => {
    if (!name.trim()) return;
    const homeId = dish.home_id;
    const categories = [...new Set([...CATEGORIES, ...(readCache<string[]>(`cats.${homeId}`) ?? [])])];
    const history = readCache<{ name: string; category: string | null }[]>(`catalog.${homeId}`) ?? [];
    const known = knownCategory(name, history, categories);
    const id = newId();
    const ingredient = name.trim();
    await supabase.from("dish_ingredients").insert({ id, dish_id: dish.id, home_id: homeId, name: ingredient, quantity: qty, unit: unit || null, category: known, is_spice: isSpice });
    setName("");
    setQty(1);
    setUnit("");
    load();
    if (!known && !isSpice) {
      const picked = await aiCategory(homeId, ingredient, categories);
      await supabase.from("dish_ingredients").update({ category: picked ?? "כללי" }).eq("id", id).is("category", null);
    }
  };
  const remove = async (id: string) => {
    await supabase.from("dish_ingredients").delete().eq("id", id);
    load();
  };

  const sortRows = (arr: Ingredient[]) => {
    const a = [...arr];
    if (sortMode === "alpha") a.sort((x, y) => x.name.localeCompare(y.name, "he"));
    else a.sort((x, y) => (x.created_at ?? "").localeCompare(y.created_at ?? ""));
    return a;
  };
  const ingredients = sortRows(rows.filter((r) => !r.is_spice));
  const spices = sortRows(rows.filter((r) => r.is_spice));
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toString());

  const rowView = (r: Ingredient) => (
    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
      <span style={{ flex: 1, fontSize: 15, color: "var(--text-2)", fontWeight: 500 }}>
        {r.name} · {fmt(r.quantity)} {r.unit ?? ""}
      </span>
      <button className="nst-del" onClick={() => remove(r.id)}>
        <X size={16} />
      </button>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`מצרכים · ${dish.name}`}>
      <RecipeAi dish={dish} existing={rows} onAdded={load} />
      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: "1rem" }}>
        <div className="nst-seg">
          <SegLens />
          <button className={!isSpice ? "active" : ""} onClick={() => setIsSpice(false)}>
            מצרך
          </button>
          <button className={isSpice ? "active" : ""} onClick={() => setIsSpice(true)}>
            תבלין
          </button>
        </div>
        <input placeholder={isSpice ? "שם התבלין" : "שם המצרך"} value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ flex: 1, minWidth: 0 }} type="number" min={0} step={0.25} value={qty} onChange={(e) => setQty(Number(e.target.value))} title="כמות (אפשר רבע/חצי)" />
          <input style={{ flex: 1, minWidth: 0 }} placeholder="יחידה" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        {isSpice && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>תבלינים לא נכנסים לרשימת הקניות.</p>}
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={add}>
          <Plus size={16} /> {isSpice ? "הוספת תבלין" : "הוספת מצרך"}
        </button>
      </div>

      {rows.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין מצרכים עדיין</p>}
      {rows.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <button className="btn btn-sm" onClick={() => setSortMode((m) => (m === "added" ? "alpha" : "added"))} title="שינוי סדר תצוגה">
            {sortMode === "added" ? (
              <>
                <Clock size={14} /> לפי סדר הוספה
              </>
            ) : (
              <>
                <ArrowDownAZ size={14} /> לפי א־ב
              </>
            )}
          </button>
        </div>
      )}
      {ingredients.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: spices.length ? 14 : 0 }}>{ingredients.map(rowView)}</div>}
      {spices.length > 0 && (
        <>
          <div style={{ margin: "0 4px 8px", color: "var(--text-3)", font: "400 13px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em" }}>תבלינים</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{spices.map(rowView)}</div>
        </>
      )}
    </Modal>
  );
}

type RecipeResult = {
  ingredients: { name: string; quantity: number; unit: string; is_spice: boolean; category: string }[];
  note: string;
  suggested: boolean;
};

/**
 * Fill a dish's ingredients with AI: from a pasted recipe, or — with nothing
 * pasted — the ingredients the dish usually takes. Ingredients the dish already
 * has come back unticked, so nothing is added twice unless asked.
 */
function RecipeAi({ dish, existing, onAdded }: { dish: Dish; existing: Ingredient[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecipeResult | null>(null);
  const picks = usePicks();
  const have = new Set(existing.map((i) => i.name.trim()));
  const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toString());

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await callAi<RecipeResult>("recipe", dish.home_id, { dish: dish.name, text: text.trim(), categories: [...CATEGORIES] });
      if (!r.ingredients.length) setError("לא מצאתי מצרכים בטקסט.");
      else {
        setResult(r);
        picks.reset(r.ingredients.flatMap((x, i) => (have.has(x.name.trim()) ? [`i:${i}`] : [])));
      }
    } catch (e) {
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const chosen = result ? result.ingredients.filter((_, i) => picks.kept(`i:${i}`)) : [];
  const save = async () => {
    if (!chosen.length) return;
    setBusy(true);
    const { error: e } = await supabase.from("dish_ingredients").insert(
      chosen.map((x) => ({ dish_id: dish.id, home_id: dish.home_id, name: x.name, quantity: x.quantity, unit: x.unit || null, category: x.category, is_spice: x.is_spice })),
    );
    setBusy(false);
    if (e) {
      toast.error("לא הצלחנו להוסיף את המצרכים");
      return;
    }
    toast.success(chosen.length === 1 ? "נוסף מצרך אחד" : `נוספו ${chosen.length} מצרכים`, { description: dish.name });
    setOpen(false);
    setResult(null);
    setText("");
    onAdded();
  };

  if (!open)
    return (
      <div style={{ marginBottom: "1rem" }}>
        <AiButton block onClick={() => setOpen(true)}>
          מילוי מצרכים עם AI
        </AiButton>
      </div>
    );
  return (
    <div className="nst-ai-panel" style={{ marginBottom: "1rem" }}>
      {!result ? (
        <>
          <textarea
            rows={4}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            placeholder={`הדביקו כאן מתכון — או השאירו ריק, ונציע את המצרכים שבדרך כלל יש ב${dish.name}`}
            style={{ resize: "vertical", font: "400 16px/1.45 var(--font-body)" }}
          />
          {error && (
            <p className="alert qa-error" role="alert">
              <TriangleAlert /> {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AiButton busy={busy} busyLabel="קורא…" onClick={run}>
              {text.trim() ? "חילוץ המצרכים" : `הצעת מצרכים ל${dish.name}`}
            </AiButton>
            <button className="btn btn-sm" onClick={() => setOpen(false)} disabled={busy}>
              סגירה
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="section-sub">
            {result.suggested ? `הצעה לפי איך שמכינים ${dish.name} בדרך כלל — הורידו את מה שלא מתאים.` : "המצרכים מהמתכון — הורידו את מה שלא צריך."}
          </p>
          <div className="nst-group">
            {result.ingredients.map((x, i) => (
              <PickRow
                key={i}
                kept={picks.kept(`i:${i}`)}
                onToggle={() => picks.toggle(`i:${i}`)}
                title={`${x.name} · ${fmt(x.quantity)}${x.unit ? ` ${x.unit}` : ""}`}
                tags={
                  <>
                    <span className="nst-tag">{x.is_spice ? "תבלין" : x.category}</span>
                    {have.has(x.name.trim()) && <span className="nst-tag">כבר במאכל</span>}
                  </>
                }
              />
            ))}
          </div>
          {result.note && <p className="section-sub">{result.note}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !chosen.length}>
              {busy ? "מוסיף…" : chosen.length === 1 ? "הוספת מצרך אחד" : `הוספת ${chosen.length} מצרכים`}
            </button>
            <button className="btn btn-sm" onClick={() => setResult(null)} disabled={busy}>
              חזרה
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function WeekTab() {
  const { homeId, members } = useHome();
  const { user } = useAuth();
  const nameFor = (uid: string) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "";
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [listPickerFor, setListPickerFor] = useState<Meal | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const weekIso = toISODate(weekStart);

  const load = useCallback(async () => {
    if (!homeId) return;
    const [m, d, l] = await Promise.all([
      supabase.from("weekly_meals").select("*, dishes(name)").eq("home_id", homeId).eq("week_start", weekIso).order("day_of_week", { nullsFirst: true }),
      supabase.from("dishes").select("*").eq("home_id", homeId).order("name"),
      supabase.from("shopping_lists").select("*").eq("home_id", homeId).order("is_default", { ascending: false }),
    ]);
    setMeals((m.data as unknown as Meal[]) ?? []);
    setDishes(d.data ?? []);
    setLists(l.data ?? []);
    setLoading(false);
    writeCache(`week.${homeId}.${weekIso}`, { meals: m.data ?? [], dishes: d.data ?? [], lists: l.data ?? [] });
  }, [homeId, weekIso]);
  useEffect(() => {
    load();
  }, [load]);
  useOnResume(load);
  useSeedFromCache<{ meals: Meal[]; dishes: Dish[]; lists: List[] }>(homeId && `week.${homeId}.${weekIso}`, (c) => {
    setMeals(c.meals);
    setDishes(c.dishes);
    setLists(c.lists);
    setLoading(false);
  });

  const removeMeal = (id: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    bgWrite(supabase.from("weekly_meals").delete().eq("id", id), load);
  };
  const addToList = async (meal: Meal, listId: string) => {
    await supabase.rpc("add_meal_to_list", { meal_id: meal.id, list_id: listId });
    setListPickerFor(null);
    load();
  };

  if (loading) return <FullPageSpinner />;

  return (
    <>
      <div className="nst-card" style={{ padding: "0.7rem 0.9rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button className="nst-iconbtn plain" onClick={() => setWeekStart((w) => addDays(w, -7))}>
          <ChevronRight />
        </button>
        <div style={{ textAlign: "center" }}>
          <p style={{ font: "400 17px var(--font-body)", color: "var(--text-bright)" }}>
            {formatDayMonth(weekStart)} – {formatDayMonth(addDays(weekStart, 6))}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>שבוע</p>
        </div>
        <button className="nst-iconbtn plain" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          <ChevronLeft />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center", padding: 13 }} onClick={() => setAdding(true)}>
          <CalendarPlus size={18} /> הוספת מאכל לשבוע
        </button>
        <button className="btn" style={{ padding: "0 14px" }} onClick={() => setShowRecurring(true)} title="ארוחות קבועות">
          <Repeat size={16} /> קבועות
        </button>
      </div>
      <AiButton block onClick={() => setSuggesting(true)}>
        הצעה לתפריט השבוע
      </AiButton>

      {meals.length === 0 ? (
        <EmptyState icon={<ChefHat size={42} />} title="לא נבחרו מאכלים לשבוע זה" />
      ) : (
        <div className="nst-group">
          {meals.map((meal) => (
            <div className="nst-row" key={meal.id}>
              <span className="nst-tile" style={{ background: "var(--cat-3-bg)", color: "var(--cat-3-fg)" }}>
                <UtensilsCrossed size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ font: "400 17px var(--font-body)", color: "var(--text-bright)" }}>{meal.dishes?.name ?? "מאכל"}</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
                  {meal.all_week ? "כל השבוע" : meal.day_of_week != null ? `יום ${DAYS_HE[meal.day_of_week]}` : "ללא יום"}
                  {meal.meal_type ? ` · ${MEAL_TYPES[meal.meal_type as keyof typeof MEAL_TYPES]}` : ""}
                  {" · "}
                  {meal.for_members && meal.for_members.length > 0 ? meal.for_members.map((id) => nameFor(id)).filter(Boolean).join(", ") : "כל הבית"}
                </p>
              </div>
              {meal.added_to_list ? (
                <span className="badge b-active" style={{ borderRadius: 30 }}>
                  <Check size={12} style={{ verticalAlign: -2 }} /> נוסף
                </span>
              ) : (
                <button className="nst-chip" style={{ color: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--accent-soft)" }} onClick={() => setListPickerFor(meal)}>
                  <ShoppingCart /> לרשימה
                </button>
              )}
              <button className="nst-del" onClick={() => removeMeal(meal.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddMealModal
          homeId={homeId!}
          weekIso={weekIso}
          dishes={dishes}
          userId={user?.id ?? null}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {suggesting && (
        <MenuAiSheet
          homeId={homeId!}
          weekIso={weekIso}
          userId={user?.id ?? null}
          onClose={() => setSuggesting(false)}
          onAdded={() => {
            setSuggesting(false);
            load();
          }}
        />
      )}
      {listPickerFor && (
        <Modal open onClose={() => setListPickerFor(null)} title="לאיזו רשימה להוסיף?">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lists.map((l) => (
              <button key={l.id} className="btn btn-block" style={{ justifyContent: "flex-start" }} onClick={() => addToList(listPickerFor, l.id)}>
                <ShoppingCart size={16} /> {l.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {showRecurring && (
        <RecurringMealsModal
          homeId={homeId!}
          dishes={dishes}
          userId={user?.id ?? null}
          onClose={() => {
            setShowRecurring(false);
            load();
          }}
        />
      )}
    </>
  );
}

type MenuResult = { meals: { dish_id: string; dish_name: string; day_of_week: number; meal_type: string }[]; note: string };

/**
 * Plan the week with AI, from the household's own dishes only: it fills the
 * meals still open (dinners by default), doesn't repeat a dish, prefers ones not
 * eaten lately, and takes a request in plain words ("בלי בשר ביום שני").
 */
function MenuAiSheet({ homeId, weekIso, userId, onClose, onAdded }: { homeId: string; weekIso: string; userId: string | null; onClose: () => void; onAdded: () => void }) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MenuResult | null>(null);
  const picks = usePicks();
  const chosen = result ? result.meals.filter((_, i) => picks.kept(`m:${i}`)) : [];

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await callAi<MenuResult>("menu", homeId, { week_start: weekIso, request: request.trim() });
      if (!r.meals.length) setError(r.note || "לא נשארו ארוחות פנויות השבוע, או שלא מצאתי מאכל שמתאים.");
      else {
        setResult(r);
        picks.reset();
      }
    } catch (e) {
      setError(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!chosen.length) return;
    setBusy(true);
    const { error: e } = await supabase.from("weekly_meals").insert(
      chosen.map((m) => ({ home_id: homeId, week_start: weekIso, dish_id: m.dish_id, day_of_week: m.day_of_week, meal_type: m.meal_type, all_week: false, for_members: [], created_by: userId })),
    );
    setBusy(false);
    if (e) {
      toast.error("לא הצלחנו להוסיף לתפריט");
      return;
    }
    toast.success(chosen.length === 1 ? "נוספה ארוחה אחת לשבוע" : `נוספו ${chosen.length} ארוחות לשבוע`);
    onAdded();
  };

  const done = result
    ? { label: busy ? "מוסיף…" : `הוספה (${chosen.length})`, onClick: save, disabled: busy || !chosen.length }
    : { label: busy ? "מתכנן…" : "הצעה", onClick: run, disabled: busy };

  return (
    <Modal open onClose={onClose} title="הצעה לתפריט" done={done}>
      {!result ? (
        <div className="nst-fields">
          <p className="section-sub">ה-AI בוחר מתוך המאכלים הקבועים שלכם, ממלא את הארוחות שעוד פנויות השבוע (ארוחות ערב, אם לא ביקשתם אחרת), ומעדיף מה שלא אכלתם לאחרונה.</p>
          <div>
            <label>בקשות (לא חובה)</label>
            <textarea
              rows={3}
              maxLength={300}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              disabled={busy}
              placeholder="למשל: בלי בשר ביום שני, משהו מהיר ברביעי"
              style={{ resize: "none", font: "400 16px/1.45 var(--font-body)" }}
            />
          </div>
          {error && (
            <p className="alert qa-error" role="alert">
              <TriangleAlert /> {error}
            </p>
          )}
        </div>
      ) : (
        <div className="qa-review">
          {result.note && <p className="section-sub">{result.note}</p>}
          <div className="nst-group">
            {result.meals.map((m, i) => (
              <PickRow
                key={i}
                kept={picks.kept(`m:${i}`)}
                onToggle={() => picks.toggle(`m:${i}`)}
                title={m.dish_name}
                tags={
                  <span className="nst-tag">
                    יום {DAYS_HE[m.day_of_week]} · {MEAL_TYPES[m.meal_type as keyof typeof MEAL_TYPES] ?? ""}
                  </span>
                }
              />
            ))}
          </div>
          <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setResult(null)} disabled={busy}>
            הצעה אחרת
          </button>
        </div>
      )}
    </Modal>
  );
}

const INTERVAL_LABELS: Record<number, string> = { 1: "כל שבוע", 2: "כל שבועיים", 4: "כל 4 שבועות" };

function RecurringMealsModal({ homeId, dishes, userId, onClose }: { homeId: string; dishes: Dish[]; userId: string | null; onClose: () => void }) {
  const { members } = useHome();
  const nameFor = (uid: string) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "";
  const [rows, setRows] = useState<(Tables<"recurring_meals"> & { dishes?: { name: string } | null })[]>([]);
  const [dishId, setDishId] = useState<string>(dishes[0]?.id ?? "");
  const [day, setDay] = useState<string>("");
  const [mealType, setMealType] = useState<string>("");
  const [interval, setInterval] = useState(1);
  const [forMembers, setForMembers] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("recurring_meals").select("*, dishes(name)").eq("home_id", homeId).order("created_at");
    setRows((data as unknown as (Tables<"recurring_meals"> & { dishes?: { name: string } | null })[]) ?? []);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const toggleMember = (uid: string) => setForMembers((r) => (r.includes(uid) ? r.filter((x) => x !== uid) : [...r, uid]));

  const add = async () => {
    if (!dishId) return;
    const allWeek = day === "all";
    await supabase.from("recurring_meals").insert({
      home_id: homeId,
      dish_id: dishId,
      all_week: allWeek,
      day_of_week: day === "" || allWeek ? null : Number(day),
      meal_type: mealType || null,
      interval_weeks: interval,
      for_members: forMembers,
      created_by: userId,
    });
    setForMembers([]);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("recurring_meals").delete().eq("id", id);
    load();
  };

  if (dishes.length === 0) {
    return (
      <Modal open onClose={onClose} title="ארוחות קבועות">
        <p className="section-sub">קודם הוסיפו מאכלים בלשונית "מאכלים קבועים", ואז תוכלו להגדיר ארוחות שנכנסות אוטומטית לכל שבוע.</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="ארוחות קבועות">
      <p className="section-sub" style={{ marginTop: "-0.3rem", marginBottom: "1rem" }}>מאכלים שייכנסו אוטומטית לתפריט השבועי — כל שבוע, שבועיים או 4 שבועות.</p>
      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: "1rem" }}>
        <select value={dishId} onChange={(e) => setDishId(e.target.value)}>
          {dishes.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ flex: 1 }} value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">ללא יום</option>
            <option value="all">כל השבוע</option>
            {DAYS_HE.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
          <select style={{ flex: 1 }} value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            {[1, 2, 4].map((n) => (
              <option key={n} value={n}>
                {INTERVAL_LABELS[n]}
              </option>
            ))}
          </select>
        </div>
        <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
          <option value="">ללא ארוחה</option>
          {Object.entries(MEAL_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {members.map((m) => (
            <button key={m.user_id} className={`nst-chip ${forMembers.includes(m.user_id) ? "active" : ""}`} onClick={() => toggleMember(m.user_id)}>
              {m.profile?.display_name ?? "חבר"}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={add}>
          <Plus size={16} /> הוספת ארוחה קבועה
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין ארוחות קבועות עדיין</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ font: "400 16px var(--font-body)", color: "var(--text-bright)" }}>{r.dishes?.name ?? "מאכל"}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
                {INTERVAL_LABELS[r.interval_weeks] ?? "כל שבוע"}
                {" · "}
                {r.all_week ? "כל השבוע" : r.day_of_week != null ? `יום ${DAYS_HE[r.day_of_week]}` : "ללא יום"}
                {r.meal_type ? ` · ${MEAL_TYPES[r.meal_type as keyof typeof MEAL_TYPES]}` : ""}
                {r.for_members && r.for_members.length > 0 ? ` · ${r.for_members.map((id) => nameFor(id)).filter(Boolean).join(", ")}` : ""}
              </p>
            </div>
            <button className="nst-del" onClick={() => remove(r.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function AddMealModal({
  homeId,
  weekIso,
  dishes,
  userId,
  onClose,
  onAdded,
}: {
  homeId: string;
  weekIso: string;
  dishes: Dish[];
  userId: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { members } = useHome();
  const [dishId, setDishId] = useState<string>(dishes[0]?.id ?? "");
  const [day, setDay] = useState<string>("");
  const [mealType, setMealType] = useState<string>("");
  const [forMembers, setForMembers] = useState<string[]>([]);

  const toggleMember = (uid: string) => setForMembers((r) => (r.includes(uid) ? r.filter((x) => x !== uid) : [...r, uid]));

  const save = async () => {
    if (!dishId) return;
    const allWeek = day === "all";
    await supabase.from("weekly_meals").insert({
      home_id: homeId,
      dish_id: dishId,
      week_start: weekIso,
      all_week: allWeek,
      day_of_week: day === "" || allWeek ? null : Number(day),
      meal_type: mealType || null,
      for_members: forMembers,
      created_by: userId,
    });
    onAdded();
  };

  if (dishes.length === 0) {
    return (
      <Modal open onClose={onClose} title="הוספת מאכל">
        <p className="section-sub">קודם הוסיפו מאכלים בלשונית "מאכלים קבועים", ואז תוכלו לשבץ אותם לשבוע.</p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="מאכל לשבוע" done={{ label: "הוספה", onClick: save }}>
      <div className="nst-fields">
        <div>
          <label>מאכל</label>
          <select value={dishId} onChange={(e) => setDishId(e.target.value)}>
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>יום</label>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">ללא יום</option>
              <option value="all">כל השבוע</option>
              {DAYS_HE.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>ארוחה (רשות)</label>
            <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
              <option value="">ללא</option>
              {Object.entries(MEAL_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label>עבור מי? (ריק = כל הבית)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {members.map((m) => (
              <button
                key={m.user_id}
                className={`nst-chip ${forMembers.includes(m.user_id) ? "active" : ""}`}
                onClick={() => toggleMember(m.user_id)}
              >
                {m.profile?.display_name ?? "חבר"}
              </button>
            ))}
          </div>
        </div>
        <p className="alert alert-info">
          <Info /> שיבוץ מאכל ישלח התראה לאחראי הקניות לקבוע יום ושעה לקנייה.
        </p>
      </div>
    </Modal>
  );
}
