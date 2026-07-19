import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ChefHat,
  ChevronRight,
  ChevronLeft,
  ShoppingCart,
  Check,
  X,
  CalendarPlus,
} from "lucide-react";
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
  const [tab, setTab] = useState<"dishes" | "week">("week");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">בישולים</h1>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          onClick={() => setTab("week")}
          className={`rounded-xl py-2 text-sm font-medium ${
            tab === "week" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          התפריט השבועי
        </button>
        <button
          onClick={() => setTab("dishes")}
          className={`rounded-xl py-2 text-sm font-medium ${
            tab === "dishes" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          מאכלים קבועים
        </button>
      </div>
      {tab === "dishes" ? <DishesTab /> : <WeekTab />}
    </div>
  );
}

/* ------------------------------- Dishes ---------------------------------- */
function DishesTab() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Dish | null>(null);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("dishes").select("*").eq("home_id", homeId).order("name");
    setDishes(data ?? []);
    setLoading(false);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="space-y-3">
      <form onSubmit={add} className="card flex gap-2">
        <input
          className="input flex-1"
          placeholder="שם מאכל חדש…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn-primary !px-4">
          <Plus size={18} />
        </button>
      </form>

      {dishes.length === 0 ? (
        <EmptyState icon={<ChefHat size={40} />} title="אין מאכלים עדיין" hint="הוסיפו מאכל וקבעו לו מצרכים" />
      ) : (
        <div className="space-y-2">
          {dishes.map((d) => (
            <div key={d.id} className="card flex items-center gap-3 !py-3">
              <button onClick={() => setEditing(d)} className="flex min-w-0 flex-1 items-center gap-3 text-right">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                  <ChefHat size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-400">הקשה לעריכת מצרכים</p>
                </span>
                <ChevronLeft size={18} className="text-slate-300" />
              </button>
              <button onClick={() => remove(d.id)} className="p-1 text-slate-300 hover:text-red-500">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && <IngredientsModal dish={editing} onClose={() => setEditing(null)} />}
    </div>
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
    await supabase.from("dish_ingredients").insert({
      dish_id: dish.id,
      home_id: dish.home_id,
      name: name.trim(),
      quantity: qty,
      unit: unit || null,
      category,
    });
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
      <div className="mb-4 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <input className="input" placeholder="שם המצרך" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          <input
            className="input w-20"
            type="number"
            min={0}
            step="0.5"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <input
            className="input w-24"
            placeholder="יחידה"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <select className="input flex-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button onClick={add} className="btn-primary w-full">
          <Plus size={16} /> הוספת מצרך
        </button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">אין מצרכים עדיין</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
            <span className="flex-1 text-sm text-slate-700">
              {r.name} · {r.quantity} {r.unit ?? ""}
            </span>
            <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ------------------------------- Week ------------------------------------ */
function WeekTab() {
  const { homeId } = useHome();
  const { user } = useAuth();
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
      supabase
        .from("weekly_meals")
        .select("*, dishes(name)")
        .eq("home_id", homeId)
        .eq("week_start", weekIso)
        .order("day_of_week", { nullsFirst: true }),
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
    <div className="space-y-3">
      {/* week navigator */}
      <div className="card flex items-center justify-between !py-2.5">
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="p-1.5 text-slate-500">
          <ChevronRight size={20} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">
            {formatDayMonth(weekStart)} – {formatDayMonth(addDays(weekStart, 6))}
          </p>
          <p className="text-[11px] text-slate-400">שבוע</p>
        </div>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="p-1.5 text-slate-500">
          <ChevronLeft size={20} />
        </button>
      </div>

      <button onClick={() => setAdding(true)} className="btn-primary w-full">
        <CalendarPlus size={18} /> הוספת מאכל לשבוע
      </button>

      {meals.length === 0 ? (
        <EmptyState icon={<ChefHat size={40} />} title="לא נבחרו מאכלים לשבוע זה" />
      ) : (
        <div className="space-y-2">
          {meals.map((meal) => (
            <div key={meal.id} className="card flex items-center gap-3 !py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                <ChefHat size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{meal.dishes?.name ?? "מאכל"}</p>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {meal.day_of_week != null && <span>יום {DAYS_HE[meal.day_of_week]}</span>}
                  {meal.meal_type && <span>· {MEAL_TYPES[meal.meal_type as keyof typeof MEAL_TYPES]}</span>}
                </div>
              </div>
              {meal.added_to_list ? (
                <span className="chip bg-brand-50 text-brand-700">
                  <Check size={13} /> נוסף
                </span>
              ) : (
                <button
                  onClick={() => setListPickerFor(meal)}
                  className="btn-ghost !px-2.5 !py-1.5 text-xs text-brand-600"
                >
                  <ShoppingCart size={14} /> לרשימה
                </button>
              )}
              <button onClick={() => removeMeal(meal.id)} className="p-1 text-slate-300 hover:text-red-500">
                <Trash2 size={17} />
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
          <div className="space-y-2">
            {lists.map((l) => (
              <button
                key={l.id}
                onClick={() => addToList(listPickerFor, l.id)}
                className="btn-ghost w-full justify-start"
              >
                <ShoppingCart size={16} /> {l.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
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
  const [dishId, setDishId] = useState<string>(dishes[0]?.id ?? "");
  const [day, setDay] = useState<string>("");
  const [mealType, setMealType] = useState<string>("");

  const save = async () => {
    if (!dishId) return;
    await supabase.from("weekly_meals").insert({
      home_id: homeId,
      dish_id: dishId,
      week_start: weekIso,
      day_of_week: day === "" ? null : Number(day),
      meal_type: mealType || null,
      created_by: userId,
    });
    onAdded();
  };

  if (dishes.length === 0) {
    return (
      <Modal open onClose={onClose} title="הוספת מאכל">
        <p className="text-sm text-slate-500">
          קודם הוסיפו מאכלים בלשונית "מאכלים קבועים", ואז תוכלו לשבץ אותם לשבוע.
        </p>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="הוספת מאכל לשבוע">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">מאכל</label>
          <select className="input" value={dishId} onChange={(e) => setDishId(e.target.value)}>
            {dishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">יום (רשות)</label>
            <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">ללא</option>
              {DAYS_HE.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-600">ארוחה (רשות)</label>
            <select className="input" value={mealType} onChange={(e) => setMealType(e.target.value)}>
              <option value="">ללא</option>
              {Object.entries(MEAL_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          שיבוץ מאכל ישלח התראה לאחראי הקניות לקבוע יום ושעה לקנייה.
        </p>
        <button onClick={save} className="btn-primary w-full">
          הוספה לשבוע
        </button>
      </div>
    </Modal>
  );
}
