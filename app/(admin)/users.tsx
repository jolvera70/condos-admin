// app/(app)/users.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions
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

/* ======================= Tipos ======================= */
type OrgOpt = { orgId: string; name: string };
type UserItem = {
  id: string;
  email: string;
  fullName?: string;
  roles?: string[];
  orgs?: Array<{
    orgId: string;
    role: string;
    status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  }>;
  status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

const ROLE_OPTS = ["ADMINISTRADOR", "SUPERVISOR", "OPERATIVO"] as const;
const STATUS_OPTS = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;

/* ======================= Utils ======================= */
const normalizeRole = (r?: string) => {
  const R = (r ?? "").toUpperCase();
  return (["ADMINISTRADOR", "SUPERVISOR", "OPERATIVO"] as const).includes(
    R as any
  )
    ? R
    : "OPERATIVO";
};
const normalizeStatus = (s?: string) => {
  const S = (s ?? "").toUpperCase();
  return (["ACTIVE", "SUSPENDED", "ARCHIVED"] as const).includes(
    S as any
  )
    ? S
    : "ACTIVE";
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
            borderColor: lokalyTheme.border,
            minHeight: 44,
            justifyContent: "center",
            backgroundColor: lokalyTheme.bgAlt,
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
  const current =
    items.find((i) => i.value === value)?.label ?? "Seleccionar…";
  return (
    <Pressable
      onPress={() => {
        const options = [...items.map((i) => i.label), "Cancelar"];
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex: options.length - 1,
            userInterfaceStyle: "dark",
            title: "Selecciona una opción",
          },
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
          borderColor: lokalyTheme.border,
          minHeight: 44,
          paddingHorizontal: 12,
          justifyContent: "center",
          backgroundColor: lokalyTheme.bgAlt,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: lokalyTheme.text,
          fontSize: 14,
        }}
      >
        {current}
      </Text>
    </Pressable>
  );
}

