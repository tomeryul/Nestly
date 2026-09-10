import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Check, Package, MapPin, Clock, X, GripVertical, Store, AlertTriangle } from "lucide-react";
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

export default function Deliveries() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [tab, setTab] = useState<"open" | "points">("open");
  const [points, setPoints] = useState<Point[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  // new delivery form
  const [name, setName] = useState("");
  const [pointId, setPointId] = useState("");

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
  // Keep the selection valid: a deleted point must not linger as a dangling id,
  // or the next insert fails the foreign key and the parcel silently vanishes.
  useEffect(() => {
    if (points.length === 0) {
      if (pointId) setPointId("");
    } else if (!points.some((p) => p.id === pointId)) {
      setPointId(points[0].id);
    }
  }, [points, pointId]);

  const pointById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);

  const addDelivery = () => {
    if (!name.trim() || !homeId) return;
    const today = toISODate(new Date());
    const point = pointId ? pointById.get(pointId) : undefined;
    const id = newId();
    const row: Delivery = {
      id,
      home_id: homeId,
      name: name.trim(),
      pickup_point_id: pointId || null,
      arrived_on: today,
      // A parcel goes back to the sender after the point's holding period.
      return_by: point ? addDaysIso(today, point.hold_days) : null,
      picked_up: false,
      position: deliveries.length,
      created_by: user?.id ?? null,
      created_at: new Date().toISOString(),
    };
    setDeliveries((prev) => [...prev, row]);
    setName("");
    bgWrite(
      supabase.from("deliveries").insert({
        id, home_id: homeId, name: row.name, pickup_point_id: row.pickup_point_id,
        arrived_on: today, return_by: row.return_by, position: row.position, created_by: user?.id ?? null,
      }),
      load
    );
  };
  const togglePicked = (d: Delivery) => {
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, picked_up: !x.picked_up } : x)));
    bgWrite(supabase.from("deliveries").update({ picked_up: !d.picked_up }).eq("id", d.id), load);
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
  const open = useMemo(() => deliveries.filter((d) => !d.picked_up), [deliveries]);
  const collected = useMemo(() => deliveries.filter((d) => d.picked_up), [deliveries]);
  const dr = useDragReorder(open, reorderDeliveries);
  const openById = useMemo(() => new Map(open.map((d) => [d.id, d])), [open]);
  const urgent = open.filter((d) => d.return_by && daysUntil(d.return_by) <= 1).length;

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
    return (
      <div
        className="nst-row"
        key={d.id}
        ref={draggable ? dr.setItemRef(d.id) : undefined}
        style={{ opacity: d.picked_up ? 0.55 : 1, ...(draggable ? dr.itemStyle(d.id) : {}) }}
      >
        {draggable && open.length > 1 && (
          <span className="nst-grip" {...dr.handleProps(d.id)} title="גרירה לסידור">
            <GripVertical size={17} />
          </span>
        )}
        <button className={`nst-check ${d.picked_up ? "on" : ""}`} onClick={() => togglePicked(d)} title={d.picked_up ? "החזרה לרשימה" : "נאסף"}>
          <Check size={14} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: d.picked_up ? "line-through" : "none" }}>{d.name}</p>
          <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
            {point && (
              <span className="nst-tag">
                <Store /> {point.name}
              </span>
            )}
            {point?.location && (
              <span className="nst-tag">
                <MapPin /> {point.location}
              </span>
            )}
            {point?.closing_time && (
              <span className="nst-tag">
                <Clock /> נסגר {formatTime(point.closing_time)}
              </span>
            )}
            {dl && !d.picked_up && (
              <span className="nst-tag" style={{ background: dl.soft, color: dl.tone }}>
                {dl.left <= 0 && <AlertTriangle />} {dl.label}
              </span>
            )}
          </div>
        </div>
        <button className="nst-del" onClick={() => removeDelivery(d.id)}>
          <Trash2 />
        </button>
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
            {points.length === 0 ? (
              <p className="section-sub">קודם הוסיפו נקודת איסוף בלשונית "נקודות איסוף", ואז תוכלו לרשום כאן חבילות.</p>
            ) : (
              <>
                <input placeholder="מה הגיע? (למשל: חבילה מאמזון)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDelivery()} />
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={{ flex: 1 }} value={pointId} onChange={(e) => setPointId(e.target.value)}>
                    {points.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.location ? ` · ${p.location}` : ""}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={addDelivery}>
                    <Plus size={18} />
                  </button>
                </div>
              </>
            )}
          </div>

          {open.length === 0 ? (
            <EmptyState icon={<Package size={42} />} title="אין חבילות לאיסוף" hint="כל מה שנאסף מופיע למטה" />
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
