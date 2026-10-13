import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ListChecks, ShoppingCart, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "./ui";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { announceDataChanged, readCache } from "../lib/cache";
import { CATEGORIES } from "../lib/constants";
import { dayLabel } from "../lib/dates";
import { applyPlan, understand, type QuickPlan } from "../lib/quickAdd";
import { aiErrorText } from "../lib/ai";
import { PickRow } from "./AiParts";

type ListRow = { id: string; name: string; is_default: boolean };

/**
 * Quick add: one sentence, typed or dictated, becomes shopping items, schedule
 * entries and tasks. Three steps in one sheet — write, see what was understood
 * (and untick anything that's wrong), add — so nothing lands anywhere the person
 * didn't see first. Everything added can be taken back from the toast.
 */
export default function QuickAdd({ onClose }: { onClose: () => void }) {
  const { homeId, members } = useHome();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [stage, setStage] = useState<"write" | "thinking" | "review" | "saving">("write");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<QuickPlan | null>(null);
  // Rows the person unticked, by "kind:index".
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [lists, setLists] = useState<ListRow[]>(() => readCache<ListRow[]>(homeId && `lists.${homeId}`) ?? []);
  const [listId, setListId] = useState<string | null>(() => readCache<string>(homeId && `activeList.${homeId}`) ?? null);
  const [customCats, setCustomCats] = useState<string[]>(() => readCache<string[]>(homeId && `cats.${homeId}`) ?? []);

  useEffect(() => {
    if (!homeId) return;
    supabase.from("shopping_lists").select("id, name, is_default").eq("home_id", homeId).order("created_at").then(({ data }) => {
      if (!data?.length) return;
      setLists(data);
      setListId((cur) => (cur && data.some((l) => l.id === cur) ? cur : (data.find((l) => l.is_default) ?? data[0]).id));
    });
    supabase.from("shopping_categories").select("name").eq("home_id", homeId).then(({ data }) => data && setCustomCats(data.map((c) => c.name)));
  }, [homeId]);

  const nameOf = (id: string | null) => (id ? members.find((m) => m.user_id === id)?.profile?.display_name ?? "בן/בת בית" : null);
  const categories = useMemo(() => [...new Set([...CATEGORIES, ...customCats])], [customCats]);

  const run = async () => {
    if (!homeId || !text.trim()) return;
    setError("");
    setStage("thinking");
    try {
      const p = await understand(text.trim(), homeId, categories);
      if (!p.shopping.length && !p.schedule.length && !p.tasks.length) {
        setError(p.unclear ? `לא מצאתי מה להוסיף: ${p.unclear}` : "לא מצאתי מה להוסיף. נסו לנסח אחרת.");
        setStage("write");
        return;
      }
      setPlan(p);
      setSkipped(new Set());
      setStage("review");
    } catch (e) {
      setError(aiErrorText(e));
      setStage("write");
    }
  };

  const kept: QuickPlan | null = plan && {
    shopping: plan.shopping.filter((_, i) => !skipped.has(`s:${i}`)),
    schedule: plan.schedule.filter((_, i) => !skipped.has(`c:${i}`)),
    tasks: plan.tasks.filter((_, i) => !skipped.has(`t:${i}`)),
    unclear: plan.unclear,
  };
  const count = kept ? kept.shopping.length + kept.schedule.length + kept.tasks.length : 0;

  const save = async () => {
    if (!kept || !homeId || !count) return;
    setStage("saving");
    try {
      const { added, undo } = await applyPlan(kept, { homeId, userId: user?.id ?? null, listId });
      announceDataChanged();
      onClose();
      const parts = [
        kept.shopping.length && `${kept.shopping.length} לקניות`,
        kept.schedule.length && `${kept.schedule.length} ללוז`,
        kept.tasks.length && `${kept.tasks.length} למשימות`,
      ].filter(Boolean);
      toast.success(added === 1 ? "נוסף פריט אחד" : `נוספו ${added} פריטים`, {
        description: parts.join(" · "),
        duration: 6000,
        action: {
          label: "ביטול",
          onClick: () =>
            undo().then(
              () => {
                announceDataChanged();
                toast("ההוספה בוטלה");
              },
              () => toast.error("לא הצלחנו לבטל"),
            ),
        },
      });
    } catch (e) {
      console.error("[nestly] quick add failed", e);
      toast.error("לא הצלחנו להוסיף", { description: "שום דבר לא נשמר. נסו שוב." });
      setStage("review");
    }
  };

  const toggle = (key: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const reviewing = stage === "review" || stage === "saving";
  const done = reviewing
    ? { label: stage === "saving" ? "מוסיף…" : `הוספה (${count})`, onClick: save, disabled: !count || stage === "saving" }
    : { label: stage === "thinking" ? "מבין…" : "המשך", onClick: run, disabled: !text.trim() || stage === "thinking" };

  const row = (key: string, title: string, tags: React.ReactNode) => (
    <PickRow key={key} kept={!skipped.has(key)} onToggle={() => toggle(key)} title={title} tags={tags} />
  );

  return (
    <Modal open onClose={onClose} title="הוספה מהירה" done={done}>
      {!reviewing ? (
        <div className="nst-fields">
          <textarea
            autoFocus
            rows={4}
            maxLength={600}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && run()}
            disabled={stage === "thinking"}
            placeholder="למשל: חלב, 2 ביצים ולחם. מחר ב-5 לאסוף את נועה מהחוג. להתקשר לסבתא."
            style={{ resize: "none", font: "400 17px/1.45 var(--font-body)" }}
          />
          <p className="section-sub" style={{ display: "flex", gap: 6 }}>
            <Sparkles size={15} style={{ flex: "none", marginTop: 2, color: "var(--accent)" }} />
            <span>כתבו או הכתיבו (במיקרופון של המקלדת) כמה דברים יחד — קניות, דברים ליומן ומשימות. לפני שמשהו נשמר תראו מה הובן.</span>
          </p>
          {error && (
            <p className="alert qa-error" role="alert">
              <TriangleAlert /> {error}
            </p>
          )}
        </div>
      ) : (
        plan && (
          <div className="qa-review">
            {plan.shopping.length > 0 && (
              <section>
                <div className="nst-subhead">
                  <ShoppingCart size={13} /> לקניות
                  {lists.length > 1 && (
                    <select className="qa-list" value={listId ?? ""} onChange={(e) => setListId(e.target.value)} aria-label="לאיזו רשימה">
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="nst-group">
                  {plan.shopping.map((s, i) =>
                    row(`s:${i}`, s.quantity > 1 ? `${s.name} ×${s.quantity}` : s.name, <span className="nst-tag">{s.category}</span>),
                  )}
                </div>
              </section>
            )}
            {plan.schedule.length > 0 && (
              <section>
                <div className="nst-subhead">
                  <CalendarDays size={13} /> ללוז
                </div>
                <div className="nst-group">
                  {plan.schedule.map((s, i) =>
                    row(
                      `c:${i}`,
                      s.title,
                      <>
                        <span className="nst-tag">{dayLabel(s.date, s.start_time)}</span>
                        {s.assigned_to && <span className="nst-tag">{nameOf(s.assigned_to)}</span>}
                      </>,
                    ),
                  )}
                </div>
              </section>
            )}
            {plan.tasks.length > 0 && (
              <section>
                <div className="nst-subhead">
                  <ListChecks size={13} /> למשימות
                </div>
                <div className="nst-group">
                  {plan.tasks.map((t, i) => row(`t:${i}`, t.title, <span className="nst-tag">{t.owner_id ? `של ${nameOf(t.owner_id)}` : "כלליות"}</span>))}
                </div>
              </section>
            )}
            {plan.unclear && (
              <p className="alert alert-info">
                <TriangleAlert /> לא הבנתי: {plan.unclear}
              </p>
            )}
            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setStage("write")} disabled={stage === "saving"}>
              עריכת הטקסט
            </button>
          </div>
        )
      )}
    </Modal>
  );
}
