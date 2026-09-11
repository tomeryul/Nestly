import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Package, MapPin, Clock, X, GripVertical, Store, AlertTriangle, ShoppingBag, PackageCheck, ArrowLeft, Navigation } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState, FullPageSpinner } from "../components/ui";
import { useDragReorder } from "../lib/dragReorder";
import { bgWrite, newId } from "../lib/optimistic";
import { formatTime, toISODate } from "../lib/dates";
import type { Tables } from "../types/database";

type Point = Tables<"pickup_points">;
type Delivery = Tables<"deliveries">;

/** Whole days from today until `iso` (negative once the date has passed). */
function daysUntil(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

const STAGES = [
  { label: "הזמנה בוצעה", icon: ShoppingBag },
  { label: "כתובת משלוח", icon: MapPin },
  { label: "החבילה נאספה", icon: PackageCheck },
];
const LAST_STAGE = STAGES.length - 1; // 2 — collected

/** Waze deep link; works as an app handoff on mobile and the web client otherwise. */
const wazeUrl = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

export default function Deliveries() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [tab, setTab] = useState<"open" | "points">("open");
  const [points, setPoints] = useState<Point[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  // new delivery form
  const [name, setName] = useState("");
  const [stagingPoint, setStagingPoint] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!homeId) return;
    const [p, d] = await Promise.all([
      supabase.from("pickup_points").select("*").eq("home_id", homeId).order("position").order("created_at"),
      supabase.from("deliveries").select("*").eq("home_id", homeId).order("picked_up").order("position").order("created_at"),
    ]);
    setPoints(p.data ?? []);
    setDeliveries(d.data ?? []);
    setLoading(false);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);
  // Drop staged selections whose pickup point was deleted, so a card never
  // submits a dangling id that would fail the foreign key.
  useEffect(() => {
    setStagingPoint((prev) => {
      const kept = Object.fromEntries(Object.entries(prev).filter(([, v]) => points.some((p) => p.id === v)));
      return Object.keys(kept).length === Object.keys(prev).length ? prev : kept;
    });
  }, [points]);

  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  const addDelivery = () => {
    if (!name.trim() || !homeId) return;
    const id = newId();
    const row: Delivery = {
      id,
      home_id: homeId,
      name: name.trim(),
      pickup_point_id: null,
      arrived_on: toISODate(new Date()),
      return_by: null,
      picked_up: false,
      stage: 0,
      position: deliveries.length,
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
    };
    setDeliveries((prev) => [...prev, row]);
    setName("");
    bgWrite(
      supabase.from("deliveries").insert({ id, home_id: homeId, name: row.name, stage: 0, position: row.position, created_by: user?.id ?? null }),
      load
    );
  };

  /** Stage 0 -> 1: the parcel reached a pickup point, so the return clock starts now. */
  const setAddress = (d: Delivery, targetPointId: string) => {
    const point = pointById.get(targetPointId);
    if (!point) return;
    const today = toISODate(new Date());
    const patch = { pickup_point_id: targetPointId, arrived_on: today, return_by: addDaysIso(today, point.hold_days), stage: 1 };
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
    bgWrite(supabase.from("deliveries").update(patch).eq("id", d.id), load);
  };

  const setStage = (d: Delivery, stage: number) => {
    const next = Math.max(0, Math.min(stage, LAST_STAGE));
    // Going back before the address clears it, so the flow stays truthful.
    const patch =
      next === 0
        ? { stage: 0, picked_up: false, pickup_point_id: null, return_by: null }
        : { stage: next, picked_up: next >= LAST_STAGE };
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
    bgWrite(supabase.from("deliveries").update(patch).eq("id", d.id), load);
  };

  const removeDelivery = (id: string) => {
    setDeliveries((prev) => prev.filter((x) => x.id !== id));
    bgWrite(supabase.from("deliveries").delete().eq("id", id), load);
  };
  const addPoint = (p: { name: string; location: string; closing: string; hold: number }) => {
    if (!p.name.trim() || !homeId) return;
    const id = newId();
    const row: Point = {
      id, home_id: homeId, name: p.name.trim(), location: p.location.trim() || null,
      closing_time: p.closing || null, hold_days: p.hold, notes: null,
      position: points.length, created_at: new Date().toISOString(),
    };
    setPoints((prev) => [...prev, row]);
    bgWrite(
      supabase.from("pickup_points").insert({ id, home_id: homeId, name: row.name, location: row.location, closing_time: row.closing_time, hold_days: p.hold, position: row.position }),
      load
    );
  };
  const removePoint = (id: string) => {
    setPoints((prev) => prev.filter((p) => p.id !== id));
    bgWrite(supabase.from("pickup_points").delete().eq("id", id), load);
  };
  const reorderDeliveries = useCallback(
    async (ids: string[]) => {
      await Promise.all(ids.map((id, i) => supabase.from("deliveries").update({ position: i }).eq("id", id)));
      load();
    },
    [load]
  );

  // Memoised: useDragReorder syncs from this array, and a fresh identity each
  // render would snap the just-dragged order back to the stale server order.
  const open = useMemo(() => deliveries.filter((d) => d.stage < LAST_STAGE), [deliveries]);
  const collected = useMemo(() => deliveries.filter((d) => d.stage >= LAST_STAGE), [deliveries]);
  const dr = useDragReorder(open, reorderDeliveries);
  const openById = useMemo(() => new Map(open.map((d) => [d.id, d])), [open]);
  const urgent = open.filter((d) => d.pickup_point_id && d.return_by && daysUntil(d.return_by) <= 1).length;

  if (loading) return <FullPageSpinner />;

  const deadline = (d: Delivery) => {
    if (!d.return_by) return null;
    const left = daysUntil(d.return_by);
    const label = left < 0 ? `חזר לשולח לפני ${-left} ימים` : left === 0 ? "היום האחרון!" : left === 1 ? "נשאר יום אחד" : `נשארו ${left} ימים`;
    const tone = left <= 0 ? "var(--danger)" : left <= 2 ? "var(--warn)" : "var(--ok)";
    const soft = left <= 0 ? "var(--danger-soft)" : left <= 2 ? "var(--warn-soft)" : "var(--ok-soft)";
    return { label, tone, soft, left };
  };

  const row = (d: Delivery, draggable: boolean) => {
    const point = d.pickup_point_id ? pointById.get(d.pickup_point_id) : undefined;
    const dl = deadline(d);
    const done = d.stage >= LAST_STAGE;
    const address = point?.location?.trim() || point?.name?.trim() || "";

    return (
      <div
        className="nst-card"
        key={d.id}
        ref={draggable ? dr.setItemRef(d.id) : undefined}
        style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 12, opacity: done ? 0.7 : 1, ...(draggable ? dr.itemStyle(d.id) : {}) }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {draggable && open.length > 1 && (
            <span className="nst-grip" {...dr.handleProps(d.id)} title="גרירה לסידור">
              <GripVertical size={18} />
            </span>
          )}
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--cat-7-bg)", color: "var(--cat-7-fg)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <Package size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ font: "600 15px var(--font-body)", color: "var(--text-bright)", textDecoration: done ? "line-through" : "none" }}>{d.name}</p>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
              {point && (
                <span className="nst-tag">
                  <Store /> {point.name}
                </span>
              )}
              {point?.closing_time && (
                <span className="nst-tag">
                  <Clock /> נסגר {formatTime(point.closing_time)}
                </span>
              )}
              {dl && point && !done && (
                <span className="nst-tag" style={{ background: dl.soft, color: dl.tone }}>
                  {dl.left <= 0 && <AlertTriangle />} {dl.label}
                </span>
              )}
            </div>
          </div>
          <button className="nst-del" onClick={() => removeDelivery(d.id)}>
            <Trash2 size={17} />
          </button>
        </div>

        {/* stage progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {STAGES.map((st, i) => {
            const state = d.stage > i ? "done" : d.stage === i ? "current" : "todo";
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  style={{
                    width: 34, height: 34, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
                    background: state === "done" ? "var(--accent)" : state === "current" ? "var(--accent-soft)" : "var(--surface-2)",
                    color: state === "done" ? "#fff" : state === "current" ? "var(--accent-ink)" : "var(--text-muted)",
                    boxShadow: state === "todo" ? "inset 0 0 0 1px var(--border-2)" : "none",
                  }}
                >
                  {state === "done" ? <Check size={16} /> : <st.icon size={16} />}
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: state === "todo" ? "var(--text-muted)" : "var(--text-2)", textAlign: "center" }}>{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* the address, once we have one, with a Waze handoff */}
        {point && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MapPin size={15} style={{ color: "var(--accent)", flex: "none" }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-2)", fontWeight: 600 }}>{address || "ללא כתובת"}</span>
            {address && (
              <a className="btn btn-sm" href={wazeUrl(address)} target="_blank" rel="noopener noreferrer" title="ניווט עם Waze">
                <Navigation size={14} /> Waze
              </a>
            )}
          </div>
        )}

        {/* Needs an address: stage 0, or a later stage whose pickup point was deleted. */}
        {d.stage < LAST_STAGE && !point &&
          (points.length === 0 ? (
            <p className="section-sub">הוסיפו נקודת איסוף בלשונית "נקודות איסוף" כדי להמשיך.</p>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ flex: 1 }} value={stagingPoint[d.id] ?? points[0].id} onChange={(e) => setStagingPoint((prev) => ({ ...prev, [d.id]: e.target.value }))}>
                {points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.location ? ` · ${p.location}` : ""}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" style={{ padding: "0 14px" }} onClick={() => setAddress(d, stagingPoint[d.id] ?? points[0].id)}>
                הגיע לכתובת <ArrowLeft size={16} />
              </button>
            </div>
          ))}

        {d.stage === 1 && point && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setStage(d, 0)}>
              שלב קודם
            </button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setStage(d, 2)}>
              סיימתי · החבילה נאספה <ArrowLeft size={16} />
            </button>
          </div>
        )}

        {done && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="badge b-active" style={{ borderRadius: 30 }}>
              <Check size={12} style={{ verticalAlign: -2 }} /> נאספה
            </span>
            <button className="btn btn-sm" onClick={() => setStage(d, 1)}>
              חזרה
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h1 className="page-title">משלוחים</h1>

      <div className="nst-seg">
        <button className={tab === "open" ? "active" : ""} onClick={() => setTab("open")}>
          לאיסוף{open.length > 0 ? ` (${open.length})` : ""}
        </button>
        <button className={tab === "points" ? "active" : ""} onClick={() => setTab("points")}>
          נקודות איסוף
        </button>
      </div>

      {tab === "open" ? (
        <>
          {urgent > 0 && (
            <div className="next-action is-calm">
              <span className="next-action-ico">
                <AlertTriangle />
              </span>
              <div className="next-action-body">
                <div className="next-action-kicker">דחוף</div>
                <div className="next-action-title">
                  {urgent} {urgent === 1 ? "חבילה חוזרת לשולח בקרוב" : "חבילות חוזרות לשולח בקרוב"}
                </div>
              </div>
            </div>
          )}

          <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 10 }}>
            <p className="section-sub" style={{ marginTop: "-0.2rem" }}>רשמו מה הזמנתם. את הכתובת תבחרו כשהחבילה תגיע לנקודת איסוף.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ flex: 1 }} placeholder="מה הוזמן? (למשל: אוזניות מאמזון)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDelivery()} />
              <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={addDelivery}>
                <Plus size={18} />
              </button>
            </div>
          </div>

          {open.length === 0 ? (
            <EmptyState icon={<Package size={42} />} title="אין משלוחים פתוחים" hint="רשמו הזמנה חדשה למעלה" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {dr.order.map((id) => {
                const d = openById.get(id);
                return d ? row(d, true) : null;
              })}
            </div>
          )}

          {collected.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 6 }}>
              <div style={{ margin: "0 4px", color: "var(--text-3)", font: "700 11.5px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                נאספו · {collected.length}
              </div>
              {collected.map((d) => row(d, false))}
            </div>
          )}
        </>
      ) : (
        <PointsTab points={points} onAdd={addPoint} onRemove={removePoint} />
      )}
    </section>
  );
}

