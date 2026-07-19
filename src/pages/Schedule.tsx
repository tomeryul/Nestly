import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  Clock,
  Repeat,
  X,
  CalendarDays,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Modal, EmptyState, FullPageSpinner } from "../components/ui";
import { DAYS_HE, DAYS_HE_SHORT, TASK_CATEGORIES, type TaskCategory } from "../lib/constants";
import { addDays, formatTime, isToday, startOfWeek, toISODate, weekDates } from "../lib/dates";
import type { Tables } from "../types/database";

type Task = Tables<"schedule_tasks">;
type RecurringTask = Tables<"recurring_tasks">;

export default function Schedule() {
  const { homeId, members } = useHome();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  const days = weekDates(weekStart);
  const weekFrom = toISODate(weekStart);
  const weekTo = toISODate(addDays(weekStart, 6));
  const selectedIso = toISODate(selected);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase
      .from("schedule_tasks")
      .select("*")
      .eq("home_id", homeId)
      .gte("scheduled_date", weekFrom)
      .lte("scheduled_date", weekTo)
      .order("start_time", { nullsFirst: true });
    setTasks(data ?? []);
    setLoading(false);
  }, [homeId, weekFrom, weekTo]);
  useEffect(() => {
    load();
  }, [load]);

  const nameFor = (uid: string | null) =>
    members.find((m) => m.user_id === uid)?.profile?.display_name ?? null;

  const dayTasks = tasks
    .filter((t) => t.scheduled_date === selectedIso)
    .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));

  const countFor = (iso: string) => tasks.filter((t) => t.scheduled_date === iso).length;

  const toggle = async (t: Task) => {
    await supabase.from("schedule_tasks").update({ is_done: !t.is_done }).eq("id", t.id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("schedule_tasks").delete().eq("id", id);
    load();
  };

  if (loading) return <FullPageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">לוז שבועי</h1>
        <button onClick={() => setShowRecurring(true)} className="btn-ghost !px-3 !py-2 text-xs">
          <Repeat size={15} /> משימות קבועות
        </button>
      </div>

      {/* week navigator */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart((w) => addDays(w, -7))} className="p-1.5 text-slate-500">
          <ChevronRight size={20} />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((d) => {
            const iso = toISODate(d);
            const active = iso === selectedIso;
            const cnt = countFor(iso);
            return (
              <button
                key={iso}
                onClick={() => setSelected(d)}
                className={`flex flex-col items-center rounded-xl py-1.5 ${
                  active ? "bg-brand-600 text-white" : isToday(d) ? "bg-brand-50 text-brand-700" : "text-slate-500"
                }`}
              >
                <span className="text-[10px]">{DAYS_HE_SHORT[d.getDay()]}</span>
                <span className="text-sm font-semibold">{d.getDate()}</span>
                {cnt > 0 && (
                  <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${active ? "bg-white" : "bg-brand-500"}`} />
                )}
              </button>
            );
          })}
        </div>
        <button onClick={() => setWeekStart((w) => addDays(w, 7))} className="p-1.5 text-slate-500">
          <ChevronLeft size={20} />
        </button>
      </div>

      <button onClick={() => setAdding(true)} className="btn-primary w-full">
        <Plus size={18} /> משימה ל{DAYS_HE[selected.getDay()]}
      </button>

      {dayTasks.length === 0 ? (
        <EmptyState icon={<CalendarDays size={40} />} title="אין משימות ליום זה" />
      ) : (
        <div className="space-y-2">
          {dayTasks.map((t) => {
            const cat = TASK_CATEGORIES[t.category as TaskCategory] ?? TASK_CATEGORIES.general;
            const who = nameFor(t.assigned_to);
            return (
              <div key={t.id} className={`card flex items-center gap-3 !py-3 ${t.is_done ? "opacity-60" : ""}`}>
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: t.color ?? cat.color }} />
                <button
                  onClick={() => toggle(t)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    t.is_done ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                  }`}
                >
                  {t.is_done && <Check size={14} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium text-slate-800 ${t.is_done ? "line-through" : ""}`}>
                    {t.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    {t.start_time && (
                      <span className="flex items-center gap-0.5">
                        <Clock size={12} />
                        {formatTime(t.start_time)}
                        {t.end_time && `–${formatTime(t.end_time)}`}
                      </span>
                    )}
                    <span className="chip !px-1.5 !py-0" style={{ color: cat.color, background: cat.color + "1a" }}>
                      {cat.label}
                    </span>
                    {who && <span>· {who}</span>}
                  </div>
                </div>
                <button onClick={() => remove(t.id)} className="p-1 text-slate-300 hover:text-red-500">
                  <Trash2 size={17} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <TaskModal
          homeId={homeId!}
          dateIso={selectedIso}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {showRecurring && <RecurringTaskModal homeId={homeId!} onClose={() => setShowRecurring(false)} />}
    </div>
  );
}

function MemberSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { members } = useHome();
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">ללא אחראי</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.profile?.display_name ?? "חבר"}
        </option>
      ))}
    </select>
  );
}

function TaskModal({
  homeId,
  dateIso,
  onClose,
  onSaved,
}: {
  homeId: string;
  dateIso: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [category, setCategory] = useState<TaskCategory>("general");
  const [assigned, setAssigned] = useState("");

  const save = async () => {
    if (!title.trim()) return;
    await supabase.from("schedule_tasks").insert({
      home_id: homeId,
      title: title.trim(),
      scheduled_date: dateIso,
      start_time: start || null,
      end_time: end || null,
      category,
      assigned_to: assigned || null,
      created_by: user?.id ?? null,
    });
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="משימה חדשה">
      <div className="space-y-3">
        <input className="input" placeholder="כותרת המשימה" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">משעה</label>
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">עד שעה</label>
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          {(Object.keys(TASK_CATEGORIES) as TaskCategory[]).map((k) => (
            <button
              key={k}
              onClick={() => setCategory(k)}
              className={`chip flex-1 justify-center ${
                category === k ? "text-white" : "bg-slate-100 text-slate-600"
              }`}
              style={category === k ? { background: TASK_CATEGORIES[k].color } : undefined}
            >
              {TASK_CATEGORIES[k].label}
            </button>
          ))}
        </div>
        <MemberSelect value={assigned} onChange={setAssigned} />
        <button onClick={save} className="btn-primary w-full">
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

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("recurring_tasks")
      .select("*")
      .eq("home_id", homeId)
      .order("day_of_week");
    setRows(data ?? []);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    await supabase.from("recurring_tasks").insert({
      home_id: homeId,
      title: title.trim(),
      day_of_week: day,
      start_time: start || null,
      category,
      assigned_to: assigned || null,
      created_by: user?.id ?? null,
    });
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
      <p className="mb-3 text-sm text-slate-500">משימות שייכנסו ללוז אוטומטית בכל שבוע ביום ובשעה שתגדירו.</p>
      <div className="mb-4 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <input className="input" placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
          <select className="input flex-1" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS_HE.map((d, i) => (
              <option key={i} value={i}>
                יום {d}
              </option>
            ))}
          </select>
          <input className="input w-28" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
          {(Object.keys(TASK_CATEGORIES) as TaskCategory[]).map((k) => (
            <option key={k} value={k}>
              {TASK_CATEGORIES[k].label}
            </option>
          ))}
        </select>
        <MemberSelect value={assigned} onChange={setAssigned} />
        <button onClick={add} className="btn-primary w-full">
          <Plus size={16} /> הוספה
        </button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">אין משימות קבועות</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
            <span className="flex-1 text-sm text-slate-700">{r.title}</span>
            <span className="chip bg-brand-50 text-brand-700">
              {DAYS_HE[r.day_of_week]} {formatTime(r.start_time)}
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
