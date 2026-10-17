import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Repeat, ChefHat, Check, ListPlus, X, Eraser, ShoppingBasket, Trash2, ListFilter, Tag, ShoppingCart, Sparkles, Search } from "lucide-react";
import { AiButton } from "../components/AiParts";
import ListUpdate from "../components/ListUpdate";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { readCache, useOnResume, writeCache } from "../lib/cache";
import { Modal, EmptyState, FullPageSpinner } from "../components/ui";
import { CATEGORIES, DAYS_HE } from "../lib/constants";
import { reinsert, removeWithUndo } from "../lib/undo";
import { bgWrite, newId } from "../lib/optimistic";
import { useDoneLast } from "../lib/doneLast";
import { searchCatalog } from "../lib/products";
import { aiCategory, knownCategory } from "../lib/categorize";
import { fetchStores, getStoreId, getStoreName, priceMany, setStoreId, setStoreName, type PriceItem, type PriceStore } from "../lib/prices";
import type { Tables } from "../types/database";

type Item = Tables<"shopping_items">;
type List = Tables<"shopping_lists">;
type Recurring = Tables<"recurring_shopping_items">;

export default function Shopping() {
  const { homeId } = useHome();
  const { user } = useAuth();
  // Open on what this phone showed last time; the network copy replaces it quietly.
  const [lists, setLists] = useState<List[]>(() => readCache<List[]>(homeId && `lists.${homeId}`) ?? []);
  const [activeList, setActiveList] = useState<string | null>(() => readCache<string>(homeId && `activeList.${homeId}`) ?? null);
  const [items, setItems] = useState<Item[]>(() => readCache<Item[]>(activeList && `items.${activeList}`) ?? []);
  const [loading, setLoading] = useState(() => !readCache<Item[]>(activeList && `items.${activeList}`));
  const [typed, setName] = useState("");
  const [qty, setQty] = useState(1);
  // Categories are the app's job, never the shopper's (lib/categorize). These are
  // the items whose category the AI is still deciding (waiting for the next batch,
  // or sent), and those already sent to be sorted during this visit.
  const [sorting, setSorting] = useState<Map<string, "queued" | "sending">>(() => new Map());
  const sortTried = useRef(new Set<string>());
  // Finding something on a long list (the pantry) to change it, and updating in a sentence.
  const [query, setQuery] = useState("");
  const [updating, setUpdating] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [grouped, setGrouped] = useState(() => localStorage.getItem("nestly.shopGrouped") === "1");
  const [customCats, setCustomCats] = useState<string[]>(() => readCache<string[]>(homeId && `cats.${homeId}`) ?? []);

  // King Store prices (public price-transparency data, via the `prices` edge function)
  const [priceMap, setPriceMap] = useState<Record<string, PriceItem | null>>({});
  const [pricing, setPricing] = useState(false);
  const [showStores, setShowStores] = useState(false);
  const [priceErr, setPriceErr] = useState("");
  const [priceOptions, setPriceOptions] = useState<Record<string, PriceItem[]>>({});
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [storeName, setStoreNameState] = useState(getStoreName());
  const listRef = useRef<HTMLDivElement>(null);
  // A ticked item keeps its place, showing its tick, until the shopper stops
  // tapping; then everything ticked moves to "taken" together.
  const doneLast = useDoneLast(listRef);
  const flip = doneLast.flip;

  const loadPrices = async (list: Item[]) => {
    const storeId = getStoreId();
    if (!storeId) {
      setShowStores(true);
      return;
    }
    setPricing(true);
    setPriceErr("");
    try {
      const names = [...new Set(list.map((i) => i.name.trim()))];
      const { matches, options } = await priceMany(storeId, names);
      setPriceMap(matches);
      setPriceOptions(options);
      if (Object.values(matches).every((v) => !v)) setPriceErr("לא נמצאו התאמות למוצרים ברשימה בסניף שנבחר.");
    } catch (e) {
      setPriceErr(`שגיאה בטעינת מחירים: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPricing(false);
    }
  };

  const loadCats = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("shopping_categories").select("name").eq("home_id", homeId).order("position").order("created_at");
    const names = (data ?? []).map((c) => c.name);
    setCustomCats(names);
    writeCache(`cats.${homeId}`, names);
  }, [homeId]);
  useEffect(() => {
    loadCats();
  }, [loadCats]);
  const allCategories = useMemo(() => {
    const out: string[] = [...CATEGORIES];
    for (const c of customCats) if (!out.includes(c)) out.push(c);
    return out;
  }, [customCats]);

  const toggleGrouped = () => {
    setGrouped((g) => {
      localStorage.setItem("nestly.shopGrouped", g ? "0" : "1");
      return !g;
    });
  };

  // product memory: distinct products the home has ever added (for autocomplete)
  const [catalog, setCatalog] = useState<{ name: string; category: string | null; quantity: number }[]>(() => readCache(homeId && `catalog.${homeId}`) ?? []);
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
    writeCache(`catalog.${homeId}`, out);
  }, [homeId]);
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Suggestions: products this home has bought before come first (they carry the
  // remembered quantity/category), then common Israeli products from the built-in list.
  const suggestions = useMemo(() => {
    const q = typed.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const mine = catalog.filter((c) => c.name.toLowerCase().includes(lower)).slice(0, 6);
    const seen = new Set(mine.map((m) => m.name.trim().toLowerCase()));
    const builtin = searchCatalog(q, 8)
      .filter((p) => !seen.has(p.name.trim().toLowerCase()))
      .map((p) => ({ name: p.name, category: p.category, quantity: 1, builtin: true }));
    return [...mine.map((m) => ({ ...m, builtin: false })), ...builtin].slice(0, 8);
  }, [typed, catalog]);

  const loadLists = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("shopping_lists").select("*").eq("home_id", homeId).order("is_default", { ascending: false }).order("created_at");
    setLists(data ?? []);
    setActiveList((prev) => (prev && data?.some((l) => l.id === prev) ? prev : data?.[0]?.id ?? null));
    writeCache(`lists.${homeId}`, data ?? []);
  }, [homeId]);

  const loadItems = useCallback(async () => {
    if (!activeList) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("shopping_items").select("*").eq("list_id", activeList).order("is_checked").order("position").order("created_at");
    setItems(data ?? []);
    setLoading(false);
  }, [activeList]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);
  // Switching lists: show that list's last copy at once, then the fresh one.
  useEffect(() => {
    if (!activeList) return;
    writeCache(`activeList.${homeId}`, activeList);
    const cached = readCache<Item[]>(`items.${activeList}`);
    if (cached) {
      setItems(cached);
      setLoading(false);
    }
  }, [activeList, homeId]);
  useEffect(() => {
    loadItems();
  }, [loadItems]);
  // Keep the device copy in step with what's on screen, including ticks made
  // offline-first. Only rows of the current list, in case a switch is mid-flight.
  useEffect(() => {
    if (!activeList || loading) return;
    writeCache(`items.${activeList}`, items.filter((i) => i.list_id === activeList));
  }, [items, activeList, loading]);
  // Back after a while: catch up on changes made on another phone, silently.
  useOnResume(() => {
    loadLists();
    loadItems();
  });
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

  // Back onto the list from "taken" — straight away, since it was asked for by name.
  const untick = (id: string) => {
    doneLast.release(id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_checked: false } : i)));
    bgWrite(supabase.from("shopping_items").update({ is_checked: false }).eq("id", id), loadItems);
  };

  // Write a category the app worked out, unless someone set one meanwhile (on any phone).
  const setCategoryOf = useCallback((id: string, category: string) => {
    setItems((prev) => prev.map((i) => (i.id === id && !i.category ? { ...i, category } : i)));
    bgWrite(supabase.from("shopping_items").update({ category }).eq("id", id).is("category", null));
  }, []);
  /** Let the AI place an item the app couldn't, once the item is saved: it waits for the next batch. */
  const sortWithAi = useCallback(
    (id: string, itemName: string, saved: Promise<unknown> = Promise.resolve()) => {
      if (!homeId) return;
      setSorting((s) => new Map(s).set(id, "queued"));
      const sending = () => setSorting((s) => (s.has(id) ? new Map(s).set(id, "sending") : s));
      Promise.all([aiCategory(homeId, itemName, allCategories, sending), saved]).then(([picked]) => {
        setSorting((s) => {
          const next = new Map(s);
          next.delete(id);
          return next;
        });
        // No answer: it stays without a category and is asked about next time.
        if (!picked) return;
        setCategoryOf(id, picked);
        loadCatalog();
      });
    },
    [homeId, allCategories, setCategoryOf, loadCatalog],
  );
  // Anything on the list without a category — a weekly item, an older one — gets one too.
  useEffect(() => {
    if (loading) return;
    for (const it of items) {
      if (it.category || it.is_checked || it.list_id !== activeList || sortTried.current.has(it.id)) continue;
      sortTried.current.add(it.id);
      const known = knownCategory(it.name, catalog, allCategories);
      if (known) setCategoryOf(it.id, known);
      else sortWithAi(it.id, it.name);
    }
  }, [items, loading, activeList, catalog, allCategories, setCategoryOf, sortWithAi]);

  const addItem = (named?: string) => {
    const name = (named ?? typed).trim();
    if (!name || !homeId || !activeList) return;

    // Never create a second row for something already on the list. If it was
    // already bought, tick it back on instead; if it is still pending, leave it.
    const existing = items.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      if (existing.is_checked) untick(existing.id);
      setName("");
      setQty(1);
      setFocused(false);
      return;
    }

    const id = newId();
    // Known from this home's history or the built-in catalogue — otherwise the item
    // goes on now and the AI fills its category in a moment.
    const known = knownCategory(name, catalog, allCategories);
    sortTried.current.add(id);
    const row: Item = {
      id, list_id: activeList, home_id: homeId, name: name.trim(), quantity: qty, category: known,
      source: "manual", is_checked: false, position: items.length, created_by: user?.id ?? null,
      created_at: new Date().toISOString(), dish_id: null, note: null, unit: null,
    };
    flip();
    setItems((prev) => [...prev, row]);
    setName("");
    setQty(1);
    setFocused(false);
    // One promise, shared: a query builder would send the insert again for every `then`.
    const inserted = Promise.resolve(
      supabase.from("shopping_items").insert({ id, list_id: activeList, home_id: homeId, name: row.name, quantity: row.quantity, category: known, source: "manual", position: row.position, created_by: user?.id ?? null }),
    );
    bgWrite(inserted, loadItems);
    if (!known) sortWithAi(id, row.name, inserted);
    loadCatalog();
  };
  const toggle = (item: Item) => {
    doneLast.ticked(item.id, item.is_checked);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_checked: !i.is_checked } : i)));
    bgWrite(supabase.from("shopping_items").update({ is_checked: !item.is_checked }).eq("id", item.id), loadItems);
  };
  const changeQty = (item: Item, delta: number) => {
    const quantity = Math.max(1, item.quantity + delta);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity } : i)));
    bgWrite(supabase.from("shopping_items").update({ quantity }).eq("id", item.id), loadItems);
  };
  const remove = (id: string) => {
    const at = items.findIndex((i) => i.id === id);
    const row = items[at];
    if (!row) return;
    flip();
    setItems((prev) => prev.filter((i) => i.id !== id));
    removeWithUndo({
      message: "המוצר נמחק",
      description: row.name,
      remove: () => supabase.from("shopping_items").delete().eq("id", id),
      undoLocal: () => {
        flip();
        setItems((prev) => reinsert(prev, [row], at));
      },
      restore: () => supabase.from("shopping_items").insert(row),
      reload: loadItems,
    });
  };
  const clearChecked = () => {
    if (!activeList) return;
    const rows = items.filter((i) => i.is_checked);
    if (!rows.length) return;
    const listId = activeList;
    flip();
    setItems((prev) => prev.filter((i) => !i.is_checked));
    removeWithUndo({
      message: rows.length === 1 ? "מוצר אחד נוקה מהרשימה" : `${rows.length} מוצרים נוקו מהרשימה`,
      remove: () => supabase.from("shopping_items").delete().in("id", rows.map((r) => r.id)).eq("list_id", listId),
      undoLocal: () => {
        flip();
        setItems((prev) => reinsert(prev, rows));
      },
      restore: () => supabase.from("shopping_items").insert(rows),
      reload: loadItems,
    });
  };

  if (loading && !lists.length) return <FullPageSpinner />;

  const collator = new Intl.Collator("he");
  const byName = (a: Item, b: Item) => collator.compare(a.name, b.name);
  const shownTaken = (i: Item) => doneLast.shownDone(i.id, i.is_checked);
  // Search ignores niqqud, quote marks and extra spaces, so "קוטג" finds "קוטג'".
  const fold = (t: string) => t.normalize("NFD").replace(/[\u0591-\u05C7'"׳״`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const q = fold(query);
  const shown = q ? items.filter((i) => fold(i.name).includes(q)) : items;
  const active = shown.filter((i) => !shownTaken(i)).sort(byName);
  const taken = shown.filter(shownTaken).sort(byName);
  // The cost estimate is for the whole list, whatever the search shows.
  const activeAll = items.filter((i) => !shownTaken(i));
  const takenCount = items.length - activeAll.length;

  // when grouped, order categories by the CATEGORIES list (others last); items א־ב within each
  const groupedSections: [string, Item[]][] = (() => {
    const map = new Map<string, Item[]>();
    for (const it of active) {
      const key = it.category || "אחר";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    const order = [...allCategories, "אחר"];
    return [...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  })();

  const renderRow = (item: Item) => (
    <div className="nst-row shop-row" key={item.id} data-flip={item.id} style={{ opacity: item.is_checked ? 0.55 : 1 }}>
      <button className={`nst-check ${item.is_checked ? "on" : ""}`} onClick={() => toggle(item)}>
        <Check size={14} />
      </button>
      <div className="shop-row-text">
        <p style={{ font: "400 17px var(--font-body)", color: "var(--text-bright)", textDecoration: item.is_checked ? "line-through" : "none" }}>{item.name}</p>
        <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
          {priceMap[item.name.trim()] && (
            <button
              onClick={() => setPickFor(item.name.trim())}
              title="הקישו להחלפת המוצר שזוהה"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", padding: 0, cursor: "pointer", maxWidth: "100%" }}
            >
              <span className="nst-tag" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
                ₪{(priceMap[item.name.trim()]!.price * item.quantity).toFixed(2)}
                {item.quantity > 1 ? ` (₪${priceMap[item.name.trim()]!.price.toFixed(2)} ליח׳)` : ""}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
                {priceMap[item.name.trim()]!.name}
              </span>
            </button>
          )}
          <span className="nst-tag" style={{ font: "400 12px var(--font-body)", letterSpacing: "0.04em" }}>
            {!item.category && sorting.get(item.id) === "sending" ? (
              <>
                <Sparkles className="nst-ai-pulse" /> ממיין…
              </>
            ) : !item.category && sorting.has(item.id) ? (
              <>
                <Sparkles /> ימוין בקרוב
              </>
            ) : (
              item.category || "ללא קטגוריה"
            )}
          </span>
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
      <div className="shop-row-ctrl">
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
    </div>
  );

  const takenSection =
    taken.length > 0 ? (
      <div style={{ marginTop: 6 }}>
        <div className="nst-group-header" data-flip="h:taken">
          <ShoppingCart size={12} /> נלקחו · {taken.length}
          <span style={{ flex: 1 }} />
          <button className="reorder-btn" style={{ color: "var(--danger)", font: "600 13px var(--font-body)", gap: 4, alignItems: "center", minHeight: 32 }} onClick={clearChecked}>
            <Eraser size={14} /> ניקוי
          </button>
        </div>
        <div className="nst-group">{taken.map(renderRow)}</div>
      </div>
    ) : null;

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h1 className="page-title">קניות</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className={`btn btn-sm ${grouped ? "btn-primary" : ""}`} onClick={toggleGrouped} title="מיון לפי קטגוריה">
            <ListFilter size={15} /> קטגוריות
          </button>
          <button className="btn btn-sm" onClick={() => loadPrices(items)} disabled={pricing || items.length === 0} title="מחירים מקינג סטור">
            <Tag size={15} /> {pricing ? "טוען…" : "מחירים"}
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
          autoComplete="off"
          value={typed}
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
                    // Already on the list: don't duplicate it. Un-tick it if it was
                    // bought, otherwise leave it exactly as it is.
                    if (cur) {
                      if (cur.is_checked) untick(cur.id);
                      setName("");
                      setQty(1);
                      setFocused(false);
                      return;
                    }
                    setName(s.name);
                    setQty(s.quantity);
                    setFocused(false);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--surface-2)", border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", textAlign: "right" }}
                >
                  <span style={{ flex: 1, font: "400 16px var(--font-body)", color: "var(--text-bright)", textDecoration: cur?.is_checked ? "line-through" : "none" }}>{s.name}</span>
                  {s.category && <span className="nst-tag">{s.category}</span>}
                  {!s.builtin && <span className="nst-tag">×{s.quantity}</span>}
                  {cur &&
                    (cur.is_checked ? (
                      <span className="nst-tag" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>נקנה · החזרה לרשימה</span>
                    ) : (
                      <span className="nst-tag" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>כבר ברשימה</span>
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
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => addItem()} disabled={!typed.trim()}>
            <Plus size={18} /> הוספה
          </button>
        </div>
      </div>

      <div className="shop-tools">
        {items.length > 0 && (
          <label className="shop-search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש ברשימה…" enterKeyHint="search" aria-label="חיפוש ברשימה" />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="ניקוי החיפוש">
                <X size={15} />
              </button>
            )}
          </label>
        )}
        <AiButton onClick={() => setUpdating(true)} block={items.length === 0}>
          עדכון עם AI
        </AiButton>
      </div>

      {priceErr && (
        <p className="alert alert-info" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{priceErr}</span>
          <button className="btn btn-sm" onClick={() => setShowStores(true)}>
            החלפת סניף
          </button>
        </p>
      )}

      {Object.keys(priceMap).length > 0 && (
        <div className="next-action is-calm">
          <span className="next-action-ico">
            <Tag />
          </span>
          <div className="next-action-body">
            <div className="next-action-kicker">קינג סטור{storeName ? ` · ${storeName}` : ""}</div>
            <div className="next-action-title">
              הערכת עלות: ₪
              {activeAll
                .reduce((sum, i) => sum + (priceMap[i.name.trim()]?.price ?? 0) * i.quantity, 0)
                .toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, marginTop: 2 }}>
              {activeAll.filter((i) => priceMap[i.name.trim()]).length}/{activeAll.length} מוצרים שנותרו לקנות
              {takenCount > 0 ? ` · ${takenCount} שנקנו לא נספרים` : ""}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => setShowStores(true)}>
            סניף
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBasket size={42} />} title="הרשימה ריקה" hint="הוסיפו מצרך ראשון למעלה" />
      ) : q && !shown.length ? (
        <div className="shop-nomatch">
          <p>אין ״{query.trim()}״ ברשימה.</p>
          <button
            className="btn btn-sm"
            onClick={() => {
              addItem(query);
              setQuery("");
            }}
          >
            <Plus size={15} /> הוספה לרשימה
          </button>
        </div>
      ) : grouped ? (
        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groupedSections.map(([cat, catItems]) => (
            <div key={cat}>
              <div className="nst-group-header" data-flip={`h:${cat}`}>
                {cat} · {catItems.length}
              </div>
              <div className="nst-group">{catItems.map(renderRow)}</div>
            </div>
          ))}
          {takenSection}
        </div>
      ) : (
        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {active.length > 0 && <div className="nst-group">{active.map(renderRow)}</div>}
          {takenSection}
        </div>
      )}

      {updating && homeId && (
        <ListUpdate
          homeId={homeId}
          userId={user?.id ?? null}
          listId={activeList}
          categories={allCategories}
          history={catalog}
          onClose={() => setUpdating(false)}
          onDone={() => {
            setUpdating(false);
            loadItems();
            loadCatalog();
          }}
        />
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
      {pickFor && (
        <Modal open onClose={() => setPickFor(null)} title={`איזה מוצר? · ${pickFor}`}>
          {(priceOptions[pickFor] ?? []).length === 0 ? (
            <p className="section-sub">לא נמצאו חלופות למוצר הזה בסניף.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(priceOptions[pickFor] ?? []).map((o) => {
                const chosen = priceMap[pickFor]?.code === o.code;
                return (
                  <button
                    key={o.code + o.name}
                    className="btn btn-block"
                    style={{ justifyContent: "space-between", ...(chosen ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : {}) }}
                    onClick={() => {
                      setPriceMap((p) => ({ ...p, [pickFor]: o }));
                      setPickFor(null);
                    }}
                  >
                    <span style={{ textAlign: "right", flex: 1, minWidth: 0 }}>{o.name}</span>
                    <span className="nst-tag" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>₪{o.price.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}
      {showStores && (
        <StorePickerModal
          onClose={() => setShowStores(false)}
          onPicked={(s) => {
            setStoreId(s.id);
            setStoreName(s.name);
            setStoreNameState(s.name);
            setShowStores(false);
            loadPrices(items);
          }}
        />
      )}
    </section>
  );
}

function StorePickerModal({ onClose, onPicked }: { onClose: () => void; onPicked: (s: PriceStore) => void }) {
  const [stores, setStores] = useState<PriceStore[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetchStores()
      .then(setStores)
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const shown = stores.filter((s) => s.name.includes(q.trim()));

  return (
    <Modal open onClose={onClose} title="בחירת סניף · קינג סטור">
      <p className="section-sub" style={{ marginBottom: "1rem" }}>המחירים מגיעים מקבצי המחירים הרשמיים שהרשת מפרסמת לפי חוק. בחרו את הסניף שלכם.</p>
      {err && <p className="alert alert-info" style={{ marginBottom: "1rem" }}>לא הצלחנו לטעון את רשימת הסניפים: {err}</p>}
      {!err && stores.length === 0 && <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>טוען סניפים…</p>}
      {stores.length > 0 && (
        <>
          <input style={{ marginBottom: 10 }} placeholder="חיפוש סניף…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 340, overflowY: "auto" }}>
            {shown.map((s) => (
              <button key={s.id} className="btn btn-block" style={{ justifyContent: "flex-start" }} onClick={() => onPicked(s)}>
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
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
    <Modal open onClose={onClose} title="רשימה חדשה" done={{ label: "יצירה", onClick: create, disabled: !name.trim() }}>
      <div className="nst-fields">
        <div>
          <label>שם הרשימה</label>
          <input placeholder="למשל: פארם" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
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
            <span style={{ flex: 1, fontSize: 15, color: "var(--text-2)", fontWeight: 500 }}>
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
