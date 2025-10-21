// app/_layout.tsx
import { Slot, useRootNavigationState, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import "react-native-gesture-handler"; // 👈 debe ser el primero
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthStorage } from "../lib/auth";
import { useApp } from "../lib/store";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const navState = useRootNavigationState();

  const token = useApp((s) => s.token);
  const setToken = useApp((s) => s.setToken);
  const [hydrated, setHydrated] = useState(false);

  // Hidratar token al arrancar
  useEffect(() => {
    (async () => {
      const t = await AuthStorage.get();
      setToken(t);
      setHydrated(true);
    })();
  }, [setToken]);

  // Proteger rutas (espera a que el router esté listo y a que hidratemos)
  useEffect(() => {
    if (!navState?.key || !hydrated) return;

    const inAuth = segments[0] === "(auth)";

    if (!token && !inAuth) {
      router.replace("/(auth)/login");
    } else if (token && inAuth) {
      router.replace("/(app)/home");
    }
  }, [navState?.key, hydrated, token, segments, router]);

    return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <Slot />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}