/* ======================= Pantalla ======================= */
export default function Users() {
  const router = useRouter();
  const { me, logout } = useApp();
  const { width } = useWindowDimensions();
  const twoCols = width >= 820; // 2 columnas en iPad/desktop

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
  const [editForm, setEditForm] = useState<{
    fullName: string;
    email: string;
    password?: string;
  }>({
    fullName: "",
    email: "",
    password: "",
  });

  const myRoleInOrg = useMemo(() => {
    if (!me || !orgId) return "";
    const found = (me.orgs ?? []).find((o: any) => o.orgId === orgId);
    return (
      (found?.role || (me.roles ?? [])[0] || "").toString().toUpperCase()
    );
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
    return (
      u.orgs?.find((o) => o.orgId === org)?.role ?? "OPERATIVO"
    );
  };
  const statusForOrg = (u: UserItem, org: string) =>
    (u.orgs?.find((o) => o.orgId === org)?.status ?? "ACTIVE") as
      (typeof STATUS_OPTS)[number];

  /* ------------------------ cargar tenants ------------------------ */
  const loadOrgs = useCallback(async () => {
    setMsg("");
    if (!me) return;
    try {
      const isSA =
        (Array.isArray(me.roles) &&
          me.roles.includes("SUPERADMIN")) ||
        (Array.isArray(me.orgs) &&
          me.orgs.some((o: any) => o.role === "SUPERADMIN"));

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
      setNewUser({
        fullName: "",
        email: "",
        password: "",
        role: "ADMINISTRADOR",
      });
      await loadUsers();
      setShowCreate(false);
      setMsg("Usuario creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

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

      // 1) Actualizar perfil en user-api (nombre + email)
      await apiAuth(`/user/users/${editingId}`, "PUT", {
        fullName: newFullName,
        email: newEmail,
      });

      // 2) Si cambió el email, actualizar también en auth-api
      if (newEmail && newEmail !== oldEmail) {
        await apiAuth(
          `/auth/users/${editingId}/email`,
          "PATCH",
          { newEmail }
        );
      }

      // 3) Si vino password nuevo, actualizar en auth-api
      if (newPassword && newPassword.length >= 3) {
        await apiAuth(
          `/auth/users/${editingId}/password`,
          "PATCH",
          { newPassword }
        );
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

  const changeStatus = async (
    u: UserItem,
    newStatus: (typeof STATUS_OPTS)[number]
  ) => {
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
      // eslint-disable-next-line no-alert
      if (confirm(`¿Archivar a ${u.email}?`)) await go();
    } else {
      Alert.alert("Confirmar", `¿Archivar a ${u.email}?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Archivar", style: "destructive", onPress: go },
      ]);
    }
  };

  /* ------------------------ estilos base ------------------------ */

  const card: any = {
    borderWidth: 1,
    borderColor: lokalyTheme.borderSoft,
    borderRadius: 18,
    backgroundColor: lokalyTheme.surface,
    padding: 14,
    ...(Platform.OS === "web"
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
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    backgroundColor: lokalyTheme.bgAlt,
    color: lokalyTheme.text,
    fontSize: 13,
  } as const;

  /* ------------------------ Render ------------------------ */
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: lokalyTheme.bg,
      }}
    >
      {/* TOP BAR uniforme */}
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
            Usuarios / Cuentas
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: lokalyTheme.textMuted,
              marginTop: 2,
            }}
          >
            Administra los usuarios y sus roles dentro de cada empresa.
          </Text>
        </View>

        {!!myRoleInOrg && (
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
                color: lokalyTheme.primary,
                fontSize: 11,
                fontWeight: "800",
              }}
            >
              Mi rol: {myRoleInOrg}
            </Text>
          </View>
        )}
      </View>

      {/* CONTENIDO */}
      <FlatList
        style={{ flex: 1, backgroundColor: lokalyTheme.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
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
                  backgroundColor: msg.includes("✅")
                    ? "rgba(22,163,74,0.12)"
                    : "rgba(248,113,113,0.10)",
                  borderWidth: 1,
                  borderColor: msg.includes("✅")
                    ? "rgba(34,197,94,0.6)"
                    : "rgba(248,113,113,0.65)",
                }}
              >
                <Text
                  style={{
                    color: msg.includes("✅")
                      ? "#4ADE80"
                      : lokalyTheme.danger,
                    fontSize: 12,
                  }}
                >
                  {msg}
                </Text>
              </View>
            )}

            {/* Empresa + Crear */}
            <View
              style={{
                ...card,
                gap: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "800",
                      color: lokalyTheme.text,
                    }}
                  >
                    Empresa
                  </Text>

                  {Platform.OS === "web" ? (
                    <select
                      value={orgId}
                      onChange={(e) =>
                        setOrgId(e.currentTarget.value)
                      }
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #4B5563" as any,
                        minWidth: 220,
                        backgroundColor: "#020617",
                        color: "#E5E7EB",
                      }}
                    >
                      {orgs.map((t) => (
                        <option
                          key={t.orgId}
                          value={t.orgId}
                        >
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Combo
                      value={orgId}
                      onChange={setOrgId}
                      items={orgs.map((t) => ({
                        label: t.name,
                        value: t.orgId,
                      }))}
                      style={{ minWidth: 220 }}
                    />
                  )}
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <PillButton
                    label="RECARGAR"
                    tone="secondary"
                    onPress={loadUsers}
                  />
                  <PillButton
                    label={
                      showCreate ? "OCULTAR" : "CREAR USUARIO"
                    }
                    onPress={() =>
                      setShowCreate((v) => !v)
                    }
                  />
                </View>
              </View>

              {showCreate && (
                <View style={{ gap: 8 }}>
                  <Text
                    style={{
                      color: lokalyTheme.text,
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    Crear nuevo usuario
                  </Text>
                  <TextInput
                    placeholder="Nombre"
                    placeholderTextColor={
                      lokalyTheme.textMuted
                    }
                    value={newUser.fullName}
                    onChangeText={(v) =>
                      setNewUser((u) => ({
                        ...u,
                        fullName: v,
                      }))
                    }
                    style={input}
                  />
                  <TextInput
                    placeholder="Email"
                    placeholderTextColor={
                      lokalyTheme.textMuted
                    }
                    value={newUser.email}
                    onChangeText={(v) =>
                      setNewUser((u) => ({
                        ...u,
                        email: v,
                      }))
                    }
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={input}
                  />
                  <TextInput
                    placeholder="Password temporal"
                    placeholderTextColor={
                      lokalyTheme.textMuted
                    }
                    value={newUser.password}
                    onChangeText={(v) =>
                      setNewUser((u) => ({
                        ...u,
                        password: v,
                      }))
                    }
                    secureTextEntry
                    style={input}
                  />

                  {Platform.OS === "web" ? (
                    <select
                      value={newUser.role}
                      onChange={(e) =>
                        setNewUser((u) => ({
                          ...u,
                          role:
                            e.currentTarget
                              .value as any,
                        }))
                      }
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border:
                          "1px solid #4B5563" as any,
                        backgroundColor: "#020617",
                        color: "#E5E7EB",
                      }}
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
                      onChange={(v) =>
                        setNewUser((u) => ({
                          ...u,
                          role: v as any,
                        }))
                      }
                      items={ROLE_OPTS.map((r) => ({
                        label: r,
                        value: r,
                      }))}
                    />
                  )}

                  <PillButton
                    label="CREAR"
                    onPress={createUser}
                    disabled={!isValidNew}
                  />
                </View>
              )}
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
              <Text
                style={{
                  fontWeight: "800",
                  color: lokalyTheme.text,
                }}
              >
                Usuarios de{" "}
                {orgs.find((o) => o.orgId === orgId)?.name ||
                  orgId ||
                  "…"}
              </Text>
              {loading && (
                <ActivityIndicator
                  color={lokalyTheme.primary}
                />
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text
            style={{
              color: lokalyTheme.textMuted,
              padding: 12,
            }}
          >
            {loading
              ? "Cargando..."
              : "No hay usuarios para mostrar."}
          </Text>
        }
        renderItem={({ item: u }) => {
          const isEditing = editingId === u.id;
          const currentRole = normalizeRole(
            roleForOrg(u, orgId)
          );
          const currentStatus = normalizeStatus(
            statusForOrg(u, orgId)
          );

          return (
            <View
              style={{
                position: "relative",
                padding: 12,
                borderWidth: 1,
                borderColor: lokalyTheme.borderSoft,
                borderRadius: 18,
                backgroundColor: lokalyTheme.surface,
                marginTop: 8,
                gap: 8,
                ...(Platform.OS === "web"
                  ? {
                      boxShadow:
                        "0 16px 40px rgba(15,23,42,0.8)",
                    }
                  : {}),
                flexBasis: twoCols ? "48%" : "100%",
                maxWidth: twoCols ? "48%" : "100%",
                borderLeftWidth: 6,
                borderLeftColor:
                  stripeColor(currentStatus),
              }}
            >
              {/* pill de estado arriba derecha */}
              <StatusBadge
                status={currentStatus}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 12,
                }}
              />

              {!isEditing ? (
                <>
                  {/* cabecera nombre/email */}
                  <View style={{ gap: 2 }}>
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 16,
                        color: lokalyTheme.text,
                      }}
                    >
                      {u.fullName || u.email}
                    </Text>
                    <Text
                      style={{
                        color: lokalyTheme.textMuted,
                      }}
                    >
                      {u.email}
                    </Text>
                  </View>

                  {/* badges + icon buttons */}
                  <View style={{ gap: 8 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent:
                          "space-between",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <RoleBadge role={currentRole} />
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                        }}
                      >
                        <IconButton
                          label="✏️"
                          onPress={() => startEdit(u)}
                        />
                        <IconButton
                          label="🗑️"
                          tone="danger"
                          onPress={() =>
                            softDelete(u)
                          }
                        />
                      </View>
                    </View>

                    {/* selector de rol */}
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        alignItems: "center",
                        marginTop: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "600",
                          color: lokalyTheme.text,
                        }}
                      >
                        Rol:
                      </Text>
                      {Platform.OS === "web" ? (
                        <select
                          value={currentRole}
                          onChange={(e) =>
                            changeRole(
                              u,
                              e.currentTarget.value
                            )
                          }
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border:
                              "1px solid #4B5563" as any,
                            backgroundColor:
                              "#020617",
                            color: "#E5E7EB",
                          }}
                        >
                          {ROLE_OPTS.map((r) => (
                            <option
                              key={r}
                              value={r}
                            >
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Combo
                          value={currentRole}
                          onChange={(v) =>
                            changeRole(u, v)
                          }
                          items={ROLE_OPTS.map((r) => ({
                            label: r,
                            value: r,
                          }))}
                          style={{ flex: 1 }}
                        />
                      )}
                    </View>

                    {/* selector de status */}
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        alignItems: "center",
                        marginTop: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "600",
                          color: lokalyTheme.text,
                        }}
                      >
                        Status:
                      </Text>
                      {Platform.OS === "web" ? (
                        <select
                          value={currentStatus}
                          onChange={(e) =>
                            changeStatus(
                              u,
                              e
                                .currentTarget
                                .value as any
                            )
                          }
                          style={{
                            padding: 8,
                            borderRadius: 8,
                            border:
                              "1px solid #4B5563" as any,
                            backgroundColor:
                              "#020617",
                            color: "#E5E7EB",
                          }}
                        >
                          {STATUS_OPTS.map((s) => (
                            <option
                              key={s}
                              value={s}
                            >
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Combo
                          value={currentStatus}
                          onChange={(v) =>
                            changeStatus(
                              u,
                              v as any
                            )
                          }
                          items={STATUS_OPTS.map(
                            (s) => ({
                              label: s,
                              value: s,
                            })
                          )}
                          style={{ flex: 1 }}
                        />
                      )}
                    </View>

                    {/* botón editar principal */}
                    <View style={{ marginTop: 6 }}>
                      <PillButton
                        label="EDITAR"
                        tone="secondary"
                        onPress={() => startEdit(u)}
                      />
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      color: lokalyTheme.text,
                    }}
                  >
                    Editar usuario
                  </Text>
                  <TextInput
                    placeholder="Nombre"
                    placeholderTextColor={
                      lokalyTheme.textMuted
                    }
                    value={editForm.fullName}
                    onChangeText={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        fullName: v,
                      }))
                    }
                    style={input}
                  />
                  <TextInput
                    placeholder="Email"
                    placeholderTextColor={
                      lokalyTheme.textMuted
                    }
                    value={editForm.email}
                    onChangeText={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        email: v,
                      }))
                    }
                    autoCapitalize="none"
                    style={input}
                  />
                  <TextInput
                    placeholder="Password (opcional)"
                    placeholderTextColor={
                      lokalyTheme.textMuted
                    }
                    value={editForm.password}
                    onChangeText={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        password: v,
                      }))
                    }
                    secureTextEntry
                    style={input}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 8,
                    }}
                  >
                    <PillButton
                      label="GUARDAR"
                      onPress={saveEdit}
                    />
                    <PillButton
                      label="CANCELAR"
                      tone="secondary"
                      onPress={cancelEdit}
                    />
                  </View>
                </>
              )}
            </View>
          );
        }}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </SafeAreaView>
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
    primary: {
      bg: lokalyTheme.primary,
      bg2: "#E0A93F",
      fg: "#111827",
    },
    secondary: {
      bg: "#111827",
      bg2: "#020617",
      fg: "#E5E7EB",
    },
    warning: {
      bg: "#F59E0B",
      bg2: "#D97706",
      fg: "#111827",
    },
    danger: {
      bg: "#EF4444",
      bg2: "#DC2626",
      fg: "#F9FAFB",
    },
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
        backgroundColor: disabled
          ? "rgba(148,163,184,0.45)"
          : pressed
          ? palette.bg2
          : palette.bg,
        ...(style || {}),
      })}
    >
      <Text
        style={{
          color: palette.fg,
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

function stripeColor(status: string) {
  switch (status) {
    case "ACTIVE":
      return "#10B981";
    case "SUSPENDED":
      return "#F59E0B";
    case "ARCHIVED":
      return "#6B7280";
    default:
      return lokalyTheme.borderSoft;
  }
}

function StatusBadge({
  status,
  style,
}: {
  status: string;
  style?: any;
}) {
  const palette: Record<
    string,
    { bg: string; fg: string; label: string }
  > = {
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
  const p =
    palette[status] ??
    {
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

function RoleBadge({ role }: { role?: string }) {
  const r = (role ?? "OPERATIVO").toUpperCase();
  const map: Record<string, { bg: string; fg: string }> = {
    ADMINISTRADOR: {
      bg: "rgba(59,130,246,0.18)",
      fg: "#93C5FD",
    },
    SUPERVISOR: {
      bg: "rgba(245,158,11,0.18)",
      fg: "#FACC15",
    },
    OPERATIVO: {
      bg: "rgba(16,185,129,0.18)",
      fg: "#6EE7B7",
    },
  };
  const p =
    map[r] ??
    {
      bg: "#1F2933",
      fg: "#E5E7EB",
    };
  return (
    <View
      style={{
        backgroundColor: p.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          color: p.fg,
          fontWeight: "800",
          fontSize: 11,
          letterSpacing: 0.7,
        }}
      >
        {r}
      </Text>
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
      ? {
          bg: "rgba(248,113,113,0.12)",
          bg2: "rgba(248,113,113,0.25)",
          fg: "#FCA5A5",
        }
      : {
          bg: "#111827",
          bg2: "#020617",
          fg: "#E5E7EB",
        };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: pressed
          ? palette.bg2
          : palette.bg,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: palette.fg,
          fontSize: 16,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </Pressable>
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