function PointsTab({
  points,
  onAdd,
  onRemove,
}: {
  points: Point[];
  onAdd: (p: { name: string; location: string; closing: string; hold: number }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [closing, setClosing] = useState("");
  const [hold, setHold] = useState(3);

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name, location, closing, hold });
    setName("");
    setLocation("");
    setClosing("");
  };

  return (
    <>
      <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="section-sub" style={{ marginTop: "-0.2rem" }}>המקומות שאליהם מגיעות אצלכם חבילות — שם, מיקום, שעת סגירה, וכמה ימים החבילה מחכה עד שהיא חוזרת לשולח.</p>
        <input placeholder="שם המקום (למשל: פיקאפ ברמי לוי)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <input placeholder="מיקום / כתובת" value={location} onChange={(e) => setLocation(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ font: "700 11px var(--font-body)", color: "var(--text-3)", margin: 0 }}>נסגר</label>
          <input type="time" style={{ width: 120 }} value={closing} onChange={(e) => setClosing(e.target.value)} />
          <label style={{ font: "700 11px var(--font-body)", color: "var(--text-3)", margin: 0 }}>ימי המתנה</label>
          <input type="number" min={1} max={60} style={{ width: 74 }} value={hold} onChange={(e) => setHold(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={submit}>
          <Plus size={16} /> הוספת נקודת איסוף
        </button>
      </div>

      {points.length === 0 ? (
        <EmptyState icon={<Store size={42} />} title="עדיין אין נקודות איסוף" hint="הוסיפו את המקומות שאליהם מגיעות החבילות" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {points.map((p) => (
            <div className="nst-row" key={p.id}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                <Store size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)" }}>{p.name}</p>
                <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                  {p.location && (
                    <span className="nst-tag">
                      <MapPin /> {p.location}
                    </span>
                  )}
                  {p.closing_time && (
                    <span className="nst-tag">
                      <Clock /> נסגר {formatTime(p.closing_time)}
                    </span>
                  )}
                  <span className="nst-tag">{p.hold_days} ימי המתנה</span>
                </div>
              </div>
              <button className="nst-del" onClick={() => onRemove(p.id)}>
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
