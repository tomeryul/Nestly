import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Sparkles, DoorOpen } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner } from "../components/ui";
import { startOfWeek, toISODate } from "../lib/dates";
import type { Tables } from "../types/database";

type CleaningTask = Tables<"cleaning_tasks">;
const ROOMS = ["מטבח", "סלון", "חדר שינה", "חדר ילדים", "שירותים", "מקלחת", "מרפסת", "כללי"];

export function periodKeyFor(freq: "weekly" | "monthly", d = new Date()) {
  if (freq === "weekly") return toISODate(startOfWeek(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Cleaning() {
  const { homeId, members } = useHome();
  const { user } = useAuth();
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [room, setRoom] = useState("");
  const [assignee, setAssignee] = useState("");

  const periodKey = useMemo(() => periodKeyFor(tab), [tab]);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("cleaning_tasks").select("*").eq("home_id", homeId).eq("frequency", tab).order("room").order("position").order("created_at");
    const list = data ?? [];
    setTasks(list);
    if (list.length) {
      const { data: comps } = await supabase.from("cleaning_completions").select("cleaning_task_id").eq("period_key", periodKey).in("cleaning_task_id", list.map((t) => t.id));
      setDoneIds(new Set((comps ?? []).map((c) => c.cleaning_task_id)));
    } else {
      setDoneIds(new Set());
    }
    setLoading(false);
  }, [homeId, tab, periodKey]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!title.trim() || !homeId) return;
    await supabase.from("cleaning_tasks").insert({ home_id: homeId, title: title.trim(), room: room.trim() || null, frequency: tab, assigned_to: assignee || null, created_by: user?.id ?? null });
    setTitle("");
    setRoom("");
    setAssignee("");
    load();
  };
  const toggle = async (t: CleaningTask) => {
    if (doneIds.has(t.id)) {
      await supabase.from("cleaning_completions").delete().eq("cleaning_task_id", t.id).eq("period_key", periodKey);
    } else {
      await supabase.from("cleaning_completions").insert({ cleaning_task_id: t.id, home_id: t.home_id, period_key: periodKey, done_by: user?.id ?? null });
    }
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("cleaning_tasks").delete().eq("id", id);
    load();
  };

  const nameFor = (uid: string | null) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "";
  const doneCount = tasks.filter((t) => doneIds.has(t.id)).length;

  // group by room
  const groups = useMemo(() => {
    const g: Record<string, CleaningTask[]> = {};
    tasks.forEach((t) => {
      const key = t.room?.trim() || "כללי";
      (g[key] = g[key] ?? []).push(t);
    });
    return Object.entries(g);
  }, [tasks]);

  if (loading) return <FullPageSpinner />;

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1 className="page-title">ניקיון</h1>
      <div className="nst-seg">
        <button className={tab === "weekly" ? "active" : ""} onClick={() => setTab("weekly")}>
          משימות השבוע
        </button>
        <button className={tab === "monthly" ? "active" : ""} onClick={() => setTab("monthly")}>
          משימות החודש
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="next-action is-calm">
          <span className="next-action-ico">
            <Sparkles />
          </span>
          <div className="next-action-body">
            <div className="next-action-kicker">{tab === "weekly" ? "השבוע" : "החודש"}</div>
            <div className="next-action-title">
              {doneCount}/{tasks.length} הושלמו
            </div>
          </div>
        </div>
      )}

      {/* add task */}
      <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder="משימת ניקיון חדשה…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ flex: 1 }} list="rooms" placeholder="חדר (רשות)" value={room} onChange={(e) => setRoom(e.target.value)} />
          <datalist id="rooms">
            {ROOMS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <select style={{ flex: 1 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">אחראי (רשות)</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.display_name ?? "חבר"}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={add}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={<Sparkles size={42} />} title={`אין משימות ${tab === "weekly" ? "שבועיות" : "חודשיות"}`} hint="הוסיפו משימת ניקיון והיא תחזור בכל תקופה" />
      ) : (
        groups.map(([roomName, roomTasks]) => (
          <div key={roomName}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "0.2rem 4px 0.5rem", color: "var(--text-3)", font: "700 11.5px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <DoorOpen size={13} /> {roomName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {roomTasks.map((t) => {
                const done = doneIds.has(t.id);
                return (
                  <div className="nst-row" key={t.id} style={{ opacity: done ? 0.55 : 1 }}>
                    <button className={`nst-check ${done ? "on" : ""}`} onClick={() => toggle(t)}>
                      <Check size={14} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: done ? "line-through" : "none" }}>{t.title}</p>
                      {nameFor(t.assigned_to) && (
                        <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>{nameFor(t.assigned_to)}</p>
                      )}
                    </div>
                    <button className="nst-del" onClick={() => remove(t.id)}>
                      <Trash2 />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
