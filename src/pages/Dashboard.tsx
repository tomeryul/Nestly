import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, ChefHat, CalendarDays, Bell, Check, Clock, ChevronLeft } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { AREAS, DAYS_HE, TASK_CATEGORIES, type AreaKey, type TaskCategory } from "../lib/constants";
import { formatTime, toISODate, startOfWeek } from "../lib/dates";
import { enablePush, pushEnabled, pushSupported } from "../lib/push";
import type { Tables } from "../types/database";

export default function Dashboard() {
  const { homeId, homeName, myResponsibilities } = useHome();
  const { user } = useAuth();
  const [todayTasks, setTodayTasks] = useState<Tables<"schedule_tasks">[]>([]);
  const [shopCount, setShopCount] = useState(0);
  const [mealCount, setMealCount] = useState(0);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const todayIso = toISODate(new Date());
  const weekIso = toISODate(startOfWeek(new Date()));

  const load = useCallback(async () => {
    if (!homeId) return;
    const [t, s, m] = await Promise.all([
      supabase
        .from("schedule_tasks")
        .select("*")
        .eq("home_id", homeId)
        .eq("scheduled_date", todayIso)
        .order("start_time", { nullsFirst: true }),
      supabase
        .from("shopping_items")
        .select("id", { count: "exact", head: true })
        .eq("home_id", homeId)
        .eq("is_checked", false),
      supabase
        .from("weekly_meals")
        .select("id", { count: "exact", head: true })
        .eq("home_id", homeId)
        .eq("week_start", weekIso),
    ]);
    setTodayTasks(t.data ?? []);
    setShopCount(s.count ?? 0);
    setMealCount(m.count ?? 0);
  }, [homeId, todayIso, weekIso]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (pushSupported()) pushEnabled().then(setPushOn);
    else setPushOn(false);
  }, []);

  const turnOnPush = async () => {
    if (!user) return;
    setPushBusy(true);
    const res = await enablePush(user.id);
    setPushBusy(false);
    if (res.ok) setPushOn(true);
    else alert(res.error);
  };

  const dow = new Date().getDay();

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-400">יום {DAYS_HE[dow]}</p>
        <h1 className="text-2xl font-bold text-slate-800">{homeName ?? "הבית שלי"}</h1>
      </div>

      {pushOn === false && pushSupported() && (
        <button
          onClick={turnOnPush}
          disabled={pushBusy}
          className="flex w-full items-center gap-3 rounded-2xl bg-brand-600 p-4 text-right text-white"
        >
          <Bell size={22} />
          <div className="flex-1">
            <p className="font-semibold">הפעלת התראות</p>
            <p className="text-xs text-white/80">קבלו תזכורות למשימות ולקניות</p>
          </div>
          <ChevronLeft size={20} />
        </button>
      )}

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/shopping" className="card flex flex-col gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ShoppingCart size={20} />
          </span>
          <p className="text-2xl font-bold text-slate-800">{shopCount}</p>
          <p className="text-xs text-slate-400">מצרכים לקנייה</p>
        </Link>
        <Link to="/cooking" className="card flex flex-col gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
            <ChefHat size={20} />
          </span>
          <p className="text-2xl font-bold text-slate-800">{mealCount}</p>
          <p className="text-xs text-slate-400">מאכלים השבוע</p>
        </Link>
      </div>

      {/* today */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-semibold text-slate-700">
            <CalendarDays size={18} /> המשימות של היום
          </h2>
          <Link to="/schedule" className="text-xs text-brand-600">
            כל הלוז
          </Link>
        </div>
        {todayTasks.length === 0 ? (
          <div className="card text-center text-sm text-slate-400">אין משימות להיום 🎉</div>
        ) : (
          <div className="space-y-2">
            {todayTasks.map((t) => {
              const cat = TASK_CATEGORIES[t.category as TaskCategory] ?? TASK_CATEGORIES.general;
              return (
                <div key={t.id} className={`card flex items-center gap-3 !py-3 ${t.is_done ? "opacity-50" : ""}`}>
                  <span className="h-8 w-1.5 rounded-full" style={{ background: t.color ?? cat.color }} />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium text-slate-800 ${t.is_done ? "line-through" : ""}`}>
                      {t.title}
                    </p>
                    {t.start_time && (
                      <p className="flex items-center gap-0.5 text-xs text-slate-400">
                        <Clock size={12} /> {formatTime(t.start_time)}
                      </p>
                    )}
                  </div>
                  {t.is_done && <Check size={18} className="text-brand-500" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {myResponsibilities.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold text-slate-700">התחומים שלי</h2>
          <div className="flex flex-wrap gap-2">
            {myResponsibilities.map((r) => (
              <span key={r} className="chip bg-brand-50 text-brand-700">
                {AREAS[r as AreaKey] ?? r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
