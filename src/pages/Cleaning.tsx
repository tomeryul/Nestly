import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Sparkles, DoorOpen, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner } from "../components/ui";
import { startOfWeek, toISODate } from "../lib/dates";
import type { Tables } from "../types/database";

type CleaningTask = Tables<"cleaning_tasks">;
type Room = Tables<"cleaning_rooms">;
const ROOM_SUGGESTIONS = ["מטבח", "סלון", "חדר שינה", "חדר שינה הורים", "חדר ילדים", "שירותים", "שירותים הורים", "מקלחת", "מרפסת", "כניסה"];

export function periodKeyFor(freq: "weekly" | "monthly", d = new Date()) {
  if (freq === "weekly") return toISODate(startOfWeek(d));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Cleaning() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newRoom, setNewRoom] = useState("");

  const periodKey = useMemo(() => periodKeyFor(tab), [tab]);

  const load = useCallback(async () => {
    if (!homeId) return;
    const [r, t] = await Promise.all([
      supabase.from("cleaning_rooms").select("*").eq("home_id", homeId).eq("frequency", tab).order("position").order("created_at"),
      supabase.from("cleaning_tasks").select("*").eq("home_id", homeId).eq("frequency", tab).order("position").order("created_at"),
    ]);
    setRooms(r.data ?? []);
    const list = t.data ?? [];
    setTasks(list);
    if (list.length) {
      const { data: comps } = await supabase.from("cleaning_completions").select("cleaning_task_id").eq("period_key", periodKey).in("cleaning_task_id", list.map((x) => x.id));
      setDoneIds(new Set((comps ?? []).map((c) => c.cleaning_task_id)));
    } else {
      setDoneIds(new Set());
    }
    setLoading(false);
  }, [homeId, tab, periodKey]);

  useEffect(() => {
    load();
  }, [load]);

  const addRoom = async () => {
    if (!newRoom.trim() || !homeId) return;
    await supabase.from("cleaning_rooms").insert({ home_id: homeId, name: newRoom.trim(), frequency: tab, position: rooms.length });
    setNewRoom("");
    load();
  };
  const removeRoom = async (id: string) => {
    await supabase.from("cleaning_rooms").delete().eq("id", id);
    load();
  };
  const addTask = async (roomId: string | null, title: string) => {
    if (!title.trim() || !homeId) return;
    await supabase.from("cleaning_tasks").insert({ home_id: homeId, title: title.trim(), room_id: roomId, frequency: tab, created_by: user?.id ?? null });
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
  const removeTask = async (id: string) => {
    await supabase.from("cleaning_tasks").delete().eq("id", id);
    load();
  };

  const tasksByRoom = useMemo(() => {
    const m = new Map<string, CleaningTask[]>();
    tasks.forEach((t) => {
      const key = t.room_id ?? "__none__";
      (m.get(key) ?? m.set(key, []).get(key)!).push(t);
    });
    return m;
  }, [tasks]);

  const doneCount = tasks.filter((t) => doneIds.has(t.id)).length;
  const noRoomTasks = tasksByRoom.get("__none__") ?? [];

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
            <div className="next-action-title">{doneCount}/{tasks.length} הושלמו</div>
          </div>
        </div>
      )}

      {/* add room */}
      <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", gap: 8 }}>
        <input style={{ flex: 1 }} list="room-suggestions" placeholder="הוספת חדר חדש…" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRoom()} />
        <datalist id="room-suggestions">
          {ROOM_SUGGESTIONS.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={addRoom}>
          <DoorOpen size={18} />
        </button>
      </div>

      {rooms.length === 0 && noRoomTasks.length === 0 ? (
        <EmptyState icon={<Sparkles size={42} />} title="בואו נבנה את רשימת הניקיון" hint="הוסיפו חדרים, ותחת כל חדר את המשימות שחוזרות כל תקופה" />
      ) : (
        <>
          {rooms.map((room) => (
            <RoomSection
              key={room.id}
              name={room.name}
              tasks={tasksByRoom.get(room.id) ?? []}
              doneIds={doneIds}
              onAddTask={(title) => addTask(room.id, title)}
              onToggle={toggle}
              onRemoveTask={removeTask}
              onRemoveRoom={() => removeRoom(room.id)}
            />
          ))}
          {noRoomTasks.length > 0 && (
            <RoomSection name="ללא חדר" tasks={noRoomTasks} doneIds={doneIds} onAddTask={(title) => addTask(null, title)} onToggle={toggle} onRemoveTask={removeTask} />
          )}
        </>
      )}
    </section>
  );
}

function RoomSection({
  name,
  tasks,
  doneIds,
  onAddTask,
  onToggle,
  onRemoveTask,
  onRemoveRoom,
}: {
  name: string;
  tasks: CleaningTask[];
  doneIds: Set<string>;
  onAddTask: (title: string) => void;
  onToggle: (t: CleaningTask) => void;
  onRemoveTask: (id: string) => void;
  onRemoveRoom?: () => void;
}) {
  const [title, setTitle] = useState("");
  const submit = () => {
    onAddTask(title);
    setTitle("");
  };
  const done = tasks.filter((t) => doneIds.has(t.id)).length;

  return (
    <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <DoorOpen size={16} style={{ color: "var(--accent)" }} />
        <h2 style={{ font: "600 16px var(--font-display)", color: "var(--text-bright)", margin: 0, flex: 1 }}>{name}</h2>
        {tasks.length > 0 && (
          <span className="badge b-wt" style={{ borderRadius: 30 }}>
            {done}/{tasks.length}
          </span>
        )}
        {onRemoveRoom && (
          <button className="nst-del" onClick={onRemoveRoom} title="מחיקת חדר">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {tasks.map((t) => {
        const isDone = doneIds.has(t.id);
        return (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, opacity: isDone ? 0.55 : 1 }}>
            <button className={`nst-check ${isDone ? "on" : ""}`} onClick={() => onToggle(t)}>
              <Check size={14} />
            </button>
            <span style={{ flex: 1, font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: isDone ? "line-through" : "none" }}>{t.title}</span>
            <button className="nst-del" onClick={() => onRemoveTask(t.id)}>
              <X size={16} />
            </button>
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        <input style={{ flex: 1 }} placeholder="הוספת משימה…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn" style={{ padding: "0 14px" }} onClick={submit}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
