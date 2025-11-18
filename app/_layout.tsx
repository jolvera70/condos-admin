// app/_layout.tsx (extracto)
import { AuthStorage } from "@/lib/auth";
import { useApp } from "@/lib/store";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";

export default function RootLayout() {
  const { token, setToken } = useApp();
  const [boot, setBoot] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const t = await AuthStorage.get();
      if (t) setToken(t);
      setBoot(true);
    })();
  }, [setToken]);

  useEffect(() => {
    if (!boot) return;
    const inAuth = segments[0] === "(auth)";
    if (!token && !inAuth) router.replace("/login");
    if (token && inAuth) router.replace("/home");
  }, [boot, token, segments, router]);

  return boot ? <Slot /> : null;
}