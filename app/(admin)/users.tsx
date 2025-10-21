// app/(app)/users.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";

type OrgOpt = { orgId: string; name: string };
type UserItem = {
  id: string;
  email: string;
  fullName?: string;
  roles?: string[];
  orgs?: Array<{ orgId: string; role: string }>;
};

const ROLE_OPTS = ["ADMINISTRADOR", "SUPERVISOR", "OPERATIVO"] as const;

export default function Users() {
  const router = useRouter();
  const { me, logout } = useApp();

  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [orgId, setOrgId] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // crear
  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "ADMINISTRADOR" as (typeof ROLE_OPTS)[number],
  });

  // edición
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ fullName: string; email: string; password?: string }>({
    fullName: "",
    email: "",
    password: "",
  });

  const isValidNew = useMemo(
    () => !!orgId && /^\S+@\S+\.\S+$/.test(newUser.email.trim()) && newUser.password.trim().length >= 3,
    [orgId, newUser.email, newUser.password]
  );

  const roleForOrg = (u: UserItem, org: string): string => {
    if (Array.isArray(u.roles) && u.roles.length) return u.roles.join(", ");
    return u.orgs?.find((o) => o.orgId === org)?.role ?? "-";
  };

  /* ------------------------ cargar tenants ------------------------ */
  const loadOrgs = useCallback(async () => {
    setMsg("");
    if (!me) return;
    try {
      const isSA =
        (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
        (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"));

      if (isSA) {
        const raw = await apiAuth("/tenant?page=0&size=1000", "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: OrgOpt[] = list.map((t: any) => ({
          orgId: t.orgId ?? t.id,
          name: t.name ?? t.slug ?? (t.orgId ?? t.id),
        }));
        setOrgs(arr);
        if (!orgId && arr.length) setOrgId(arr[0].orgId);
      } else {
        const arr: OrgOpt[] = (me?.orgs ?? []).map((o: any) => ({
          orgId: o.orgId,
          name: o.name ?? o.orgId,
        }));
        setOrgs(arr);
        if (!orgId && arr.length) setOrgId(arr[0].orgId);
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }, [me, orgId]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  /* ------------------------ cargar usuarios ------------------------ */
  const loadUsers = useCallback(async () => {
    if (!orgId) return;
    setMsg("");
    setLoading(true);
    try {
      const list: UserItem[] = await apiAuth(`/user/users?orgId=${encodeURIComponent(orgId)}`, "GET");
      setUsers(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /* ------------------------ acciones ------------------------ */
  const createUser = async () => {
    try {
      const body = {
        fullName: newUser.fullName.trim(),
        email: newUser.email.trim().toLowerCase(),
        orgId,
        role: newUser.role,
        provisionAccount: true,
        tempPassword: newUser.password,
      };
      await apiAuth("/user/users", "POST", body);
      setNewUser({ fullName: "", email: "", password: "", role: "ADMINISTRADOR" });
      await loadUsers();
      setMsg("Usuario creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const startEdit = (u: UserItem) => {
    setEditingId(u.id);
    setEditForm({ fullName: u.fullName ?? "", email: u.email ?? "", password: "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ fullName: "", email: "", password: "" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const payload: any = {
        fullName: editForm.fullName.trim(),
        email: editForm.email.trim().toLowerCase(),
      };
      if (editForm.password && editForm.password.trim().length >= 3) {
        payload.password = editForm.password.trim();
      }
      await apiAuth(`/user/users/${editingId}`, "PATCH", payload);
      await loadUsers();
      cancelEdit();
      setMsg("Usuario actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeRole = async (u: UserItem, newRole: string) => {
    try {
      // Gateway unificado de user-api:
      await apiAuth(`/user/users/${u.id}/orgs/${orgId}/role`, "PATCH", { role: newRole });
      await loadUsers();
      setMsg("Rol actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const softDelete = async (u: UserItem) => {
    const go = async () => {
      try {
        await apiAuth(`/user/users/${u.id}`, "DELETE");
        await loadUsers();
        setMsg("Usuario archivado ✅");
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      }
    };
    if (Platform.OS === "web") {
      if (confirm(`¿Archivar a ${u.email}?`)) await go();
    } else {
      Alert.alert("Confirmar", `¿Archivar a ${u.email}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Archivar", style: "destructive", onPress: go },
      ]);
    }
  };

  /* ------------------------ UI helpers ------------------------ */
  const card: any = {
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)" }
      : {}),
  };
  const input = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
  } as const;

  /* ------------------------ Render ------------------------ */
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
          <PillButton label="Salir" tone="danger" onPress={logout} />
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Gestión de Usuarios</Text>
        <PillButton label="Menú principal" onPress={() => router.replace("/(app)/home")} />
      </View>

      {/* SCROLL PRINCIPAL */}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        data={users}
        keyExtractor={(u) => u.id}
        refreshing={loading}
        onRefresh={loadUsers}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {!!msg && (
              <View
                style={{
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

            {/* Selector de empresa */}
            <View style={{ ...card, gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>Empresa</Text>
              {Platform.OS === "web" ? (
                <select
                  value={orgId}
                  onChange={(e) => setOrgId(e.currentTarget.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any }}
                >
                  {orgs.map((t) => (
                    <option key={t.orgId} value={t.orgId}>
                      {t.name} ({t.orgId})
                    </option>
                  ))}
                </select>
              ) : (
                <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}>
                  <Picker selectedValue={orgId} onValueChange={(v) => setOrgId(String(v))}>
                    {orgs.map((t) => (
                      <Picker.Item key={t.orgId} label={`${t.name} (${t.orgId})`} value={t.orgId} />
                    ))}
                  </Picker>
                </View>
              )}
            </View>

            {/* Crear nuevo usuario */}
            <View style={{ ...card, gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>Crear nuevo usuario</Text>
              <TextInput
                placeholder="Nombre"
                value={newUser.fullName}
                onChangeText={(v) => setNewUser((u) => ({ ...u, fullName: v }))}
                style={input}
              />
              <TextInput
                placeholder="Email"
                value={newUser.email}
                onChangeText={(v) => setNewUser((u) => ({ ...u, email: v }))}
                autoCapitalize="none"
                keyboardType="email-address"
                style={input}
              />
              <TextInput
                placeholder="Password"
                value={newUser.password}
                onChangeText={(v) => setNewUser((u) => ({ ...u, password: v }))}
                secureTextEntry
                style={input}
              />
              {Platform.OS === "web" ? (
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser((u) => ({ ...u, role: e.currentTarget.value as any }))}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any }}
                >
                  {ROLE_OPTS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}>
                  <Picker
                    selectedValue={newUser.role}
                    onValueChange={(v) => setNewUser((u) => ({ ...u, role: v as any }))}
                  >
                    {ROLE_OPTS.map((r) => (
                      <Picker.Item key={r} label={r} value={r} />
                    ))}
                  </Picker>
                </View>
              )}
              <PillButton label="Crear usuario" onPress={createUser} disabled={!isValidNew} />
            </View>

            {/* Encabezado listado */}
            <View style={{ ...card, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>
                Usuarios de {orgs.find((o) => o.orgId === orgId)?.name || orgId || "…"}
              </Text>
              {loading && <ActivityIndicator />}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: "#777", padding: 12 }}>
            {loading ? "Cargando..." : "No hay usuarios para mostrar."}
          </Text>
        }
        renderItem={({ item: u }) => {
          const isEditing = editingId === u.id;
          return (
            <View
              style={{
                padding: 12,
                borderWidth: 1,
                borderColor: "#F3F4F6",
                borderRadius: 12,
                backgroundColor: "#fff",
                marginTop: 8,
                gap: 8,
                ...(Platform.OS === "web"
                  ? { boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 1px 2px rgba(16,24,40,.06)" }
                  : {}),
              }}
            >
              {!isEditing ? (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text style={{ fontWeight: "800", fontSize: 16 }}>{u.fullName || u.email}</Text>
                    <Text style={{ color: "#64748B" }}>{u.email}</Text>
                  </View>

                  {/* rol en esta org */}
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Text style={{ fontWeight: "600" }}>Rol en esta empresa:</Text>
                    {Platform.OS === "web" ? (
                      <select
                        defaultValue={roleForOrg(u, orgId) || "OPERATIVO"}
                        onChange={(e) => changeRole(u, e.currentTarget.value)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid #E5E7EB" as any }}
                      >
                        {ROLE_OPTS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB", flex: 1 }}>
                        <Picker
                          selectedValue={roleForOrg(u, orgId) || "OPERATIVO"}
                          onValueChange={(v) => changeRole(u, String(v))}
                        >
                          {ROLE_OPTS.map((r) => (
                            <Picker.Item key={r} label={r} value={r} />
                          ))}
                        </Picker>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <PillButton label="Editar" tone="secondary" onPress={() => startEdit(u)} />
                    <PillButton label="Archivar" tone="danger" onPress={() => softDelete(u)} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={{ fontWeight: "800" }}>Editar usuario</Text>
                  <TextInput
                    placeholder="Nombre"
                    value={editForm.fullName}
                    onChangeText={(v) => setEditForm((f) => ({ ...f, fullName: v }))}
                    style={input}
                  />
                  <TextInput
                    placeholder="Email"
                    value={editForm.email}
                    onChangeText={(v) => setEditForm((f) => ({ ...f, email: v }))}
                    autoCapitalize="none"
                    style={input}
                  />
                  <TextInput
                    placeholder="Password (opcional)"
                    value={editForm.password}
                    onChangeText={(v) => setEditForm((f) => ({ ...f, password: v }))}
                    secureTextEntry
                    style={input}
                  />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <PillButton label="Guardar" onPress={saveEdit} />
                    <PillButton label="Cancelar" tone="secondary" onPress={cancelEdit} />
                  </View>
                </>
              )}
            </View>
          );
        }}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </View>
  );
}

/* ---------- UI helpers ---------- */
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