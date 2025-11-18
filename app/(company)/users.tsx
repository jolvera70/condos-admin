// app/(company)/users.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { apiAuth } from "../../lib/api";
import {
  Role,
  allowedRoleOptionsFor,
  highestRoleInOrg
} from "../../lib/rbac";
import { useApp } from "../../lib/store";

/* ================== Tipos ================== */
type OrgOpt = { orgId: string; name: string };
type Status = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type UserItem = {
  id: string;
  email: string;
  fullName?: string;
  roles?: string[];
  orgs?: Array<{ orgId: string; role: Role | string; status?: Status }>;
  status?: Status;
};
const STATUS_OPTS: Status[] = ["ACTIVE", "SUSPENDED"];

/* ================== Breakpoints ================== */
const useBreakpoints = () => {
  const { width } = useWindowDimensions();
  return {
    width,
    isPhone: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
};

/* ================== Select adaptativo ================== */
type Option<T extends string> = { label: string; value: T };
function Select<T extends string>({
  value,
  options,
  onChange,
  minWidth = 160,
  testID,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  minWidth?: number;
  testID?: string;
}) {
  if (Platform.OS === "web") {
    return (
      <select
        data-testid={testID}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as T)}
        style={{
          minWidth,
          padding: 10,
          borderRadius: 12,
          border: "1px solid #E5E7EB" as any,
          background: "#fff",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (Platform.OS === "ios") {
    const current = options.find((o) => o.value === value)?.label ?? String(value);
    return (
      <Pressable
        onPress={() => {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: [...options.map((o) => o.label), "Cancelar"],
              cancelButtonIndex: options.length,
              userInterfaceStyle: "light",
            },
            (idx) => {
              if (idx != null && idx >= 0 && idx < options.length) {
                onChange(options[idx].value);
              }
            }
          );
        }}
        style={{
          minWidth,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ fontWeight: "600", color: "#111827" }}>{current}</Text>
      </Pressable>
    );
  }

  // Android
  return (
    <View
      style={{
        minWidth,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#fff",
        height: 44,
        justifyContent: "center",
      }}
    >
      <Picker
        selectedValue={value}
        onValueChange={(v) => onChange(v as T)}
        mode="dropdown"
        style={{ height: 44, width: "100%" }}
      >
        {options.map((o) => (
          <Picker.Item key={o.value} label={o.label} value={o.value} />
        ))}
      </Picker>
    </View>
  );
}

/* ================== UI helpers ================== */
function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
  size = "md",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "warning" | "danger";
  size?: "sm" | "md";
  style?: any;
}) {
  const palette = {
    primary: { bg: "#2563EB", fg: "#fff" },
    secondary: { bg: "#F1F5F9", fg: "#0F172A" },
    warning: { bg: "#F59E0B", fg: "#fff" },
    danger: { bg: "#EF4444", fg: "#fff" },
  } as const;
  const p = palette[tone];
  const pv = size === "sm" ? 8 : 10;
  const ph = size === "sm" ? 12 : 14;
  const fs = size === "sm" ? 12 : 14;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          backgroundColor: p.bg,
          borderRadius: 999,
          paddingVertical: pv,
          paddingHorizontal: ph,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: p.fg, fontWeight: "800", fontSize: fs }}>{label.toUpperCase()}</Text>
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

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "ACTIVE").toUpperCase();
  const map = {
    ACTIVE: { bg: "#DCFCE7", fg: "#065F46", label: "ACTIVO" },
    SUSPENDED: { bg: "#F3F4F6", fg: "#374151", label: "SUSPENDIDO" },
    ARCHIVED: { bg: "#FEE2E2", fg: "#991B1B", label: "ARCHIVADO" },
  } as const;
  const { bg, fg, label } = map[s as keyof typeof map] ?? map.ACTIVE;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
      <Text style={{ color: fg, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F1F5F9" }}>
      <Text style={{ color: "#0F172A", fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

/* ================== Pantalla ================== */
export default function UsersCompany() {
  const router = useRouter();
  const { me, logout } = useApp();
  const { width, isPhone, isTablet, isDesktop } = useBreakpoints();

  const maxW = isDesktop ? 1100 : isTablet ? 880 : width;
  const gutter = isTablet || isDesktop ? 16 : 10;
  const numColumns = isTablet || isDesktop ? 2 : 1;

  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [orgId, setOrgId] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  /* ------- cargar tenants ------- */
  async function fetchTenantsByIds(ids: string[]) {
    if (!ids.length) return [];
    try {
      const res = await apiAuth(`/tenant/lookup?ids=${encodeURIComponent(ids.join(","))}`, "GET");
      const list = Array.isArray(res) ? res : res?.content ?? [];
      return list.map((t: any) => ({
        orgId: String(t.id ?? t.orgId),
        name: String(t.name ?? t.slug ?? t.id),
      })) as OrgOpt[];
    } catch {
      return [];
    }
  }

  const loadOrgs = async () => {
    setMsg("");
    if (!me) return;

    const isSA =
      (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
      (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"));

    try {
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

  /* ------- cargar usuarios ------- */
  const loadUsers = async () => {
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
  };
  useEffect(() => {
    loadUsers();
  }, [orgId]);

  /* ------- helpers rol/estado ------- */
  const myRoleInOrg = useMemo<Role>(() => highestRoleInOrg(me, orgId), [me, orgId]);
  const createRoleOptions = useMemo<Role[]>(
    () => allowedRoleOptionsFor(me, orgId),
    [me, orgId]
  );
  const roleForOrg = (u: UserItem, org: string): Role => {
    const found = u.orgs?.find((o) => o.orgId === org)?.role;
    const r = (Array.isArray(u.roles) && u.roles.length ? u.roles[0] : found) as string | undefined;
    if (r === "SUPERADMIN" || r === "ADMINISTRADOR" || r === "SUPERVISOR" || r === "OPERATIVO")
      return r as Role;
    return "OPERATIVO";
  };
  const statusForOrg = (u: UserItem, org: string): Status =>
    (u.orgs?.find((o) => o.orgId === org)?.status as Status) ?? "ACTIVE";

  /* ------- crear usuario ------- */
  const [newUser, setNewUser] = useState<{ fullName: string; email: string; password: string; role: Role }>({
    fullName: "",
    email: "",
    password: "",
    role: "OPERATIVO",
  });
  const [showCreate, setShowCreate] = useState(false);

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
        status: "ACTIVE" as Status,
        provisionAccount: true,
        tempPassword: newUser.password,
      };
      await apiAuth("/user/users", "POST", body);
      setNewUser({ fullName: "", email: "", password: "", role: createRoleOptions[0] ?? "OPERATIVO" });
      await loadUsers();
      setShowCreate(false); // cerrar formulario al crear
      setMsg("Usuario creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------- edición ------- */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ fullName: string; email: string; password?: string }>({
    fullName: "",
    email: "",
    password: "",
  });
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
      const payload: any = { fullName: editForm.fullName, email: editForm.email.trim().toLowerCase() };
      if (editForm.password && editForm.password.length >= 3) payload.password = editForm.password;
      await apiAuth(`/user/users/${editingId}`, "PUT", payload);
      await loadUsers();
      cancelEdit();
      setMsg("Usuario actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------- cambios rol/estado ------- */
  const changeStatus = async (u: UserItem, newStatus: Status) => {
    try {
      await apiAuth(`/user/users/${u.id}/orgs/${orgId}/status`, "PATCH", { status: newStatus });
      await loadUsers();
      setMsg("Status actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };
  const changeRole = async (u: UserItem, newRole: Role) => {
    try {
      await apiAuth(`/user/users/${u.id}/orgs/${orgId}/role`, "PATCH", { role: newRole });
      await loadUsers();
      setMsg("Rol actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };
  const softDelete = async (u: UserItem) => {
    try {
      await apiAuth(`/user/users/${u.id}`, "DELETE");
      await loadUsers();
      setMsg("Usuario archivado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------- estilos ------- */
  const cardBase = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  } as const;

  const input = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "android" ? 8 : 12,
    minHeight: 44,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  } as const;

  /* ------- grid ------- */
  const cardWidth = useMemo(() => {
    if (numColumns === 1) return maxW - 32; // 16 + 16 padding contenedor
    const totalGutters = gutter * (numColumns - 1);
    return (maxW - 32 - totalGutters) / numColumns;
  }, [maxW, numColumns, gutter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <View style={{ flex: 1, alignItems: "center" }}>
        <View style={{ width: maxW, flex: 1 }}>
          {/* Top bar */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: isPhone ? 10 : 12,
              borderBottomWidth: 1,
              borderColor: "#ECECEC",
              backgroundColor: "#FFFFFF",
              flexDirection: isPhone ? "column" : "row",
              alignItems: isPhone ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: isPhone ? 10 : 8,
              ...(Platform.OS === "web" ? { position: "sticky" as any, top: 0, zIndex: 50 } : {}),
            }}
          >
            <Text style={{ fontSize: isTablet || isDesktop ? 20 : 18, fontWeight: "800" }}>Condos Admin</Text>
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
                    maxWidth: 280,
                  }}
                  numberOfLines={1}
                >
                  {me.email}
                </Text>
              )}
              <PillButton label="Salir" tone="danger" size="sm" onPress={logout} />
            </View>
          </View>

          {/* Sub header */}
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
              <Select
                value={orgId as any}
                onChange={(v) => setOrgId(String(v))}
                options={orgs.map((t) => ({ label: t.name, value: t.orgId as any }))}
                minWidth={200}
                testID="org-select"
              />
              <PillButton
                label={showCreate ? "OCULTAR" : "CREAR USUARIO"}
                tone={showCreate ? "secondary" : "primary"}
                onPress={() => setShowCreate((v) => !v)}
              />
              <PillButton label="Menú principal" onPress={() => router.replace("/(app)/home")} />
            </View>
          </View>

          {/* Lista */}
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? { gap: gutter } : undefined}
            contentContainerStyle={{ padding: 16, paddingBottom: 80, gap: 12 }}
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

                {/* Crear usuario (oculto/visible con toggle) */}
                {showCreate && (
                  <View style={[cardBase, { gap: 10 }]}>
                    <Text style={{ fontWeight: "800", fontSize: 16 }}>Crear nuevo usuario</Text>
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
                      autoCorrect={false}
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
                    <Select
                      value={newUser.role}
                      onChange={(v) => setNewUser((u) => ({ ...u, role: v }))}
                      options={allowedRoleOptionsFor(me, orgId).map((r) => ({ label: r, value: r }))}
                      minWidth={200}
                    />
                    <PillButton
                      label="Crear usuario"
                      onPress={createUser}
                      disabled={!orgId || !newUser.email || !newUser.password}
                    />
                  </View>
                )}

                {/* Encabezado listado */}
                <View style={[cardBase, { padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                  <Text style={{ fontWeight: "800" }}>
                    Usuarios de {orgs.find((o) => o.orgId === orgId)?.name || orgId || "..."}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    {loading && <ActivityIndicator />}
                    <Chip label={`Mi rol: ${myRoleInOrg}`} />
                  </View>
                </View>
              </View>
            }
            renderItem={({ item: u }) => {
              const isEditing = editingId === u.id;
              const role = roleForOrg(u, orgId);
              const status = statusForOrg(u, orgId);

              return (
                <View style={[cardBase, { width: cardWidth }]}>
                  {!isEditing ? (
                    <>
                      <View style={{ gap: 2, marginBottom: 6 }}>
                        <Text style={{ fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
                          {u.fullName || u.email}
                        </Text>
                        <Text style={{ color: "#64748B" }} numberOfLines={1}>
                          {u.email}
                        </Text>
                      </View>

                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <RoleBadge role={role} />
                        <StatusBadge status={status} />
                      </View>

                      {/* Rol */}
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <Text style={{ fontWeight: "600" }}>Rol:</Text>
                        <Select
                          value={role}
                          onChange={(v) => changeRole(u, v as Role)}
                          options={allowedRoleOptionsFor(me, orgId).map((r) => ({ label: r, value: r }))}
                          minWidth={200}
                        />
                      </View>

                      {/* Status */}
                      {status !== "ARCHIVED" && (
                        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 }}>
                          <Text style={{ fontWeight: "600" }}>Status:</Text>
                          <Select
                            value={status}
                            onChange={(v) => changeStatus(u, v as Status)}
                            options={STATUS_OPTS.map((s) => ({ label: s, value: s }))}
                            minWidth={200}
                          />
                        </View>
                      )}

                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PillButton label="Editar" tone="secondary" onPress={() => startEdit(u)} />
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
                        autoCorrect={false}
                        keyboardType="email-address"
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
            ListFooterComponent={<View style={{ height: 40 }} />}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}