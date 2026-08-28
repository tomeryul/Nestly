import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Sparkles, DoorOpen, X, GripVertical, ChevronDown, Printer, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner } from "../components/ui";
import { startOfWeek, toISODate, addDays, formatDayMonth } from "../lib/dates";
import { useDragReorder } from "../lib/dragReorder";
import { bgWrite, newId } from "../lib/optimistic";
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
  const [exporting, setExporting] = useState(false);

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

  const addRoom = () => {
    if (!newRoom.trim() || !homeId) return;
    const id = newId();
    const row: Room = { id, home_id: homeId, name: newRoom.trim(), frequency: tab, position: rooms.length, created_at: new Date().toISOString() };
    setRooms((prev) => [...prev, row]);
    setNewRoom("");
    bgWrite(supabase.from("cleaning_rooms").insert({ id, home_id: homeId, name: row.name, frequency: tab, position: row.position }), load);
  };
  const removeRoom = (id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setTasks((prev) => prev.filter((t) => t.room_id !== id));
    bgWrite(supabase.from("cleaning_rooms").delete().eq("id", id), load);
  };
  const renameRoom = (id: string, name: string) => {
    const n = name.trim();
    if (!n) return;
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, name: n } : r)));
    bgWrite(supabase.from("cleaning_rooms").update({ name: n }).eq("id", id), load);
  };
  const addTask = (roomId: string | null, title: string) => {
    if (!title.trim() || !homeId) return;
    const id = newId();
    const row: CleaningTask = { id, home_id: homeId, title: title.trim(), room_id: roomId, room: null, frequency: tab, position: tasks.length, assigned_to: null, created_by: user?.id ?? null, created_at: new Date().toISOString() };
    setTasks((prev) => [...prev, row]);
    bgWrite(supabase.from("cleaning_tasks").insert({ id, home_id: homeId, title: row.title, room_id: roomId, frequency: tab, created_by: user?.id ?? null }), load);
  };
  const toggle = (t: CleaningTask) => {
    const has = doneIds.has(t.id);
    setDoneIds((prev) => {
      const n = new Set(prev);
      if (has) n.delete(t.id);
      else n.add(t.id);
      return n;
    });
    if (has) {
      bgWrite(supabase.from("cleaning_completions").delete().eq("cleaning_task_id", t.id).eq("period_key", periodKey), load);
    } else {
      bgWrite(supabase.from("cleaning_completions").insert({ cleaning_task_id: t.id, home_id: t.home_id, period_key: periodKey, done_by: user?.id ?? null }), load);
    }
  };
  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    bgWrite(supabase.from("cleaning_tasks").delete().eq("id", id), load);
  };
  const renameTask = (id: string, title: string) => {
    const n = title.trim();
    if (!n) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: n } : t)));
    bgWrite(supabase.from("cleaning_tasks").update({ title: n }).eq("id", id), load);
  };
  const reorderTasks = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => supabase.from("cleaning_tasks").update({ position: i }).eq("id", id)));
      load();
    },
    [load]
  );

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

  const periodLabel = (() => {
    if (tab === "weekly") {
      const s = startOfWeek(new Date());
      return `שבוע ${formatDayMonth(s)} – ${formatDayMonth(addDays(s, 6))}`;
    }
    return new Date().toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  })();

  const exportSheet = async () => {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
    const roomBlock = (title: string, list: CleaningTask[]) =>
      list.length
        ? `<div style="margin-bottom:20px"><div style="font-size:18px;font-weight:700;border-bottom:1px solid #bbb;padding-bottom:5px;margin-bottom:6px">${esc(title)}</div><table style="width:100%;border-collapse:collapse">${list
            .map(
              (t) =>
                `<tr><td style="width:30px;padding:7px 0;vertical-align:middle"><span style="display:inline-block;width:18px;height:18px;border:1.6px solid #111;border-radius:4px"></span></td><td style="padding:7px 10px;font-size:16px;vertical-align:middle;text-align:right">${esc(t.title)}</td></tr>`
            )
            .join("")}</table></div>`
        : "";
    const bodyHtml = rooms.map((r) => roomBlock(r.name, tasksByRoom.get(r.id) ?? [])).join("") + roomBlock("ללא חדר", noRoomTasks);

    const el = document.createElement("div");
    el.dir = "rtl";
    el.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#111;padding:40px;font-family:Arial,'Segoe UI',sans-serif;";
    el.innerHTML = `<div style="border-bottom:3px solid #111;padding-bottom:12px;margin-bottom:22px"><div style="font-size:26px;font-weight:700">דף ניקיון ${tab === "weekly" ? "שבועי" : "חודשי"}</div><div style="font-size:16px;color:#444;margin-top:6px;font-weight:600">${esc(periodLabel)}</div></div>${bodyHtml || '<div style="color:#666">אין משימות ברשימה.</div>'}`;
    document.body.appendChild(el);
    setExporting(true);
    try {
      const [{ jsPDF }, html2canvas] = await Promise.all([import("jspdf"), import("html2canvas").then((m) => m.default)]);
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(img, "PNG", 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`דף-ניקיון-${tab === "weekly" ? "שבועי" : "חודשי"}.pdf`);
    } catch (e) {
      console.error(e);
      alert("אירעה שגיאה בהכנת ה-PDF. נסו שוב.");
    } finally {
      setExporting(false);
      document.body.removeChild(el);
    }
  };

  if (loading) return <FullPageSpinner />;

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h1 className="page-title">ניקיון</h1>
        <button className="btn btn-sm" onClick={exportSheet} disabled={exporting} title="הורדת דף PDF להדפסה">
          <Printer size={15} /> {exporting ? "מכין…" : "הורדת PDF"}
        </button>
      </div>
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
              {doneCount}/{tasks.length} הושלמו · {Math.round((doneCount / tasks.length) * 100)}%
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
              <span className="nst-meter">
                <i style={{ width: `${(doneCount / tasks.length) * 100}%` }} />
              </span>
              {doneCount === tasks.length && <span style={{ fontSize: 15 }}>🎉</span>}
            </div>
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
              collapseKey={`${tab}:${room.id}`}
              name={room.name}
              tasks={tasksByRoom.get(room.id) ?? []}
              doneIds={doneIds}
              onAddTask={(title) => addTask(room.id, title)}
              onToggle={toggle}
              onRemoveTask={removeTask}
              onReorder={reorderTasks}
              onRemoveRoom={() => removeRoom(room.id)}
              onRename={(name) => renameRoom(room.id, name)}
              onRenameTask={renameTask}
            />
          ))}
          {noRoomTasks.length > 0 && (
            <RoomSection collapseKey={`${tab}:none`} name="ללא חדר" tasks={noRoomTasks} doneIds={doneIds} onAddTask={(title) => addTask(null, title)} onToggle={toggle} onRemoveTask={removeTask} onReorder={reorderTasks} onRenameTask={renameTask} />
          )}
        </>
      )}
    </section>
  );
}

