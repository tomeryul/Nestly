import { useCallback, useEffect, useState } from "react";
import { Plus, Check, X, User, Globe, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner } from "../components/ui";
import type { Tables } from "../types/database";

type PTask = Tables<"personal_tasks">;

export default function Personal() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("personal_tasks").select("*").eq("home_id", homeId).order("is_done").order("position").order("created_at");
    setTasks(data ?? []);
    setLoading(false);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (scope: "personal" | "general", title: string) => {
    if (!title.trim() || !homeId) return;
    await supabase.from("personal_tasks").insert({
      home_id: homeId,
      scope,
      owner_id: scope === "personal" ? user?.id ?? null : null,
      title: title.trim(),
      position: tasks.length,
      created_by: user?.id ?? null,
    });
    load();
  };
  const toggle = async (t: PTask) => {
    await supabase.from("personal_tasks").update({ is_done: !t.is_done }).eq("id", t.id);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("personal_tasks").delete().eq("id", id);
    load();
  };
  const move = async (list: PTask[], id: string, dir: "up" | "down") => {
    const idx = list.findIndex((t) => t.id === id);
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || j < 0 || j >= list.length) return;
    const arr = [...list];
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    await Promise.all(arr.map((t, i) => supabase.from("personal_tasks").update({ position: i }).eq("id", t.id)));
    load();
  };

  if (loading) return <FullPageSpinner />;

  const personal = tasks.filter((t) => t.scope === "personal");
  const general = tasks.filter((t) => t.scope === "general");

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <h1 className="page-title">משימות</h1>

      <Section title="המשימות שלי" icon={<User />} hint="משימות אישיות — רק אתה רואה אותן." tasks={personal} onAdd={(v) => add("personal", v)} onToggle={toggle} onRemove={remove} onMove={(id, dir) => move(personal, id, dir)} />
      <Section title="משימות כלליות" icon={<Globe />} hint="משותפות לכל הבית — לא בהכרח קשורות לבית." tasks={general} onAdd={(v) => add("general", v)} onToggle={toggle} onRemove={remove} onMove={(id, dir) => move(general, id, dir)} />
    </section>
  );
}

function Section({
  title,
  icon,
  hint,
  tasks,
  onAdd,
  onToggle,
  onRemove,
  onMove,
}: {
  title: string;
  icon: React.ReactNode;
  hint: string;
  tasks: PTask[];
  onAdd: (v: string) => void;
  onToggle: (t: PTask) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: "up" | "down") => void;
}) {
  const [v, setV] = useState("");
  const submit = () => {
    onAdd(v);
    setV("");
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
        <EmptyState title="אין משימות עדיין" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {tasks.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, opacity: t.is_done ? 0.55 : 1 }}>
              <button className={`nst-check ${t.is_done ? "on" : ""}`} onClick={() => onToggle(t)}>
                <Check size={14} />
              </button>
              <span style={{ flex: 1, font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: t.is_done ? "line-through" : "none" }}>{t.title}</span>
              {tasks.length > 1 && (
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <button className="reorder-btn" disabled={i === 0} onClick={() => onMove(t.id, "up")}>
                    <ChevronUp size={14} />
                  </button>
                  <button className="reorder-btn" disabled={i === tasks.length - 1} onClick={() => onMove(t.id, "down")}>
                    <ChevronDown size={14} />
                  </button>
                </span>
              )}
              <button className="nst-del" onClick={() => onRemove(t.id)}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
