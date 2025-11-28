// app/(app)/home.tsx
import RoleGate from "@/components/RoleGate";
import { api } from "@/lib/api";
import { extractRoles, highestRole } from "@/lib/roles";
import { useApp } from "@/lib/store";
import { useRouter } from "expo-router";
import React, { PropsWithChildren, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const ui = {
  bg: "#020617",
  bgSoft: "#030712",
  surface: "#020617",
  surfaceSoft: "#020617",
  border: "#1F2937",
  borderSoft: "#111827",
  primary: "#F4C15D",
  primarySoft: "rgba(244,193,93,0.12)",
  text: "#E5E7EB",
  textMuted: "#94A3B8",
  danger: "#F87171",
};

/* ======================= Home ======================= */

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const top = highestRole(me);
  const roles = extractRoles(me);
  const isLoaded = !!me;
  const shortName = me?.email ? me.email.split("@")[0] : "";

  return (
    <View style={{ flex: 1, backgroundColor: ui.bg }}>
      <TopBar email={me?.email} onLogout={logout} />

      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
        }}
      >
        <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
          {/* Fila 1: Hero + Perfil */}
          <View
            style={{
              flexDirection: Platform.OS === "web" ? "row" : "column",
              gap: 16,
            }}
          >
            <View style={{ flex: 2 }}>
              <Card>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "800",
                    marginBottom: 6,
                    color: ui.text,
                  }}
                >
                  Hola{shortName ? `, ${shortName}` : ""} 👋
                </Text>
                <Text
                  style={{
                    color: ui.textMuted,
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  Este es tu panel de inicio. Desde aquí puedes navegar a las
                  secciones principales según tus permisos.
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <Badge
                    label={`Rol principal: ${top || "sin rol"}`}
                    tone="primary"
                  />
                  {me?.orgs?.length ? (
                    <Badge
                      label={`${me.orgs.length} organización${
                        me.orgs.length > 1 ? "es" : ""
                      }`}
                    />
                  ) : null}
                  {loading && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginLeft: 2,
                      }}
                    >
                      <ActivityIndicator size="small" color={ui.primary} />
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                        Cargando tu perfil…
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            </View>

            <View style={{ flex: 1 }}>
              <Card>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: ui.text,
                    marginBottom: 6,
                  }}
                >
                  Resumen rápido
                </Text>

                <View style={{ gap: 8 }}>
                  <SummaryRow
                    label="Usuario"
                    value={me?.email ?? "—"}
                  />
                  <SummaryRow
                    label="Rol principal"
                    value={top || "—"}
                  />
                  <SummaryRow
                    label="Roles asignados"
                    value={
                      roles.length
                        ? roles.join(" · ")
                        : "Sin roles asignados"
                    }
                  />
                </View>
              </Card>
            </View>
          </View>

          {/* SUPERADMIN */}
          <RoleGate allow={["SUPERADMIN"]} fallback={null}>
            <Section
              title="Administración global"
              subtitle="Gestiona empresas, usuarios y tableros a nivel plataforma."
            >
              <TileGrid
                items={[
                  {
                    label: "Empresas",
                    description: "Alta y mantenimiento de tenants.",
                    icon: "🏢",
                    onPress: () => router.push("/(admin)/tenants"),
                  },
                  {
                    label: "Usuarios",
                    description: "Usuarios globales y permisos.",
                    icon: "👥",
                    onPress: () => router.push("/(admin)/users"),
                  },
                  {
                    label: "Condominios",
                    description: "Tableros y colonias por empresa.",
                    icon: "🏙️",
                    onPress: () => router.push("/(admin)/boards"),
                  },
                ]}
              />
            </Section>
          </RoleGate>

          {/* ADMINISTRADOR / SUPERVISOR */}
          <RoleGate allow={["ADMINISTRADOR", "SUPERVISOR"]} fallback={null}>
            <Section
              title="Panel administrativo"
              subtitle="Operación diaria de tu empresa y condominios."
            >
              <TileGrid
                items={[
                  {
                    label: "Usuarios de mi empresa",
                    description: "Altas, bajas y permisos internos.",
                    icon: "🧑‍💼",
                    onPress: () => router.push("/(company)/users"),
                  },
                  {
                    label: "Mis condominios",
                    description: "Tableros y tareas por condominio.",
                    icon: "🏘️",
                    onPress: () => router.push("/(company)/boards"),
                  },
                  {
                    label: "Mis tareas",
                    description: "Vista Kanban para el equipo.",
                    icon: "✅",
                    onPress: () => router.push("/(ops)/tasks"),
                  },
                  {
                    label: "Reportes",
                    description: "Indicadores y métricas básicas.",
                    icon: "📊",
                    onPress: () => router.push("/(company)/reports"),
                  },
                ]}
              />
            </Section>
          </RoleGate>

          {/* OPERATIVO */}
          <RoleGate allow={["OPERATIVO"]} fallback={null}>
            <Section
              title="Panel operativo"
              subtitle="Accesos directos a las tareas que tienes asignadas."
            >
              <TileGrid
                items={[
                  {
                    label: "Mis tareas",
                    description: "Tablero Kanban de tareas personales.",
                    icon: "🛠️",
                    onPress: () => router.push("/(ops)/tasks"),
                  },
                ]}
              />
            </Section>
          </RoleGate>

          {/* Sin roles */}
          {isLoaded && !roles.length && (
            <Card
              tone="danger"
              style={{
                borderColor: "#7F1D1D",
              }}
            >
              <Text
                style={{
                  color: "#FCA5A5",
                  fontWeight: "600",
                  marginBottom: 4,
                }}
              >
                No tienes roles asignados en tu organización.
              </Text>
              <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                Contacta al administrador para que te agregue a algún rol
                (ADMINISTRADOR, SUPERVISOR u OPERATIVO).
              </Text>
            </Card>
          )}

          {/* Footer */}
          <Text
            style={{
              color: ui.textMuted,
              marginTop: 20,
              marginBottom: 8,
              textAlign: "center",
              fontSize: 11,
            }}
          >
            © {new Date().getFullYear()} Condos Admin
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ======================= Layout / UI bits ======================= */

