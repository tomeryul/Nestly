import { useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { Tables } from "../types/database";
import { formatRelative } from "../lib/dates";

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Tables<"notifications">[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems(data ?? []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel("notifications-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((i) => !i.is_read).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    load();
  };

  const openItem = async (n: Tables<"notifications">) => {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      load();
    }
    setOpen(false);
    if (n.link) navigate(n.link.replace(/^\/#/, "").replace(/^#/, "") || "/");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
        aria-label="התראות"
      >
        <Bell size={22} />
        {unread > 0 && (
          <span className="absolute -left-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-semibold text-slate-800">התראות</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brand-600">
                <Check size={14} /> סמן הכל כנקרא
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">אין התראות</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex w-full flex-col items-start gap-0.5 border-b border-slate-50 px-4 py-3 text-right hover:bg-slate-50 ${
                  n.is_read ? "" : "bg-brand-50/50"
                }`}
              >
                <span className="text-sm font-medium text-slate-800">{n.title}</span>
                {n.body && <span className="text-xs text-slate-500">{n.body}</span>}
                <span className="mt-0.5 text-[11px] text-slate-400">{formatRelative(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
