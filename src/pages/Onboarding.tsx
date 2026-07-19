import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Users, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useHome } from "../context/HomeContext";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "../components/ui";

export default function Onboarding() {
  const { refresh, homes } = useHome();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createHome = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.rpc("create_home", { home_name: name || "הבית שלי" });
    setLoading(false);
    if (error) return setErr(error.message);
    await refresh();
    navigate("/");
  };

  const joinHome = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.rpc("accept_invite", { invite_code: code.trim() });
    setLoading(false);
    if (error) return setErr("קוד הזמנה לא תקין או שפג תוקפו");
    await refresh();
    navigate("/");
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt="Nestly"
          className="mx-auto mb-3 h-14 w-14 rounded-2xl shadow"
        />
        <h1 className="text-xl font-bold text-slate-800">{homes.length ? "בית נוסף" : "ברוכים הבאים ל‑Nestly"}</h1>
        <p className="mt-1 text-sm text-slate-500">צרו בית חדש או הצטרפו לבית קיים בעזרת קוד הזמנה</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button
          onClick={() => setTab("create")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium ${
            tab === "create" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          <Home size={16} /> בית חדש
        </button>
        <button
          onClick={() => setTab("join")}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium ${
            tab === "join" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          <Users size={16} /> הצטרפות
        </button>
      </div>

      {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      {tab === "create" ? (
        <form onSubmit={createHome} className="card space-y-3">
          <label className="block text-sm font-medium text-slate-600">שם הבית</label>
          <input
            className="input"
            placeholder="למשל: משפחת כהן"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? <Spinner className="border-white/40 border-t-white" /> : "יצירת בית"}
          </button>
        </form>
      ) : (
        <form onSubmit={joinHome} className="card space-y-3">
          <label className="block text-sm font-medium text-slate-600">קוד הזמנה</label>
          <input
            className="input font-mono tracking-widest"
            placeholder="הזינו קוד"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? <Spinner className="border-white/40 border-t-white" /> : "הצטרפות לבית"}
          </button>
        </form>
      )}

      <button onClick={signOut} className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-400">
        <LogOut size={15} /> התנתקות
      </button>
    </div>
  );
}
