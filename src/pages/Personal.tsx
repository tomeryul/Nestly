import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Plus, Check, X, User, Globe, GripVertical, Pencil, CalendarClock, CalendarDays, Clock, History } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDoneLast } from "../lib/doneLast";
import { supabase } from "../lib/supabase";
import { useOnResume, useSeedFromCache, writeCache } from "../lib/cache";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner, Modal } from "../components/ui";
import { carriedLabel, dayLabel, toISODate } from "../lib/dates";
import { useDragReorder } from "../lib/dragReorder";
import { reinsert, removeWithUndo } from "../lib/undo";
import { bgWrite, newId } from "../lib/optimistic";
import type { Tables } from "../types/database";

type PTask = Tables<"personal_tasks">;
type STask = Tables<"schedule_tasks">;

/** Schedule order: by day, then by time (untimed last on their day), then manual position. */
const bySchedule = (a: STask, b: STask) =>
  a.scheduled_date.localeCompare(b.scheduled_date) || (a.start_time ?? "99").localeCompare(b.start_time ?? "99") || a.position - b.position;

export default function Personal() {
  const { homeId, members } = useHome();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PTask[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  // Two kinds of schedule rows matter here:
  //  * ones assigned to someone, shown in that person's section under "בלוז" —
  //    today's (ticked or not: a tick sinks it, it doesn't vanish) and every
  //    unfinished one ahead; the same row as the schedule's, so a tick is shared;
  //  * ones linked to a task on this page (personal_task_id): the task stays in
  //    its list and the schedule holds a twin, kept in step by the database —
  //    tick or rename either and the other follows.
  const [sched, setSched] = useState<STask[]>([]);
  const [schedFor, setSchedFor] = useState<PTask | null>(null);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("personal_tasks").select("*").eq("home_id", homeId).order("is_done").order("position").order("created_at");
    setTasks(data ?? []);
    setLoading(false);
    writeCache(`personal.${homeId}`, data ?? []);
  }, [homeId]);
  useSeedFromCache<PTask[]>(homeId && `personal.${homeId}`, (c) => {
    setTasks(c);
    setLoading(false);
  });
  useEffect(() => {
    load();
  }, [load]);
  useOnResume(load);

  const loadSched = useCallback(async () => {
    if (!homeId) return;
    const today = toISODate(new Date());
    const { data } = await supabase
      .from("schedule_tasks")
      .select("*")
      .eq("home_id", homeId)
      .or("assigned_to.not.is.null,personal_task_id.not.is.null")
      .gte("scheduled_date", today)
      .order("scheduled_date")
      .limit(300);
    const rows = (data ?? []).filter((s) => s.scheduled_date === today || !s.is_done).sort(bySchedule);
    setSched(rows);
    writeCache(`personal.sched.${homeId}`, rows);
  }, [homeId]);
  useSeedFromCache<STask[]>(homeId && `personal.sched.${homeId}`, setSched);
  useEffect(() => {
    loadSched();
  }, [loadSched]);
  useOnResume(loadSched);

  const toggleScheduled = (s: STask) => {
    setSched((prev) => prev.map((x) => (x.id === s.id ? { ...x, is_done: !x.is_done } : x)));
    bgWrite(supabase.from("schedule_tasks").update({ is_done: !s.is_done }).eq("id", s.id), loadSched);
  };

  /** Schedule twins by the task they belong to. */
  const linked = useMemo(() => new Map(sched.filter((s) => s.personal_task_id).map((s) => [s.personal_task_id!, s])), [sched]);

  /**
   * Put a task on the schedule for a day (and maybe a time). The task stays in
   * its list; the schedule gets a linked twin — assigned to the task's owner,
   * with reminders and carry-over like any schedule task. Asked again for a
   * task that is already on, it moves the twin to the new day/time instead.
   */
  const putOnSchedule = async (t: PTask, date: string, time: string | null) => {
    if (!homeId) return;
    setSchedFor(null);
    const twin = linked.get(t.id);
    const when = dayLabel(date, time);
    const action = { label: "ללוז", onClick: () => navigate("/schedule", { state: { date } }) };
    if (twin) {
      const patch = { scheduled_date: date, start_time: time, carried_from: null, reminded: false };
      setSched((prev) => prev.map((x) => (x.id === twin.id ? { ...x, ...patch } : x)).sort(bySchedule));
      const { error } = await supabase.from("schedule_tasks").update(patch).eq("id", twin.id);
      if (error) {
        toast.error("לא הצלחנו לעדכן בלוז");
        loadSched();
      } else toast.success("עודכן בלוז", { description: `${t.title} · ${when}`, action });
      return;
    }
    const row: STask = {
      id: newId(), home_id: homeId, title: t.title, description: null, category: "general",
      scheduled_date: date, start_time: time, end_time: null,
      assigned_to: t.scope === "personal" ? t.owner_id : null, is_done: t.is_done, color: null,
      recurring_id: null, reminded: false, position: 0, carried_from: null, personal_task_id: t.id,
      created_by: user?.id ?? null, created_at: new Date().toISOString(),
    };
    setSched((prev) => [...prev, row].sort(bySchedule));
    // The schedule's own rule: an untouched day stays in time order (0); a day
    // someone has reordered takes the new task at the end.
    const { data: top } = await supabase.from("schedule_tasks").select("position").eq("home_id", homeId).eq("scheduled_date", date).order("position", { ascending: false }).limit(1);
    const max = top?.[0]?.position ?? 0;
    const { error } = await supabase.from("schedule_tasks").insert({ ...row, position: max === 0 ? 0 : max + 1 });
    if (error) {
      console.error("[nestly] put on schedule failed", error);
      toast.error("לא הצלחנו להוסיף ללוז");
      loadSched();
    } else toast.success("נוסף ללוז", { description: `${t.title} · ${when}`, action });
  };

  /** Take a task's twin off the schedule; the task itself stays. Undoable. */
  const takeOffSchedule = (t: PTask) => {
    const twin = linked.get(t.id);
    setSchedFor(null);
    if (!twin) return;
    setSched((prev) => prev.filter((x) => x.id !== twin.id));
    removeWithUndo({
      message: "הוסר מהלוז",
      description: t.title,
      remove: () => supabase.from("schedule_tasks").delete().eq("id", twin.id),
      undoLocal: () => setSched((prev) => reinsert(prev, [twin]).sort(bySchedule)),
      restore: () => supabase.from("schedule_tasks").insert(twin),
      reload: loadSched,
    });
  };
  const openDay = (date: string) => navigate("/schedule", { state: { date } });

  const add = (scope: "personal" | "general", ownerId: string | null, title: string) => {
    if (!title.trim() || !homeId) return;
    const siblings = tasks.filter((t) => t.scope === scope && (scope === "general" || t.owner_id === ownerId));
    const id = newId();
    const row: PTask = {
      id, home_id: homeId, scope, owner_id: scope === "personal" ? ownerId : null, title: title.trim(),
      is_done: false, position: siblings.length, due_date: null, created_by: user?.id ?? null, created_at: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, row]);
    bgWrite(supabase.from("personal_tasks").insert({ id, home_id: homeId, scope, owner_id: row.owner_id, title: row.title, position: row.position, created_by: user?.id ?? null }), load);
  };
  const toggle = (t: PTask) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_done: !x.is_done } : x)));
    setSched((prev) => prev.map((x) => (x.personal_task_id === t.id ? { ...x, is_done: !t.is_done } : x)));
    bgWrite(supabase.from("personal_tasks").update({ is_done: !t.is_done }).eq("id", t.id), load);
  };
  const remove = (id: string) => {
    const at = tasks.findIndex((x) => x.id === id);
    const row = tasks[at];
    if (!row) return;
    // A twin on the schedule outlives the task (the database clears its link),
    // so Undo has to link it back as well as restore the task.
    const twin = linked.get(id);
    setTasks((prev) => prev.filter((x) => x.id !== id));
    if (twin) setSched((prev) => prev.map((x) => (x.id === twin.id ? { ...x, personal_task_id: null } : x)));
    removeWithUndo({
      message: "המשימה נמחקה",
      description: row.title,
      remove: () => supabase.from("personal_tasks").delete().eq("id", id),
      undoLocal: () => {
        setTasks((prev) => reinsert(prev, [row], at));
        if (twin) setSched((prev) => prev.map((x) => (x.id === twin.id ? { ...x, personal_task_id: id } : x)));
      },
      restore: async () => {
        const r = await supabase.from("personal_tasks").insert(row);
        return r.error || !twin ? r : supabase.from("schedule_tasks").update({ personal_task_id: id }).eq("id", twin.id);
      },
      reload: load,
    });
  };
  const rename = (id: string, title: string) => {
    const n = title.trim();
    if (!n) return;
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, title: n } : x)));
    setSched((prev) => prev.map((x) => (x.personal_task_id === id ? { ...x, title: n } : x)));
    bgWrite(supabase.from("personal_tasks").update({ title: n }).eq("id", id), load);
  };
  const reorder = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => supabase.from("personal_tasks").update({ position: i }).eq("id", id)));
      load();
    },
    [load]
  );

  if (loading) return <FullPageSpinner />;

  const general = tasks.filter((t) => t.scope === "general");
  const taskIds = new Set(tasks.map((t) => t.id));
  // Members sorted with me first.
  const ordered = [...members].sort((a, b) => (a.user_id === user?.id ? -1 : b.user_id === user?.id ? 1 : 0));

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <h1 className="page-title">משימות</h1>

      {ordered.map((m) => {
        const mine = m.user_id === user?.id;
        const name = m.profile?.display_name ?? "בן הבית";
        return (
          <Section
            key={m.user_id}
            title={mine ? `המשימות שלי · ${name}` : `המשימות של ${name}`}
            icon={<User />}
            hint={mine ? "כל בני הבית יכולים להוסיף לך משימות. רק אתה יכול למחוק." : "אפשר להוסיף כאן משימה — אך רק בעל הרשימה יכול למחוק."}
            tasks={tasks.filter((t) => t.scope === "personal" && t.owner_id === m.user_id)}
            scheduled={sched.filter((s) => s.assigned_to === m.user_id && !(s.personal_task_id && taskIds.has(s.personal_task_id)))}
            linked={linked}
            onToggleScheduled={toggleScheduled}
            onOpenDay={openDay}
            onSchedule={setSchedFor}
            canDelete={mine}
            onAdd={(v) => add("personal", m.user_id, v)}
            onToggle={toggle}
            onRemove={remove}
            onRename={rename}
            onReorder={reorder}
          />
        );
      })}

      <Section
        title="משימות כלליות"
        icon={<Globe />}
        hint="משותפות לכל הבית — לא בהכרח קשורות לבית."
        tasks={general}
        scheduled={[]}
        linked={linked}
        onToggleScheduled={toggleScheduled}
        onOpenDay={openDay}
        onSchedule={setSchedFor}
        canDelete
        onAdd={(v) => add("general", null, v)}
        onToggle={toggle}
        onRemove={remove}
        onRename={rename}
        onReorder={reorder}
      />

      {schedFor && (
        <ScheduleSheet
          task={schedFor}
          twin={linked.get(schedFor.id) ?? null}
          onClose={() => setSchedFor(null)}
          onSave={(date, time) => putOnSchedule(schedFor, date, time)}
          onTakeOff={() => takeOffSchedule(schedFor)}
        />
      )}
    </section>
  );
}

