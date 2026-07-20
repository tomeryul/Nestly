import { useCallback, useEffect, useState } from "react";
import { Plus, Minus, Trash2, ChevronRight, ChevronLeft, ShoppingCart, Check, X, CalendarPlus, ChefHat, UtensilsCrossed, Info } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Modal, EmptyState, FullPageSpinner } from "../components/ui";
import { CATEGORIES, DAYS_HE, MEAL_TYPES } from "../lib/constants";
import { addDays, formatDayMonth, startOfWeek, toISODate } from "../lib/dates";
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
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim() || !homeId) return;
    await supabase.from("dishes").insert({ home_id: homeId, name: name.trim(), created_by: user?.id ?? null });
    setName("");
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("dishes").delete().eq("id", id);
    load();
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
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {dishes.map((d) => (
            <div className="nst-row" key={d.id}>
              <button style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, border: "none", background: "transparent", textAlign: "right", cursor: "pointer" }} onClick={() => setEditing(d)}>
                <span style={{ width: 42, height: 42, borderRadius: 13, background: "var(--cat-3-bg)", color: "var(--cat-3-fg)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <ChefHat size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "600 14px var(--font-body)", color: "var(--text-bright)" }}>{d.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>{counts[d.id] ?? 0} מצרכים · הקשה לעריכה</span>
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
  const [category, setCategory] = useState<string>(CATEGORIES[0]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("dish_ingredients").select("*").eq("dish_id", dish.id).order("name");
    setRows(data ?? []);
  }, [dish.id]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    await supabase.from("dish_ingredients").insert({ dish_id: dish.id, home_id: dish.home_id, name: name.trim(), quantity: qty, unit: unit || null, category });
    setName("");
    setQty(1);
    setUnit("");
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("dish_ingredients").delete().eq("id", id);
    load();
  };

  return (
    <Modal open onClose={onClose} title={`מצרכים · ${dish.name}`}>
      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: "1rem" }}>
        <input placeholder="שם המצרך" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <div className="nst-stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus />
            </button>
            <span className="val">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)}>
              <Plus />
            </button>
          </div>
          <input style={{ width: 90 }} placeholder="יחידה" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <select style={{ flex: 1 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={add}>
          <Plus size={16} /> הוספת מצרך
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין מצרכים עדיין</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-2)", fontWeight: 500 }}>
              {r.name} · {r.quantity} {r.unit ?? ""}
            </span>
            <button className="nst-del" onClick={() => remove(r.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
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
  const [listPickerFor, setListPickerFor] = useState<Meal | null>(null);
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
  }, [homeId, weekIso]);
  useEffect(() => {
    load();
  }, [load]);

  const removeMeal = async (id: string) => {
    await supabase.from("weekly_meals").delete().eq("id", id);
    load();
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
          <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)" }}>
            {formatDayMonth(weekStart)} – {formatDayMonth(addDays(weekStart, 6))}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>שבוע</p>
        </div>
        <button className="nst-iconbtn plain" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          <ChevronLeft />
        </button>
      </div>

      <button className="btn btn-primary btn-block" style={{ padding: 13 }} onClick={() => setAdding(true)}>
        <CalendarPlus size={18} /> הוספת מאכל לשבוע
      </button>

      {meals.length === 0 ? (
        <EmptyState icon={<ChefHat size={42} />} title="לא נבחרו מאכלים לשבוע זה" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {meals.map((meal) => (
            <div className="nst-row" key={meal.id}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: "var(--cat-3-bg)", color: "var(--cat-3-fg)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <UtensilsCrossed size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)" }}>{meal.dishes?.name ?? "מאכל"}</p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
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
    </>
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
    <Modal open onClose={onClose} title="הוספת מאכל לשבוע">
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
        <button className="btn btn-primary btn-block" style={{ padding: 12 }} onClick={save}>
          הוספה לשבוע
        </button>
      </div>
    </Modal>
  );
}
