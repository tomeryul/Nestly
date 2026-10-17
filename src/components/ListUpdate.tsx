import { useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "./ui";
import { PickRow } from "./AiParts";
import { aiErrorText } from "../lib/ai";
import { announceDataChanged } from "../lib/cache";
import { applyChanges, describeChange, understandUpdate, type ListUpdatePlan } from "../lib/listUpdate";

/**
 * Update the lists in a sentence, typed or dictated: "תוסיף למחסן 4 רסק עגבניות
 * ותוריד אורז אחד". Same three steps as quick add — write, see each change with
 * its before and after (untick anything wrong), update — and an undo after.
 */
export default function ListUpdate({
  homeId,
  userId,
  listId,
  categories,
  history,
  onClose,
  onDone,
}: {
  homeId: string;
  userId: string | null;
  listId: string | null;
  categories: string[];
  history: { name: string; category: string | null }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [stage, setStage] = useState<"write" | "thinking" | "review" | "saving">("write");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<ListUpdatePlan | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set());

  const run = async () => {
    if (!text.trim()) return;
    setError("");
    setStage("thinking");
    try {
      const p = await understandUpdate(homeId, text.trim(), listId);
      if (!p.changes.length) {
        setError(p.unclear ? `לא מצאתי מה לעדכן: ${p.unclear}` : "לא מצאתי מה לעדכן. נסו לנסח אחרת.");
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

  const kept = plan ? plan.changes.filter((_, i) => !skipped.has(i)) : [];
  const save = async () => {
    if (!kept.length) return;
    setStage("saving");
    try {
      const undo = await applyChanges(kept, { homeId, userId, categories, history });
      announceDataChanged();
      onDone();
      toast.success(kept.length === 1 ? "עודכן פריט אחד" : `עודכנו ${kept.length} פריטים`, {
        duration: 6000,
        action: {
          label: "ביטול",
          onClick: () =>
            undo().then(
              () => {
                announceDataChanged();
                toast("העדכון בוטל");
              },
              () => toast.error("לא הצלחנו לבטל"),
            ),
        },
      });
    } catch (e) {
      console.error("[nestly] list update failed", e);
      toast.error("לא הצלחנו לעדכן", { description: "שום דבר לא השתנה. נסו שוב." });
      setStage("review");
    }
  };

  const reviewing = stage === "review" || stage === "saving";
  const done = reviewing
    ? { label: stage === "saving" ? "מעדכן…" : `עדכון (${kept.length})`, onClick: save, disabled: !kept.length || stage === "saving" }
    : { label: stage === "thinking" ? "מבין…" : "המשך", onClick: run, disabled: !text.trim() || stage === "thinking" };

  return (
    <Modal open onClose={onClose} title="עדכון עם AI" done={done}>
      {!reviewing ? (
        <div className="nst-fields">
          <textarea
            rows={3}
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && run()}
            disabled={stage === "thinking"}
            placeholder="למשל: תוסיף למחסן 4 רסק עגבניות ותוריד אורז אחד"
            style={{ resize: "none", font: "400 17px/1.45 var(--font-body)" }}
          />
          <p className="section-sub" style={{ display: "flex", gap: 6 }}>
            <Sparkles size={15} style={{ flex: "none", marginTop: 2, color: "var(--accent)" }} />
            <span>להוסיף, להוריד, לעדכן כמה יש או למחוק — בכל רשימה, גם במחסן. כתבו או הכתיבו; לפני שמשהו משתנה תראו כל שינוי, מכמה לכמה.</span>
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
            <div className="nst-group">
              {plan.changes.map((c, i) => (
                <PickRow
                  key={i}
                  kept={!skipped.has(i)}
                  onToggle={() =>
                    setSkipped((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })
                  }
                  title={c.name}
                  tags={
                    <>
                      <span className="nst-tag" dir="rtl">{describeChange(c)}</span>
                      <span className="nst-tag">{c.list_name}</span>
                    </>
                  }
                />
              ))}
            </div>
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