function RoomSection({
  collapseKey,
  name,
  tasks,
  doneIds,
  onAddTask,
  onToggle,
  onRemoveTask,
  onReorder,
  onRemoveRoom,
  onRename,
  onRenameTask,
}: {
  collapseKey: string;
  name: string;
  tasks: CleaningTask[];
  doneIds: Set<string>;
  onAddTask: (title: string) => void;
  onToggle: (t: CleaningTask) => void;
  onRemoveTask: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onRemoveRoom?: () => void;
  onRename?: (name: string) => void;
  onRenameTask?: (id: string, title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState("");
  const storageKey = `nestly.cleanCollapse.${collapseKey}`;
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey) === "1");
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      localStorage.setItem(storageKey, c ? "0" : "1");
      return !c;
    });
  const dr = useDragReorder(tasks, onReorder);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const submit = () => {
    onAddTask(title);
    setTitle("");
  };
  const startEdit = () => {
    setDraft(name);
    setEditing(true);
  };
  const saveEdit = () => {
    if (draft.trim() && draft.trim() !== name) onRename?.(draft);
    setEditing(false);
  };
  const done = tasks.filter((t) => doneIds.has(t.id)).length;

  return (
    <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={toggleCollapsed} title={collapsed ? "הרחבה" : "צמצום"} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--accent)", display: "flex", padding: 0, lineHeight: 0 }}>
          <ChevronDown size={18} style={{ transition: "transform .15s", transform: collapsed ? "rotate(-90deg)" : "none" }} />
        </button>
        <DoorOpen size={16} style={{ color: "var(--accent)" }} />
        {editing ? (
          <>
            <input
              autoFocus
              style={{ flex: 1, font: "600 15px var(--font-body)" }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button className="nst-check on" onClick={saveEdit} title="שמירה">
              <Check size={14} />
            </button>
          </>
        ) : (
          <>
            <h2 onClick={toggleCollapsed} style={{ font: "600 16px var(--font-display)", color: "var(--text-bright)", margin: 0, flex: 1, cursor: "pointer" }}>{name}</h2>
            {tasks.length > 0 && (
              <span className="badge b-wt" style={{ borderRadius: 30 }}>
                {done}/{tasks.length}
              </span>
            )}
            {onRename && (
              <button className="nst-del" onClick={startEdit} title="עריכת שם החדר">
                <Pencil size={15} />
              </button>
            )}
            {onRemoveRoom && (
              <button className="nst-del" onClick={onRemoveRoom} title="מחיקת חדר">
                <Trash2 size={16} />
              </button>
            )}
          </>
        )}
      </div>

      {tasks.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: -2 }}>
          <span className="nst-meter">
            <i style={{ width: `${(done / tasks.length) * 100}%` }} />
          </span>
          <span style={{ font: "700 11px var(--font-body)", color: done === tasks.length ? "var(--ok)" : "var(--text-muted)", minWidth: 34, textAlign: "left" }}>
            {Math.round((done / tasks.length) * 100)}%
          </span>
        </div>
      )}

      {collapsed
        ? null
        : dr.order.map((id) => {
        const t = byId.get(id);
        if (!t) return null;
        const isDone = doneIds.has(t.id);
        return (
          <div key={t.id} ref={dr.setItemRef(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, opacity: isDone ? 0.55 : 1, ...dr.itemStyle(t.id) }}>
            {editingTask === t.id ? (
              <>
                <input
                  autoFocus
                  style={{ flex: 1, font: "600 14px var(--font-body)" }}
                  value={taskDraft}
                  onChange={(e) => setTaskDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (taskDraft.trim() && taskDraft.trim() !== t.title) onRenameTask?.(t.id, taskDraft);
                      setEditingTask(null);
                    }
                    if (e.key === "Escape") setEditingTask(null);
                  }}
                />
                <button
                  className="nst-check on"
                  title="שמירה"
                  onClick={() => {
                    if (taskDraft.trim() && taskDraft.trim() !== t.title) onRenameTask?.(t.id, taskDraft);
                    setEditingTask(null);
                  }}
                >
                  <Check size={14} />
                </button>
              </>
            ) : (
              <>
                {tasks.length > 1 && (
                  <span className="nst-grip" {...dr.handleProps(t.id)} title="גרירה לסידור">
                    <GripVertical size={17} />
                  </span>
                )}
                <button className={`nst-check ${isDone ? "on" : ""}`} onClick={() => onToggle(t)}>
                  <Check size={14} />
                </button>
                <span
                  onClick={() => {
                    if (!onRenameTask) return;
                    setTaskDraft(t.title);
                    setEditingTask(t.id);
                  }}
                  style={{ flex: 1, font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: isDone ? "line-through" : "none", cursor: onRenameTask ? "pointer" : "default" }}
                >
                  {t.title}
                </span>
                {onRenameTask && (
                  <button
                    className="nst-del"
                    title="עריכת המשימה"
                    onClick={() => {
                      setTaskDraft(t.title);
                      setEditingTask(t.id);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button className="nst-del" onClick={() => onRemoveTask(t.id)}>
                  <X size={16} />
                </button>
              </>
            )}
          </div>
        );
      })}

      {!collapsed && (
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <input style={{ flex: 1 }} placeholder="הוספת משימה…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <button className="btn" style={{ padding: "0 14px" }} onClick={submit}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
