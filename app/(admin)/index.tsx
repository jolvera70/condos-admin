// app/(app)/admin/index.tsx
import { useRouter } from "expo-router";
import { Button, Text, View } from "react-native";

export default function AdminIndex() {
  const router = useRouter();
  return (
    <View style={{ padding:16, gap:8 }}>
      <Text style={{ fontSize:18, fontWeight:"700" }}>Consola SuperAdmin</Text>
      <Button title="Empresas" onPress={() => router.push("/(admin)/tenants")} />
      <Button title="Usuarios"  onPress={() => router.push("/(admin)/users")} />
        <Button title="Condominios"  onPress={() => router.push("/(admin)/boards")} />
    </View>
  );
}