/** Put a task on the schedule for a day (and optionally a time) — or move or remove it there. */
function ScheduleSheet({
  task,
  twin,
  onClose,
  onSave,
  onTakeOff,
}: {
  task: PTask;
  twin: STask | null;
  onClose: () => void;
  onSave: (date: string, time: string | null) => void;
  onTakeOff: () => void;
}) {
  const [date, setDate] = useState(() => twin?.scheduled_date ?? toISODate(new Date()));
  const [time, setTime] = useState(() => twin?.start_time?.slice(0, 5) ?? "");
  return (
    <Modal open onClose={onClose} title="בלוז" done={{ label: twin ? "עדכון" : "הוספה", onClick: () => onSave(date, time || null), disabled: !date }}>
      <div className="nst-fields">
        <p style={{ font: "600 var(--t-headline) var(--font-body)", color: "var(--text-bright)", overflowWrap: "anywhere" }}>{task.title}</p>
        <p className="section-sub" style={{ marginTop: -6 }}>
          המשימה תופיע גם בלוז של היום שתבחרו, ותישאר גם כאן. סימון באחד המקומות מסמן גם בשני.
        </p>
        <div>
          <label>תאריך</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label>שעה (לא חובה — עם שעה תגיע גם תזכורת)</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        {twin && (
          <button className="btn btn-block" style={{ color: "var(--danger)" }} onClick={onTakeOff}>
            הסרה מהלוז
          </button>
        )}
      </div>
    </Modal>
  );
}

