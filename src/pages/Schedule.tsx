import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, ChevronRight, ChevronLeft, Check, Clock, Repeat, X, CalendarDays, ListChecks, Pencil, GripVertical, Library } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Modal, EmptyState, FullPageSpinner } from "../components/ui";
import { DAYS_HE, DAYS_HE_SHORT, TASK_CATEGORIES, type TaskCategory } from "../lib/constants";
import { addDays, formatTime, isToday, startOfWeek, toISODate, weekDates } from "../lib/dates";
import { bgWrite, newId } from "../lib/optimistic";
import { useDragReorder } from "../lib/dragReorder";
import type { Tables } from "../types/database";

type Task = Tables<"schedule_tasks">;
type RecurringTask = Tables<"recurring_tasks">;

export default function Schedule() {
  const { homeId, members } = useHome();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subCounts, setSubCounts] = useState<Record<string, { done: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  const days = weekDates(weekStart);
  const weekFrom = toISODate(weekStart);
  const weekTo = toISODate(addDays(weekStart, 6));
  const selectedIso = toISODate(selected);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("schedule_tasks").select("*").eq("home_id", homeId).gte("scheduled_date", weekFrom).lte("scheduled_date", weekTo).order("position").order("start_time", { nullsFirst: true });
    const list = data ?? [];
    setTasks(list);
    const ids = list.map((t) => t.id);
    if (ids.length) {
      const { data: subs } = await supabase.from("task_subtasks").select("task_id, is_done").in("task_id", ids);
      const c: Record<string, { done: number; total: number }> = {};
      (subs ?? []).forEach((s) => {
        c[s.task_id] = c[s.task_id] ?? { done: 0, total: 0 };
        c[s.task_id].total++;
        if (s.is_done) c[s.task_id].done++;
      });
      setSubCounts(c);
    } else {
      setSubCounts({});
    }
    setLoading(false);
  }, [homeId, weekFrom, weekTo]);
  useEffect(() => {
    load();
  }, [load]);

  const nameFor = (uid: string | null) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "";
  // Manual order wins; tasks never dragged all sit at position 0 and fall back to time order.
  const dayTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.scheduled_date === selectedIso)
        .sort((a, b) => a.position - b.position || (a.start_time ?? "99").localeCompare(b.start_time ?? "99")),
    [tasks, selectedIso]
  );
  const countFor = (iso: string) => tasks.filter((t) => t.scheduled_date === iso).length;

  const toggle = (t: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_done: !x.is_done } : x)));
    bgWrite(supabase.from("schedule_tasks").update({ is_done: !t.is_done }).eq("id", t.id), load);
  };
  const remove = (id: string) => {
    setTasks((prev) => prev.filter((x) => x.id !== id));
    bgWrite(supabase.from("schedule_tasks").delete().eq("id", id), load);
  };

  const reorder = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => supabase.from("schedule_tasks").update({ position: i }).eq("id", id)));
      load();
    },
    [load]
  );
  const dr = useDragReorder(dayTasks, reorder);
  const byId = useMemo(() => new Map(dayTasks.map((t) => [t.id, t])), [dayTasks]);

  if (loading) return <FullPageSpinner />;

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="page-title">לוז שבועי</h1>
        <button className="btn btn-sm" onClick={() => setShowRecurring(true)}>
          <Repeat size={15} /> משימות קבועות
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="nst-iconbtn plain" onClick={() => setWeekStart((w) => addDays(w, -7))}>
          <ChevronRight />
        </button>
        <div className="nst-daypick" style={{ flex: 1 }}>
          {days.map((d) => {
            const iso = toISODate(d);
            const cls = `${iso === selectedIso ? "sel" : ""} ${isToday(d) ? "today" : ""}`;
            return (
              <button key={iso} className={`nst-day ${cls}`} onClick={() => setSelected(d)}>
                <span className="dow">{DAYS_HE_SHORT[d.getDay()]}</span>
                <span className="dnum">{d.getDate()}</span>
                {countFor(iso) > 0 && <span className="dot" />}
              </button>
            );
          })}
        </div>
        <button className="nst-iconbtn plain" onClick={() => setWeekStart((w) => addDays(w, 7))}>
          <ChevronLeft />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center", padding: 13 }} onClick={() => setAdding(true)}>
          <Plus size={18} /> משימה ל{DAYS_HE[selected.getDay()]}
        </button>
        <button className="btn" style={{ padding: "0 14px" }} onClick={() => setShowLibrary(true)} title="מאגר משימות קבוע">
          <Library size={16} /> מהמאגר
        </button>
      </div>

      {dayTasks.length === 0 ? (
        <EmptyState icon={<CalendarDays size={42} />} title="אין משימות ליום זה" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {dr.order.map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            const cat = TASK_CATEGORIES[t.category as TaskCategory] ?? TASK_CATEGORIES.general;
            const who = nameFor(t.assigned_to);
            return (
              <div className="task-item" key={t.id} ref={dr.setItemRef(t.id)} style={{ opacity: t.is_done ? 0.55 : 1, ...dr.itemStyle(t.id) }}>
                {dayTasks.length > 1 && (
                  <span className="nst-grip" {...dr.handleProps(t.id)} title="גרירה לסידור">
                    <GripVertical size={17} />
                  </span>
                )}
                <span style={{ width: 5, height: 38, borderRadius: 5, background: t.color ?? cat.color, flex: "none" }} />
                <button className={`nst-check ${t.is_done ? "on" : ""}`} onClick={() => toggle(t)}>
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setDetailTask(t)}
                  style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", textAlign: "right", cursor: "pointer" }}
                >
                  <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: t.is_done ? "line-through" : "none" }}>{t.title}</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 3, flexWrap: "wrap" }}>
                    {t.start_time && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <Clock size={12} />
                        {formatTime(t.start_time)}
                        {t.end_time && `–${formatTime(t.end_time)}`}
                      </span>
                    )}
                    <span className="nst-tag" style={{ color: cat.color, background: cat.color + "1f" }}>{cat.label}</span>
                    {subCounts[t.id] && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: subCounts[t.id].done === subCounts[t.id].total ? "var(--accent)" : "var(--text-muted)" }}>
                        <ListChecks size={12} />
                        {subCounts[t.id].done}/{subCounts[t.id].total}
                      </span>
                    )}
                    {who && <span>{who}</span>}
                  </div>
                </button>
                <button className="nst-del" onClick={() => remove(t.id)}>
                  <Trash2 />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {(adding || editTask) && (
        <TaskModal
          homeId={homeId!}
          dateIso={selectedIso}
          initial={editTask}
          nextPosition={dayTasks.length}
          onClose={() => {
            setAdding(false);
            setEditTask(null);
          }}
          onSaved={(savedDate) => {
            setAdding(false);
            setEditTask(null);
            const d = new Date(savedDate + "T00:00:00");
            setSelected(d);
            setWeekStart(startOfWeek(d));
            load();
          }}
        />
      )}
      {showRecurring && <RecurringTaskModal homeId={homeId!} onClose={() => setShowRecurring(false)} />}
      {showLibrary && (
        <TaskLibraryModal
          homeId={homeId!}
          dateIso={selectedIso}
          dayLabel={DAYS_HE[selected.getDay()]}
          nextPosition={dayTasks.length}
          onClose={() => setShowLibrary(false)}
          onAdded={() => {
            setShowLibrary(false);
            load();
          }}
        />
      )}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onEdit={(t) => {
            setDetailTask(null);
            setEditTask(t);
          }}
          onClose={() => {
            setDetailTask(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function TaskDetailModal({ task, onEdit, onClose }: { task: Task; onEdit: (t: Task) => void; onClose: () => void }) {
  const [subs, setSubs] = useState<Tables<"task_subtasks">[]>([]);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("task_subtasks").select("*").eq("task_id", task.id).order("position").order("created_at");
    setSubs(data ?? []);
  }, [task.id]);
  useEffect(() => {
    load();
  }, [load]);

  const add = () => {
    if (!title.trim()) return;
    const id = newId();
    const row: Tables<"task_subtasks"> = { id, task_id: task.id, home_id: task.home_id, title: title.trim(), is_done: false, position: subs.length, created_at: new Date().toISOString() };
    setSubs((prev) => [...prev, row]);
    setTitle("");
    bgWrite(supabase.from("task_subtasks").insert({ id, task_id: task.id, home_id: task.home_id, title: row.title, position: row.position }), load);
  };
  const toggle = (s: Tables<"task_subtasks">) => {
    setSubs((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_done: !x.is_done } : x)));
    bgWrite(supabase.from("task_subtasks").update({ is_done: !s.is_done }).eq("id", s.id), load);
  };
  const remove = (id: string) => {
    setSubs((prev) => prev.filter((x) => x.id !== id));
    bgWrite(supabase.from("task_subtasks").delete().eq("id", id), load);
  };

  const done = subs.filter((s) => s.is_done).length;

  return (
    <Modal open onClose={onClose} title={task.title}>
      <button className="btn btn-block" style={{ marginBottom: "1rem" }} onClick={() => onEdit(task)}>
        <Pencil size={15} /> עריכת המשימה
      </button>
      <p className="section-sub" style={{ marginBottom: "1rem" }}>
        רשימת תת‑משימות להשלמת המשימה{subs.length ? ` · ${done}/${subs.length} הושלמו` : ""}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <input placeholder="הוספת תת‑משימה…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={add}>
          <Plus size={18} />
        </button>
      </div>

      {subs.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין תת‑משימות עדיין</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {subs.map((s) => (
            <div className="nst-row" key={s.id} style={{ opacity: s.is_done ? 0.55 : 1 }}>
              <button className={`nst-check ${s.is_done ? "on" : ""}`} onClick={() => toggle(s)}>
                <Check size={14} />
              </button>
              <span style={{ flex: 1, font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: s.is_done ? "line-through" : "none" }}>{s.title}</span>
              <button className="nst-del" onClick={() => remove(s.id)}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/**
 * A reusable library of tasks, the schedule's counterpart to `dishes` feeding the
 * weekly menu: manage the templates here, then drop one onto the selected day as
 * a real schedule_tasks row.
 */
function TaskLibraryModal({
  homeId,
  dateIso,
  dayLabel,
  nextPosition,
  onClose,
  onAdded,
}: {
  homeId: string;
  dateIso: string;
  dayLabel: string;
  nextPosition: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Tables<"task_templates">[]>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general");

  const load = useCallback(async () => {
    const { data } = await supabase.from("task_templates").select("*").eq("home_id", homeId).order("position").order("created_at");
    setRows(data ?? []);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const addTemplate = () => {
    if (!title.trim()) return;
    const id = newId();
    const row: Tables<"task_templates"> = {
      id, home_id: homeId, title: title.trim(), category, start_time: start || null, end_time: null,
      position: rows.length, created_by: user?.id ?? null, created_at: new Date().toISOString(),
    };
    setRows((prev) => [...prev, row]);
    setTitle("");
    setStart("");
    bgWrite(
      supabase.from("task_templates").insert({ id, home_id: homeId, title: row.title, category, start_time: row.start_time, position: row.position, created_by: user?.id ?? null }),
      load
    );
  };
  const removeTemplate = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    bgWrite(supabase.from("task_templates").delete().eq("id", id), load);
  };
  const useTemplate = async (r: Tables<"task_templates">) => {
    await supabase.from("schedule_tasks").insert({
      home_id: homeId,
      title: r.title,
      scheduled_date: dateIso,
      start_time: r.start_time,
      end_time: r.end_time,
      category: r.category,
      position: nextPosition,
      created_by: user?.id ?? null,
    });
    onAdded();
  };

  return (
    <Modal open onClose={onClose} title="מאגר משימות">
      <p className="section-sub" style={{ marginTop: "-0.3rem", marginBottom: "1rem" }}>
        משימות ששמורות אצלכם קבוע. הקישו על משימה כדי להוסיף אותה ליום {dayLabel}.
      </p>

      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: "1rem" }}>
        <input placeholder="שם המשימה (למשל: הוצאת זבל)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTemplate()} />
        <div style={{ display: "flex", gap: 8 }}>
          <input type="time" style={{ width: 120 }} value={start} onChange={(e) => setStart(e.target.value)} title="שעה (רשות)" />
          <select style={{ flex: 1 }} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {(Object.keys(TASK_CATEGORIES) as TaskCategory[]).map((k) => (
              <option key={k} value={k}>
                {TASK_CATEGORIES[k].label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={addTemplate}>
          <Plus size={16} /> הוספה למאגר
        </button>
      </div>

      {rows.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>המאגר ריק — הוסיפו משימה קבועה למעלה</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => {
            const cat = TASK_CATEGORIES[r.category as TaskCategory] ?? TASK_CATEGORIES.general;
            return (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
                <button
                  onClick={() => useTemplate(r)}
                  style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, border: "none", background: "transparent", textAlign: "right", cursor: "pointer" }}
                  title={`הוספה ליום ${dayLabel}`}
                >
                  <Plus size={15} style={{ color: "var(--accent)", flex: "none" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--text-2)", fontWeight: 600 }}>{r.title}</span>
                  {r.start_time && <span className="nst-tag">{formatTime(r.start_time)}</span>}
                  <span className="nst-tag" style={{ color: cat.color, background: cat.color + "1f" }}>{cat.label}</span>
                </button>
                <button className="nst-del" onClick={() => removeTemplate(r.id)} title="מחיקה מהמאגר">
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function MemberSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { members } = useHome();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">ללא אחראי</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.profile?.display_name ?? "חבר"}
        </option>
      ))}
    </select>
  );
}

function TaskModal({ homeId, dateIso, initial, nextPosition, onClose, onSaved }: { homeId: string; dateIso: string; initial?: Task | null; nextPosition: number; onClose: () => void; onSaved: (savedDate: string) => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.scheduled_date ?? dateIso);
  const [start, setStart] = useState(initial?.start_time ? initial.start_time.slice(0, 5) : "");
  const [end, setEnd] = useState(initial?.end_time ? initial.end_time.slice(0, 5) : "");
  const [category, setCategory] = useState<TaskCategory>((initial?.category as TaskCategory) ?? "general");
  const [assigned, setAssigned] = useState(initial?.assigned_to ?? "");

  const save = async () => {
    if (!title.trim()) return;
    if (initial) {
      await supabase.from("schedule_tasks").update({ title: title.trim(), scheduled_date: date, start_time: start || null, end_time: end || null, category, assigned_to: assigned || null }).eq("id", initial.id);
    } else {
      await supabase.from("schedule_tasks").insert({ home_id: homeId, title: title.trim(), scheduled_date: date, start_time: start || null, end_time: end || null, category, assigned_to: assigned || null, position: nextPosition, created_by: user?.id ?? null });
    }
    onSaved(date);
  };

  return (
    <Modal open onClose={onClose} title={initial ? "עריכת משימה" : "משימה חדשה"}>
      <div className="nst-fields">
        <div>
          <label>כותרת המשימה</label>
          <input placeholder="למשל: הוצאת זבל" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label>תאריך {initial ? "(אפשר להעביר ליום אחר)" : ""}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label>משעה</label>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>עד שעה</label>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label>קטגוריה</label>
          <div style={{ display: "flex", gap: 7 }}>
            {(Object.keys(TASK_CATEGORIES) as TaskCategory[]).map((k) => (
              <button
                key={k}
                className={`nst-chip ${category === k ? "active" : ""}`}
                style={{ flex: 1, justifyContent: "center", ...(category === k ? { background: TASK_CATEGORIES[k].color, boxShadow: "none" } : {}) }}
                onClick={() => setCategory(k)}
              >
                {TASK_CATEGORIES[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>אחראי</label>
          <MemberSelect value={assigned} onChange={setAssigned} />
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 12 }} onClick={save}>
          שמירה
        </button>
      </div>
    </Modal>
  );
}

function RecurringTaskModal({ homeId, onClose }: { homeId: string; onClose: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<RecurringTask[]>([]);
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(0);
  const [start, setStart] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general");
  const [assigned, setAssigned] = useState("");
  const [intervalWeeks, setIntervalWeeks] = useState(1);

  const intervalLabel = (n: number) => (n === 1 ? "כל שבוע" : n === 2 ? "כל שבועיים" : "כל 4 שבועות");

  const load = useCallback(async () => {
    const { data } = await supabase.from("recurring_tasks").select("*").eq("home_id", homeId).order("day_of_week");
    setRows(data ?? []);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    await supabase.from("recurring_tasks").insert({ home_id: homeId, title: title.trim(), day_of_week: day, start_time: start || null, category, assigned_to: assigned || null, interval_weeks: intervalWeeks, created_by: user?.id ?? null });
    setTitle("");
    setStart("");
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("recurring_tasks").delete().eq("id", id);
    load();
  };

  return (
    <Modal open onClose={onClose} title="משימות קבועות">
      <p className="section-sub" style={{ marginTop: "-0.3rem", marginBottom: "1rem" }}>משימות שייכנסו ללוז אוטומטית בכל שבוע ביום ובשעה שתגדירו.</p>
      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: "1rem" }}>
        <input placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ flex: 1 }} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS_HE.map((d, i) => (
              <option key={i} value={i}>
                יום {d}
              </option>
            ))}
          </select>
          <input type="time" style={{ width: 120 }} value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ flex: 1 }} value={intervalWeeks} onChange={(e) => setIntervalWeeks(Number(e.target.value))}>
            {[1, 2, 4].map((n) => (
              <option key={n} value={n}>
                {intervalLabel(n)}
              </option>
            ))}
          </select>
          <select style={{ flex: 1 }} value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {(Object.keys(TASK_CATEGORIES) as TaskCategory[]).map((k) => (
              <option key={k} value={k}>
                {TASK_CATEGORIES[k].label}
              </option>
            ))}
          </select>
        </div>
        <MemberSelect value={assigned} onChange={setAssigned} />
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={add}>
          <Plus size={16} /> הוספה
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין משימות קבועות</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-2)", fontWeight: 500 }}>{r.title}</span>
            <span className="badge b-wt">
              {intervalLabel(r.interval_weeks)} · {DAYS_HE[r.day_of_week]} {formatTime(r.start_time)}
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
