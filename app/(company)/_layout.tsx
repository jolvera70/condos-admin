// app/(company)/_layout.tsx
import { Ionicons } from "@expo/vector-icons";
import { Slot, usePathname, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";

/* ============ Paleta clara (Figma: "Supervisor de empresa - dashboard") ============ */
const ui = {
  sidebar: "#7B70E8",
  sidebarActivePill: "#FFFFFF",
  sidebarActiveText: "#5B4CE0",
  page: "#F4F1EC", // gris/beige claro detrás de la tarjeta
  content: "#FBF1E1", // crema de la tarjeta principal
  textOnSidebar: "#FFFFFF",
  textOnSidebarMuted: "rgba(255,255,255,0.75)",
  yellow: "#F1E94A",
  avatarColors: ["#F1C84A", "#F97362", "#5B9EF9", "#4ADE80", "#C084FC"],
};

type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", route: "/(company)", icon: "home" },
  { label: "Condominios", route: "/(company)/boards", icon: "business-outline" },
  { label: "Operadores", route: "/(company)/users", icon: "people-outline" },
  { label: "Reportes", route: "/(company)/reports", icon: "bar-chart-outline" },
];

function TokkoWordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Svg width={16} height={12} viewBox="0 0 20 14">
        <Path
          d="M2 12 L10 2 L18 12"
          stroke={ui.yellow}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 16 }}>tokko</Text>
    </View>
  );
}

function initialsAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return ui.avatarColors[Math.abs(hash) % ui.avatarColors.length];
}

export default function CompanyLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { me, logout } = useApp();

  // orgId activo: por ahora se toma la primera org del usuario (igual que el resto de pantallas company).
  const orgId = me?.orgs?.[0]?.orgId ?? "";
  const myRole: Role = highestRoleInOrg(me, orgId);
  const roleLabel =
    myRole === "SUPERVISOR"
      ? "Supervisor de empresa"
      : myRole === "ADMINISTRADOR"
      ? "Administrador de empresa"
      : myRole === "SUPERADMIN"
      ? "Superadmin"
      : "Operador";

  const displayName = (me as any)?.name ?? (me?.email ?? "").split("@")[0] ?? "";
  const initial = displayName.trim().charAt(0).toUpperCase() || "U";

  const isActive = (route: string) => {
    if (route === "/(company)") {
      return pathname === "/(company)" || pathname === "/" || pathname === "";
    }
    return pathname.startsWith(route.replace("/(company)", ""));
  };

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: ui.page }}>
      {/* ===== Sidebar ===== */}
      <View
        style={{
          width: 220,
          backgroundColor: ui.sidebar,
          paddingTop: 20,
          paddingHorizontal: 14,
          paddingBottom: 16,
          justifyContent: "space-between",
          ...(Platform.OS === "web"
            ? ({ height: "100vh", position: "sticky" as any, top: 0 } as any)
            : { flex: 1 }),
        }}
      >
        <View>
          <View style={{ paddingHorizontal: 4, marginBottom: 24 }}>
            <TokkoWordmark />
          </View>

          <View style={{ gap: 4 }}>
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.route);
              return (
                <Pressable
                  key={item.route}
                  onPress={() => router.push(item.route as any)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: active ? ui.sidebarActivePill : "transparent",
                  }}
                >
                  <Ionicons
                    name={item.icon}
                    size={17}
                    color={active ? ui.sidebarActiveText : ui.textOnSidebarMuted}
                  />
                  <Text
                    style={{
                      color: active ? ui.sidebarActiveText : ui.textOnSidebarMuted,
                      fontSize: 14,
                      fontWeight: active ? "700" : "500",
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pie: usuario activo + salir */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Pressable
            onPress={() => router.push("/(company)/users" as any)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 6,
              paddingVertical: 6,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: initialsAvatarColor(displayName),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#1F2430", fontWeight: "800", fontSize: 13 }}>{initial}</Text>
            </View>
            <Text
              style={{ color: ui.textOnSidebar, fontSize: 13, fontWeight: "600" }}
              numberOfLines={1}
            >
              {displayName}
            </Text>
          </Pressable>
          <Pressable
            onPress={logout}
            style={{ padding: 8, borderRadius: 8 }}
          >
            <Ionicons name="log-out-outline" size={18} color={ui.textOnSidebarMuted} />
          </Pressable>
        </View>
      </View>

      {/* ===== Contenido ===== */}
      <View style={{ flex: 1, minHeight: 0, padding: 18 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: ui.content,
            borderRadius: 24,
            overflow: "hidden",
            ...(Platform.OS === "web"
              ? ({ boxShadow: "0 10px 30px rgba(21,19,31,0.08)" } as any)
              : {}),
          }}
        >
          <Slot />
        </View>
      </View>
    </View>
  );
}
