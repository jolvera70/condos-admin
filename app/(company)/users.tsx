// app/(company)/users.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { apiAuth } from "../../lib/api";
import {
  Role,
  allowedRoleOptionsFor,
  highestRoleInOrg,
} from "../../lib/rbac";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

/* ================== Tema Condos / Lokaly ================== */
const ui = {
  bg: "#020617",
  bgSoft: "#030712",
  surface: "#020617",
  surfaceAlt: "#020617",
  card: "#020617",
  border: "#1F2937",
  borderSoft: "#111827",
  primary: "#F4C15D",
  primarySoft: "rgba(244,193,93,0.12)",
  text: "#E5E7EB",
  textMuted: "#94A3B8",
  danger: "#F87171",
};

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

type StatusFilter = "ALL" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

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
  disabled = false,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  minWidth?: number;
  testID?: string;
  disabled?: boolean;
}) {
  if (Platform.OS === "web") {
    return (
      <select
        disabled={disabled}
        data-testid={testID}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as T)}
        style={{
          minWidth,
          padding: 10,
          borderRadius: 999,
          border: `1px solid ${ui.border}` as any,
          background: disabled ? "#020617" : ui.bgSoft,
          color: disabled ? ui.textMuted : ui.text,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 13,
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
    const current =
      options.find((o) => o.value === value)?.label ?? String(value);
    return (
      <Pressable
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: [...options.map((o) => o.label), "Cancelar"],
              cancelButtonIndex: options.length,
              userInterfaceStyle: "dark",
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
          borderColor: ui.border,
          borderRadius: 999,
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: disabled ? "#020617" : ui.bgSoft,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Text style={{ fontWeight: "600", color: ui.text }}>{current}</Text>
      </Pressable>
    );
  }

  // Android
  return (
    <View
      style={{
        minWidth,
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 999,
        overflow: "hidden",
        backgroundColor: disabled ? "#020617" : ui.bgSoft,
        height: 44,
        justifyContent: "center",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Picker
        enabled={!disabled}
        selectedValue={value}
        onValueChange={(v) => onChange(v as T)}
        mode="dropdown"
        style={{ height: 44, width: "100%", color: ui.text }}
        dropdownIconColor={ui.text}
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
    primary: { bg: "#1D4ED8", fg: "#F9FAFB" },
    secondary: { bg: ui.bgSoft, fg: ui.text },
    warning: { bg: "#F59E0B", fg: "#111827" },
    danger: { bg: "#B91C1C", fg: "#F9FAFB" },
  } as const;
  const p = palette[tone];
  const pv = size === "sm" ? 7 : 9;
  const ph = size === "sm" ? 12 : 14;
  const fs = size === "sm" ? 11 : 13;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderRadius: 999,
          paddingVertical: pv,
          paddingHorizontal: ph,
        },
        style,
      ]}
    >
      <Text style={{ color: p.fg, fontWeight: "700", fontSize: fs }}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const palette: Record<Role, { bg: string; fg: string }> = {
    SUPERADMIN: { bg: "rgba(248,113,113,0.16)", fg: "#FCA5A5" },
    ADMINISTRADOR: { bg: "rgba(96,165,250,0.18)", fg: "#BFDBFE" },
    SUPERVISOR: { bg: "rgba(250,204,21,0.18)", fg: "#FACC15" },
    OPERATIVO: { bg: "rgba(45,212,191,0.16)", fg: "#6EE7B7" },
  };
  const { bg, fg } = palette[role] ?? { bg: ui.bgSoft, fg: ui.text };
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: 11 }}>
        {role}
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "ACTIVE").toUpperCase();
  const map = {
    ACTIVE: { bg: "rgba(34,197,94,0.18)", fg: "#BBF7D0", label: "ACTIVO" },
    SUSPENDED: {
      bg: "rgba(148,163,184,0.18)",
      fg: "#E5E7EB",
      label: "SUSPENDIDO",
    },
    ARCHIVED: {
      bg: "rgba(248,113,113,0.16)",
      fg: "#FCA5A5",
      label: "ARCHIVADO",
    },
  } as const;
  const { bg, fg, label } = map[s as keyof typeof map] ?? map.ACTIVE;
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: ui.bgSoft,
        borderWidth: 1,
        borderColor: ui.borderSoft,
      }}
    >
      <Text style={{ color: ui.textMuted, fontWeight: "600", fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 90,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: ui.border,
        backgroundColor: ui.bgSoft,
      }}
    >
      <Text
        style={{
          color: ui.textMuted,
          fontSize: 11,
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          color: ui.text,
          fontWeight: "800",
          fontSize: 18,
        }}
      >
        {value}
      </Text>
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

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  /* ------- cargar tenants ------- */
  async function fetchTenantsByIds(ids: string[]) {
    if (!ids.length) return [];
    try {
      const res = await apiAuth(
        `/tenant/lookup?ids=${encodeURIComponent(ids.join(","))}`,
        "GET"
      );
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
      (Array.isArray(me.orgs) &&
        me.orgs.some((o: any) => o.role === "SUPERADMIN"));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  /* ------- cargar usuarios ------- */
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

  /* ------- helpers rol/estado ------- */
  const myRoleInOrg = useMemo<Role>(
    () => highestRoleInOrg(me, orgId),
    [me, orgId]
  );
  const createRoleOptions = useMemo<Role[]>(
    () => allowedRoleOptionsFor(me, orgId),
    [me, orgId]
  );
  const canManageUsers =
    myRoleInOrg === "SUPERADMIN" || myRoleInOrg === "ADMINISTRADOR";
  const roleForOrg = (u: UserItem, org: string): Role => {
    const found = u.orgs?.find((o) => o.orgId === org)?.role;
    const r = (Array.isArray(u.roles) && u.roles.length
      ? u.roles[0]
      : found) as string | undefined;
    if (
      r === "SUPERADMIN" ||
      r === "ADMINISTRADOR" ||
      r === "SUPERVISOR" ||
      r === "OPERATIVO"
    )
      return r as Role;
    return "OPERATIVO";
  };
  const statusForOrg = (u: UserItem, org: string): Status =>
    (u.orgs?.find((o) => o.orgId === org)?.status as Status) ?? "ACTIVE";

  /* ------- crear usuario ------- */
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
      setNewUser({
        fullName: "",
        email: "",
        password: "",
        role: createRoleOptions[0] ?? "OPERATIVO",
      });
      await loadUsers();
      setShowCreate(false);
      setMsg("Usuario creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------- edición ------- */
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
      const oldUser = users.find((u) => u.id === editingId);
      const oldEmail = (oldUser?.email ?? "").toLowerCase();

      const newFullName = editForm.fullName.trim();
      const newEmail = editForm.email.trim().toLowerCase();
      const newPassword = editForm.password?.trim();

      // 1) Actualizar perfil en user-api
      await apiAuth(`/user/users/${editingId}`, "PUT", {
        fullName: newFullName,
        email: newEmail,
      });

      // 2) Email en auth-api si cambió
      if (newEmail && newEmail !== oldEmail) {
        await apiAuth(`/auth/users/${editingId}/email`, "PATCH", {
          newEmail,
        });
      }

      // 3) Password en auth-api si viene nuevo
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

  /* ------- cambios rol/estado ------- */
  const changeStatus = async (u: UserItem, newStatus: Status) => {
    try {
      await apiAuth(
        `/user/users/${u.id}/orgs/${orgId}/status`,
        "PATCH",
        { status: newStatus }
      );
      await loadUsers();
      setMsg("Status actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };
  const changeRole = async (u: UserItem, newRole: Role) => {
    try {
      await apiAuth(
        `/user/users/${u.id}/orgs/${orgId}/role`,
        "PATCH",
        { role: newRole }
      );
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

  /* ------- métricas y filtros en memoria ------- */
  const totalUsers = users.length;
  const activeCount = users.filter(
    (u) => statusForOrg(u, orgId) === "ACTIVE"
  ).length;
  const suspendedCount = users.filter(
    (u) => statusForOrg(u, orgId) === "SUSPENDED"
  ).length;

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      const status = statusForOrg(u, orgId);

      if (statusFilter !== "ALL" && status !== statusFilter) {
        return false;
      }

      if (!term) return true;

      const name = (u.fullName ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();

      return (
        name.includes(term) ||
        email.includes(term)
      );
    });
  }, [users, orgId, search, statusFilter]);

  /* ------- estilos ------- */
  const cardBase = {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    backgroundColor: ui.card,
    padding: 14,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 18px 40px rgba(15,23,42,0.75)",
        }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 4,
        }),
  } as const;

  const input = {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "android" ? 8 : 11,
    minHeight: 44,
    fontSize: 14,
    backgroundColor: ui.bgSoft,
    color: ui.text,
  } as const;

  /* ------- grid ------- */
  const cardWidth = useMemo(() => {
    if (numColumns === 1) return maxW - 32;
    const totalGutters = gutter * (numColumns - 1);
    return (maxW - 32 - totalGutters) / numColumns;
  }, [maxW, numColumns, gutter]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
      <View style={{ flex: 1, alignItems: "center", backgroundColor: ui.bg }}>
        <View style={{ width: maxW, flex: 1 }}>
          {/* Top bar */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: isPhone ? 10 : 12,
              borderBottomWidth: 1,
              borderColor: ui.border,
              backgroundColor: ui.bgSoft,
              flexDirection: isPhone ? "column" : "row",
              alignItems: isPhone ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: isPhone ? 10 : 8,
              ...(Platform.OS === "web"
                ? { position: "sticky" as any, top: 0, zIndex: 50 }
                : {}),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
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
              <View>
                <Text
                  style={{
                    fontSize: isTablet || isDesktop ? 18 : 17,
                    fontWeight: "800",
                    color: ui.primary,
                  }}
                >
                  Condos Admin
                </Text>
                <Text style={{ fontSize: 11, color: ui.textMuted }}>
                  Gestión de usuarios
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
              }}
            >
              {!!me?.email && (
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: ui.border,
                    backgroundColor: ui.bg,
                    maxWidth: 260,
                  }}
                >
                  <Text
                    style={{
                      color: ui.text,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                    numberOfLines={1}
                  >
                    {me.email}
                  </Text>
                </View>
              )}
              <PillButton
                label="Salir"
                tone="danger"
                size="sm"
                onPress={logout}
              />
            </View>
          </View>

          {/* Sub header con métricas y filtros */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: ui.border,
              backgroundColor: ui.bgSoft,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "800",
                    color: ui.text,
                  }}
                >
                  Usuarios de la empresa
                </Text>
                <Text style={{ fontSize: 12, color: ui.textMuted }}>
                  Administra accesos y permisos por organización.
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Select
                  value={orgId as any}
                  onChange={(v) => setOrgId(String(v))}
                  options={orgs.map((t) => ({
                    label: t.name,
                    value: t.orgId as any,
                  }))}
                  minWidth={200}
                  testID="org-select"
                />
                <PillButton
                  label="Menú principal"
                  size="sm"
                  tone="secondary"
                  onPress={() => router.replace("/(app)/home")}
                />
              </View>
            </View>

            {/* Métricas */}
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <MetricCard label="Total usuarios" value={totalUsers} />
              <MetricCard label="Activos" value={activeCount} />
              <MetricCard label="Suspendidos" value={suspendedCount} />
            </View>

            {/* Buscador + filtro de estado + crear */}
            <View
              style={{
                flexDirection: isPhone ? "column" : "row",
                gap: 10,
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <TextInput
                  placeholder="Buscar por nombre o email..."
                  placeholderTextColor={ui.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  style={input}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {/* Segmented control de estado */}
                <View
                  style={{
                    flexDirection: "row",
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: ui.border,
                    overflow: "hidden",
                  }}
                >
                  {(["ALL", "ACTIVE", "SUSPENDED"] as StatusFilter[]).map(
                    (key) => {
                      const isActive = statusFilter === key;
                      const labels: Record<StatusFilter, string> = {
                        ALL: "Todos",
                        ACTIVE: "Activos",
                        SUSPENDED: "Suspendidos",
                        ARCHIVED: "Archivados",
                      };
                      return (
                        <Pressable
                          key={key}
                          onPress={() => setStatusFilter(key)}
                          style={({ pressed }) => ({
                            paddingVertical: 7,
                            paddingHorizontal: 12,
                            backgroundColor: isActive
                              ? ui.primarySoft
                              : ui.bgSoft,
                            opacity: pressed ? 0.8 : 1,
                          })}
                        >
                          <Text
                            style={{
                              color: isActive ? ui.primary : ui.textMuted,
                              fontSize: 11,
                              fontWeight: "700",
                            }}
                          >
                            {labels[key].toUpperCase()}
                          </Text>
                        </Pressable>
                      );
                    }
                  )}
                </View>

                {canManageUsers && (
                  <PillButton
                    label={showCreate ? "Ocultar" : "Crear usuario"}
                    tone={showCreate ? "secondary" : "primary"}
                    size="sm"
                    onPress={() => setShowCreate((v) => !v)}
                  />
                )}
              </View>
            </View>
          </View>

          {/* Lista */}
          <FlatList
            data={filteredUsers}
            keyExtractor={(u) => u.id}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? { gap: gutter } : undefined}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 80,
              gap: 12,
              backgroundColor: ui.bg,
            }}
            refreshing={loading}
            onRefresh={loadUsers}
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                {!!msg && (
                  <View
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: msg.includes("✅")
                        ? "rgba(37,99,235,0.16)"
                        : "rgba(248,113,113,0.12)",
                      borderWidth: 1,
                      borderColor: msg.includes("✅")
                        ? "#2563EB"
                        : "#F87171",
                    }}
                  >
                    <Text
                      style={{
                        color: msg.includes("✅") ? "#BFDBFE" : "#FCA5A5",
                      }}
                    >
                      {msg}
                    </Text>
                  </View>
                )}

                {/* Crear usuario */}
                {showCreate && (
                  <View style={[cardBase, { gap: 10 }]}>
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 16,
                        color: ui.text,
                      }}
                    >
                      Crear nuevo usuario
                    </Text>
                    <TextInput
                      placeholder="Nombre"
                      placeholderTextColor={ui.textMuted}
                      value={newUser.fullName}
                      onChangeText={(v) =>
                        setNewUser((u) => ({ ...u, fullName: v }))
                      }
                      style={input}
                    />
                    <TextInput
                      placeholder="Email"
                      placeholderTextColor={ui.textMuted}
                      value={newUser.email}
                      onChangeText={(v) =>
                        setNewUser((u) => ({ ...u, email: v }))
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      style={input}
                    />
                    <TextInput
                      placeholder="Password temporal"
                      placeholderTextColor={ui.textMuted}
                      value={newUser.password}
                      onChangeText={(v) =>
                        setNewUser((u) => ({ ...u, password: v }))
                      }
                      secureTextEntry
                      style={input}
                    />
                    <Select
                      value={newUser.role}
                      onChange={(v) =>
                        setNewUser((u) => ({ ...u, role: v }))
                      }
                      options={allowedRoleOptionsFor(me, orgId).map((r) => ({
                        label: r,
                        value: r,
                      }))}
                      minWidth={200}
                    />
                    <PillButton
                      label="Crear usuario"
                      onPress={createUser}
                      disabled={
                        !orgId ||
                        !newUser.email ||
                        !newUser.password ||
                        !newUser.fullName
                      }
                    />
                  </View>
                )}

                {/* Encabezado listado */}
                <View
                  style={[
                    cardBase,
                    {
                      padding: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    },
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontWeight: "800", color: ui.text }}>
                      Usuarios de{" "}
                      {orgs.find((o) => o.orgId === orgId)?.name ||
                        orgId ||
                        "..."}
                    </Text>
                    <Text
                      style={{
                        color: ui.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {filteredUsers.length} resultado
                      {filteredUsers.length === 1 ? "" : "s"}
                      {search.trim()
                        ? ` para "${search.trim()}"`
                        : ""}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    {loading && <ActivityIndicator color={ui.primary} />}
                    <Chip label={`Mi rol: ${myRoleInOrg}`} />
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              !loading && (
                <View
                  style={{
                    alignItems: "center",
                    paddingVertical: 40,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      color: ui.text,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    No se encontraron usuarios
                  </Text>
                  <Text
                    style={{
                      color: ui.textMuted,
                      fontSize: 12,
                      textAlign: "center",
                      maxWidth: 260,
                    }}
                  >
                    Ajusta el filtro de estado, limpia el buscador o crea
                    un nuevo usuario.
                  </Text>
                </View>
              )
            }
            renderItem={({ item: u }) => {
              const isEditing = editingId === u.id;
              const role = roleForOrg(u, orgId);
              const status = statusForOrg(u, orgId);

              return (
                <View style={[cardBase, { width: cardWidth }]}>
                  {!isEditing ? (
                    <>
                      <View
                        style={{
                          gap: 2,
                          marginBottom: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: "800",
                            fontSize: 15,
                            color: ui.text,
                          }}
                          numberOfLines={1}
                        >
                          {u.fullName || u.email}
                        </Text>
                        <Text
                          style={{ color: ui.textMuted, fontSize: 12 }}
                          numberOfLines={1}
                        >
                          {u.email}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <RoleBadge role={role} />
                        <StatusBadge status={status} />
                      </View>

                      {/* Rol */}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "center",
                          marginBottom: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontWeight: "600",
                            color: ui.text,
                            fontSize: 12,
                          }}
                        >
                          Rol:
                        </Text>
                        <Select
                          value={role}
                          onChange={(v) => changeRole(u, v as Role)}
                          options={allowedRoleOptionsFor(me, orgId).map(
                            (r) => ({ label: r, value: r })
                          )}
                          minWidth={200}
                          disabled={!canManageUsers}
                        />
                      </View>

                      {/* Status */}
                      {status !== "ARCHIVED" && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 8,
                            alignItems: "center",
                            marginBottom: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: "600",
                              color: ui.text,
                              fontSize: 12,
                            }}
                          >
                            Status:
                          </Text>
                          <Select
                            value={status}
                            onChange={(v) => changeStatus(u, v as Status)}
                            options={STATUS_OPTS.map((s) => ({
                              label: s,
                              value: s,
                            }))}
                            minWidth={200}
                            disabled={!canManageUsers}
                          />
                        </View>
                      )}

                      {canManageUsers && (
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 8,
                            justifyContent: "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                          <PillButton
                            label="Editar"
                            tone="secondary"
                            size="sm"
                            onPress={() => startEdit(u)}
                          />
                          <PillButton
                            label="Archivar"
                            tone="danger"
                            size="sm"
                            onPress={() => softDelete(u)}
                          />
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <Text
                        style={{
                          fontWeight: "800",
                          color: ui.text,
                          marginBottom: 8,
                        }}
                      >
                        Editar usuario
                      </Text>
                      <TextInput
                        placeholder="Nombre"
                        placeholderTextColor={ui.textMuted}
                        value={editForm.fullName}
                        onChangeText={(v) =>
                          setEditForm((f) => ({ ...f, fullName: v }))
                        }
                        style={[input, { marginBottom: 6 }]}
                      />
                      <TextInput
                        placeholder="Email"
                        placeholderTextColor={ui.textMuted}
                        value={editForm.email}
                        onChangeText={(v) =>
                          setEditForm((f) => ({ ...f, email: v }))
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        style={[input, { marginBottom: 6 }]}
                      />
                      <TextInput
                        placeholder="Password (opcional)"
                        placeholderTextColor={ui.textMuted}
                        value={editForm.password}
                        onChangeText={(v) =>
                          setEditForm((f) => ({ ...f, password: v }))
                        }
                        secureTextEntry
                        style={[input, { marginBottom: 10 }]}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          justifyContent: "flex-start",
                        }}
                      >
                        <PillButton
                          label="Guardar"
                          size="sm"
                          onPress={saveEdit}
                        />
                        <PillButton
                          label="Cancelar"
                          tone="secondary"
                          size="sm"
                          onPress={cancelEdit}
                        />
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