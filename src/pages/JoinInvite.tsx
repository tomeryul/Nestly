import { useEffect, useState } from "react";
import { Home } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHome } from "../context/HomeContext";
import { FullPageSpinner, Spinner } from "../components/ui";

const PENDING_INVITE = "nestly.pendingInvite";

export default function JoinInvite() {
  const { code } = useParams<{ code: string }>();
  const { session } = useAuth();
  const { refresh } = useHome();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<{ home_name: string; valid: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    // Not signed in yet: remember the invite and send them through auth first.
    if (!session) {
      localStorage.setItem(PENDING_INVITE, code);
      navigate("/", { replace: true });
      return;
    }
    supabase.rpc("invite_preview", { invite_code: code }).then(({ data }) => {
      const row = (data ?? [])[0];
      setPreview(row ? { home_name: row.home_name, valid: row.valid } : null);
    });
  }, [code, session, navigate]);

  const accept = async () => {
    if (!code) return;
    setLoading(true);
    const { error } = await supabase.rpc("accept_invite", { invite_code: code });
    setLoading(false);
    if (error) return setErr("לא ניתן להצטרף — ייתכן שהקוד פג תוקף");
    await refresh();
    navigate("/");
  };

  if (!session) return <FullPageSpinner />;

  return (
    <div className="nst-root" dir="rtl">
      <div className="login-screen" style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div className="login-box" style={{ textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
            <span className="nst-logo-tile" style={{ width: 46, height: 46 }}>
              <Home size={23} />
            </span>
          </div>
          {preview === null ? (
            <p className="section-sub">בודק את ההזמנה…</p>
          ) : !preview.valid ? (
            <>
              <h3 style={{ font: "600 20px var(--font-display)", color: "var(--text-bright)" }}>ההזמנה אינה תקפה</h3>
              <p className="section-sub" style={{ marginTop: 4 }}>הקוד שגוי או שפג תוקפו.</p>
              <button onClick={() => navigate("/")} className="btn" style={{ margin: "1.25rem auto 0" }}>
                חזרה
              </button>
            </>
          ) : (
            <>
              <h3 style={{ font: "600 20px var(--font-display)", color: "var(--text-bright)" }}>הוזמנתם להצטרף</h3>
              <p className="section-sub" style={{ marginTop: 4 }}>
                לבית <span style={{ fontWeight: 700, color: "var(--accent-ink)" }}>{preview.home_name}</span>
              </p>
              {err && <p style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600, marginTop: 12 }}>{err}</p>}
              <button onClick={accept} className="btn btn-primary btn-block" style={{ marginTop: "1.25rem", padding: 13 }} disabled={loading}>
                {loading ? <Spinner className="!border-white/40 !border-t-white" /> : "הצטרפות לבית"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
