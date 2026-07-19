import { useCallback, useEffect, useState } from "react";
import { Copy, LogOut, UserPlus, Bell, BellOff, Check, Users, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { AREAS, type AreaKey } from "../lib/constants";
import { enablePush, disablePush, pushEnabled, pushSupported } from "../lib/push";
import { Modal } from "../components/ui";
import type { Tables } from "../types/database";

export default function Settings() {
  const { homeId, homeName, members, isOwner, refresh } = useHome();
  const { user, signOut } = useAuth();
  const [invites, setInvites] = useState<Tables<"home_invites">[]>([]);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editName, setEditName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase
      .from("home_invites")
      .select("*")
      .eq("home_id", homeId)
      .is("accepted_by", null)
      .order("created_at", { ascending: false });
    setInvites(data ?? []);
  }, [homeId]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);
  useEffect(() => {
    if (pushSupported()) pushEnabled().then(setPushOn);
    const me = members.find((m) => m.user_id === user?.id);
    setDisplayName(me?.profile?.display_name ?? "");
  }, [members, user]);

  const togglePush = async () => {
    if (!user) return;
    setPushBusy(true);
    if (pushOn) {
      await disablePush();
      setPushOn(false);
    } else {
      const res = await enablePush(user.id);
      if (res.ok) setPushOn(true);
      else alert(res.error);
    }
    setPushBusy(false);
  };

  const saveName = async () => {
    if (!user) return;
    await supabase.from("profiles").update({ display_name: displayName.trim() || null }).eq("id", user.id);
    setEditName(false);
    refresh();
  };

  const inviteLink = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}#/join/${code}`;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked; the field is still visible to copy manually */
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleResponsibility = async (member: Tables<"home_members">, area: AreaKey) => {
    const has = member.responsibilities.includes(area);
    const next = has
      ? member.responsibilities.filter((r) => r !== area)
      : [...member.responsibilities, area];
    await supabase.from("home_members").update({ responsibilities: next }).eq("id", member.id);
    refresh();
  };

  const revokeInvite = async (id: string) => {
    await supabase.from("home_invites").delete().eq("id", id);
    loadInvites();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">הגדרות</h1>

      {/* profile */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">הפרופיל שלי</h2>
        <div className="card flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
            {(displayName || "?").charAt(0)}
          </span>
          <div className="flex-1">
            <p className="font-medium text-slate-800">{displayName || "ללא שם"}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
          </div>
          <button onClick={() => setEditName(true)} className="p-1.5 text-slate-400 hover:text-brand-600">
            <Pencil size={16} />
          </button>
        </div>
      </section>

      {/* notifications */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-500">התראות</h2>
        <button
          onClick={togglePush}
          disabled={pushBusy || !pushSupported()}
          className="card flex w-full items-center gap-3 text-right disabled:opacity-60"
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              pushOn ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"
            }`}
          >
            {pushOn ? <Bell size={20} /> : <BellOff size={20} />}
          </span>
          <div className="flex-1">
            <p className="font-medium text-slate-800">התראות דחיפה</p>
            <p className="text-xs text-slate-400">
              {!pushSupported() ? "לא נתמך בדפדפן זה" : pushOn ? "פעיל במכשיר זה" : "כבוי"}
            </p>
          </div>
          <span className={`h-6 w-11 rounded-full p-0.5 transition ${pushOn ? "bg-brand-600" : "bg-slate-200"}`}>
            <span className={`block h-5 w-5 rounded-full bg-white transition ${pushOn ? "-translate-x-5" : ""}`} />
          </span>
        </button>
      </section>

      {/* members */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <Users size={15} /> חברי הבית · {homeName}
          </h2>
          {isOwner && (
            <button onClick={() => setShowInvite(true)} className="flex items-center gap-1 text-xs text-brand-600">
              <UserPlus size={14} /> הזמנה
            </button>
          )}
        </div>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="card space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">
                  {(m.profile?.display_name || "?").charAt(0)}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">
                    {m.profile?.display_name ?? "חבר"}
                    {m.user_id === user?.id && <span className="text-xs text-slate-400"> (אני)</span>}
                  </p>
                  <p className="text-xs text-slate-400">{m.role === "owner" ? "מנהל/ת הבית" : "חבר/ה"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(AREAS) as AreaKey[]).map((area) => {
                  const active = m.responsibilities.includes(area);
                  const editable = isOwner || m.user_id === user?.id;
                  return (
                    <button
                      key={area}
                      disabled={!editable}
                      onClick={() => toggleResponsibility(m, area)}
                      className={`chip ${
                        active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"
                      } ${editable ? "" : "opacity-70"}`}
                    >
                      {active && <Check size={12} />}
                      {AREAS[area]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* pending invites */}
      {isOwner && invites.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">הזמנות ממתינות</h2>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="card flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-slate-500">{inviteLink(inv.code)}</code>
                <button onClick={() => copy(inviteLink(inv.code), inv.id)} className="p-1.5 text-slate-400 hover:text-brand-600">
                  {copied === inv.id ? <Check size={16} className="text-brand-600" /> : <Copy size={16} />}
                </button>
                <button onClick={() => revokeInvite(inv.id)} className="p-1.5 text-slate-300 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <button onClick={signOut} className="btn-ghost w-full text-red-500">
        <LogOut size={16} /> התנתקות
      </button>

      {editName && (
        <Modal open onClose={() => setEditName(false)} title="עריכת שם">
          <div className="space-y-3">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <button onClick={saveName} className="btn-primary w-full">
              שמירה
            </button>
          </div>
        </Modal>
      )}

      {showInvite && (
        <InviteModal
          homeId={homeId!}
          userId={user?.id ?? ""}
          onClose={() => setShowInvite(false)}
          onCreated={() => {
            loadInvites();
          }}
          inviteLink={inviteLink}
          copy={copy}
          copied={copied}
        />
      )}
    </div>
  );
}

function InviteModal({
  homeId,
  userId,
  onClose,
  onCreated,
  inviteLink,
  copy,
  copied,
}: {
  homeId: string;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
  inviteLink: (code: string) => string;
  copy: (t: string, k: string) => void;
  copied: string | null;
}) {
  const [responsibilities, setResponsibilities] = useState<AreaKey[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (a: AreaKey) =>
    setResponsibilities((r) => (r.includes(a) ? r.filter((x) => x !== a) : [...r, a]));

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("home_invites")
      .insert({ home_id: homeId, invited_by: userId, responsibilities })
      .select("code")
      .single();
    setBusy(false);
    if (!error && data) {
      setCode(data.code);
      onCreated();
    }
  };

  return (
    <Modal open onClose={onClose} title="הזמנת שותף לבית">
      {!code ? (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-slate-600">אילו תחומים באחריות השותף? (אפשר לשנות בהמשך)</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AREAS) as AreaKey[]).map((a) => (
                <button
                  key={a}
                  onClick={() => toggle(a)}
                  className={`chip ${
                    responsibilities.includes(a) ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {AREAS[a]}
                </button>
              ))}
            </div>
          </div>
          <button onClick={create} disabled={busy} className="btn-primary w-full">
            יצירת קישור הזמנה
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm text-slate-600">שלחו את הקישור לשותף — בכניסה הוא יצטרף לבית.</p>
          <div className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200">
            <code className="flex-1 truncate text-xs text-slate-600">{inviteLink(code)}</code>
            <button onClick={() => copy(inviteLink(code), "modal")} className="btn-primary !px-3 !py-2">
              {copied === "modal" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            קוד: <span className="font-mono font-semibold">{code}</span>
          </p>
        </div>
      )}
    </Modal>
  );
}
