import { useState } from "react";
import { Home } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Spinner } from "../components/ui";

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const redirectTo = window.location.origin + import.meta.env.BASE_URL;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split("@")[0] }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (!data.session) setMsg("נשלח אימות למייל. אשרו את ההרשמה ואז התחברו.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const magicLink = async () => {
    if (!email) return setErr("הזינו כתובת מייל");
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setLoading(false);
    if (error) setErr(error.message);
    else setMsg("שלחנו לכם קישור כניסה למייל ✨");
  };

  return (
    <div className="nst-root" dir="rtl">
      <div className="login-screen" style={{ minHeight: "100vh", position: "relative", zIndex: 1 }}>
        <div className="login-box">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: "1.5rem" }}>
            <span className="nst-logo-tile" style={{ width: 46, height: 46 }}>
              <Home size={23} />
            </span>
            <div style={{ textAlign: "right" }}>
              <h1 style={{ font: "600 25px var(--font-display)", color: "var(--text-bright)", margin: 0 }}>Nestly</h1>
              <p
                style={{
                  font: "700 10px var(--font-body)",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                ניהול משק הבית
              </p>
            </div>
          </div>

          <div className="login-tabs">
            <button
              className={`login-tab ${mode === "signin" ? "active" : ""}`}
              onClick={() => {
                setMode("signin");
                setErr(null);
                setMsg(null);
              }}
            >
              כניסה
            </button>
            <button
              className={`login-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => {
                setMode("signup");
                setErr(null);
                setMsg(null);
              }}
            >
              הרשמה
            </button>
          </div>

          <form className="nst-fields" onSubmit={submit}>
            {mode === "signup" && (
              <div>
                <label>שם לתצוגה</label>
                <input placeholder="השם שלך" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label>כתובת מייל</label>
              <input type="email" placeholder="you@example.com" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>סיסמה</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {err && <p style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{err}</p>}
            {msg && <p style={{ color: "var(--accent-ink)", fontSize: 13, fontWeight: 600 }}>{msg}</p>}

            <button type="submit" className="btn btn-primary btn-block" style={{ padding: 13 }} disabled={loading}>
              {loading ? <Spinner className="!border-white/40 !border-t-white" /> : mode === "signup" ? "הרשמה" : "כניסה"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: "1rem", fontSize: 12.5, color: "var(--text-muted)", fontWeight: 500 }}>
            או{" "}
            <button type="button" onClick={magicLink} style={{ color: "var(--accent)", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>
              קישור קסם למייל
            </button>
          </p>
          <p style={{ textAlign: "center", marginTop: "0.6rem", fontSize: 11, color: "var(--text-faint)" }}>
            חשבונות חדשים נפתחים כמשתמש רגיל. אפשר להזמין שותפים בהמשך.
          </p>
        </div>
      </div>
    </div>
  );
}
