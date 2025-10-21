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
          orgId: t.orgId ?? t.id,
          name: t.name ?? t.slug ?? (t.orgId ?? t.id),
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
          orgId: o.orgId,
          name: o.name ?? o.orgId,
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
      const body = {
        name: name.trim(),
        slug: normalizeSlug(slug || name),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      };
      if (!isValid) {
        setMsg("Nombre y email son obligatorios.");
        return;
      }
      await apiAuth("/tenant", "POST", body);
      setName("");
      setSlug("");
      setEmail("");
      setPhone("");
      setAddress("");
      await load();
      setMsg("Tenant creado ✅");
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
      setMsg("Tenant actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      await apiAuth(`/tenant/${id}`, "DELETE");
      await load();
      setMsg("Tenant eliminado ❌");
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

  const card = {
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
        }
      : {}),
  };
  const input = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
      {/* --- TOP BAR --- */}
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
          <PillButton label="Salir" tone="danger" onPress={logout} />
        </View>
      </View>

      {/* --- SUB HEADER --- */}
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Gestión de Tenants</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {Platform.OS === "web" ? (
            <label style={{ display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e: any) => setIncludeArchived(e.currentTarget.checked)}
              />
              <Text>Incluir archivados</Text>
            </label>
          ) : (
            <PillButton
              label={includeArchived ? "Ocultar archivados" : "Incluir archivados"}
              onPress={() => setIncludeArchived((v) => !v)}
              tone="secondary"
            />
          )}
          <PillButton label="Recargar" onPress={load} />
          <PillButton label="Menú principal" onPress={() => router.replace("/(app)/home")} />
        </View>
      </View>

      {/* --- CONTENIDO PRINCIPAL --- */}
<FlatList
  style={{ flex: 1 }}
  contentContainerStyle={{ padding: 16 }}
  keyboardShouldPersistTaps="handled"
  data={orgs}
  keyExtractor={(t) => t.orgId}
  refreshing={loading}
  onRefresh={load}
  ListHeaderComponent={
    <View>
      {!!msg && (
        <View
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 12,
            backgroundColor: msg.includes("✅") ? "#F1F5FF" : "#FEF2F2",
            borderWidth: 1,
            borderColor: msg.includes("✅") ? "#DBEAFE" : "#FECACA",
          }}
        >
          <Text style={{ color: msg.includes("✅") ? "#1E40AF" : "#B91C1C" }}>{msg}</Text>
        </View>
      )}

      {/* Crear nuevo */}
      <View style={{ ...card, marginBottom: 14 }}>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>Crear nuevo tenant</Text>
        <View style={{ gap: 8 }}>
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
          <PillButton label="Crear tenant" onPress={create} disabled={!isValid} />
        </View>
      </View>

      {/* Encabezado de lista */}
      <View style={{ ...card, padding: 12, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontWeight: "800" }}>Tenants</Text>
          {loading && <ActivityIndicator />}
        </View>
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
        padding: 12,
        borderWidth: 1,
        borderColor: "#F3F4F6",
        borderRadius: 12,
        backgroundColor: "#fff",
        marginBottom: 8,
        ...(Platform.OS === "web"
          ? { boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 1px 2px rgba(16,24,40,.06)" }
          : {}),
      }}
    >
      {editingId === t.orgId ? (
        <>
          <TextInput placeholder="Nuevo nombre" value={name} onChangeText={setName} style={input} />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <PillButton label="Guardar" onPress={() => update(t.orgId)} />
            <PillButton label="Cancelar" tone="secondary" onPress={() => setEditingId(null)} />
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
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
              label="Editar"
              tone="secondary"
              onPress={() => {
                setEditingId(t.orgId);
                setName(t.name);
              }}
            />
            {t.status !== "ARCHIVED" ? (
              <PillButton label="Archivar" tone="warning" onPress={() => changeStatus(t.orgId, "ARCHIVED")} />
            ) : (
              <PillButton label="Activar" onPress={() => changeStatus(t.orgId, "ACTIVE")} />
            )}
            <PillButton label="Suspender" tone="warning" onPress={() => changeStatus(t.orgId, "SUSPENDED")} />
            <PillButton label="Eliminar" tone="danger" onPress={() => remove(t.orgId)} />
          </View>
        </>
      )}
    </View>
  )}
  ListFooterComponent={<View style={{ height: 24 }} />}
/>
    </View>
  );
}

/* --- Componentes de apoyo --- */
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
  }[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: disabled ? "#CBD5E1" : pressed ? palette.bg2 : palette.bg,
      })}
    >
      <Text style={{ color: palette.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: TenantStatus }) {
  const map = {
    ACTIVE: { bg: "#E6FFED", fg: "#136F3A" },
    SUSPENDED: { bg: "#FFF7ED", fg: "#8B5E00" },
    ARCHIVED: { bg: "#F1F5F9", fg: "#475569" },
  }[status];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: map.bg }}>
      <Text style={{ color: map.fg, fontWeight: "800", fontSize: 12 }}>{status}</Text>
    </View>
  );
}