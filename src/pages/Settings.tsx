import { useCallback, useEffect, useState } from "react";
import { Copy, LogOut, UserPlus, Bell, Check, Users, Pencil, Trash2, House } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { AREAS, type AreaKey } from "../lib/constants";
import { enablePush, disablePush, pushEnabled, pushSupported } from "../lib/push";
import { Modal } from "../components/ui";
import type { Tables } from "../types/database";

const AVATAR_BG = ["var(--accent)", "var(--cat-3-fg)", "var(--cat-5-fg)", "var(--cat-7-fg)", "var(--cat-4-fg)"];

export default function Settings() {
  const { homeId, homeName, members, isOwner, refresh } = useHome();
  const { user, signOut } = useAuth();
  const [invites, setInvites] = useState<Tables<"home_invites">[]>([]);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editName, setEditName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [homeNameDraft, setHomeNameDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    if (!homeId) return;
    const { data } = await supabase.from("home_invites").select("*").eq("home_id", homeId).is("accepted_by", null).order("created_at", { ascending: false });
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
  useEffect(() => {
    setHomeNameDraft(homeName ?? "");
  }, [homeName]);

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
  const saveHomeName = async () => {
    if (!homeId || !homeNameDraft.trim() || homeNameDraft === homeName) return;
    await supabase.from("homes").update({ name: homeNameDraft.trim() }).eq("id", homeId);
    refresh();
  };

  const inviteLink = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be blocked; field still visible */
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggleResponsibility = async (member: Tables<"home_members">, area: AreaKey) => {
    const has = member.responsibilities.includes(area);
    const next = has ? member.responsibilities.filter((r) => r !== area) : [...member.responsibilities, area];
    await supabase.from("home_members").update({ responsibilities: next }).eq("id", member.id);
    refresh();
  };
  const revokeInvite = async (id: string) => {
    await supabase.from("home_invites").delete().eq("id", id);
    loadInvites();
  };

  const activeInvite = invites[0];

  return (
    <section className="tab-content" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <h1 className="page-title">הגדרות</h1>

      {/* profile */}
      <div className="nst-card">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="nst-avatar" style={{ width: 46, height: 46, fontSize: 18 }}>{(displayName || "?").charAt(0)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ font: "600 15px var(--font-body)", color: "var(--text-bright)" }}>{displayName || "ללא שם"}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{user?.email}</p>
          </div>
          <button className="nst-iconbtn plain" onClick={() => setEditName(true)}>
            <Pencil size={16} />
          </button>
        </div>
      </div>

      {/* home */}
      <div className="nst-card">
        <h2 className="nst-card-title" style={{ marginBottom: "1rem" }}>
          <House /> הבית
        </h2>
        <div style={{ marginBottom: "1rem" }}>
          <label>שם הבית</label>
          <input value={homeNameDraft} onChange={(e) => setHomeNameDraft(e.target.value)} onBlur={saveHomeName} disabled={!isOwner} />
        </div>
        <label>קישור הזמנה</label>
        {activeInvite ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={inviteLink(activeInvite.code)} style={{ flex: 1, color: "var(--text-3)" }} />
            <button className="btn" onClick={() => copy(inviteLink(activeInvite.code), "main")}>
              {copied === "main" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "main" ? "הועתק" : "העתקה"}
            </button>
            {isOwner && (
              <button className="nst-del" onClick={() => revokeInvite(activeInvite.id)}>
                <Trash2 />
              </button>
            )}
          </div>
        ) : isOwner ? (
          <button className="btn btn-block" onClick={() => setShowInvite(true)}>
            <UserPlus size={16} /> יצירת קישור הזמנה
          </button>
        ) : (
          <p className="section-sub">רק מנהל/ת הבית יכול/ה ליצור הזמנות.</p>
        )}
      </div>

      {/* members */}
      <div className="nst-card">
        <h2 className="nst-card-title" style={{ marginBottom: "0.4rem" }}>
          <Users /> חברי הבית
        </h2>
        <p className="section-sub" style={{ marginBottom: "0.6rem" }}>חלקו תחומי אחריות בין השותפים — קניות, בישולים, לוז.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: "0.4rem" }}>
          {members.map((m, idx) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 9, paddingBottom: 14, borderBottom: idx < members.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <span className="nst-avatar" style={{ background: AVATAR_BG[idx % AVATAR_BG.length] }}>{(m.profile?.display_name || "?").charAt(0)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ font: "600 14px var(--font-body)", color: "var(--text-bright)" }}>
                    {m.profile?.display_name ?? "חבר"}
                    {m.user_id === user?.id && <span style={{ color: "var(--text-muted)", fontSize: 12 }}> (אני)</span>}
                  </p>
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 600 }}>{m.role === "owner" ? "מנהל/ת הבית" : "חבר/ה"}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingInlineStart: 49 }}>
                {(Object.keys(AREAS) as AreaKey[]).map((area) => {
                  const active = m.responsibilities.includes(area);
                  const editable = isOwner || m.user_id === user?.id;
                  return (
                    <button
                      key={area}
                      className={`nst-chip ${active ? "active" : ""}`}
                      style={{ padding: "5px 12px", fontSize: 11.5, opacity: editable ? 1 : 0.7 }}
                      disabled={!editable}
                      onClick={() => toggleResponsibility(m, area)}
                    >
                      {AREAS[area]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* notifications */}
      <div className="nst-card">
        <h2 className="nst-card-title" style={{ marginBottom: "0.6rem" }}>
          <Bell /> התראות
        </h2>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ font: "500 13.5px var(--font-body)", color: "var(--text-2)" }}>התראות דחיפה</p>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
              {!pushSupported() ? "לא נתמך בדפדפן זה" : pushOn ? "פעיל במכשיר זה" : "כבוי"}
            </p>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={pushOn} disabled={pushBusy || !pushSupported()} onChange={togglePush} />
            <span className="toggle-track" />
          </label>
        </div>
      </div>

      <button className="btn btn-block" style={{ color: "var(--danger)", padding: 13 }} onClick={signOut}>
        <LogOut size={16} /> התנתקות
      </button>

      {editName && (
        <Modal open onClose={() => setEditName(false)} title="עריכת שם">
          <div className="nst-fields">
            <div>
              <label>שם לתצוגה</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" style={{ padding: 12 }} onClick={saveName}>
              שמירה
            </button>
          </div>
        </Modal>
      )}

      {showInvite && <InviteModal homeId={homeId!} userId={user?.id ?? ""} onClose={() => setShowInvite(false)} onCreated={() => { setShowInvite(false); loadInvites(); }} />}
    </section>
  );
}

function InviteModal({ homeId, userId, onClose, onCreated }: { homeId: string; userId: string; onClose: () => void; onCreated: () => void }) {
  const [responsibilities, setResponsibilities] = useState<AreaKey[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (a: AreaKey) => setResponsibilities((r) => (r.includes(a) ? r.filter((x) => x !== a) : [...r, a]));

  const create = async () => {
    setBusy(true);
    const { error } = await supabase.from("home_invites").insert({ home_id: homeId, invited_by: userId, responsibilities });
    setBusy(false);
    if (!error) onCreated();
  };

  return (
    <Modal open onClose={onClose} title="הזמנת שותף לבית">
      <div className="nst-fields">
        <div>
          <p className="section-sub" style={{ marginBottom: 10 }}>אילו תחומים באחריות השותף? (אפשר לשנות בהמשך)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(Object.keys(AREAS) as AreaKey[]).map((a) => (
              <button key={a} className={`nst-chip ${responsibilities.includes(a) ? "active" : ""}`} onClick={() => toggle(a)}>
                {AREAS[a]}
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-block" style={{ padding: 12 }} onClick={create} disabled={busy}>
          יצירת קישור הזמנה
        </button>
      </div>
    </Modal>
  );
}
