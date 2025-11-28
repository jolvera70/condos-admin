// app/(app)/admin/boards.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
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

  boardBg: "#F9FAFB",
  boardCard: "#FFFFFF",
  boardBorder: "#E5E7EB",
  boardText: "#111827",
  boardTextMuted: "#6B7280",
};

/** Backend sólo maneja ACTIVE / ARCHIVED */
type BoardStatus = "ACTIVE" | "ARCHIVED";

type Board = {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: BoardStatus;
};

type Tenant = {
  orgId: string;
  name: string;
  slug?: string;
};

export default function BoardsAdmin() {
  const { me, logout } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const twoCols = width >= 820; // 2 columnas en iPad/desktop

  // Datos base
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Listado de boards
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Crear / Editar
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const isSuperAdmin = useMemo(() => {
    if (!me) return false;
    return (
      (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
      (Array.isArray(me.orgs) &&
        me.orgs.some((o: any) => o.role === "SUPERADMIN"))
    );
  }, [me]);

  const myRoleInOrg = useMemo(() => {
    if (!me || !selectedOrgId) return "";
    const found = (me.orgs ?? []).find((o: any) => o.orgId === selectedOrgId);
    return (
      (found?.role || (me.roles ?? [])[0] || "").toString().toUpperCase()
    );
  }, [me, selectedOrgId]);

  // Inicializar orgId desde me.orgs
  useEffect(() => {
    if (!selectedOrgId && Array.isArray(me?.orgs) && me!.orgs.length > 0) {
      setSelectedOrgId(me!.orgs[0].orgId);
    }
  }, [me, selectedOrgId]);

  /* =================== Carga de datos =================== */
  const loadTenants = useCallback(async () => {
    if (!me) return;
    if (isSuperAdmin) {
      try {
        const raw = await apiAuth(`/tenant?page=0&size=1000`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: Tenant[] = list.map((t: any) => ({
          orgId: t.orgId ?? t.id,
          name: t.name ?? t.slug ?? (t.orgId ?? t.id),
          slug: t.slug,
        }));
        setTenants(arr);
        if (!selectedOrgId && arr.length > 0) setSelectedOrgId(arr[0].orgId);
      } catch {
        const fallback: Tenant[] = (me?.orgs ?? []).map((o: any) => ({
          orgId: o.orgId,
          name: o.name ?? o.orgId,
        }));
        setTenants(fallback);
        if (!selectedOrgId && fallback.length > 0)
          setSelectedOrgId(fallback[0].orgId);
      }
    } else {
      const arr: Tenant[] = (me?.orgs ?? []).map((o: any) => ({
        orgId: o.orgId,
        name: o.name ?? o.orgId,
      }));
      setTenants(arr);
      if (!selectedOrgId && arr.length > 0) setSelectedOrgId(arr[0].orgId);
    }
  }, [me, isSuperAdmin, selectedOrgId]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const loadBoards = useCallback(async () => {
    setMsg("");
    if (!selectedOrgId) {
      setBoards([]);
      setMsg("Selecciona una empresa para ver sus colonias.");
      return;
    }
    setLoading(true);
    try {
      const qs =
        `?page=0&size=1000` +
        (includeArchived ? `&includeArchived=true` : ``) +
        `&orgId=${encodeURIComponent(selectedOrgId)}`;

      const raw = await apiAuth(`/board/boards${qs}`, "GET");
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];

      // 1) Mapeo + normalización básica
      let arr: Board[] = list.map((b: any) => {
        const rawStatus = (b.status ?? b.boardStatus ?? b.state ?? "")
          .toString()
          .trim()
          .toUpperCase();
        const norm: BoardStatus =
          rawStatus === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
        return {
          id: String(b.id ?? b.boardId ?? b._id),
          orgId: String(b.orgId),
          name: String(b.name),
          description: b.description,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          status: norm,
        };
      });

      // 2) Fallback (solo si pedimos archivados): revalida contra el detalle
      if (includeArchived) {
        arr = await Promise.all(
          arr.map(async (b) => {
            if (b.status === "ARCHIVED") return b; // ya está bien
            try {
              const det = await apiAuth(`/board/boards/${b.id}`, "GET");
              const raw2 = (det?.status ?? det?.boardStatus ?? det?.state ?? "")
                .toString()
                .trim()
                .toUpperCase();
              const fixed: BoardStatus =
                raw2 === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
              return { ...b, status: fixed };
            } catch {
              return b;
            }
          })
        );
      }

      setBoards(arr);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, includeArchived]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  /* =================== Acciones =================== */
  const createBoard = async () => {
    try {
      setMsg("");
      if (!selectedOrgId || !name.trim()) {
        setMsg("Selecciona una empresa y escribe un nombre.");
        return;
      }
      const body = {
        orgId: selectedOrgId,
        name: name.trim(),
        description: description.trim() || undefined,
      };
      await apiAuth(`/board/boards`, "POST", body);
      setName("");
      setDescription("");
      setShowCreate(false);
      await loadBoards();
      setMsg("Condominio creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const updateBoard = async (id: string) => {
    try {
      if (!name.trim()) {
        setMsg("El nombre no puede estar vacío.");
        return;
      }
      await apiAuth(`/board/boards/${id}`, "PUT", {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setEditingId(null);
      setName("");
      setDescription("");
      await loadBoards();
      setMsg("Condominio actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const deleteBoard = async (id: string) => {
    try {
      await apiAuth(`/board/boards/${id}`, "DELETE");
      await loadBoards();
      setMsg("Condominio eliminado ❌");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (id: string, status: BoardStatus) => {
    try {
      await apiAuth(
        `/board/boards/${id}/status?status=${encodeURIComponent(status)}`,
        "PATCH"
      );
      await loadBoards();
      setMsg(`Estado cambiado a ${status} ✅`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* =================== UI helpers =================== */

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

  function getBoardStatusUI(status?: BoardStatus) {
    const s = String(status || "ACTIVE").toUpperCase() as BoardStatus;
    if (s === "ARCHIVED")
      return {
        pillBg: "#1E293B",
        pillFg: "#E5E7EB",
        bar: "#9CA3AF",
        label: "ARCHIVED",
      };
    return {
      pillBg: "rgba(16,185,129,0.18)",
      pillFg: "#6EE7B7",
      bar: "#10B981",
      label: "ACTIVE",
    };
  }

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
      primary: { bg: lokalyTheme.primary, bg2: "#E0A93F", fg: "#111827" },
      secondary: { bg: "#111827", bg2: "#020617", fg: "#E5E7EB" },
      warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#111827" },
      danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#F9FAFB" },
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

  function StatusPill({
    status,
    style,
  }: {
    status?: BoardStatus;
    style?: any;
  }) {
    const ui = getBoardStatusUI(status);
    return (
      <View
        style={[
          {
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: ui.pillBg,
          },
          style,
        ]}
      >
        <Text
          style={{
            color: ui.pillFg,
            fontWeight: "800",
            fontSize: 11,
            letterSpacing: 0.7,
          }}
        >
          {ui.label}
        </Text>
      </View>
    );
  }

  /* ============== Selector Tenant (por plataforma) ============== */

  const selectedTenant = tenants.find((t) => t.orgId === selectedOrgId);

  const TenantSelector = () => {
    // WEB: <select>
    if (Platform.OS === "web") {
      return (
        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.currentTarget.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #4B5563",
            minWidth: 260,
            background: "#020617",
            color: "#E5E7EB",
          }}
        >
          {!selectedOrgId && <option value="">— elige —</option>}
          {tenants.map((t) => (
            <option key={t.orgId} value={t.orgId}>
              {t.name}
            </option>
          ))}
        </select>
      );
    }

    // ANDROID: Picker
    if (Platform.OS === "android") {
      return (
        <View
          style={{
            borderWidth: 1,
            borderColor: "#4B5563",
            borderRadius: 10,
            minHeight: 44,
            justifyContent: "center",
            backgroundColor: "#020617",
          }}
        >
          <Picker
            selectedValue={selectedOrgId}
            onValueChange={(val) => setSelectedOrgId(String(val))}
            mode="dropdown"
            style={{ height: 44, color: "#E5E7EB" }}
            dropdownIconColor="#E5E7EB"
          >
            {!selectedOrgId && <Picker.Item label="— elige —" value="" />}
            {tenants.map((t) => (
              <Picker.Item
                key={t.orgId}
                label={`${t.name} (${t.slug ?? t.orgId})`}
                value={t.orgId}
              />
            ))}
          </Picker>
        </View>
      );
    }

    // iOS: ActionSheet
    const currentLabel = selectedTenant
      ? `${selectedTenant.name} (${selectedTenant.slug ?? selectedTenant.orgId})`
      : "— elige —";

    const options = [
      "— elige —",
      ...tenants.map(
        (t) => `${t.name} (${t.slug ?? t.orgId})`
      ),
      "Cancelar",
    ];
    const cancelButtonIndex = options.length - 1;

    const openSheet = () => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Selecciona empresa",
          options,
          cancelButtonIndex,
          userInterfaceStyle: "dark",
        },
        (idx) => {
          if (idx === cancelButtonIndex) return;
          if (idx === 0) {
            setSelectedOrgId("");
          } else {
            const t = tenants[idx - 1];
            if (t) setSelectedOrgId(t.orgId);
          }
        }
      );
    };

    return (
      <Pressable
        onPress={openSheet}
        style={({ pressed }) => ({
          borderWidth: 1,
          borderColor: "#4B5563",
          borderRadius: 10,
          minHeight: 44,
          backgroundColor: pressed ? "#020617" : "#020617",
          justifyContent: "center",
          paddingHorizontal: 12,
          minWidth: 260,
        })}
      >
        <Text
          style={{ fontWeight: "700", color: "#E5E7EB" }}
          numberOfLines={1}
        >
          {currentLabel}
        </Text>
        <Text
          style={{
            position: "absolute",
            right: 12,
            color: "#94A3B8",
            fontSize: 12,
          }}
        >
          ▼
        </Text>
      </Pressable>
    );
  };

  /* =================== Render =================== */
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

      {/* HEADER de la página */}
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
            Colonias / Condominios
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: lokalyTheme.textMuted,
              marginTop: 2,
            }}
          >
            Administra las colonias asociadas a cada empresa.
          </Text>
        </View>

        {!!myRoleInOrg && (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: lokalyTheme.borderSoft,
              backgroundColor: lokalyTheme.surface,
            }}
          >
            <Text
              style={{
                color: lokalyTheme.text,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              Rol: {myRoleInOrg}
            </Text>
          </View>
        )}
      </View>

      {/* LISTA */}
      <FlatList
        style={{ flex: 1, backgroundColor: lokalyTheme.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        data={boards}
        keyExtractor={(b) => b.id}
        refreshing={loading}
        onRefresh={loadBoards}
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

            {/* Filtros / empresa / archivados */}
            <View style={{ ...card, gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
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
                <TenantSelector />
                {Platform.OS === "web" ? (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      userSelect: "none",
                      color: lokalyTheme.textMuted,
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
                    onPress={() => setIncludeArchived((v) => !v)}
                    tone="secondary"
                  />
                )}

                <View style={{ marginLeft: "auto" }}>
                  <PillButton
                    label={showCreate ? "OCULTAR" : "CREAR CONDOMINIO"}
                    onPress={() => setShowCreate((v) => !v)}
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
                    Crear nuevo condominio
                  </Text>
                  <TextInput
                    placeholder="Nombre"
                    placeholderTextColor={lokalyTheme.textMuted}
                    value={name}
                    onChangeText={setName}
                    style={input}
                  />
                  <TextInput
                    placeholder="Descripción (opcional)"
                    placeholderTextColor={lokalyTheme.textMuted}
                    value={description}
                    onChangeText={setDescription}
                    style={input}
                  />
                  <PillButton
                    label="CREAR"
                    onPress={createBoard}
                    disabled={!name.trim() || !selectedOrgId}
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
                Colonias de{" "}
                {(
                  tenants.find((t) => t.orgId === selectedOrgId)?.name ??
                  selectedOrgId
                ) || "…"}
              </Text>
              {loading && (
                <ActivityIndicator color={lokalyTheme.primary} />
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
              : "No hay colonias para mostrar."}
          </Text>
        }
        renderItem={({ item: b }) => {
          const isEditing = editingId === b.id;
          const uiStatus = getBoardStatusUI(b.status);

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
                borderLeftColor: uiStatus.bar,
              }}
            >
              {/* pill estado */}
              <StatusPill
                status={b.status}
                style={{ position: "absolute", top: 10, right: 12 }}
              />

              {!isEditing ? (
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      color: lokalyTheme.text,
                    }}
                    numberOfLines={1}
                  >
                    {b.name}
                  </Text>

                  <Text
                    style={{
                      color: lokalyTheme.textMuted,
                      fontSize: 12,
                    }}
                  >
                    ID: {b.id}
                  </Text>
                  <Text
                    style={{
                      color: lokalyTheme.textMuted,
                      fontSize: 12,
                    }}
                  >
                    Empresa: {b.orgId}
                  </Text>
                  {!!b.description && (
                    <Text
                      style={{
                        color: lokalyTheme.text,
                        fontSize: 12,
                      }}
                    >
                      Descripción: {b.description}
                    </Text>
                  )}
                  {!!b.updatedAt && (
                    <Text
                      style={{
                        color: lokalyTheme.textMuted,
                        fontSize: 12,
                      }}
                    >
                      Actualizado:{" "}
                      {new Date(b.updatedAt).toLocaleString()}
                    </Text>
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <PillButton
                      label="EDITAR"
                      tone="secondary"
                      onPress={() => {
                        setEditingId(b.id);
                        setName(b.name);
                        setDescription(b.description ?? "");
                      }}
                    />
                    {b.status !== "ARCHIVED" ? (
                      <PillButton
                        label="ARCHIVAR"
                        tone="warning"
                        onPress={() =>
                          changeStatus(b.id, "ARCHIVED")
                        }
                      />
                    ) : (
                      <PillButton
                        label="ACTIVAR"
                        onPress={() =>
                          changeStatus(b.id, "ACTIVE")
                        }
                      />
                    )}
                    <PillButton
                      label="TAREAS"
                      onPress={() =>
                        router.push({
                          pathname: "../(admin)/board-tasks",
                          params: {
                            boardId: b.id,
                            orgId: b.orgId,
                            boardName: b.name,
                          },
                        })
                      }
                    />
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
                    Editar condominio
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Nombre"
                    placeholderTextColor={lokalyTheme.textMuted}
                    style={input}
                  />
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Descripción (opcional)"
                    placeholderTextColor={lokalyTheme.textMuted}
                    style={input}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <PillButton
                      label="GUARDAR"
                      onPress={() => updateBoard(b.id)}
                      disabled={!name.trim()}
                    />
                    <PillButton
                      label="CANCELAR"
                      tone="secondary"
                      onPress={() => {
                        setEditingId(null);
                        setName("");
                        setDescription("");
                      }}
                    />
                    <PillButton
                      label="ELIMINAR"
                      tone="danger"
                      onPress={() => deleteBoard(b.id)}
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