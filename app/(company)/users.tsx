// app/(company)/users.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import {
  Role,
  allowedRoleOptionsFor,
  canManage,
  highestRoleInOrg,
} from "../../lib/rbac";
import { useApp } from "../../lib/store";

type OrgOpt = { orgId: string; name: string };
type UserItem = {
  id: string;
  email: string;
  fullName?: string;
  roles?: string[];
  orgs?: Array<{ orgId: string; role: Role | string }>;
};

export default function UsersCompany() {
  const router = useRouter();
  const { me, logout } = useApp();

  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [orgId, setOrgId] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // ---------- cargar tenants ----------
  async function fetchTenantsByIds(ids: string[]) {
    if (!ids.length) return [];
    const res = await apiAuth(`/tenant/tenants?ids=${encodeURIComponent(ids.join(","))}`, "GET");
    const list = Array.isArray(res) ? res : res?.content ?? [];
    return list.map((t: any) => ({
      orgId: String(t.orgId ?? t.id),
      name: String(t.name ?? t.slug ?? t.orgId ?? t.id),
    })) as OrgOpt[];
  }

  const loadOrgs = async () => {
    setMsg("");
    try {
      if (!me) return;

      const isSA =
        (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
        (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"));

      if (isSA) {
        const raw = await apiAuth("/tenant?page=0&size=1000", "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: OrgOpt[] = list.map((t: any) => ({
          orgId: String(t.orgId ?? t.id),
          name: String(t.name ?? t.slug ?? t.orgId ?? t.id),
        }));
        setOrgs(arr);
        if (!orgId && arr.length) setOrgId(arr[0].orgId);
      } else {
        const ids = (me?.orgs ?? []).map((o: any) => String(o.orgId));
        const enriched = await fetchTenantsByIds(ids);
        setOrgs(enriched);
        if (!orgId && enriched.length) setOrgId(enriched[0].orgId);
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  useEffect(() => {
    loadOrgs();
  }, [me]);

  // ---------- cargar usuarios por org ----------
  const loadUsers = async () => {
    if (!orgId) return;
    setMsg("");
    setLoading(true);
    try {
      const list: UserItem[] = await apiAuth(
        `/user/users?orgId=${encodeURIComponent(orgId)}`,
        "GET"
      );
      setUsers(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadUsers();
  }, [orgId]);

  // ---------- permisos / roles ----------
  const myRoleInOrg = useMemo<Role>(() => highestRoleInOrg(me, orgId), [me, orgId]);
  const createRoleOptions = useMemo<Role[]>(
    () => allowedRoleOptionsFor(me, orgId),
    [me, orgId]
  );

  const roleForOrg = (u: UserItem, org: string): Role => {
    const found = u.orgs?.find((o) => o.orgId === org)?.role;
    const r = (Array.isArray(u.roles) && u.roles.length ? u.roles[0] : found) as
      | string
      | undefined;
    if (r === "SUPERADMIN" || r === "ADMINISTRADOR" || r === "SUPERVISOR" || r === "OPERATIVO")
      return r as Role;
    return "OPERATIVO";
  };

  // ---------- crear usuario ----------
  const [newUser, setNewUser] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: Role;
  }>({
    fullName: "",
    email: "",
    password: "",
    role: "OPERATIVO",
  });

  useEffect(() => {
    if (createRoleOptions.length && !createRoleOptions.includes(newUser.role)) {
      setNewUser((u) => ({ ...u, role: createRoleOptions[0] }));
    }
  }, [createRoleOptions]);

  const createUser = async () => {
    try {
      const body = {
        fullName: newUser.fullName,
        email: newUser.email.trim().toLowerCase(),
        orgId,
        role: newUser.role,
        provisionAccount: true,
        tempPassword: newUser.password,
      };
      await apiAuth("/user/users", "POST", body);
      setNewUser({
        fullName: "",
        email: "",
        password: "",
        role: createRoleOptions[0] ?? "OPERATIVO",
      });
      await loadUsers();
      setMsg("Usuario creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  // ---------- edición ----------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    fullName: string;
    email: string;
    password?: string;
  }>({
    fullName: "",
    email: "",
    password: "",
  });

  const startEdit = (u: UserItem) => {
    setEditingId(u.id);
    setEditForm({
      fullName: u.fullName ?? "",
      email: u.email ?? "",
      password: "",
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ fullName: "", email: "", password: "" });
  };
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const payload: any = {
        fullName: editForm.fullName,
        email: editForm.email.trim().toLowerCase(),
      };
      if (editForm.password && editForm.password.length >= 3) {
        payload.password = editForm.password;
      }
      await apiAuth(`/user/users/${editingId}`, "PATCH", payload);
      await loadUsers();
      cancelEdit();
      setMsg("Usuario actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  // ---------- rol ----------
  const changeRole = async (u: UserItem, newRole: Role) => {
    try {
      await apiAuth(`/users/${u.id}/orgs/${orgId}/role`, "PATCH", { role: newRole });
      await loadUsers();
      setMsg("Rol actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  // ---------- archivar ----------
  const softDelete = async (u: UserItem) => {
    try {
      await apiAuth(`/user/users/${u.id}`, "DELETE");
      await loadUsers();
      setMsg("Usuario archivado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------------------------ estilos base ------------------------ */
  const card: any = {
    borderWidth: 1,
    borderColor: "#060404ff",
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

  /* ------------------------ render ------------------------ */
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Condos</Text>
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Usuarios de la empresa</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {Platform.OS === "web" ? (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.currentTarget.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #E5E7EB" as any }}
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
          <PillButton label="Menú principal" onPress={() => router.replace("/(app)/home")} />
        </View>
      </View>

      {/* SCROLL PRINCIPAL */}
      <View style={{ flex: 1, minHeight: 0 }}>
      <FlatList
        style={{ flex: 1 }}                               // 👈 asegura altura
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }} // 👈 espacio final
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

            {/* Crear usuario */}
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
                style={input}
              />
              <TextInput
                placeholder="Password"
                value={newUser.password}
                onChangeText={(v) => setNewUser((u) => ({ ...u, password: v }))}
                secureTextEntry
                style={input}
              />

              {/* Rol permitido según permisos */}
              {Platform.OS === "web" ? (
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser((u) => ({ ...u, role: e.currentTarget.value as Role }))
                  }
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any }}
                >
                  {createRoleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}>
                  <Picker
                    selectedValue={newUser.role}
                    onValueChange={(v) => setNewUser((u) => ({ ...u, role: v as Role }))}
                  >
                    {createRoleOptions.map((r) => (
                      <Picker.Item key={r} label={r} value={r} />
                    ))}
                  </Picker>
                </View>
              )}

              <PillButton
                label="Crear usuario"
                onPress={createUser}
                disabled={!orgId || !newUser.email || !newUser.password || !createRoleOptions.length}
              />
            </View>

            {/* Encabezado listado */}
            <View
              style={{
                ...card,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text style={{ fontWeight: "800" }}>
                Usuarios de {orgs.find((o) => o.orgId === orgId)?.name || orgId || "..."}
              </Text>
              {loading && <ActivityIndicator />}
              <Chip
                label={`Mi rol: ${myRoleInOrg}`}
                tone={myRoleInOrg === "SUPERADMIN" ? "primary" : "secondary"}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: "#777", padding: 12 }}>
            {loading ? "Cargando..." : "Sin usuarios para mostrar."}
          </Text>
        }
        renderItem={({ item: u }) => {
          const isEditing = editingId === u.id;
          const currentRole: Role = roleForOrg(u, orgId);
          const youCanManage = canManage(me, orgId, currentRole);

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
                  <View
                    style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <Text style={{ fontWeight: "800", fontSize: 16 }}>
                      {u.fullName || u.email}
                    </Text>
                    <RoleBadge role={currentRole} />
                  </View>

                  <Text style={{ color: "#475569" }}>{u.email}</Text>

                  {Array.isArray(u.orgs) && u.orgs.length ? (
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                      {u.orgs.map((o) => {
                        const orgName = orgs.find((x) => x.orgId === o.orgId)?.name ?? o.orgId;
                        return (
                          <Chip
                            key={o.orgId}
                            label={`${orgName}: ${String(o.role)}`}
                            tone="secondary"
                          />
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ color: "#64748B" }}>Sin organizaciones</Text>
                  )}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {youCanManage && (
                      <>
                        {/* Cambiar rol en la org actual */}
                        {Platform.OS === "web" ? (
                          <select
                            value={currentRole}
                            onChange={(e) => changeRole(u, e.currentTarget.value as Role)}
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #E5E7EB" as any,
                            }}
                          >
                            {allowedRoleOptionsFor(me, orgId).map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <View
                            style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}
                          >
                            <Picker
                              selectedValue={currentRole}
                              onValueChange={(v) => changeRole(u, String(v) as Role)}
                            >
                              {allowedRoleOptionsFor(me, orgId).map((r) => (
                                <Picker.Item key={r} label={r} value={r} />
                              ))}
                            </Picker>
                          </View>
                        )}

                        <PillButton label="Editar" tone="secondary" onPress={() => startEdit(u)} />
                        <PillButton label="Archivar" tone="danger" onPress={() => softDelete(u)} />
                      </>
                    )}
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
        ListFooterComponent={<View style={{ height: 60 }} />} // 👈 colofón
      />
      </View>
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

function RoleBadge({ role }: { role: Role }) {
  const palette: Record<Role, { bg: string; fg: string }> = {
    SUPERADMIN: { bg: "#FEF2F2", fg: "#991B1B" },
    ADMINISTRADOR: { bg: "#EFF6FF", fg: "#1D4ED8" },
    SUPERVISOR: { bg: "#FFFBEB", fg: "#92400E" },
    OPERATIVO: { bg: "#E6FFED", fg: "#136F3A" },
  };
  const { bg, fg } = palette[role] ?? { bg: "#F1F5F9", fg: "#0F172A" };
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: fg, fontWeight: "800", fontSize: 12 }}>{role}</Text>
    </View>
  );
}

function Chip({
  label,
  tone = "secondary",
}: {
  label: string;
  tone?: "primary" | "secondary" | "warning";
}) {
  const palette = {
    primary: { bg: "#EEF2FF", fg: "#3730A3" },
    secondary: { bg: "#F1F5F9", fg: "#0F172A" },
    warning: { bg: "#FFFBEB", fg: "#92400E" },
  } as const;
  const p = palette[tone];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: p.bg,
      }}
    >
      <Text style={{ color: p.fg, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}