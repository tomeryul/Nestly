import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, ChefHat, CalendarDays, Users, BellRing, Check, Clock } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { AREAS, DAYS_HE, TASK_CATEGORIES, type AreaKey, type TaskCategory } from "../lib/constants";
import { formatTime, toISODate, startOfWeek } from "../lib/dates";
import { enablePush, pushEnabled, pushSupported } from "../lib/push";
import type { Tables } from "../types/database";

type Task = Tables<"schedule_tasks">;

export default function Dashboard() {
  const { homeId, myResponsibilities, members } = useHome();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [shopCount, setShopCount] = useState(0);
  const [mealCount, setMealCount] = useState(0);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  const todayIso = toISODate(new Date());
  const weekIso = toISODate(startOfWeek(new Date()));
  const me = members.find((m) => m.user_id === user?.id);
  const meFirst = (me?.profile?.display_name ?? "").split(" ")[0] || "בבית";

  const load = useCallback(async () => {
    if (!homeId) return;
    const [t, s, m] = await Promise.all([
      supabase.from("schedule_tasks").select("*").eq("home_id", homeId).eq("scheduled_date", todayIso).order("start_time", { nullsFirst: true }),
      supabase.from("shopping_items").select("id", { count: "exact", head: true }).eq("home_id", homeId).eq("is_checked", false),
      supabase.from("weekly_meals").select("id", { count: "exact", head: true }).eq("home_id", homeId).eq("week_start", weekIso),
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
  const toggle = async (t: Task) => {
    await supabase.from("schedule_tasks").update({ is_done: !t.is_done }).eq("id", t.id);
    load();
  };
  const nameFor = (uid: string | null) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "";

  const nextTask = todayTasks.find((t) => !t.is_done);

  const tile = (bg: string, fg: string): CSSProperties => ({ ["--cat-bg" as string]: bg, ["--cat-fg" as string]: fg });
  const stats = [
    { label: "מצרכים לקנייה", value: shopCount, icon: ShoppingCart, to: "/shopping", bg: "var(--cat-1-bg)", fg: "var(--cat-1-fg)" },
    { label: "מאכלים השבוע", value: mealCount, icon: ChefHat, to: "/cooking", bg: "var(--cat-3-bg)", fg: "var(--cat-3-fg)" },
    { label: "משימות היום", value: todayTasks.length, icon: CalendarDays, to: "/schedule", bg: "var(--cat-5-bg)", fg: "var(--cat-5-fg)" },
    { label: "חברי הבית", value: members.length, icon: Users, to: "/settings", bg: "var(--cat-7-bg)", fg: "var(--cat-7-fg)" },
  ];

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <p style={{ font: "700 11.5px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)" }}>
          יום {DAYS_HE[dow]}
        </p>
        <h1 style={{ font: "600 30px var(--font-display)", color: "var(--text-bright)", letterSpacing: "-0.022em", marginTop: 2 }}>
          שלום, {meFirst} 👋
        </h1>
      </div>

      {pushOn === false && pushSupported() && (
        <div className="next-action">
          <span className="next-action-ico">
            <BellRing />
          </span>
          <div className="next-action-body">
            <div className="next-action-kicker">התראות</div>
            <div className="next-action-title">קבלו תזכורות למשימות ולקניות</div>
          </div>
          <button className="next-action-cta" onClick={turnOnPush} disabled={pushBusy}>
            הפעלה
          </button>
        </div>
      )}

      {nextTask && (
        <div className="next-action is-calm">
          <span className="next-action-ico">
            <CalendarDays />
          </span>
          <div className="next-action-body">
            <div className="next-action-kicker">המשימה הבאה</div>
            <div className="next-action-title">
              {nextTask.title}
              {nextTask.start_time ? ` · ${formatTime(nextTask.start_time)}` : ""}
            </div>
          </div>
          <button className="next-action-cta" onClick={() => navigate("/schedule")}>
            ללוז
          </button>
        </div>
      )}

      <div className="section-overview">
        {stats.map((s) => (
          <button key={s.label} className="sec-tile" style={tile(s.bg, s.fg)} onClick={() => navigate(s.to)}>
            <span className="sec-tile-ico">
              <s.icon />
            </span>
            <span className="sec-tile-count">{s.value}</span>
            <span className="sec-tile-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="nst-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 className="nst-card-title">
            <CalendarDays /> המשימות של היום
          </h2>
          <button className="nst-chip" style={{ boxShadow: "none", background: "transparent", color: "var(--accent)", padding: "4px 6px" }} onClick={() => navigate("/schedule")}>
            כל הלוז
          </button>
        </div>
        {todayTasks.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "0.5rem 0" }}>אין משימות להיום 🎉</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {todayTasks.map((t) => {
              const cat = TASK_CATEGORIES[t.category as TaskCategory] ?? TASK_CATEGORIES.general;
              return (
                <div className="task-item" key={t.id} style={{ opacity: t.is_done ? 0.55 : 1 }}>
                  <span style={{ width: 5, height: 34, borderRadius: 5, background: t.color ?? cat.color, flex: "none" }} />
                  <button className={`nst-check ${t.is_done ? "on" : ""}`} onClick={() => toggle(t)}>
                    <Check size={14} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: t.is_done ? "line-through" : "none" }}>{t.title}</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
                      {t.start_time && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <Clock size={12} />
                          {formatTime(t.start_time)}
                        </span>
                      )}
                      <span className="nst-tag" style={{ color: cat.color, background: cat.color + "1f" }}>{cat.label}</span>
                      {nameFor(t.assigned_to) && <span>{nameFor(t.assigned_to)}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {myResponsibilities.length > 0 && (
        <div className="nst-card">
          <h2 className="nst-card-title" style={{ marginBottom: "0.9rem" }}>
            <Check /> התחומים שלי
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {myResponsibilities.map((r) => (
              <span key={r} className="badge b-wt" style={{ padding: "7px 14px", borderRadius: 30, fontSize: 12 }}>
                {AREAS[r as AreaKey] ?? r}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
