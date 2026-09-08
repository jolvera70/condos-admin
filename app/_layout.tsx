// app/_layout.tsx (extracto)
import { api } from "@/lib/api";
import { AuthStorage } from "@/lib/auth";
import { landingRouteFor } from "@/lib/roles";
import { useApp } from "@/lib/store";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";

export default function RootLayout() {
  const { token, me, setToken, setMe, logout } = useApp();
  const [boot, setBoot] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const t = await AuthStorage.get();
      if (t) {
        setToken(t);
        try {
          const data = await api("/auth/me", "GET", undefined, t);
          setMe(data);
        } catch {
          logout();
        }
      }
      setBoot(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setToken]);

  useEffect(() => {
    if (!boot) return;
    const inAuth = segments[0] === "(auth)";
    if (!token && !inAuth) router.replace("/login");
    if (token && inAuth) router.replace(landingRouteFor(me) as any);
  }, [boot, token, me, segments, router]);

  return boot ? <Slot /> : null;
}