import { useEffect, useState } from "react";
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt="Nestly"
        className="mx-auto mb-4 h-14 w-14 rounded-2xl shadow"
      />
      {preview === null ? (
        <p className="text-slate-500">בודק את ההזמנה…</p>
      ) : !preview.valid ? (
        <>
          <h1 className="text-lg font-bold text-slate-800">ההזמנה אינה תקפה</h1>
          <p className="mt-1 text-sm text-slate-500">הקוד שגוי או שפג תוקפו.</p>
          <button onClick={() => navigate("/")} className="btn-ghost mx-auto mt-5">
            חזרה
          </button>
        </>
      ) : (
        <>
          <h1 className="text-lg font-bold text-slate-800">הוזמנתם להצטרף</h1>
          <p className="mt-1 text-sm text-slate-500">
            לבית <span className="font-semibold text-brand-700">{preview.home_name}</span>
          </p>
          {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
          <button onClick={accept} className="btn-primary mx-auto mt-5 w-full max-w-xs" disabled={loading}>
            {loading ? <Spinner className="border-white/40 border-t-white" /> : "הצטרפות לבית"}
          </button>
        </>
      )}
    </div>
  );
}
