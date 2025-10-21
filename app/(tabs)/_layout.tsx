import { Tabs } from "expo-router";
import { useApp } from "../../lib/store";

export default function AppTabs() {
  const { me } = useApp();
  const isSuper = me?.roles?.includes("SUPERADMIN");

  return (
    <Tabs screenOptions={{ headerTitleAlign: "center", tabBarActiveTintColor: "#0ea5e9" }}>
      <Tabs.Screen name="home" options={{ title: "Inicio" }} />
      {isSuper && (
        <Tabs.Screen name="(admin)" options={{ title: "Admin" }} />
      )}
    </Tabs>
  );
}