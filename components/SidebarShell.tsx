// components/SidebarShell.tsx
import { Ionicons } from "@expo/vector-icons";
import { Slot, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

/* ============ Misma paleta clara en (company)/(operator)/(condomino) ============ */
export const shellUi = {
  sidebar: "#7B70E8",
  sidebarActivePill: "#FFFFFF",
  sidebarActiveText: "#5B4CE0",
  page: "#F4F1EC",
  content: "#FBF1E1",
  textOnSidebar: "#FFFFFF",
  textOnSidebarMuted: "rgba(255,255,255,0.75)",
  yellow: "#F1E94A",
  avatarColors: ["#F1C84A", "#F97362", "#5B9EF9", "#4ADE80", "#C084FC"],
};

export type NavItem = {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
};

function TokkoWordmark() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Svg width={16} height={12} viewBox="0 0 20 14">
        <Path
          d="M2 12 L10 2 L18 12"
          stroke={shellUi.yellow}
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
  return shellUi.avatarColors[Math.abs(hash) % shellUi.avatarColors.length];
}

function NavList({
  navItems,
  isActive,
  onNavigate,
}: {
  navItems: NavItem[];
  isActive: (route: string) => boolean;
  onNavigate: (route: string) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      {navItems.map((item) => {
        const active = isActive(item.route);
        return (
          <Pressable
            key={item.route}
            onPress={() => onNavigate(item.route)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: active ? shellUi.sidebarActivePill : "transparent",
            }}
          >
            <Ionicons
              name={item.icon}
              size={17}
              color={active ? shellUi.sidebarActiveText : shellUi.textOnSidebarMuted}
            />
            <Text
              style={{
                color: active ? shellUi.sidebarActiveText : shellUi.textOnSidebarMuted,
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
  );
}

function UserFooter({
  displayName,
  roleLabel,
  initial,
  logout,
  onPressProfile,
}: {
  displayName: string;
  roleLabel: string;
  initial: string;
  logout: () => void;
  onPressProfile?: () => void;
}) {
  const Wrapper = onPressProfile ? Pressable : View;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Wrapper
        {...(onPressProfile ? { onPress: onPressProfile } : {})}
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
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: shellUi.textOnSidebar, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={{ color: shellUi.textOnSidebarMuted, fontSize: 10 }}>{roleLabel}</Text>
        </View>
      </Wrapper>
      <Pressable onPress={logout} style={{ padding: 8, borderRadius: 8 }}>
        <Ionicons name="log-out-outline" size={18} color={shellUi.textOnSidebarMuted} />
      </Pressable>
    </View>
  );
}

/**
 * Shell con sidebar fija en desktop/tablet y menú tipo drawer (hamburguesa)
 * en celular, compartido por (company)/(operator)/(condomino). En escritorio
 * se comporta igual que antes (sidebar de 220px + tarjeta redondeada); en
 * celular la sidebar de 220px dejaba menos de la mitad de la pantalla para
 * el contenido, así que se reemplaza por una barra superior + drawer.
 */
export function SidebarShell({
  navItems,
  isActive,
  roleLabel,
  displayName,
  logout,
  onPressProfile,
}: {
  navItems: NavItem[];
  isActive: (route: string) => boolean;
  roleLabel: string;
  displayName: string;
  logout: () => void;
  onPressProfile?: () => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || "U";

  const navigate = (route: string) => {
    setDrawerOpen(false);
    router.push(route as any);
  };

  if (isMobile) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: shellUi.page,
          ...(Platform.OS === "web" ? ({ height: "100vh" } as any) : {}),
        }}
      >
        {/* ===== Barra superior ===== */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: shellUi.sidebar,
            paddingHorizontal: 12,
            paddingVertical: 10,
            ...(Platform.OS === "web" ? ({ position: "sticky", top: 0, zIndex: 10 } as any) : {}),
          }}
        >
          <Pressable onPress={() => setDrawerOpen(true)} style={{ padding: 6 }} hitSlop={8}>
            <Ionicons name="menu" size={24} color="#FFFFFF" />
          </Pressable>
          <TokkoWordmark />
          <Pressable
            onPress={onPressProfile ?? logout}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: initialsAvatarColor(displayName),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#1F2430", fontWeight: "800", fontSize: 12 }}>{initial}</Text>
          </Pressable>
        </View>

        {/* ===== Contenido (a todo lo ancho, sin tarjeta) ===== */}
        <View style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <Slot />
        </View>

        {/* ===== Drawer de navegación ===== */}
        <Modal
          visible={drawerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={{ flex: 1, flexDirection: "row" }}>
            <View
              style={{
                width: 250,
                maxWidth: "80%",
                backgroundColor: shellUi.sidebar,
                paddingTop: 20,
                paddingHorizontal: 14,
                paddingBottom: 16,
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, minHeight: 0 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 4,
                    marginBottom: 24,
                  }}
                >
                  <TokkoWordmark />
                  <Pressable onPress={() => setDrawerOpen(false)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={shellUi.textOnSidebarMuted} />
                  </Pressable>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <NavList navItems={navItems} isActive={isActive} onNavigate={navigate} />
                </ScrollView>
              </View>
              <UserFooter
                displayName={displayName}
                roleLabel={roleLabel}
                initial={initial}
                logout={logout}
                onPressProfile={onPressProfile}
              />
            </View>
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(21,19,31,0.4)" }}
              onPress={() => setDrawerOpen(false)}
            />
          </View>
        </Modal>
      </View>
    );
  }

  // ===== Desktop / tablet: sidebar fija + tarjeta de contenido =====
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        backgroundColor: shellUi.page,
        ...(Platform.OS === "web" ? ({ height: "100vh" } as any) : {}),
      }}
    >
      <View
        style={{
          width: 220,
          backgroundColor: shellUi.sidebar,
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
          <NavList navItems={navItems} isActive={isActive} onNavigate={(r) => router.push(r as any)} />
        </View>
        <UserFooter
          displayName={displayName}
          roleLabel={roleLabel}
          initial={initial}
          logout={logout}
          onPressProfile={onPressProfile}
        />
      </View>

      <View style={{ flex: 1, minHeight: 0, padding: 18 }}>
        <View
          style={{
            flex: 1,
            minHeight: 0,
            backgroundColor: shellUi.content,
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
