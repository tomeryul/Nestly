import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { HomeProvider, useHome } from "./context/HomeContext";
import { FullPageSpinner } from "./components/ui";
import { supabase } from "./lib/supabase";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import JoinInvite from "./pages/JoinInvite";
import Dashboard from "./pages/Dashboard";
import Shopping from "./pages/Shopping";
import Cooking from "./pages/Cooking";
import Cleaning from "./pages/Cleaning";
import Laundry from "./pages/Laundry";
import Personal from "./pages/Personal";
import Schedule from "./pages/Schedule";
import Settings from "./pages/Settings";

const PENDING_INVITE = "nestly.pendingInvite";

function AuthedRoutes() {
  const home = useHome();
  const navigate = useNavigate();

  // If the user arrived via an invite link before signing in, redeem it now.
  useEffect(() => {
    const code = localStorage.getItem(PENDING_INVITE);
    if (!code) return;
    (async () => {
      const { error } = await supabase.rpc("accept_invite", { invite_code: code });
      localStorage.removeItem(PENDING_INVITE);
      if (!error) {
        await home.refresh();
        navigate("/");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (home.loading) return <FullPageSpinner />;

  return (
    <Routes>
      <Route path="/join/:code" element={<JoinInvite />} />
      <Route path="/onboarding" element={<Onboarding />} />
      {home.homeId == null ? (
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="shopping" element={<Shopping />} />
          <Route path="cooking" element={<Cooking />} />
          <Route path="cleaning" element={<Cleaning />} />
          <Route path="laundry" element={<Laundry />} />
          <Route path="personal" element={<Personal />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}

function Gate() {
  const { loading, session } = useAuth();
  if (loading) return <FullPageSpinner />;

  if (!session) {
    return (
      <Routes>
        <Route path="/join/:code" element={<JoinInvite />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return <AuthedRoutes />;
}

export default function App() {
  return (
    <AuthProvider>
      <HomeProvider>
        <Gate />
      </HomeProvider>
    </AuthProvider>
  );
}
