import { useState } from "react";
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt="Nestly"
          className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-lg"
        />
        <h1 className="text-2xl font-bold text-slate-800">Nestly</h1>
        <p className="mt-1 text-sm text-slate-500">מסדרים את הבית ביחד — קניות, בישולים ולוז</p>
      </div>

      <form onSubmit={submit} className="card space-y-3">
        {mode === "signup" && (
          <input
            className="input"
            placeholder="שם לתצוגה"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="input"
          type="email"
          placeholder="מייל"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="סיסמה"
          value={password}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
        {msg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{msg}</p>}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? <Spinner className="border-white/40 border-t-white" /> : mode === "signup" ? "הרשמה" : "כניסה"}
        </button>
      </form>

      <button onClick={magicLink} className="mt-3 text-center text-sm text-brand-600" disabled={loading}>
        שליחת קישור כניסה למייל
      </button>

      <p className="mt-6 text-center text-sm text-slate-500">
        {mode === "signup" ? "כבר יש לכם חשבון?" : "אין לכם חשבון עדיין?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setErr(null);
            setMsg(null);
          }}
          className="font-semibold text-brand-600"
        >
          {mode === "signup" ? "התחברו" : "הרשמו"}
        </button>
      </p>
    </div>
  );
}
