import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { clearCache } from "../lib/cache";

type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Supabase re-checks the session whenever the app returns to the foreground
  // and reports it as a fresh sign-in, with a brand-new user object. Keying the
  // user on its id keeps it the *same* object for the same person, so nothing
  // downstream mistakes "came back from another app" for "a different user"
  // and reloads everything.
  const userId = session?.user?.id ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const user = useMemo(() => session?.user ?? null, [userId]);

  const signOut = async () => {
    clearCache(); // this device's copy of the home's data goes with the account
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
