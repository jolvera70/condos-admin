// app/(app)/users.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";

/* ======================= Tipos ======================= */
type OrgOpt = { orgId: string; name: string };
type UserItem = {
  id: string;
  email: string;
  fullName?: string;
  roles?: string[];
  orgs?: Array<{ orgId: string; role: string; status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED" }>;
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

const ROLE_OPTS = ["ADMINISTRADOR", "SUPERVISOR", "OPERATIVO"] as const;
const STATUS_OPTS = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;

/* ======================= Utils ======================= */
const normalizeRole = (r?: string) => {
  const R = (r ?? "").toUpperCase();
  return (["ADMINISTRADOR", "SUPERVISOR", "OPERATIVO"] as const).includes(R as any) ? R : "OPERATIVO";
};
const normalizeStatus = (s?: string) => {
  const S = (s ?? "").toUpperCase();
  return (["ACTIVE", "SUSPENDED", "ARCHIVED"] as const).includes(S as any) ? S : "ACTIVE";
};

/* ======================= Combo (móvil) ======================= */
/**
 * Unifica el comportamiento de selectores en móvil:
 * - iOS: "input" que abre ActionSheet
 * - Android: Picker dropdown nativo
 */
function Combo({
  value,
  onChange,
  items,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  items: Array<{ label: string; value: string }>;
  style?: any;
}) {
  if (Platform.OS === "android") {
    return (
      <View
        style={[
          {
            borderWidth: 1,
            borderRadius: 10,
            borderColor: "#E5E7EB",
            minHeight: 44,
            justifyContent: "center",
            backgroundColor: "#fff",
            overflow: "hidden",
          },
          style,
        ]}
      >
        <Picker
          selectedValue={value}
          onValueChange={(v) => onChange(String(v))}
          style={{ height: 44, width: "100%" }}
          itemStyle={{ fontSize: 14 }}
          mode="dropdown"
        >
          {items.map((it) => (
            <Picker.Item key={it.value} label={it.label} value={it.value} />
          ))}
        </Picker>
      </View>
    );
  }

  // iOS – ActionSheet
  const current = items.find((i) => i.value === value)?.label ?? "Seleccionar…";
  return (
    <Pressable
      onPress={() => {
        const options = [...items.map((i) => i.label), "Cancelar"];
        ActionSheetIOS.showActionSheetWithOptions(
          { options, cancelButtonIndex: options.length - 1 },
          (idx) => {
            if (idx != null && idx >= 0 && idx < items.length) {
              onChange(items[idx].value);
            }
          }
        );
      }}
      style={[
        {
          borderWidth: 1,
          borderRadius: 10,
          borderColor: "#E5E7EB",
          minHeight: 44,
          paddingHorizontal: 12,
          justifyContent: "center",
          backgroundColor: "#fff",
        },
        style,
      ]}
    >
      <Text style={{ color: "#0F172A", fontSize: 14 }}>{current}</Text>
    </Pressable>
  );
}

/* ======================= Pantalla ======================= */
export default function Users() {
  const router = useRouter();
  const { me, logout } = useApp();
  const { width } = useWindowDimensions();

  // 2 columnas en iPad/desktop
  const twoCols = width >= 820;

  const [orgs, setOrgs] = useState<OrgOpt[]>([]);
  const [orgId, setOrgId] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "ADMINISTRADOR" as (typeof ROLE_OPTS)[number],
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ fullName: string; email: string; password?: string }>({
    fullName: "",
    email: "",
    password: "",
  });

  const myRoleInOrg = useMemo(() => {
    if (!me || !orgId) return "";
    const found = (me.orgs ?? []).find((o: any) => o.orgId === orgId);
    return (found?.role || (me.roles ?? [])[0] || "").toString().toUpperCase();
  }, [me, orgId]);

  const isValidNew = useMemo(
    () =>
      !!orgId &&
      /^\S+@\S+\.\S+$/.test(newUser.email.trim()) &&
      newUser.password.trim().length >= 3 &&
      newUser.fullName.trim().length > 0,
    [orgId, newUser]
  );

  const roleForOrg = (u: UserItem, org: string): string => {
    if (Array.isArray(u.roles) && u.roles.length) return u.roles.join(", ");
    return u.orgs?.find((o) => o.orgId === org)?.role ?? "OPERATIVO";
  };
  const statusForOrg = (u: UserItem, org: string) =>
    (u.orgs?.find((o) => o.orgId === org)?.status ?? "ACTIVE") as (typeof STATUS_OPTS)[number];

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
        status: "ACTIVE",
        provisionAccount: true,
        tempPassword: newUser.password.trim(),
      };
      await apiAuth("/user/users", "POST", body);
      setNewUser({ fullName: "", email: "", password: "", role: "ADMINISTRADOR" });
      await loadUsers();
      setShowCreate(false);
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
    const oldUser = users.find((u) => u.id === editingId);
    const oldEmail = (oldUser?.email ?? "").toLowerCase();

    const newFullName = editForm.fullName.trim();
    const newEmail = editForm.email.trim().toLowerCase();
    const newPassword = editForm.password?.trim();

    // 1) Actualizar perfil en user-api (nombre + email)
    await apiAuth(`/user/users/${editingId}`, "PUT", {
      fullName: newFullName,
      email: newEmail,
    });

    // 2) Si cambió el email, actualizar también en auth-api
    if (newEmail && newEmail !== oldEmail) {
      await apiAuth(`/auth/users/${editingId}/email`, "PATCH", {
        newEmail,
      });
    }

    // 3) Si vino password nuevo, actualizar en auth-api
    if (newPassword && newPassword.length >= 3) {
      await apiAuth(`/auth/users/${editingId}/password`, "PATCH", {
        newPassword,
      });
    }

    await loadUsers();
    cancelEdit();
    setMsg("Usuario actualizado ✅");
  } catch (e: any) {
    setMsg(e.message ?? String(e));
  }
};

  const changeRole = async (u: UserItem, newRole: string) => {
    try {
      await apiAuth(`/user/users/${u.id}/orgs/${orgId}/role`, "PATCH", { role: newRole });
      await loadUsers();
      setMsg("Rol actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (u: UserItem, newStatus: (typeof STATUS_OPTS)[number]) => {
    try {
      await apiAuth(`/user/users/${u.id}/orgs/${orgId}/status`, "PATCH", { status: newStatus });
      await loadUsers();
      setMsg("Status actualizado ✅");
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

  /* ------------------------ estilos ------------------------ */
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
          <PillButton label="MENÚ PRINCIPAL" tone="secondary" onPress={() => router.replace("/(app)/home")} />
          <PillButton label="SALIR" tone="danger" size="sm" onPress={logout} />
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
        {!!myRoleInOrg && (
          <Text
            style={{
              color: "#111827",
              backgroundColor: "#EEF2FF",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: "800",
            }}
          >
            Mi rol: {myRoleInOrg}
          </Text>
        )}
        <PillButton label="RECARGAR" tone="secondary" onPress={loadUsers} />
      </View>

      {/* LISTA */}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        data={users}
        keyExtractor={(u) => u.id}
        refreshing={loading}
        onRefresh={loadUsers}
        extraData={twoCols}
        numColumns={twoCols ? 2 : 1}
        columnWrapperStyle={twoCols ? { gap: 16 } : undefined}
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

            {/* Empresa + Crear */}
            <View style={{ ...card, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text style={{ fontWeight: "800" }}>Empresa</Text>

                {Platform.OS === "web" ? (
                  <select
                    value={orgId}
                    onChange={(e) => setOrgId(e.currentTarget.value)}
                    style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any, minWidth: 220 }}
                  >
                    {orgs.map((t) => (
                      <option key={t.orgId} value={t.orgId}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Combo
                    value={orgId}
                    onChange={setOrgId}
                    items={orgs.map((t) => ({ label: `${t.name}`, value: t.orgId }))}
                    style={{ flex: 1 }}
                  />
                )}

                <View style={{ marginLeft: "auto" }}>
                  <PillButton
                    label={showCreate ? "OCULTAR" : "CREAR USUARIO"}
                    onPress={() => setShowCreate((v) => !v)}
                  />
                </View>
              </View>

              {showCreate && (
                <View style={{ gap: 8 }}>
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
                    placeholder="Password temporal"
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
                    <Combo
                      value={newUser.role}
                      onChange={(v) => setNewUser((u) => ({ ...u, role: v as any }))}
                      items={ROLE_OPTS.map((r) => ({ label: r, value: r }))}
                    />
                  )}

                  <PillButton label="CREAR" onPress={createUser} disabled={!isValidNew} />
                </View>
              )}
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
          const currentRole = normalizeRole(roleForOrg(u, orgId));
          const currentStatus = normalizeStatus(statusForOrg(u, orgId));

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
                flexBasis: twoCols ? "48%" : "100%",
                maxWidth: twoCols ? "48%" : "100%",
              }}
            >
              {!isEditing ? (
                <>
                  {/* cabecera nombre/email */}
                  <View style={{ gap: 2 }}>
                    <Text style={{ fontWeight: "800", fontSize: 16 }}>{u.fullName || u.email}</Text>
                    <Text style={{ color: "#64748B" }}>{u.email}</Text>
                  </View>

                  {/* badges + acciones */}
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        <RoleBadge role={currentRole} />
                        <StatusBadge status={currentStatus} />
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <IconButton label="✏️" onPress={() => startEdit(u)} />
                        <IconButton label="🗑️" tone="danger" onPress={() => softDelete(u)} />
                      </View>
                    </View>

                    {/* selector de rol */}
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <Text style={{ fontWeight: "600" }}>Rol:</Text>
                      {Platform.OS === "web" ? (
                        <select
                          value={currentRole}
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
                        <Combo
                          value={currentRole}
                          onChange={(v) => changeRole(u, v)}
                          items={ROLE_OPTS.map((r) => ({ label: r, value: r }))}
                          style={{ flex: 1 }}
                        />
                      )}
                    </View>

                    {/* selector de status */}
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <Text style={{ fontWeight: "600" }}>Status:</Text>
                      {Platform.OS === "web" ? (
                        <select
                          value={currentStatus}
                          onChange={(e) => changeStatus(u, e.currentTarget.value as any)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #E5E7EB" as any }}
                        >
                          {STATUS_OPTS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Combo
                          value={currentStatus}
                          onChange={(v) => changeStatus(u, v as any)}
                          items={STATUS_OPTS.map((s) => ({ label: s, value: s }))}
                          style={{ flex: 1 }}
                        />
                      )}
                    </View>

                    {/* botón editar “company-like” */}
                    <View style={{ marginTop: 6 }}>
                      <PillButton label="EDITAR" tone="secondary" onPress={() => startEdit(u)} />
                    </View>
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
                    <PillButton label="GUARDAR" onPress={saveEdit} />
                    <PillButton label="CANCELAR" tone="secondary" onPress={cancelEdit} />
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
    primary: { bg: "#2563EB", bg2: "#1D4ED8", fg: "#fff" },
    secondary: { bg: "#F1F5F9", bg2: "#E2E8F0", fg: "#0F172A" },
    warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#fff" },
    danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#fff" },
  }[tone];

  const padV = size === "sm" ? 8 : 10;
  const padH = size === "sm" ? 12 : 14;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: padH,
        paddingVertical: padV,
        borderRadius: 999,
        backgroundColor: disabled ? "#CBD5E1" : pressed ? palette.bg2 : palette.bg,
        ...(style || {}),
      })}
    >
      <Text style={{ color: palette.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
    </Pressable>
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

function RoleBadge({ role }: { role?: string }) {
  const r = (role ?? "OPERATIVO").toUpperCase();
  const map = {
    ADMINISTRADOR: { bg: "#DBEAFE", fg: "#1E40AF" },
    SUPERVISOR: { bg: "#FEF3C7", fg: "#92400E" },
    OPERATIVO: { bg: "#DCFCE7", fg: "#065F46" },
  } as const;
  const { bg, fg } = map[r as keyof typeof map] ?? map.OPERATIVO;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
      <Text style={{ color: fg, fontWeight: "800" }}>{r}</Text>
    </View>
  );
}

function IconButton({
  label,
  onPress,
  tone = "neutral",
}: {
  label: string;
  onPress: () => void;
  tone?: "neutral" | "danger";
}) {
  const palette =
    tone === "danger"
      ? { bg: "#FEE2E2", bg2: "#FCA5A5", fg: "#991B1B" }
      : { bg: "#F1F5F9", bg2: "#E2E8F0", fg: "#0F172A" };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: pressed ? palette.bg2 : palette.bg,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text style={{ color: palette.fg, fontSize: 16, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}