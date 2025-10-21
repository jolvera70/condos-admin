import { create } from "zustand";

type Org = { orgId: string; role: string; status?: string };

type AppState = {
  token: string | null; // ← puede ser null
  me: { id?: string; email?: string; roles?: string[]; orgs?: Org[] } | null;
  setToken: (t: string | null) => void;
  setMe: (m: AppState["me"]) => void;
  logout: () => void;
};

export const useApp = create<AppState>((set) => ({
  token: null,
  me: null,
  setToken: (t) => set({ token: t, ...(t ? {} : { me: null }) }),
  setMe: (m) => set({ me: m }),
  logout: () => set({ token: null, me: null }), // ← limpia ambos
}));