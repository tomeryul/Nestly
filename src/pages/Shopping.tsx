import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Minus, Repeat, ChefHat, Check, ListPlus, X, Eraser } from "lucide-react";
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

  const loadLists = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase
      .from("shopping_lists")
      .select("*")
      .eq("home_id", homeId)
      .order("is_default", { ascending: false })
      .order("created_at");
    setLists(data ?? []);
    setActiveList((prev) => prev ?? data?.[0]?.id ?? null);
  }, [homeId]);

  const loadItems = useCallback(async () => {
    if (!activeList) {
      setItems([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("shopping_items")
      .select("*")
      .eq("list_id", activeList)
      .order("is_checked")
      .order("created_at");
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_items", filter: `list_id=eq.${activeList}` },
        () => loadItems(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeList, loadItems]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !homeId || !activeList) return;
    await supabase.from("shopping_items").insert({
      list_id: activeList,
      home_id: homeId,
      name: name.trim(),
      quantity: qty,
      category,
      source: "manual",
      created_by: user?.id ?? null,
    });
    setName("");
    setQty(1);
    loadItems();
  };

  const toggle = async (item: Item) => {
    await supabase.from("shopping_items").update({ is_checked: !item.is_checked }).eq("id", item.id);
    loadItems();
  };
  const changeQty = async (item: Item, delta: number) => {
    const q = Math.max(1, item.quantity + delta);
    await supabase.from("shopping_items").update({ quantity: q }).eq("id", item.id);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">קניות</h1>
        <button onClick={() => setShowRecurring(true)} className="btn-ghost !px-3 !py-2 text-xs">
          <Repeat size={15} /> פריטים קבועים
        </button>
      </div>

      {/* list tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {lists.map((l) => (
          <button
            key={l.id}
            onClick={() => setActiveList(l.id)}
            className={`chip whitespace-nowrap ${
              activeList === l.id ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {l.name}
          </button>
        ))}
        <button
          onClick={() => setShowNewList(true)}
          className="chip whitespace-nowrap bg-white text-brand-600 ring-1 ring-slate-200"
        >
          <ListPlus size={14} /> רשימה
        </button>
      </div>

      {/* quick add */}
      <form onSubmit={addItem} className="card space-y-2.5">
        <input
          className="input"
          placeholder="הוספת מצרך…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 px-1">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-2 text-slate-500">
              <Minus size={16} />
            </button>
            <span className="w-6 text-center text-sm font-semibold">{qty}</span>
            <button type="button" onClick={() => setQty((q) => q + 1)} className="p-2 text-slate-500">
              <Plus size={16} />
            </button>
          </div>
          <select className="input flex-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn-primary !px-4" type="submit">
            <Plus size={18} />
          </button>
        </div>
      </form>

      {/* items */}
      {items.length === 0 ? (
        <EmptyState title="הרשימה ריקה" hint="הוסיפו מצרך ראשון למעלה" />
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`card flex items-center gap-3 !py-3 ${item.is_checked ? "opacity-60" : ""}`}
            >
              <button
                onClick={() => toggle(item)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  item.is_checked ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                }`}
              >
                {item.is_checked && <Check size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium text-slate-800 ${item.is_checked ? "line-through" : ""}`}>
                  {item.name}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {item.category && <span>{item.category}</span>}
                  {item.source === "recipe" && (
                    <span className="flex items-center gap-0.5 text-orange-500">
                      <ChefHat size={12} /> ממתכון
                    </span>
                  )}
                  {item.source === "recurring" && (
                    <span className="flex items-center gap-0.5 text-brand-500">
                      <Repeat size={12} /> קבוע
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-1">
                <button onClick={() => changeQty(item, -1)} className="p-1.5 text-slate-500">
                  <Minus size={14} />
                </button>
                <span className="w-5 text-center text-sm font-semibold">{item.quantity}</span>
                <button onClick={() => changeQty(item, 1)} className="p-1.5 text-slate-500">
                  <Plus size={14} />
                </button>
              </div>
              <button onClick={() => remove(item.id)} className="p-1 text-slate-300 hover:text-red-500">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}

      {checkedCount > 0 && (
        <button onClick={clearChecked} className="btn-ghost w-full text-red-500">
          <Eraser size={16} /> מחיקת {checkedCount} פריטים מסומנים
        </button>
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

      {showRecurring && (
        <RecurringModal homeId={homeId!} lists={lists} onClose={() => setShowRecurring(false)} />
      )}
    </div>
  );
}

function NewListModal({
  homeId,
  onClose,
  onCreated,
}: {
  homeId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const create = async () => {
    if (!name.trim()) return;
    const { data } = await supabase
      .from("shopping_lists")
      .insert({ home_id: homeId, name: name.trim(), created_by: user?.id ?? null })
      .select("id")
      .single();
    if (data) onCreated(data.id);
  };
  return (
    <Modal open onClose={onClose} title="רשימה חדשה">
      <div className="space-y-3">
        <input className="input" placeholder="שם הרשימה" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={create} className="btn-primary w-full">
          יצירה
        </button>
      </div>
    </Modal>
  );
}

function RecurringModal({
  homeId,
  lists,
  onClose,
}: {
  homeId: string;
  lists: List[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Recurring[]>([]);
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [day, setDay] = useState(0);
  const [listId, setListId] = useState<string>(lists[0]?.id ?? "");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("recurring_shopping_items")
      .select("*")
      .eq("home_id", homeId)
      .order("day_of_week");
    setRows(data ?? []);
  }, [homeId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    await supabase.from("recurring_shopping_items").insert({
      home_id: homeId,
      name: name.trim(),
      quantity: qty,
      day_of_week: day,
      target_list_id: listId || null,
      created_by: user?.id ?? null,
    });
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
      <p className="mb-3 text-sm text-slate-500">
        פריטים שיתווספו אוטומטית לרשימה ביום שבחרתם, בכל שבוע.
      </p>
      <div className="mb-4 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <input className="input" placeholder="שם המצרך" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          <input
            className="input w-20"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
          <select className="input flex-1" value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {DAYS_HE.map((d, i) => (
              <option key={i} value={i}>
                יום {d}
              </option>
            ))}
          </select>
        </div>
        <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button onClick={add} className="btn-primary w-full">
          <Plus size={16} /> הוספה
        </button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">אין פריטים אוטומטיים</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
            <span className="flex-1 text-sm text-slate-700">
              {r.name} × {r.quantity}
            </span>
            <span className="chip bg-brand-50 text-brand-700">יום {DAYS_HE[r.day_of_week]}</span>
            <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
