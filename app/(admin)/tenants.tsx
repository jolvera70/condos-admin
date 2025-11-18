// app/(app)/admin/tenants.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";

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
  const [showCreate, setShowCreate] = useState(false); // ⬅️ Toggle crear

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
        (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"));

      if (isSA) {
        const qs = `?page=0&size=1000${includeArchived ? "&includeArchived=true" : ""}`;
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
      setShowCreate(false); // ⬅️ cerrar formulario tras crear
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
      await apiAuth(`/tenant/${id}/status?status=${encodeURIComponent(status)}`, "PATCH");
      await load();
      setMsg(`Estado cambiado a ${status} ✅`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ===== Estilos ===== */
  const card: any = {
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    ...(isWeb
      ? { boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)" }
      : {}),
  };
  const input = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: isWeb ? 10 : 12,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
      {/* TOP BAR */}
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
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Condos Admin</Text>

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
          <PillButton label="MENÚ PRINCIPAL" tone="secondary" onPress={() => router.replace("/(app)/home")} />
          <PillButton label="SALIR" tone="danger" onPress={logout} />
        </View>
      </View>

      {/* SUB HEADER */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: "#ECECEC",
          backgroundColor: "#F9FAFB",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Gestión de Empresas</Text>

        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {isWeb ? (
            <label style={{ display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e: any) => setIncludeArchived(e.currentTarget.checked)}
              />
              Incluir archivados
            </label>
          ) : (
            <Pressable
              onPress={() => setIncludeArchived((v) => !v)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: pressed ? "#E2E8F0" : "#F1F5F9",
              })}
            >
              <Text style={{ color: "#0F172A", fontWeight: "800" }}>
                {includeArchived ? "OCULTAR ARCHIVADOS" : "INCLUIR ARCHIVADOS"}
              </Text>
            </Pressable>
          )}
          {/* Botón toggle crear */}
          <PillButton
            label={showCreate ? "OCULTAR" : "CREAR EMPRESA"}
            onPress={() => setShowCreate((v) => !v)}
            tone={showCreate ? "secondary" : "primary"}
          />
          <PillButton label="RECARGAR" tone="secondary" onPress={load} />
        </View>
      </View>

      {/* FORM CREAR (fuera del FlatList para que no rompa el grid) */}
      {showCreate && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          {!!msg && (
            <View
              style={{
                padding: 10,
                borderRadius: 12,
                backgroundColor: msg.includes("✅") ? "#F1F5FF" : "#FEF2F2",
                borderWidth: 1,
                borderColor: msg.includes("✅") ? "#DBEAFE" : "#FECACA",
                marginBottom: 12,
              }}
            >
              <Text style={{ color: msg.includes("✅") ? "#1E40AF" : "#B91C1C" }}>{msg}</Text>
            </View>
          )}

          <View style={{ ...card, gap: 8 }}>
            <Text style={{ fontWeight: "800" }}>Crear nueva empresa</Text>
            <TextInput
              placeholder="Nombre"
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (!slug) setSlug(v);
              }}
              style={input}
            />
            <TextInput
              placeholder="Slug (único, sin espacios)"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              style={input}
            />
            <TextInput
              placeholder="Email del administrador"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={input}
            />
            <TextInput
              placeholder="Teléfono (opcional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={input}
            />
            <TextInput
              placeholder="Dirección (opcional)"
              value={address}
              onChangeText={setAddress}
              style={input}
            />
            <PillButton label="CREAR EMPRESA" onPress={create} disabled={!isValid} />
          </View>
        </View>
      )}

      {/* LISTA */}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        data={orgs}
        keyExtractor={(t) => t.orgId}
        refreshing={loading}
        onRefresh={load}
        numColumns={twoCols ? 2 : 1}
        columnWrapperStyle={twoCols ? { gap: 16 } : undefined}
        ListHeaderComponent={
          <View style={{ ...card, padding: 12, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>Empresas</Text>
              {loading && <ActivityIndicator />}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: "#777", padding: 12 }}>
            {loading ? "Cargando..." : "No hay tenants para mostrar."}
          </Text>
        }
        renderItem={({ item: t }) => (
          <View
            style={{
              position: "relative",
              borderWidth: 1,
              borderColor: "#EAEAEA",
              borderRadius: 16,
              backgroundColor: "#fff",
              padding: 14,
              marginBottom: 16,
              ...(Platform.OS === "web"
                ? { boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)" }
                : {}),
              flexBasis: twoCols ? "48%" : "100%",
              maxWidth: twoCols ? "48%" : "100%",
            }}
          >
            {/* Franja de estado a la izquierda */}
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 6,
                backgroundColor: leftStripeColor(t.status),
                borderTopLeftRadius: 16,
                borderBottomLeftRadius: 16,
              }}
            />

            {editingId === t.orgId ? (
              <>
                <TextInput placeholder="Nuevo nombre" value={name} onChangeText={setName} style={input} />
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <PillButton label="GUARDAR" onPress={() => update(t.orgId)} />
                  <PillButton label="CANCELAR" tone="secondary" onPress={() => setEditingId(null)} />
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "800", fontSize: 16 }}>{t.name}</Text>
                  {!!t.status && <StatusBadge status={t.status} />}
                </View>

                <Text style={{ color: "#64748B", fontSize: 12 }}>ID: {t.orgId}</Text>
                {!!t.slug && <Text>Slug: {t.slug}</Text>}
                {!!t.email && <Text>Email: {t.email}</Text>}
                {!!t.phone && <Text>Teléfono: {t.phone}</Text>}
                {!!t.address && <Text>Dirección: {t.address}</Text>}

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  <PillButton
                    label="EDITAR"
                    tone="secondary"
                    onPress={() => {
                      setEditingId(t.orgId);
                      setName(t.name);
                    }}
                  />
                  {t.status !== "ARCHIVED" ? (
                    <PillButton label="ARCHIVAR" tone="danger" onPress={() => changeStatus(t.orgId, "ARCHIVED")} />
                  ) : (
                    <PillButton label="ACTIVAR" onPress={() => changeStatus(t.orgId, "ACTIVE")} />
                  )}
                  <PillButton label="SUSPENDER" tone="warning" onPress={() => changeStatus(t.orgId, "SUSPENDED")} />
                </View>
              </>
            )}
          </View>
        )}
      />
    </View>
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
    primary: { bg: "#2563EB", bg2: "#1D4ED8", fg: "#fff" },
    secondary: { bg: "#F1F5F9", bg2: "#E2E8F0", fg: "#0F172A" },
    warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#fff" },
    danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#fff" },
  } as const;
  const p = palette[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: disabled ? "#CBD5E1" : pressed ? p.bg2 : p.bg,
      })}
    >
      <Text style={{ color: p.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function leftStripeColor(status?: TenantStatus) {
  switch (status) {
    case "ACTIVE":
      return "#16A34A"; // verde
    case "SUSPENDED":
      return "#F59E0B"; // ámbar
    case "ARCHIVED":
      return "#94A3B8"; // gris
    default:
      return "#E5E7EB"; // fallback
  }
}

function StatusBadge({ status }: { status: TenantStatus }) {
  const palette: Record<TenantStatus, { bg: string; fg: string }> = {
    ACTIVE: { bg: "#E6FFED", fg: "#136F3A" },
    SUSPENDED: { bg: "#FFF7ED", fg: "#8B5E00" },
    ARCHIVED: { bg: "#F1F5F9", fg: "#475569" },
  };
  const p = palette[status] ?? { bg: "#F1F5F9", fg: "#0F172A" };
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: p.bg }}>
      <Text style={{ color: p.fg, fontWeight: "800", fontSize: 12 }}>{status}</Text>
    </View>
  );
}