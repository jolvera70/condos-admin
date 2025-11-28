// app/(app)/admin/tenants.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

/* ======================= Theme estilo Lokaly ======================= */

const lokalyTheme = {
  bg: "#050509",
  bgAlt: "#080812",
  surface: "#101018",
  surfaceSoft: "#171725",
  border: "#262637",
  borderSoft: "#202033",
  primary: "#F4C15D",
  primarySoft: "rgba(244, 193, 93, 0.14)",
  danger: "#F87171",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textSubtle: "#6B7280",
  chipBg: "#111827",
  chipBorder: "#1F2937",
};

type TenantStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

type Tenant = {
  orgId: string;
  name: string;
  slug?: string;
  email?: string;
  phone?: string;
  address?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: TenantStatus;
};

export default function Tenants() {
  const { me, logout } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const twoCols = width >= 820; // 2 columnas en web/tablet

  const [orgs, setOrgs] = useState<Tenant[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false); // toggle crear

  const isValid = useMemo(
    () => name.trim().length > 0 && /^\S+@\S+\.\S+$/.test(email.trim()),
    [name, email]
  );

  const normalizeSlug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const load = useCallback(async () => {
    setMsg("");
    if (!me) return;
    setLoading(true);
    try {
      const isSA =
        (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
        (Array.isArray(me.orgs) &&
          me.orgs.some((o: any) => o.role === "SUPERADMIN"));

      if (isSA) {
        const qs = `?page=0&size=1000${
          includeArchived ? "&includeArchived=true" : ""
        }`;
        const raw = await apiAuth(`/tenant${qs}`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: Tenant[] = list.map((t: any) => ({
          orgId: String(t.orgId ?? t.id),
          name: String(t.name ?? t.slug ?? (t.orgId ?? t.id)),
          slug: t.slug,
          email: t.email,
          phone: t.phone,
          address: t.address,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          status: t.status,
        }));
        setOrgs(arr);
      } else {
        const arr: Tenant[] = (me?.orgs ?? []).map((o: any) => ({
          orgId: String(o.orgId),
          name: String(o.name ?? o.orgId),
          status: "ACTIVE",
        }));
        setOrgs(arr);
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [me, includeArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    try {
      setMsg("");
      if (!isValid) {
        setMsg("Nombre y email son obligatorios.");
        return;
      }
      const body = {
        name: name.trim(),
        slug: normalizeSlug(slug || name),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      };
      await apiAuth("/tenant", "POST", body);
      setName("");
      setSlug("");
      setEmail("");
      setPhone("");
      setAddress("");
      setShowCreate(false);
      await load();
      setMsg("Empresa creada ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const update = async (id: string) => {
    try {
      await apiAuth(`/tenant/${id}`, "PUT", { name: name.trim() });
      setEditingId(null);
      setName("");
      await load();
      setMsg("Empresa actualizada ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      await apiAuth(`/tenant/${id}`, "DELETE");
      await load();
      setMsg("Empresa eliminada ❌");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (id: string, status: TenantStatus) => {
    try {
      await apiAuth(
        `/tenant/${id}/status?status=${encodeURIComponent(status)}`,
        "PATCH"
      );
      await load();
      setMsg(`Estado cambiado a ${status} ✅`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ===== Estilos base ===== */
  const card: any = {
    borderWidth: 1,
    borderColor: lokalyTheme.borderSoft,
    borderRadius: 18,
    backgroundColor: lokalyTheme.surface,
    padding: 14,
    ...(isWeb
      ? {
          boxShadow: "0 18px 45px rgba(0,0,0,0.65)",
        }
      : {}),
  };

  const input = {
    borderWidth: 1,
    borderColor: lokalyTheme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: isWeb ? 10 : 12,
    backgroundColor: lokalyTheme.bgAlt,
    color: lokalyTheme.text,
    fontSize: 13,
  } as const;

  /* =================== Render =================== */
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: lokalyTheme.bg,
      }}
    >
      {/* TOP BAR uniforme (usa email del usuario) */}
      <TopBar
        email={me?.email}
        onMenu={() => router.replace("/(app)/home")}
        onLogout={logout}
      />

      {/* HEADER de página */}
      <View
        style={{
          height: 64,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
          borderBottomWidth: 1,
          borderColor: lokalyTheme.borderSoft,
          backgroundColor: lokalyTheme.bgAlt,
        }}
      >
        <View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: lokalyTheme.primary,
            }}
          >
            Empresas / Tenants
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: lokalyTheme.textMuted,
              marginTop: 2,
            }}
          >
            Administra las empresas que usan la plataforma Condos.
          </Text>
        </View>

        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: "#111827",
            borderWidth: 1,
            borderColor: lokalyTheme.borderSoft,
          }}
        >
          <Text
            style={{
              color: lokalyTheme.textMuted,
              fontSize: 11,
            }}
          >
            Total:{" "}
            <Text style={{ color: lokalyTheme.primary, fontWeight: "700" }}>
              {orgs.length}
            </Text>
          </Text>
        </View>
      </View>

      {/* FORM CREAR + MENSAJE */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        {!!msg && (
          <View
            style={{
              padding: 10,
              borderRadius: 12,
              backgroundColor: msg.includes("✅")
                ? "rgba(22,163,74,0.12)"
                : "rgba(248,113,113,0.10)",
              borderWidth: 1,
              borderColor: msg.includes("✅")
                ? "rgba(34,197,94,0.6)"
                : "rgba(248,113,113,0.65)",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: msg.includes("✅") ? "#4ADE80" : lokalyTheme.danger,
                fontSize: 12,
              }}
            >
              {msg}
            </Text>
          </View>
        )}

        {/* SUB HEADER / filtros */}
        <View
          style={{
            ...card,
            paddingVertical: 12,
            paddingHorizontal: 14,
            marginBottom: 12,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "800",
                  color: lokalyTheme.text,
                }}
              >
                Gestión de Empresas
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: lokalyTheme.textSubtle,
                  marginTop: 2,
                }}
              >
                Crea, suspende o archiva tenants del sistema.
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              {isWeb ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    userSelect: "none",
                    color: lokalyTheme.textMuted,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e: any) =>
                      setIncludeArchived(e.currentTarget.checked)
                    }
                  />
                  <Text>Incluir archivados</Text>
                </label>
              ) : (
                <PillButton
                  label={
                    includeArchived
                      ? "OCULTAR ARCHIVADOS"
                      : "INCLUIR ARCHIVADOS"
                  }
                  tone="secondary"
                  onPress={() => setIncludeArchived((v) => !v)}
                />
              )}
              <PillButton
                label={showCreate ? "OCULTAR" : "CREAR EMPRESA"}
                tone={showCreate ? "secondary" : "primary"}
                onPress={() => setShowCreate((v) => !v)}
              />
              <PillButton label="RECARGAR" tone="secondary" onPress={load} />
            </View>
          </View>

          {showCreate && (
            <View style={{ gap: 8, marginTop: 6 }}>
              <Text
                style={{
                  color: lokalyTheme.text,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                Crear nueva empresa
              </Text>
              <TextInput
                placeholder="Nombre"
                placeholderTextColor={lokalyTheme.textMuted}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (!slug) setSlug(v);
                }}
                style={input}
              />
              <TextInput
                placeholder="Slug (único, sin espacios)"
                placeholderTextColor={lokalyTheme.textMuted}
                value={slug}
                onChangeText={setSlug}
                autoCapitalize="none"
                style={input}
              />
              <TextInput
                placeholder="Email del administrador"
                placeholderTextColor={lokalyTheme.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                style={input}
              />
              <TextInput
                placeholder="Teléfono (opcional)"
                placeholderTextColor={lokalyTheme.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={input}
              />
              <TextInput
                placeholder="Dirección (opcional)"
                placeholderTextColor={lokalyTheme.textMuted}
                value={address}
                onChangeText={setAddress}
                style={input}
              />
              <PillButton
                label="CREAR EMPRESA"
                onPress={create}
                disabled={!isValid}
              />
            </View>
          )}
        </View>
      </View>

      {/* LISTA */}
      <FlatList
        style={{ flex: 1, backgroundColor: lokalyTheme.bg }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        data={orgs}
        keyExtractor={(t) => t.orgId}
        refreshing={loading}
        onRefresh={load}
        numColumns={twoCols ? 2 : 1}
        columnWrapperStyle={twoCols ? { gap: 16 } : undefined}
        ListHeaderComponent={
          <View
            style={{
              ...card,
              padding: 12,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              style={{
                fontWeight: "800",
                color: lokalyTheme.text,
              }}
            >
              Empresas registradas
            </Text>
            {loading && (
              <ActivityIndicator color={lokalyTheme.primary} />
            )}
          </View>
        }
        ListEmptyComponent={
          <Text
            style={{
              color: lokalyTheme.textMuted,
              padding: 12,
            }}
          >
            {loading ? "Cargando..." : "No hay tenants para mostrar."}
          </Text>
        }
        renderItem={({ item: t }) => {
          const stripe = leftStripeColor(t.status);

          return (
            <View
              style={{
                position: "relative",
                borderWidth: 1,
                borderColor: lokalyTheme.borderSoft,
                borderRadius: 18,
                backgroundColor: lokalyTheme.surface,
                padding: 14,
                marginBottom: 16,
                ...(isWeb
                  ? {
                      boxShadow:
                        "0 16px 40px rgba(15,23,42,0.8)",
                    }
                  : {}),
                flexBasis: twoCols ? "48%" : "100%",
                maxWidth: twoCols ? "48%" : "100%",
                borderLeftWidth: 6,
                borderLeftColor: stripe,
              }}
            >
              {/* estado pill arriba derecha */}
              {t.status && (
                <StatusBadge
                  status={t.status}
                  style={{ position: "absolute", top: 10, right: 12 }}
                />
              )}

              {editingId === t.orgId ? (
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      color: lokalyTheme.text,
                      marginBottom: 4,
                    }}
                  >
                    Editar empresa
                  </Text>
                  <TextInput
                    placeholder="Nuevo nombre"
                    placeholderTextColor={lokalyTheme.textMuted}
                    value={name}
                    onChangeText={setName}
                    style={input}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 8,
                    }}
                  >
                    <PillButton
                      label="GUARDAR"
                      onPress={() => update(t.orgId)}
                      disabled={!name.trim()}
                    />
                    <PillButton
                      label="CANCELAR"
                      tone="secondary"
                      onPress={() => {
                        setEditingId(null);
                        setName("");
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 40 }}>
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 16,
                          color: lokalyTheme.text,
                        }}
                        numberOfLines={1}
                      >
                        {t.name}
                      </Text>
                      {!!t.slug && (
                        <Text
                          style={{
                            color: lokalyTheme.textSubtle,
                            fontSize: 11,
                          }}
                          numberOfLines={1}
                        >
                          {t.slug}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Text
                    style={{
                      color: lokalyTheme.textMuted,
                      fontSize: 12,
                    }}
                  >
                    ID: {t.orgId}
                  </Text>
                  {!!t.email && (
                    <Text
                      style={{
                        color: lokalyTheme.text,
                        fontSize: 12,
                      }}
                    >
                      Email: {t.email}
                    </Text>
                  )}
                  {!!t.phone && (
                    <Text
                      style={{
                        color: lokalyTheme.text,
                        fontSize: 12,
                      }}
                    >
                      Teléfono: {t.phone}
                    </Text>
                  )}
                  {!!t.address && (
                    <Text
                      style={{
                        color: lokalyTheme.text,
                        fontSize: 12,
                      }}
                    >
                      Dirección: {t.address}
                    </Text>
                  )}
                  {!!t.updatedAt && (
                    <Text
                      style={{
                        color: lokalyTheme.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Actualizado:{" "}
                      {new Date(t.updatedAt).toLocaleString()}
                    </Text>
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    <PillButton
                      label="EDITAR"
                      tone="secondary"
                      onPress={() => {
                        setEditingId(t.orgId);
                        setName(t.name);
                      }}
                    />
                    {t.status !== "ARCHIVED" ? (
                      <PillButton
                        label="ARCHIVAR"
                        tone="danger"
                        onPress={() =>
                          changeStatus(t.orgId, "ARCHIVED")
                        }
                      />
                    ) : (
                      <PillButton
                        label="ACTIVAR"
                        onPress={() =>
                          changeStatus(t.orgId, "ACTIVE")
                        }
                      />
                    )}
                    <PillButton
                      label="SUSPENDER"
                      tone="warning"
                      onPress={() =>
                        changeStatus(t.orgId, "SUSPENDED")
                      }
                    />
                    <PillButton
                      label="ELIMINAR"
                      tone="danger"
                      onPress={() => remove(t.orgId)}
                    />
                  </View>
                </>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

/* ======================= UI helpers ======================= */

function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "warning" | "danger";
}) {
  const palette = {
    primary: { bg: lokalyTheme.primary, bg2: "#E0A93F", fg: "#111827" },
    secondary: { bg: "#111827", bg2: "#020617", fg: "#E5E7EB" },
    warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#111827" },
    danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#F9FAFB" },
  } as const;
  const p = palette[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: disabled
          ? "rgba(148,163,184,0.45)"
          : pressed
          ? p.bg2
          : p.bg,
      })}
    >
      <Text
        style={{
          color: p.fg,
          fontWeight: "800",
          fontSize: 11,
          letterSpacing: 0.7,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function leftStripeColor(status?: TenantStatus) {
  switch (status) {
    case "ACTIVE":
      return "#10B981"; // verde
    case "SUSPENDED":
      return "#F59E0B"; // ámbar
    case "ARCHIVED":
      return "#6B7280"; // gris
    default:
      return lokalyTheme.borderSoft;
  }
}

function StatusBadge({
  status,
  style,
}: {
  status: TenantStatus;
  style?: any;
}) {
  const palette: Record<TenantStatus, { bg: string; fg: string; label: string }> =
    {
      ACTIVE: {
        bg: "rgba(16,185,129,0.18)",
        fg: "#6EE7B7",
        label: "ACTIVO",
      },
      SUSPENDED: {
        bg: "rgba(245,158,11,0.16)",
        fg: "#FBBF24",
        label: "SUSPENDIDO",
      },
      ARCHIVED: {
        bg: "#1E293B",
        fg: "#CBD5F5",
        label: "ARCHIVADO",
      },
    };
  const p = palette[status] ?? {
    bg: "#1F2933",
    fg: "#E5E7EB",
    label: status,
  };
  return (
    <View
      style={[
        {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: p.bg,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: p.fg,
          fontWeight: "800",
          fontSize: 11,
          letterSpacing: 0.7,
        }}
      >
        {p.label}
      </Text>
    </View>
  );
}

/* ======================= TopBar reutilizable ======================= */

function TopBar({
  email,
  onMenu,
  onLogout,
}: {
  email?: string;
  onMenu: () => void;
  onLogout: () => void;
}) {
  const { width } = useWindowDimensions();
  const isSmall = width < 400;
  const isVerySmall = width < 340;

  return (
    <View
      style={{
        height: 60,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        backgroundColor: "#020617",
        borderBottomWidth: 1,
        borderColor: lokalyTheme.border,
        ...(Platform.OS === "web"
          ? { position: "sticky", top: 0, zIndex: 100 }
          : {}),
      }}
    >
      {/* IZQ: Logo / nombre */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            backgroundColor: lokalyTheme.primarySoft,
            borderWidth: 1,
            borderColor: lokalyTheme.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
<Image
  source={condosLogo}
  style={{
    width: 50,
    height: 50,
    alignItems: "flex-end",
  }}
  resizeMode="contain"
/>
        </View>
        {!isVerySmall && (
          <View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: lokalyTheme.primary,
                letterSpacing: 0.4,
              }}
            >
              S. Admin
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: lokalyTheme.textMuted,
              }}
            >
              Panel de operaciones
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* DER: email + botones */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {!isVerySmall && !!email && (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: lokalyTheme.chipBg,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: lokalyTheme.chipBorder,
              maxWidth: isSmall ? 120 : 190,
            }}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                fontWeight: "600",
                color: lokalyTheme.primary,
                fontSize: 11,
              }}
            >
              
            </Text>
          </View>
        )}

        <Pressable
          onPress={onMenu}
          style={{
            paddingHorizontal: isSmall ? 10 : 14,
            paddingVertical: 7,
            backgroundColor: lokalyTheme.surface,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: lokalyTheme.borderSoft,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              color: lokalyTheme.primary,
              fontSize: isSmall ? 11 : 12,
            }}
          >
            {isSmall ? "MENÚ" : "MENÚ PRINCIPAL"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onLogout}
          style={{
            paddingHorizontal: isSmall ? 10 : 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "#B91C1C",
            marginLeft: 4,
          }}
        >
          <Text
            style={{
              color: "#F9FAFB",
              fontWeight: "700",
              fontSize: isSmall ? 11 : 12,
            }}
          >
            SALIR
          </Text>
        </Pressable>
      </View>
    </View>
  );
}