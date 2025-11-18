// app/(app)/home.tsx
import RoleGate from "@/components/RoleGate";
import { api } from "@/lib/api";
import { extractRoles, highestRole } from "@/lib/roles";
import { useApp } from "@/lib/store";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export default function Home() {
  const router = useRouter();
  const { token, me, setMe, logout } = useApp();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (me) return;
      try {
        setLoading(true);
        const data = await api("/auth/me", "GET", undefined, token ?? undefined);
        setMe(data); // { id, email, roles?:string[], orgs?:{orgId,role}[] }
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const top = highestRole(me);
  const roles = extractRoles(me);
  const isLoaded = !!me;

  const shellCard: any = {
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#fff",
    ...(Platform.OS === "web"
      ? {
          boxShadow:
            "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
        }
      : {}),
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
      {/* Top bar */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderColor: "#ECECEC",
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Home</Text>

        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          {!!me?.email && (
            <Text
              style={{
                color: "#475569",
                backgroundColor: "#F1F5F9",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {me.email}
            </Text>
          )}
          <PillButton
            label="Salir"
            tone="danger"
            onPress={logout}
          />
        </View>
      </View>

      <ScrollView style={{ padding: 16 }}>
        {/* Bienvenida / estado */}
        <View style={{ ...shellCard, marginBottom: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 4 }}>
            ¡Hola{me?.email ? `, ${me.email.split("@")[0]}` : ""}!
          </Text>
          <Text style={{ color: "#667085" }}>
            Rol principal: <Text style={{ fontWeight: "700" }}>{top || "—"}</Text>
          </Text>

          {!isLoaded && (
            <View style={{ marginTop: 10, flexDirection: "row", gap: 8, alignItems: "center" }}>
              <ActivityIndicator />
              <Text>Cargando tu perfil…</Text>
            </View>
          )}
        </View>

        {/* SUPERADMIN */}
        <RoleGate allow={["SUPERADMIN"]} fallback={null}>
          <Section title="Consolas de administración global">
            <TileGrid
              items={[
                { label: "Empresas", onPress: () => router.push("/(admin)/tenants") },
                { label: "Usuarios", onPress: () => router.push("/(admin)/users") },
                { label: "Condominios", onPress: () => router.push("/(admin)/boards") },
              ]}
            />
          </Section>
        </RoleGate>

        {/* ADMINISTRADOR o SUPERVISOR */}
        <RoleGate allow={["ADMINISTRADOR", "SUPERVISOR"]} fallback={null}>
          <Section title="Panel Administrativo">
            <TileGrid
              items={[
                { label: "Usuarios de mi empresa", onPress: () => router.push("/(company)/users") },
                { label: "Mis condominios", onPress: () => router.push("/(company)/boards") },
                { label: "Mis tareas", onPress: () => router.push("/(ops)/tasks") },
                { label: "Reportes", onPress: () => router.push("/(company)/reports") },
              ]}
            />
          </Section>
        </RoleGate>

        {/* OPERATIVO */}
        <RoleGate allow={["OPERATIVO"]} fallback={null}>
          <Section title="Panel Operativo">
            <TileGrid
              items={[
                { label: "Mis tareas", onPress: () => router.push("/(ops)/tasks") },
              ]}
            />
          </Section>
        </RoleGate>

        {/* Ningún rol */}
        {isLoaded && !roles.length && (
          <View style={{ ...shellCard, borderColor: "#FEE2E2", backgroundColor: "#FEF2F2" }}>
            <Text style={{ color: "#B91C1C" }}>
              No tienes roles asignados en tu organización.
            </Text>
          </View>
        )}

        {/* Footer */}
        <Text style={{ color: "#94A3B8", marginTop: 18, marginBottom: 8, textAlign: "center", fontSize: 12 }}>
          © {new Date().getFullYear()} Condos
        </Text>
      </ScrollView>
    </View>
  );
}

/* --------------------------- componentes UI --------------------------- */

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  const isWeb = Platform.OS === "web";
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#EAEAEA",
        borderRadius: 16,
        padding: 16,
        backgroundColor: "#fff",
        marginBottom: 14,
        ...(isWeb
          ? {
              boxShadow:
                "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
            }
          : {}),
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "800", marginBottom: 10 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function TileGrid({
  items,
}: {
  items: { label: string; onPress: () => void }[];
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <Tile key={it.label} label={it.label} onPress={it.onPress} />
      ))}
    </View>
  );
}

function Tile({ label, onPress }: { label: string; onPress: () => void }) {
  const isWeb = Platform.OS === "web";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 220,
        flexGrow: 1,
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: pressed ? "#EFF6FF" : "#F8FAFC",
        ...(isWeb
          ? {
              transitionDuration: "120ms",
              boxShadow:
                "0 1px 2px rgba(16,24,40,.04), 0 1px 2px rgba(16,24,40,.06)",
            }
          : {}),
      })}
    >
      <Text style={{ fontWeight: "800", color: "#0F172A", textAlign: "center" }}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function PillButton({
  label,
  tone = "primary",
  onPress,
}: {
  label: string;
  tone?: "primary" | "danger";
  onPress: () => void;
}) {
  const colors =
    tone === "danger"
      ? { bg: "#EF4444", fg: "#fff", bgDisabled: "#FCA5A5" }
      : { bg: "#2563EB", fg: "#fff", bgDisabled: "#93C5FD" };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: pressed ? colors.bgDisabled : colors.bg,
      })}
    >
      <Text style={{ color: colors.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}