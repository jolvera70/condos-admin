// app/(app)/admin/index.tsx
import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function AdminIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(app)/home");
  }, [router]);

  return null; // opcional: podrías poner un spinner
}