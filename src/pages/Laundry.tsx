import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, WashingMachine, Wind, Shirt, ArrowLeft, X, Settings2, PackageOpen, GripVertical } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Modal, EmptyState, FullPageSpinner } from "../components/ui";
import { startOfWeek, toISODate } from "../lib/dates";
import { useDragReorder } from "../lib/dragReorder";
import { bgWrite, newId } from "../lib/optimistic";
import type { Tables } from "../types/database";

type Load = Tables<"laundry_tasks">;
type LType = Tables<"laundry_types">;

const STAGES = [
  { label: "הפעלת מכונה", icon: WashingMachine },
  { label: "תלייה / מייבש", icon: Wind },
  { label: "קיפול", icon: Shirt },
  { label: "פיזור", icon: PackageOpen },
];
const LAST_STAGE = STAGES.length; // completed when stage reaches this

export default function Laundry() {
  const { homeId, members } = useHome();
  const { user } = useAuth();
  const [loads, setLoads] = useState<Load[]>([]);
  const [types, setTypes] = useState<LType[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignee, setAssignee] = useState<string>(user?.id ?? "");
  const [manageTypes, setManageTypes] = useState(false);

  const weekStart = toISODate(startOfWeek(new Date()));

  const load = useCallback(async () => {
    if (!homeId) return;
    const [l, t] = await Promise.all([
      supabase.from("laundry_tasks").select("*").eq("home_id", homeId).eq("week_start", weekStart).order("position").order("created_at"),
      supabase.from("laundry_types").select("*").eq("home_id", homeId).order("position").order("created_at"),
    ]);
    setLoads(l.data ?? []);
    setTypes(t.data ?? []);
    setLoading(false);
  }, [homeId, weekStart]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (user && !assignee) setAssignee(user.id);
  }, [user, assignee]);

  const addLoad = (name: string) => {
    if (!name.trim() || !homeId) return;
    const id = newId();
    const row: Load = { id, home_id: homeId, name: name.trim(), week_start: weekStart, assigned_to: assignee || null, stage: 0, position: loads.length, created_by: user?.id ?? null, created_at: new Date().toISOString() };
    setLoads((prev) => [...prev, row]);
    bgWrite(supabase.from("laundry_tasks").insert({ id, home_id: homeId, name: row.name, week_start: weekStart, assigned_to: assignee || null, stage: 0, position: row.position, created_by: user?.id ?? null }), load);
  };
  const advance = (l: Load) => {
    const stage = Math.min(l.stage + 1, LAST_STAGE);
    setLoads((prev) => prev.map((x) => (x.id === l.id ? { ...x, stage } : x)));
    bgWrite(supabase.from("laundry_tasks").update({ stage }).eq("id", l.id), load);
  };
  const back = (l: Load) => {
    const stage = Math.max(l.stage - 1, 0);
    setLoads((prev) => prev.map((x) => (x.id === l.id ? { ...x, stage } : x)));
    bgWrite(supabase.from("laundry_tasks").update({ stage }).eq("id", l.id), load);
  };
  const removeLoad = (id: string) => {
    setLoads((prev) => prev.filter((l) => l.id !== id));
    bgWrite(supabase.from("laundry_tasks").delete().eq("id", id), load);
  };
  const nameFor = (uid: string | null) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? "";

  const persistOrder = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => supabase.from("laundry_tasks").update({ position: i }).eq("id", id)));
      load();
    },
    [load]
  );
  const dr = useDragReorder(loads, persistOrder);
  const byId = useMemo(() => new Map(loads.map((l) => [l.id, l])), [loads]);

  if (loading) return <FullPageSpinner />;

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 className="page-title">כביסות</h1>
        <button className="btn btn-sm" onClick={() => setManageTypes(true)}>
          <Settings2 size={15} /> סוגי כביסה
        </button>
      </div>

      {/* quick add from types */}
      <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ font: "700 11px var(--font-body)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>אחראי</span>
          <select style={{ flex: 1 }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">ללא</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.profile?.display_name ?? "חבר"}
              </option>
            ))}
          </select>
        </div>
        {types.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {types.map((t) => (
              <button key={t.id} className="nst-chip" onClick={() => addLoad(t.name)}>
                <Plus size={13} /> {t.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="section-sub">הוסיפו סוגי כביסה (כביסה לבנה, כהה, מגבות…) בכפתור "סוגי כביסה", ואז תוכלו לפתוח כביסה בלחיצה.</p>
        )}
        <FreeAdd onAdd={addLoad} />
      </div>

      {loads.length === 0 ? (
        <EmptyState icon={<WashingMachine size={42} />} title="אין כביסות השבוע" hint="פתחו כביסה מהסוגים למעלה" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {dr.order.map((id) => {
            const l = byId.get(id);
            if (!l) return null;
            const doneAll = l.stage >= LAST_STAGE;
            return (
              <div className="nst-card" key={l.id} ref={dr.setItemRef(l.id)} style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 12, opacity: doneAll ? 0.7 : 1, ...dr.itemStyle(l.id) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="nst-grip" {...dr.handleProps(l.id)} title="גרירה לסידור">
                    <GripVertical size={18} />
                  </span>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--cat-7-bg)", color: "var(--cat-7-fg)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <WashingMachine size={20} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ font: "600 15px var(--font-body)", color: "var(--text-bright)" }}>{l.name}</p>
                    {nameFor(l.assigned_to) && <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{nameFor(l.assigned_to)}</p>}
                  </div>
                  <button className="nst-del" onClick={() => removeLoad(l.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>

                {/* stage progress */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {STAGES.map((s, i) => {
                    const state = l.stage > i ? "done" : l.stage === i ? "current" : "todo";
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 11,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: state === "done" ? "var(--accent)" : state === "current" ? "var(--accent-soft)" : "var(--surface-2)",
                            color: state === "done" ? "#fff" : state === "current" ? "var(--accent-ink)" : "var(--text-muted)",
                            boxShadow: state === "todo" ? "inset 0 0 0 1px var(--border-2)" : "none",
                          }}
                        >
                          {state === "done" ? <Check size={16} /> : <s.icon size={16} />}
                        </div>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: state === "todo" ? "var(--text-muted)" : "var(--text-2)", textAlign: "center" }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>

                {doneAll ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="badge b-active" style={{ borderRadius: 30 }}>
                      <Check size={12} style={{ verticalAlign: -2 }} /> הכביסה הושלמה
                    </span>
                    <button className="btn btn-sm" onClick={() => back(l)}>
                      חזרה
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    {l.stage > 0 && (
                      <button className="btn btn-sm" onClick={() => back(l)}>
                        שלב קודם
                      </button>
                    )}
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => advance(l)}>
                      סיימתי · {STAGES[l.stage].label} <ArrowLeft size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {manageTypes && <TypesModal homeId={homeId!} onClose={() => { setManageTypes(false); load(); }} />}
    </section>
  );
}

function FreeAdd({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState("");
  const submit = () => {
    onAdd(v);
    setV("");
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input style={{ flex: 1 }} placeholder="או כביסה אחרת…" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button className="btn" style={{ padding: "0 14px" }} onClick={submit}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function TypesModal({ homeId, onClose }: { homeId: string; onClose: () => void }) {
  const [rows, setRows] = useState<LType[]>([]);
  const [name, setName] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("laundry_types").select("*").eq("home_id", homeId).order("position").order("created_at");
    setRows(data ?? []);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    await supabase.from("laundry_types").insert({ home_id: homeId, name: name.trim(), position: rows.length });
    setName("");
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("laundry_types").delete().eq("id", id);
    load();
  };

  return (
    <Modal open onClose={onClose} title="סוגי כביסה">
      <p className="section-sub" style={{ marginBottom: "1rem" }}>הסוגים שמהם תפתחו כביסה כל שבוע (כביסה לבנה, כהה, צבעונית, מגבות…).</p>
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <input style={{ flex: 1 }} placeholder="סוג כביסה חדש…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={add}>
          <Plus size={18} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין סוגים עדיין</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-2)", fontWeight: 500 }}>{r.name}</span>
            <button className="nst-del" onClick={() => remove(r.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
