import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Plus, Check, X, User, Globe, GripVertical, Pencil, CalendarClock, CalendarDays, Clock, History, ListTodo } from "lucide-react";
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
/** A task list of its own, with the people in it (the only ones who see it). */
type TList = Tables<"task_lists"> & { members: string[] };

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

  // Lists of their own: row-level security returns only the ones I'm in.
  const [lists, setLists] = useState<TList[]>([]);
  const [listSheet, setListSheet] = useState<TList | "new" | null>(null);
  const loadLists = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("task_lists").select("*, task_list_members(user_id)").eq("home_id", homeId).order("position").order("created_at");
    const next = (data ?? []).map(({ task_list_members, ...l }) => ({ ...l, members: (task_list_members ?? []).map((m) => m.user_id) }));
    setLists(next);
    writeCache(`personal.lists.${homeId}`, next);
  }, [homeId]);
  useSeedFromCache<TList[]>(homeId && `personal.lists.${homeId}`, setLists);
  useEffect(() => {
    loadLists();
  }, [loadLists]);
  useOnResume(loadLists);

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

  /** A task on someone's list, the general list, or (listId) a list of its own — whose tasks are shared ones. */
  const add = (scope: "personal" | "general", ownerId: string | null, title: string, listId: string | null = null) => {
    if (!title.trim() || !homeId) return;
    const siblings = tasks.filter((t) => t.scope === scope && t.list_id === listId && (scope === "general" || t.owner_id === ownerId));
    const id = newId();
    const row: PTask = {
      id, home_id: homeId, scope, owner_id: scope === "personal" ? ownerId : null, title: title.trim(), list_id: listId,
      is_done: false, position: siblings.length, due_date: null, created_by: user?.id ?? null, created_at: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, row]);
    bgWrite(supabase.from("personal_tasks").insert({ id, home_id: homeId, scope, owner_id: row.owner_id, list_id: listId, title: row.title, position: row.position, created_by: user?.id ?? null }), load);
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

  /** A new list: the list, then everyone in it (me always), in that order — the second needs the first. */
  const createList = async (name: string, people: string[]) => {
    if (!homeId || !user) return;
    setListSheet(null);
    const id = newId();
    const everyone = [user.id, ...people.filter((p) => p !== user.id)];
    const row: TList = { id, home_id: homeId, name, position: lists.length, created_by: user.id, created_at: new Date().toISOString(), members: everyone };
    setLists((prev) => [...prev, row]);
    let { error } = await supabase.from("task_lists").insert({ id, home_id: homeId, name, position: row.position, created_by: user.id });
    if (!error) ({ error } = await supabase.from("task_list_members").insert(everyone.map((user_id) => ({ list_id: id, user_id }))));
    if (error) {
      console.error("[nestly] create list failed", error);
      toast.error("לא הצלחנו ליצור את הרשימה");
      loadLists();
      return;
    }
    requestAnimationFrame(() => document.getElementById(`list-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  /** Rename a list and change who is in it. I stay in: it's my edit. */
  const saveList = async (list: TList, name: string, people: string[]) => {
    if (!user) return;
    setListSheet(null);
    const everyone = [user.id, ...people.filter((p) => p !== user.id)];
    const added = everyone.filter((p) => !list.members.includes(p));
    const removed = list.members.filter((p) => !everyone.includes(p));
    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, name, members: everyone } : l)));
    const results = await Promise.all([
      name !== list.name ? supabase.from("task_lists").update({ name }).eq("id", list.id) : null,
      added.length ? supabase.from("task_list_members").insert(added.map((user_id) => ({ list_id: list.id, user_id }))) : null,
      removed.length ? supabase.from("task_list_members").delete().eq("list_id", list.id).in("user_id", removed) : null,
    ]);
    if (results.some((r) => r?.error)) {
      console.error("[nestly] save list failed", results);
      toast.error("לא הצלחנו לשמור את הרשימה");
      loadLists();
    }
  };

  /** Delete a list with its tasks, undoable: Undo writes back the list, its people, its tasks and their links to the schedule. */
  const deleteList = (list: TList) => {
    if (!user) return;
    setListSheet(null);
    const at = lists.findIndex((l) => l.id === list.id);
    const listTasks = tasks.filter((t) => t.list_id === list.id);
    const twins = listTasks.flatMap((t) => (linked.get(t.id) ? [linked.get(t.id)!] : []));
    setLists((prev) => prev.filter((l) => l.id !== list.id));
    setTasks((prev) => prev.filter((t) => t.list_id !== list.id));
    if (twins.length) setSched((prev) => prev.map((x) => (twins.some((w) => w.id === x.id) ? { ...x, personal_task_id: null } : x)));
    const { members, ...listRow } = list;
    removeWithUndo({
      message: "הרשימה נמחקה",
      description: list.name,
      remove: () => supabase.from("task_lists").delete().eq("id", list.id),
      undoLocal: () => {
        setLists((prev) => reinsert(prev, [list], at));
        setTasks((prev) => [...prev, ...listTasks]);
        if (twins.length) setSched((prev) => prev.map((x) => twins.find((w) => w.id === x.id) ?? x));
      },
      restore: async () => {
        // Written back as mine: only a list's creator may seat its first people.
        let r = await supabase.from("task_lists").insert({ ...listRow, created_by: user.id });
        if (!r.error) r = await supabase.from("task_list_members").insert(members.map((user_id) => ({ list_id: list.id, user_id })));
        if (!r.error && listTasks.length) r = await supabase.from("personal_tasks").insert(listTasks);
        for (const w of twins) if (!r.error) r = await supabase.from("schedule_tasks").update({ personal_task_id: w.personal_task_id }).eq("id", w.id);
        return r;
      },
      reload: () => {
        load();
        loadLists();
        loadSched();
      },
    });
  };

  if (loading) return <FullPageSpinner />;

  const general = tasks.filter((t) => t.scope === "general" && !t.list_id);
  const nameOf = (id: string) => (id === user?.id ? "אני" : members.find((m) => m.user_id === id)?.profile?.display_name ?? "בן הבית");
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

      {lists.map((l) => (
        <Section
          key={l.id}
          id={`list-${l.id}`}
          title={l.name}
          icon={<ListTodo />}
          hint={sharedWith(l.members.filter((p) => p !== user?.id).map(nameOf))}
          onEdit={() => setListSheet(l)}
          tasks={tasks.filter((t) => t.list_id === l.id)}
          scheduled={[]}
          linked={linked}
          onToggleScheduled={toggleScheduled}
          onOpenDay={openDay}
          onSchedule={setSchedFor}
          canDelete
          onAdd={(v) => add("general", null, v, l.id)}
          onToggle={toggle}
          onRemove={remove}
          onRename={rename}
          onReorder={reorder}
        />
      ))}

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

      <button className="btn btn-block" onClick={() => setListSheet("new")}>
        <Plus size={17} /> רשימה חדשה
      </button>

      {listSheet && (
        <ListSheet
          list={listSheet === "new" ? null : listSheet}
          me={user?.id ?? ""}
          people={ordered.map((m) => ({ id: m.user_id, name: m.profile?.display_name ?? "בן הבית" }))}
          onClose={() => setListSheet(null)}
          onSave={(name, people) => (listSheet === "new" ? createList(name, people) : saveList(listSheet, name, people))}
          onDelete={listSheet === "new" ? undefined : () => deleteList(listSheet)}
        />
      )}

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

/** "משותפת לך, לנועה ולדני." — or, with nobody else in it, that it's only mine. */
function sharedWith(others: string[]) {
  if (!others.length) return "רק שלך: אף אחד אחר לא רואה אותה.";
  const to = ["לך", ...others.map((n) => `ל${n}`)];
  return `משותפת ${to.slice(0, -1).join(", ")} ו${to[to.length - 1]}. רק מי שברשימה רואה אותה.`;
}

/** Create a list, or rename it and change who is in it. I'm always in — it's my list too. */
function ListSheet({
  list,
  me,
  people,
  onClose,
  onSave,
  onDelete,
}: {
  list: TList | null;
  me: string;
  people: { id: string; name: string }[];
  onClose: () => void;
  onSave: (name: string, people: string[]) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(list?.name ?? "");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(list?.members ?? [me]));
  const valid = name.trim().length > 0;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const save = () => valid && onSave(name.trim().slice(0, 60), [...picked]);
  return (
    <Modal open onClose={onClose} title={list ? "עריכת רשימה" : "רשימה חדשה"} done={{ label: list ? "שמירה" : "יצירה", onClick: save, disabled: !valid }}>
      <div className="nst-fields">
        <div>
          <label htmlFor="list-name">שם הרשימה</label>
          <input id="list-name" value={name} maxLength={60} placeholder="למשל: שיפוץ המטבח" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <div>
          <label>משתתפים</label>
          <div className="nst-group list-people" role="group" aria-label="משתתפים">
            {people.map((p) => {
              const mine = p.id === me;
              const on = mine || picked.has(p.id);
              return (
                <button key={p.id} type="button" className="nst-row list-person" aria-pressed={on} disabled={mine} onClick={() => toggle(p.id)}>
                  <span className={`nst-check ${on ? "on" : ""}`} aria-hidden>
                    <Check size={14} />
                  </span>
                  <span className="list-person-name">{p.name}</span>
                  {mine && <span className="list-person-me">אני</span>}
                </button>
              );
            })}
          </div>
          <p className="section-sub" style={{ marginTop: 8 }}>
            רק מי שמסומן יראה את הרשימה ואת המשימות שבה, ויוכל להוסיף, לסמן ולערוך.
          </p>
        </div>
        {onDelete && (
          <button className="btn btn-block" style={{ color: "var(--danger)" }} onClick={onDelete}>
            מחיקת הרשימה
          </button>
        )}
      </div>
    </Modal>
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
  id,
  title,
  icon,
  hint,
  onEdit,
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
  id?: string;
  title: string;
  icon: React.ReactNode;
  hint: string;
  /** A list of its own: rename it, change who is in it, delete it. */
  onEdit?: () => void;
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
    <div id={id} className="nst-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 className="nst-card-title">
          {icon} {title}
        </h2>
        {onEdit && (
          <button className="nst-chip" style={{ boxShadow: "none", background: "transparent", color: "var(--accent)", padding: "4px 6px", flex: "none" }} onClick={onEdit}>
            עריכה
          </button>
        )}
      </div>
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
