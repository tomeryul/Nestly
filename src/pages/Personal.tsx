import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Check, X, User, Globe, GripVertical, Pencil } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner } from "../components/ui";
import { useDragReorder } from "../lib/dragReorder";
import { bgWrite, newId } from "../lib/optimistic";
import type { Tables } from "../types/database";

type PTask = Tables<"personal_tasks">;

export default function Personal() {
  const { homeId, members } = useHome();
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
    bgWrite(supabase.from("personal_tasks").update({ is_done: !t.is_done }).eq("id", t.id), load);
  };
  const remove = (id: string) => {
    setTasks((prev) => prev.filter((x) => x.id !== id));
    bgWrite(supabase.from("personal_tasks").delete().eq("id", id), load);
  };
  const rename = (id: string, title: string) => {
    const n = title.trim();
    if (!n) return;
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, title: n } : x)));
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
        canDelete
        onAdd={(v) => add("general", null, v)}
        onToggle={toggle}
        onRemove={remove}
        onRename={rename}
        onReorder={reorder}
      />
    </section>
  );
}

function Section({
  title,
  icon,
  hint,
  tasks,
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
  const dr = useDragReorder(tasks, onReorder);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
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
        <EmptyState title="אין משימות עדיין" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {dr.order.map((id) => {
            const t = byId.get(id);
            if (!t) return null;
            return (
              <div key={t.id} ref={dr.setItemRef(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, opacity: t.is_done ? 0.55 : 1, ...dr.itemStyle(t.id) }}>
                {editingId === t.id ? (
                  <>
                    <input
                      autoFocus
                      style={{ flex: 1, font: "600 14px var(--font-body)" }}
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
                    <button className={`nst-check ${t.is_done ? "on" : ""}`} onClick={() => onToggle(t)}>
                      <Check size={14} />
                    </button>
                    <span
                      onClick={() => startEdit(t)}
                      style={{ flex: 1, font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: t.is_done ? "line-through" : "none", cursor: "pointer" }}
                    >
                      {t.title}
                    </span>
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
    </div>
  );
}