function Section({
  title,
  icon,
  hint,
  tasks,
  scheduled,
  linked,
  onToggleScheduled,
  onOpenDay,
  onSchedule,
  canDelete,
  onAdd,
  onToggle,
  onRemove,
  onRename,
  onReorder,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  tasks: PTask[];
  /** Schedule tasks assigned to this section's person. */
  scheduled: STask[];
  /** Schedule twins of tasks, by task id. */
  linked: Map<string, STask>;
  onToggleScheduled: (s: STask) => void;
  onOpenDay: (date: string) => void;
  /** Put a task on the schedule (or change / remove its time there). */
  onSchedule: (t: PTask) => void;
  canDelete: boolean;
  onAdd: (v: string) => void;
  onToggle: (t: PTask) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const [v, setV] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const doneLast = useDoneLast(listRef);
  const shown = useMemo(() => doneLast.sort(tasks, (t) => t.id, (t) => t.is_done), [tasks, doneLast.sort]);
  const dr = useDragReorder(shown, onReorder);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const schedRef = useRef<HTMLDivElement>(null);
  const schedDone = useDoneLast(schedRef);
  const shownSched = useMemo(() => schedDone.sort(scheduled, (s) => s.id, (s) => s.is_done), [scheduled, schedDone.sort]);
  const submit = () => {
    onAdd(v);
    setV("");
  };
  const startEdit = (t: PTask) => {
    setDraft(t.title);
    setEditingId(t.id);
  };
  const saveEdit = (t: PTask) => {
    if (draft.trim() && draft.trim() !== t.title) onRename(t.id, draft);
    setEditingId(null);
  };
  return (
    <div className="nst-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 className="nst-card-title">
        {icon} {title}
      </h2>
      <p className="section-sub" style={{ marginTop: "-0.3rem" }}>{hint}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ flex: 1 }} placeholder="הוספת משימה…" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={submit}>
          <Plus size={18} />
        </button>
      </div>
      {tasks.length === 0 ? (
        scheduled.length === 0 && <EmptyState title="אין משימות עדיין" />
      ) : (
        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {dr.order.map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            return (
              <div key={t.id} data-flip={t.id} ref={dr.setItemRef(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, opacity: t.is_done ? 0.55 : 1, ...dr.itemStyle(t.id) }}>
                {editingId === t.id ? (
                  <>
                    <input
                      autoFocus
                      style={{ flex: 1, font: "400 17px var(--font-body)" }}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(t);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button className="nst-check on" onClick={() => saveEdit(t)} title="שמירה">
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
                    <button
                      className={`nst-check ${t.is_done ? "on" : ""}`}
                      onClick={() => {
                        doneLast.ticked(t.id, t.is_done);
                        onToggle(t);
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        onClick={() => startEdit(t)}
                        style={{ display: "block", font: "400 17px var(--font-body)", color: "var(--text-bright)", textDecoration: t.is_done ? "line-through" : "none", cursor: "pointer", overflowWrap: "anywhere" }}
                      >
                        {t.title}
                      </span>
                      {linked.get(t.id) && (
                        <button className="nst-meta nst-on-schedule" onClick={() => onSchedule(t)} title="שינוי המועד בלוז">
                          <span className="nst-tag">
                            <CalendarDays /> בלוז · {dayLabel(linked.get(t.id)!.scheduled_date, linked.get(t.id)!.start_time)}
                          </span>
                          {carriedLabel(linked.get(t.id)!.carried_from, linked.get(t.id)!.scheduled_date) && (
                            <span className="nst-tag nst-tag-carried">
                              <History /> {carriedLabel(linked.get(t.id)!.carried_from, linked.get(t.id)!.scheduled_date)}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                    {!t.is_done && !linked.get(t.id) && (
                      <button className="nst-del" onClick={() => onSchedule(t)} title="הוספה ללוז" aria-label="הוספה ללוז">
                        <CalendarClock size={16} />
                      </button>
                    )}
                    <button className="nst-del" onClick={() => startEdit(t)} title="עריכה">
                      <Pencil size={14} />
                    </button>
                    {canDelete && (
                      <button className="nst-del" onClick={() => onRemove(t.id)}>
                        <X size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* From the schedule: tasks on the schedule assigned to this person. One
          row in the database; ticking it here ticks it in the schedule. */}
      {scheduled.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div className="nst-subhead">
            <CalendarDays size={13} /> בלוז
          </div>
          <div ref={schedRef} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {shownSched.map((s) => {
              const carried = carriedLabel(s.carried_from, s.scheduled_date);
              return (
                <div key={s.id} data-flip={s.id} className="nst-sched-row" style={{ opacity: s.is_done ? 0.55 : 1 }}>
                  <button
                    className={`nst-check ${s.is_done ? "on" : ""}`}
                    onClick={() => {
                      schedDone.ticked(s.id, s.is_done);
                      onToggleScheduled(s);
                    }}
                  >
                    <Check size={14} />
                  </button>
                  <button className="nst-sched-open" onClick={() => onOpenDay(s.scheduled_date)} title="פתיחה בלוז">
                    <p style={{ font: "400 17px var(--font-body)", color: "var(--text-bright)", textDecoration: s.is_done ? "line-through" : "none" }}>{s.title}</p>
                    <span className="nst-meta" style={{ marginTop: 3 }}>
                      {carried && (
                        <span className="nst-tag nst-tag-carried">
                          <History /> {carried}
                        </span>
                      )}
                      <span className="nst-tag">
                        <Clock /> {dayLabel(s.scheduled_date, s.start_time)}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
