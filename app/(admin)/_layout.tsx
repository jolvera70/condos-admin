import { Stack } from "expo-router";
import 'react-native-gesture-handler';

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "Panel Admin" }} />
      <Stack.Screen name="tenants" options={{ title: "" }} />
      <Stack.Screen name="users" options={{ title: "" }} />
      <Stack.Screen name="boards" options={{ title: "" }} />
    </Stack>
  );
}