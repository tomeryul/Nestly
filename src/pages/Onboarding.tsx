import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HousePlus, Plus, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/ui";

export default function Onboarding() {
  const { refresh, homes } = useHome();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const createHome = async () => {
    setErr(null);
    setLoading("create");
    const { error } = await supabase.rpc("create_home", { home_name: name || "הבית שלי" });
    setLoading(null);
    if (error) return setErr(error.message);
    await refresh();
    navigate("/");
  };

  const joinHome = async () => {
    if (!code.trim()) return;
    setErr(null);
    setLoading("join");
    const cleaned = code.trim().split("/").pop() ?? code.trim();
    const { error } = await supabase.rpc("accept_invite", { invite_code: cleaned });
    setLoading(null);
    if (error) return setErr("קוד הזמנה לא תקין או שפג תוקפו");
    await refresh();
    navigate("/");
  };

  return (
    <div className="nst-root" dir="rtl">
      <div className="login-screen" style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div className="login-box">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.4rem" }}>
            <span className="nst-logo-tile" style={{ width: 46, height: 46 }}>
              <HousePlus size={23} />
            </span>
          </div>
          <h3 style={{ textAlign: "center", font: "600 22px var(--font-display)", color: "var(--text-bright)", margin: "0 0 0.3rem" }}>
            {homes.length ? "בית נוסף" : "ברוכים הבאים 👋"}
          </h3>
          <p className="section-sub" style={{ textAlign: "center", marginBottom: "1.4rem" }}>
            צרו בית חדש למשק הבית שלכם, או הצטרפו לבית קיים בעזרת קוד הזמנה.
          </p>

          {err && <p style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{err}</p>}

          <div className="nst-fields">
            <div>
              <label>שם הבית</label>
              <input placeholder="למשל: בית משפחת לוי" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" style={{ padding: 13 }} onClick={createHome} disabled={loading !== null}>
              {loading === "create" ? <Spinner className="!border-white/40 !border-t-white" /> : (<><Plus size={16} /> יצירת בית</>)}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-faint)", fontSize: 11, fontWeight: 600, margin: "0.2rem 0" }}>
              <span style={{ flex: 1, height: 1, background: "var(--border-2)" }} />
              או
              <span style={{ flex: 1, height: 1, background: "var(--border-2)" }} />
            </div>

            <div>
              <label>קוד הזמנה</label>
              <input placeholder="הדביקו קוד או קישור" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <button className="btn btn-block" style={{ padding: 12 }} onClick={joinHome} disabled={loading !== null}>
              {loading === "join" ? <Spinner /> : "הצטרפות לבית"}
            </button>
          </div>

          <button
            onClick={signOut}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, margin: "1.4rem auto 0", background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}
          >
            <LogOut size={15} /> התנתקות
          </button>
        </div>
      </div>
    </div>
  );
}
