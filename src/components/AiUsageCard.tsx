import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pencil, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { readCache, useOnResume, writeCache } from "../lib/cache";
import { useHome } from "../context/HomeContext";
import { Modal } from "./ui";

type Totals = { requests: number; input: number; output: number; cost: number; byAction: Record<string, number> };
// countingSince: the ledger's first row. Requests before it (before the ledger
// existed) were never recorded, so "everything" only means everything since then.
type Usage = { month: Totals; all: Totals; sinceBalance: Totals | null; balance: number | null; balanceAt: string | null; countingSince?: string | null };

const FEATURES: Record<string, string> = {
  quick_add: "הוספה מהירה",
  ask: "שאל את הבית",
  recipe: "רכיבי מתכון",
  breakdown: "פירוק משימה",
  menu: "תפריט שבועי",
  summary: "היום בקצרה",
};
const CONSOLE_BILLING = "https://console.anthropic.com/settings/billing";

const compact = new Intl.NumberFormat("he-IL", { notation: "compact", maximumFractionDigits: 1 });
const tokens = (n: number) => compact.format(n);
const usd = (n: number) => (n <= 0 ? "$0" : n < 0.01 ? "פחות מסנט" : `$${n.toFixed(2)}`);
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });

async function totalsSince(homeId: string, since: string): Promise<Totals> {
  const { data, error } = await supabase.rpc("ai_usage_totals", { p_home: homeId, p_since: since });
  if (error) throw error;
  const t: Totals = { requests: 0, input: 0, output: 0, cost: 0, byAction: {} };
  for (const r of data ?? []) {
    t.requests += Number(r.requests);
    t.input += Number(r.input_tokens);
    t.output += Number(r.output_tokens);
    t.cost += Number(r.cost_usd);
    t.byAction[r.action] = Number(r.requests);
  }
  return t;
}

/** At this month's pace, how long the credit that's left will last. */
function runway(left: number, monthCost: number) {
  const day = new Date().getDate();
  const perMonth = (monthCost / Math.max(day, 1)) * 30;
  if (perMonth <= 0 || left <= 0) return null;
  const months = left / perMonth;
  if (months >= 24) return "בקצב של החודש, זה מספיק לשנים";
  if (months >= 1.5) return `בקצב של החודש, זה מספיק לעוד כ-${Math.round(months)} חודשים`;
  return `בקצב של החודש, זה מספיק לעוד כ-${Math.max(1, Math.round(months * 30))} ימים`;
}

/**
 * Settings: how much the AI was used — requests, tokens, what it cost — and
 * roughly how much prepaid credit is left. Anthropic doesn't let an API key read
 * the account balance, so an owner types in the balance the Console shows and
 * the app subtracts what Nestly spent since; every request is in the ai_usage
 * ledger, written by the server from the usage Anthropic reports.
 */
