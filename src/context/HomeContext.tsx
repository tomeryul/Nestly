import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";
import type { Tables } from "../types/database";

export type Member = Tables<"home_members"> & {
  profile?: { display_name: string | null } | null;
};

type HomeValue = {
  loading: boolean;
  homeId: string | null;
  homeName: string | null;
  homes: Tables<"homes">[];
  members: Member[];
  myResponsibilities: string[];
  isOwner: boolean;
  selectHome: (id: string) => void;
  refresh: () => Promise<void>;
};

const HomeContext = createContext<HomeValue>({
  loading: true,
  homeId: null,
  homeName: null,
  homes: [],
  members: [],
  myResponsibilities: [],
  isOwner: false,
  selectHome: () => {},
  refresh: async () => {},
});

const STORAGE_KEY = "nestly.activeHome";

export function HomeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [homes, setHomes] = useState<Tables<"homes">[]>([]);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const loadHomes = useCallback(async () => {
    if (!user) {
      setHomes([]);
      setHomeId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: memberships } = await supabase
      .from("home_members")
      .select("home_id, homes(*)")
      .eq("user_id", user.id);

    const list = (memberships ?? [])
      .map((m) => (m as unknown as { homes: Tables<"homes"> }).homes)
      .filter(Boolean);
    setHomes(list);

    const stored = localStorage.getItem(STORAGE_KEY);
    const next = list.find((h) => h.id === stored)?.id ?? list[0]?.id ?? null;
    setHomeId(next);
    setLoading(false);
  }, [user]);

  const loadMembers = useCallback(async () => {
    if (!homeId) {
      setMembers([]);
      return;
    }
    const { data } = await supabase
      .from("home_members")
      .select("*, profile:profiles(display_name)")
      .eq("home_id", homeId);
    setMembers((data as unknown as Member[]) ?? []);
  }, [homeId]);

  useEffect(() => {
    loadHomes();
  }, [loadHomes]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const selectHome = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setHomeId(id);
  };

  const refresh = async () => {
    await loadHomes();
    await loadMembers();
  };

  const me = members.find((m) => m.user_id === user?.id);

  return (
    <HomeContext.Provider
      value={{
        loading,
        homeId,
        homeName: homes.find((h) => h.id === homeId)?.name ?? null,
        homes,
        members,
        myResponsibilities: me?.responsibilities ?? [],
        isOwner: me?.role === "owner",
        selectHome,
        refresh,
      }}
    >
      {children}
    </HomeContext.Provider>
  );
}

export const useHome = () => useContext(HomeContext);
