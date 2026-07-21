import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Minus, Repeat, ChefHat, Check, ListPlus, X, Eraser, ShoppingBasket, Trash2, ListFilter } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Modal, EmptyState, FullPageSpinner } from "../components/ui";
import { CATEGORIES, DAYS_HE } from "../lib/constants";
import type { Tables } from "../types/database";

type Item = Tables<"shopping_items">;
type List = Tables<"shopping_lists">;
type Recurring = Tables<"recurring_shopping_items">;

export default function Shopping() {
  const { homeId } = useHome();
  const { user } = useAuth();
  const [lists, setLists] = useState<List[]>([]);
  const [activeList, setActiveList] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [grouped, setGrouped] = useState(() => localStorage.getItem("nestly.shopGrouped") === "1");

  const toggleGrouped = () => {
    setGrouped((g) => {
      localStorage.setItem("nestly.shopGrouped", g ? "0" : "1");
      return !g;
    });
  };

  // product memory: distinct products the home has ever added (for autocomplete)
  const [catalog, setCatalog] = useState<{ name: string; category: string | null; quantity: number }[]>([]);
  const [focused, setFocused] = useState(false);
  const loadCatalog = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("shopping_items").select("name, category, quantity, created_at").eq("home_id", homeId).order("created_at", { ascending: false }).limit(500);
    const seen = new Set<string>();
    const out: { name: string; category: string | null; quantity: number }[] = [];
    for (const it of data ?? []) {
      const k = it.name.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name: it.name, category: it.category, quantity: it.quantity });
    }
    setCatalog(out);
  }, [homeId]);
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [name, catalog]);

  const loadLists = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("shopping_lists").select("*").eq("home_id", homeId).order("is_default", { ascending: false }).order("created_at");
    setLists(data ?? []);
    setActiveList((prev) => prev ?? data?.[0]?.id ?? null);
  }, [homeId]);

  const loadItems = useCallback(async () => {
    if (!activeList) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("shopping_items").select("*").eq("list_id", activeList).order("is_checked").order("created_at");
    setItems(data ?? []);
    setLoading(false);
  }, [activeList]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);
  useEffect(() => {
    loadItems();
  }, [loadItems]);
  useEffect(() => {
    if (!activeList) return;
    const ch = supabase
      .channel("shop-items-" + activeList)
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items", filter: `list_id=eq.${activeList}` }, () => loadItems())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeList, loadItems]);

  const addItem = async () => {
    if (!name.trim() || !homeId || !activeList) return;
    await supabase.from("shopping_items").insert({ list_id: activeList, home_id: homeId, name: name.trim(), quantity: qty, category, source: "manual", created_by: user?.id ?? null });
    setName("");
    setQty(1);
    setFocused(false);
    loadItems();
    loadCatalog();
  };
  const toggle = async (item: Item) => {
    await supabase.from("shopping_items").update({ is_checked: !item.is_checked }).eq("id", item.id);
    loadItems();
  };
  const changeQty = async (item: Item, delta: number) => {
    await supabase.from("shopping_items").update({ quantity: Math.max(1, item.quantity + delta) }).eq("id", item.id);
    loadItems();
  };
  const remove = async (id: string) => {
    await supabase.from("shopping_items").delete().eq("id", id);
    loadItems();
  };
  const clearChecked = async () => {
    if (!activeList) return;
    await supabase.from("shopping_items").delete().eq("list_id", activeList).eq("is_checked", true);
    loadItems();
  };

  if (loading && !lists.length) return <FullPageSpinner />;
  const checkedCount = items.filter((i) => i.is_checked).length;

  const renderRow = (item: Item) => (
    <div className="nst-row" key={item.id} style={{ opacity: item.is_checked ? 0.55 : 1 }}>
      <button className={`nst-check ${item.is_checked ? "on" : ""}`} onClick={() => toggle(item)}>
        <Check size={14} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)", textDecoration: item.is_checked ? "line-through" : "none" }}>{item.name}</p>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
          {item.category && !grouped && <span className="nst-tag">{item.category}</span>}
          {item.source === "recipe" && (
            <span className="nst-tag" style={{ background: "var(--cat-3-bg)", color: "var(--cat-3-fg)" }}>
              <ChefHat /> ממתכון
            </span>
          )}
          {item.source === "recurring" && (
            <span className="nst-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
              <Repeat /> קבוע
            </span>
          )}
        </div>
      </div>
      <div className="nst-stepper">
        <button onClick={() => changeQty(item, -1)}>
          <Minus />
        </button>
        <span className="val">{item.quantity}</span>
        <button onClick={() => changeQty(item, 1)}>
          <Plus />
        </button>
      </div>
      <button className="nst-del" onClick={() => remove(item.id)}>
        <Trash2 />
      </button>
    </div>
  );

  // when grouped, order categories by the CATEGORIES list, with any others last
  const groupedSections: [string, Item[]][] = (() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const key = it.category || "אחר";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    const order = [...CATEGORIES, "אחר"];
    return [...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  })();

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h1 className="page-title">קניות</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-sm ${grouped ? "btn-primary" : ""}`} onClick={toggleGrouped} title="מיון לפי קטגוריה">
            <ListFilter size={15} /> קטגוריות
          </button>
          <button className="btn btn-sm" onClick={() => setShowRecurring(true)}>
            <Repeat size={15} /> קבועים
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 3 }}>
        {lists.map((l) => (
          <button key={l.id} className={`nst-chip ${activeList === l.id ? "active" : ""}`} onClick={() => setActiveList(l.id)}>
            {l.name}
          </button>
        ))}
        <button className="nst-chip" style={{ color: "var(--accent)" }} onClick={() => setShowNewList(true)}>
          <ListPlus size={14} /> רשימה
        </button>
      </div>

      <div className="nst-card" style={{ padding: "1rem 1.1rem", display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          placeholder="הוספת מצרך…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        {focused && suggestions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {suggestions.map((s) => {
              const cur = items.find((i) => i.name.trim().toLowerCase() === s.name.trim().toLowerCase());
              return (
                <button
                  key={s.name}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setName(s.name);
                    setQty(s.quantity);
                    if (s.category) setCategory(s.category);
                    setFocused(false);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--surface-2)", border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", textAlign: "right" }}
                >
                  <span style={{ flex: 1, font: "600 13.5px var(--font-body)", color: "var(--text-bright)", textDecoration: cur?.is_checked ? "line-through" : "none" }}>{s.name}</span>
                  {s.category && <span className="nst-tag">{s.category}</span>}
                  <span className="nst-tag">×{s.quantity}</span>
                  {cur &&
                    (cur.is_checked ? (
                      <span className="nst-tag" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>נקנה</span>
                    ) : (
                      <span className="nst-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>ברשימה</span>
                    ))}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <div className="nst-stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus />
            </button>
            <span className="val">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)}>
              <Plus />
            </button>
          </div>
          <select style={{ flex: 1 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" style={{ padding: "0 16px" }} onClick={addItem}>
            <Plus size={18} />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBasket size={42} />} title="הרשימה ריקה" hint="הוסיפו מצרך ראשון למעלה" />
      ) : grouped ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groupedSections.map(([cat, catItems]) => (
            <div key={cat}>
              <div style={{ margin: "0 4px 0.5rem", color: "var(--text-3)", font: "700 11.5px var(--font-body)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {cat} · {catItems.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{catItems.map(renderRow)}</div>
            </div>
          ))}
          {checkedCount > 0 && (
            <button className="btn btn-block" style={{ color: "var(--danger)" }} onClick={clearChecked}>
              <Eraser size={16} /> מחיקת {checkedCount} פריטים מסומנים
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {items.map(renderRow)}
          {checkedCount > 0 && (
            <button className="btn btn-block" style={{ color: "var(--danger)", marginTop: 4 }} onClick={clearChecked}>
              <Eraser size={16} /> מחיקת {checkedCount} פריטים מסומנים
            </button>
          )}
        </div>
      )}

      {showNewList && (
        <NewListModal
          homeId={homeId!}
          onClose={() => setShowNewList(false)}
          onCreated={(id) => {
            setShowNewList(false);
            loadLists();
            setActiveList(id);
          }}
        />
      )}
      {showRecurring && <RecurringModal homeId={homeId!} lists={lists} onClose={() => setShowRecurring(false)} />}
    </section>
  );
}

function NewListModal({ homeId, onClose, onCreated }: { homeId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const create = async () => {
    if (!name.trim()) return;
    const { data } = await supabase.from("shopping_lists").insert({ home_id: homeId, name: name.trim(), created_by: user?.id ?? null }).select("id").single();
    if (data) onCreated(data.id);
  };
  return (
    <Modal open onClose={onClose} title="רשימה חדשה">
      <div className="nst-fields">
        <div>
          <label>שם הרשימה</label>
          <input placeholder="למשל: פארם" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 12 }} onClick={create}>
          יצירה
        </button>
      </div>
    </Modal>
  );
}

function RecurringModal({ homeId, lists, onClose }: { homeId: string; lists: List[]; onClose: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Recurring[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [day, setDay] = useState(0);
  const [listId, setListId] = useState<string>(lists[0]?.id ?? "");

  const load = useCallback(async () => {
    const { data } = await supabase.from("recurring_shopping_items").select("*").eq("home_id", homeId).order("day_of_week");
    setRows(data ?? []);
  }, [homeId]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    await supabase.from("recurring_shopping_items").insert({ home_id: homeId, name: name.trim(), quantity: qty, day_of_week: day, target_list_id: listId || null, created_by: user?.id ?? null });
    setName("");
    setQty(1);
    load();
  };
  const remove = async (id: string) => {
    await supabase.from("recurring_shopping_items").delete().eq("id", id);
    load();
  };

  return (
    <Modal open onClose={onClose} title="פריטים אוטומטיים">
      <p className="section-sub" style={{ marginTop: "-0.3rem", marginBottom: "1rem" }}>פריטים שיתווספו אוטומטית לרשימה ביום שבחרתם, בכל שבוע.</p>
      <div style={{ background: "var(--surface-2)", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginBottom: "1rem" }}>
        <input placeholder="שם המצרך" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <div className="nst-stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus />
            </button>
            <span className="val">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)}>
              <Plus />
            </button>
          </div>
          <select style={{ flex: 1 }} value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS_HE.map((d, i) => (
              <option key={i} value={i}>
                יום {d}
              </option>
            ))}
          </select>
        </div>
        {lists.length > 1 && (
          <select value={listId} onChange={(e) => setListId(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary btn-block" style={{ padding: 11 }} onClick={add}>
          <Plus size={16} /> הוספה
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "0.5rem 0" }}>אין פריטים אוטומטיים</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface)", borderRadius: 12, padding: "9px 12px", boxShadow: "var(--shadow-sm)" }}>
            <span style={{ flex: 1, fontSize: 13.5, color: "var(--text-2)", fontWeight: 500 }}>
              {r.name} × {r.quantity}
            </span>
            <span className="badge b-wt">יום {DAYS_HE[r.day_of_week]}</span>
            <button className="nst-del" onClick={() => remove(r.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