export default function AiUsageCard() {
  const { homeId, isOwner } = useHome();
  const key = homeId && `ai.usage.${homeId}`;
  const [usage, setUsage] = useState<Usage | null>(() => readCache<Usage>(key) ?? null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!homeId) return;
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: home, error } = await supabase.from("homes").select("ai_balance_usd, ai_balance_at").eq("id", homeId).single();
      if (error) throw error;
      const [month, all, sinceBalance, first] = await Promise.all([
        totalsSince(homeId, monthStart),
        totalsSince(homeId, "2000-01-01T00:00:00Z"),
        home.ai_balance_at ? totalsSince(homeId, home.ai_balance_at) : Promise.resolve(null),
        supabase.from("ai_usage").select("created_at").eq("home_id", homeId).order("created_at").limit(1),
      ]);
      const next: Usage = {
        month,
        all,
        sinceBalance,
        balance: home.ai_balance_usd == null ? null : Number(home.ai_balance_usd),
        balanceAt: home.ai_balance_at,
        countingSince: first.data?.[0]?.created_at ?? null,
      };
      setUsage(next);
      setFailed(false);
      writeCache(key, next);
    } catch (e) {
      console.error("[nestly] ai usage load failed", e);
      setFailed(true);
    }
  }, [homeId, key]);

  useEffect(() => {
    load();
  }, [load]);
  useOnResume(load);

  const left = usage && usage.balance != null ? usage.balance - (usage.sinceBalance?.cost ?? 0) : null;
  const pace = left != null && usage ? runway(left, usage.month.cost) : null;
  const features = usage ? Object.entries(usage.month.byAction).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="nst-card ai-usage">
      <h2 className="nst-card-title" style={{ marginBottom: "0.9rem" }}>
        <Sparkles /> AI — שימוש וקרדיט
      </h2>

      {!usage ? (
        <p className="section-sub">{failed ? "לא הצלחנו לטעון את נתוני השימוש." : "טוען…"}</p>
      ) : (
        <>
          <div className="ai-usage-tiles">
            <div className="ai-usage-tile">
              <span className="ai-usage-label">נשאר בערך</span>
              <span className="ai-usage-num" dir="ltr">
                {left == null ? "—" : `$${Math.max(0, left).toFixed(2)}`}
              </span>
              <span className="ai-usage-sub">
                {left == null
                  ? isOwner
                    ? "הזינו את היתרה מהקונסולה"
                    : "מנהל/ת הבית יכול/ה להזין יתרה"
                  : left <= 0
                    ? "כנראה נגמר — כדאי לבדוק בקונסולה"
                    : `מתוך $${usage.balance!.toFixed(2)} ב-${shortDate(usage.balanceAt!)}`}
              </span>
            </div>
            <div className="ai-usage-tile">
              <span className="ai-usage-label">נוצל החודש</span>
              <span className="ai-usage-num">{usd(usage.month.cost)}</span>
              <span className="ai-usage-sub">
                {usage.month.requests === 1 ? "בקשה אחת" : `${usage.month.requests} בקשות`} · {tokens(usage.month.input + usage.month.output)} טוקנים
              </span>
            </div>
          </div>

          {pace && <p className="section-sub ai-usage-pace">{pace}</p>}

          <dl className="ai-usage-list">
            <div>
              <dt>טוקנים החודש</dt>
              <dd>
                {tokens(usage.month.input)} קלט · {tokens(usage.month.output)} פלט
              </dd>
            </div>
            {left != null && usage.sinceBalance && (
              <div>
                <dt>מאז עדכון היתרה</dt>
                <dd>
                  {usd(usage.sinceBalance.cost)} · {tokens(usage.sinceBalance.input + usage.sinceBalance.output)} טוקנים
                </dd>
              </div>
            )}
            <div>
              <dt>{usage.countingSince ? `מאז ${shortDate(usage.countingSince)} (תחילת הספירה)` : "מאז תחילת הספירה"}</dt>
              <dd>
                {usd(usage.all.cost)} · {usage.all.requests} בקשות · {tokens(usage.all.input + usage.all.output)} טוקנים
              </dd>
            </div>
            {features.length > 0 && (
              <div>
                <dt>החודש לפי פיצ׳ר</dt>
                <dd className="ai-usage-features">
                  {features.map(([action, n]) => (
                    <span key={action} className="nst-tag">
                      {FEATURES[action] ?? action} {n}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {isOwner && (
            <button className="btn btn-block" onClick={() => setEditing(true)}>
              <Pencil size={15} /> {usage.balance == null ? "הזנת היתרה מהקונסולה" : "עדכון היתרה"}
            </button>
          )}
          <p className="section-sub" style={{ marginTop: 10 }}>
            כל בקשת AI נרשמת כאן אוטומטית, עם הטוקנים שצרכה ומחירם. הספירה התחילה עם הגרסה הזו — שימוש מלפני כן, ושימוש אחר באותו מפתח, מופיעים רק בקונסולה של Anthropic. ״נשאר״ היא הערכה: היתרה האחרונה שהוזנה מהקונסולה, פחות מה ש-Nestly ניצלה מאז.
          </p>
        </>
      )}

      {editing && homeId && (
        <BalanceSheet
          homeId={homeId}
          current={usage?.balance ?? null}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function BalanceSheet({ homeId, current, onClose, onSaved }: { homeId: string; current: number | null; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(current != null ? String(current) : "");
  const [busy, setBusy] = useState(false);
  const amount = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(amount) && amount >= 0 && amount < 100000;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const { error } = await supabase
      .from("homes")
      .update({ ai_balance_usd: Math.round(amount * 10000) / 10000, ai_balance_at: new Date().toISOString() })
      .eq("id", homeId);
    setBusy(false);
    if (error) toast.error("לא הצלחנו לשמור את היתרה");
    else onSaved();
  };

  return (
    <Modal open onClose={onClose} title="היתרה ב-Anthropic" done={{ label: busy ? "שומר…" : "שמירה", onClick: save, disabled: !valid || busy }}>
      <div className="nst-fields">
        <p className="section-sub">
          פתחו את דף החיוב בקונסולה של Anthropic, העתיקו את ה-Credit balance והזינו אותו כאן. מעכשיו האפליקציה תחסיר ממנו כל בקשה. כדאי לעדכן אחרי כל טעינת קרדיט.
        </p>
        <a className="btn btn-sm" style={{ alignSelf: "flex-start" }} href={CONSOLE_BILLING} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> לדף החיוב בקונסולה
        </a>
        <div>
          <label htmlFor="ai-balance">היתרה כרגע (בדולרים)</label>
          <div className="ai-balance-field" dir="ltr">
            <span aria-hidden>$</span>
            <input
              id="ai-balance"
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder="5.00"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