function TopBar({ email, onLogout }: { email?: string; onLogout: () => void }) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: ui.border,
        backgroundColor: ui.bgSoft,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* Branding */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            backgroundColor: ui.primarySoft,
            borderWidth: 1,
            borderColor: ui.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: ui.primary,
              fontWeight: "800",
              fontSize: 15,
            }}
          >
            C
          </Text>
        </View>
        <View>
          <Text
            style={{
              fontSize: 17,
              fontWeight: "800",
              color: ui.primary,
              letterSpacing: 0.4,
            }}
          >
            Condos Admin
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: ui.textMuted,
            }}
          >
            Panel de control
          </Text>
        </View>
      </View>

      {/* Usuario + salir */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {!!email && (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: ui.border,
              backgroundColor: "#020617",
            }}
          >
            <Text
              style={{
                color: ui.text,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {email}
            </Text>
          </View>
        )}
        <PillButton label="Salir" tone="danger" onPress={onLogout} />
      </View>
    </View>
  );
}

function Card({
  children,
  tone,
  style,
}: PropsWithChildren<{ tone?: "default" | "danger"; style?: any }>) {
  const isWeb = Platform.OS === "web";
  const backgroundColor =
    tone === "danger" ? "#111827" : ui.surfaceSoft;

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 16,
        padding: 16,
        backgroundColor,
        ...(isWeb
          ? {
              boxShadow: "0 18px 50px rgba(15,23,42,0.75)",
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <Card>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          marginBottom: subtitle ? 2 : 8,
          color: ui.text,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          style={{
            fontSize: 12,
            color: ui.textMuted,
            marginBottom: 10,
          }}
        >
          {subtitle}
        </Text>
      )}
      {children}
    </Card>
  );
}

function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "primary";
}) {
  const isPrimary = tone === "primary";
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: isPrimary ? ui.primarySoft : "#020617",
        borderWidth: 1,
        borderColor: isPrimary ? ui.primary : ui.border,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: isPrimary ? ui.primary : ui.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <Text style={{ color: ui.textMuted, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: ui.text,
          fontSize: 12,
          fontWeight: "500",
          flexShrink: 1,
          textAlign: "right",
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

/* ======================= Tiles ======================= */

type TileItem = {
  label: string;
  description?: string;
  icon?: string;
  onPress: () => void;
};

function TileGrid({ items }: { items: TileItem[] }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <Tile key={it.label} item={it} />
      ))}
    </View>
  );
}

function Tile({ item }: { item: TileItem }) {
  const isWeb = Platform.OS === "web";
  const { label, description, icon, onPress } = item;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minWidth: 220,
        maxWidth: 280,
        flexGrow: 1,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: pressed ? ui.primary : ui.borderSoft,
        backgroundColor: pressed ? "#020617" : "#020617",
        ...(isWeb
          ? {
              transitionDuration: "120ms",
              boxShadow: pressed
                ? "0 14px 35px rgba(15,23,42,0.85)"
                : "0 10px 28px rgba(15,23,42,0.65)",
              cursor: "pointer",
            }
          : {}),
      })}
    >
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        {icon && (
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: ui.primarySoft,
            }}
          >
            <Text style={{ fontSize: 16 }}>{icon}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontWeight: "600",
              color: ui.text,
              fontSize: 14,
              marginBottom: description ? 2 : 0,
            }}
          >
            {label}
          </Text>
          {description && (
            <Text
              style={{
                color: ui.textMuted,
                fontSize: 12,
              }}
              numberOfLines={2}
            >
              {description}
            </Text>
          )}
        </View>
      </View>
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
      ? { bg: "#B91C1C", fg: "#F9FAFB", bgPressed: "#DC2626" }
      : { bg: "#1D4ED8", fg: "#F9FAFB", bgPressed: "#2563EB" };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: pressed ? colors.bgPressed : colors.bg,
      })}
    >
      <Text
        style={{
          color: colors.fg,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}