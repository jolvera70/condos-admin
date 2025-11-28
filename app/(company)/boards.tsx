// app/(company)/boards.tsx
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
  SafeAreaView,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { apiAuth } from "../../lib/api";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

/* ========= Tema Condos / Lokaly (oscuro) ========= */
const ui = {
  bg: "#020617",
  bgSoft: "#030712",
  surface: "#020617",
  card: "#020617",
  border: "#1F2937",
  borderSoft: "#111827",
  primary: "#F4C15D",
  primarySoft: "rgba(244,193,93,0.12)",
  text: "#E5E7EB",
  textMuted: "#94A3B8",
  danger: "#F87171",
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
  name?: string;
  slug?: string;
};

/* ========= Helpers de tenant/nombres ========= */
const normalizeTenant = (raw: any): Tenant => ({
  orgId: String(raw.orgId ?? raw.id ?? ""),
  name:
    raw.name ??
    raw.displayName ??
    raw.companyName ??
    raw.orgName ??
    raw.title ??
    raw.slug ??
    undefined,
  slug: raw.slug ?? undefined,
});

function labelOfTenant(t: Tenant) {
  const pretty =
    t.name && t.name !== t.orgId
      ? t.name
      : t.slug ?? `${t.orgId.slice(0, 6)}…`;
  return t.slug && pretty !== t.slug ? `${pretty} (${t.slug})` : pretty;
}

/* ========= Breakpoints ========= */
const useBreakpoints = () => {
  const { width } = useWindowDimensions();
  return {
    width,
    isPhone: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
};

/* ========= Select adaptativo (web / iOS ActionSheet / Android Picker) ========= */
type Option<T extends string> = { label: string; value: T };
function Select<T extends string>({
  value,
  options,
  onChange,
  minWidth = 160,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  minWidth?: number;
}) {
  if (Platform.OS === "web") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as T)}
        style={{
          minWidth,
          padding: 10,
          borderRadius: 999,
          border: `1px solid ${ui.border}` as any,
          background: ui.bgSoft,
          color: ui.text,
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
        onPress={() => {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: [...options.map((o) => o.label), "Cancelar"],
              cancelButtonIndex: options.length,
              userInterfaceStyle: "dark",
            },
            (idx) => {
              if (idx != null && idx >= 0 && idx < options.length)
                onChange(options[idx].value);
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
          backgroundColor: ui.bgSoft,
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
        backgroundColor: ui.bgSoft,
        height: 44,
        justifyContent: "center",
      }}
    >
      <Picker
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

/* ========= UI helpers ========= */
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
          borderRadius: 999,
          paddingVertical: pv,
          paddingHorizontal: ph,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
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

function StatusBadge({ status }: { status: BoardStatus }) {
  const palette: Record<BoardStatus, { bg: string; fg: string; label: string }> =
    {
      ACTIVE: {
        bg: "rgba(34,197,94,0.18)",
        fg: "#BBF7D0",
        label: "ACTIVO",
      },
      ARCHIVED: {
        bg: "rgba(148,163,184,0.18)",
        fg: "#E5E7EB",
        label: "ARCHIVADO",
      },
    };
  const p = palette[status] ?? palette.ACTIVE;
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: p.bg,
      }}
    >
      <Text style={{ color: p.fg, fontWeight: "700", fontSize: 11 }}>
        {p.label}
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

/* ========= Pantalla ========= */
export default function BoardsCompany() {
  const { me, logout } = useApp();
  const router = useRouter();
  const { width, isPhone, isTablet, isDesktop } = useBreakpoints();

  // Layout base
  const maxW = isDesktop ? 1100 : isTablet ? 880 : width;
  const gutter = isTablet || isDesktop ? 16 : 10;
  const numColumns = isTablet || isDesktop ? 2 : 1;

  // Estado
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const tenantIndex = useMemo(
    () =>
      new Map(tenants.map((t) => [t.orgId, t.name ?? t.slug ?? t.orgId])),
    [tenants]
  );

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);

  // filtro extra
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // toggle para mostrar/ocultar formulario de creación
  const [showCreate, setShowCreate] = useState(false);

  type OrgNameMap = Record<string, string>;
  const [orgNameById, setOrgNameById] = useState<OrgNameMap>({});

  // Resolver nombre org
  function orgLabel(orgId: string) {
    if (orgNameById[orgId]) return orgNameById[orgId];
    const val = tenantIndex.get(orgId);
    if (val && val !== orgId && !val.endsWith("…")) return val;
    return `${orgId.slice(0, 6)}…`;
  }
  const selectedTenantLabel = selectedOrgId ? orgLabel(selectedOrgId) : "";

  // Lookup batch tenant names
  async function fetchTenantsByIds(ids: string[]) {
    if (!ids.length) return {} as OrgNameMap;
    try {
      const res = await apiAuth(
        `/tenant/lookup?ids=${encodeURIComponent(ids.join(","))}`,
        "GET"
      );
      const list = Array.isArray(res) ? res : res?.content ?? [];
      const dic: OrgNameMap = {};
      for (const t of list) {
        const id = String(t.id ?? t.orgId);
        dic[id] = String(t.name ?? t.slug ?? id);
      }
      return dic;
    } catch {
      return {} as OrgNameMap;
    }
  }

  // RBAC
  const myRole: Role = useMemo(
    () => highestRoleInOrg(me, selectedOrgId),
    [me, selectedOrgId]
  );
  const canCrudBoards =
    myRole === "ADMINISTRADOR" || myRole === "SUPERADMIN";

  const isSuperAdmin = useMemo(() => {
    if (!me) return false;
    return (
      (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
      (Array.isArray(me.orgs) &&
        me.orgs.some((o: any) => o.role === "SUPERADMIN"))
    );
  }, [me]);

  // Inicial org desde me.orgs
  useEffect(() => {
    if (!selectedOrgId && Array.isArray(me?.orgs) && me!.orgs.length > 0) {
      setSelectedOrgId(me!.orgs[0].orgId);
    }
  }, [me, selectedOrgId]);

  // Cargar tenants
  const loadTenants = useCallback(async () => {
    if (!me) return;

    const fromMe: Tenant[] = (me.orgs ?? []).map((o: any) =>
      normalizeTenant({ orgId: o.orgId, name: o.name, slug: o.slug })
    );

    if (isSuperAdmin) {
      try {
        const raw = await apiAuth(`/tenant?page=0&size=1000`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const fromApi: Tenant[] = list.map(normalizeTenant);

        const map = new Map<string, Tenant>();
        [...fromApi, ...fromMe].forEach((t) => {
          const prev = map.get(t.orgId);
          if (!prev) {
            map.set(t.orgId, t);
          } else {
            const prevName =
              prev.name && prev.name !== prev.orgId ? prev.name : undefined;
            const nextName =
              t.name && t.name !== t.orgId ? t.name : undefined;
            map.set(
              t.orgId,
              nextName
                ? { ...prev, ...t, name: nextName }
                : prevName
                ? prev
                : { ...prev, ...t }
            );
          }
        });

        const arr = [...map.values()].map((t) => ({
          ...t,
          name: t.name ?? t.slug ?? undefined,
        }));

        setTenants(arr);
        if (!selectedOrgId && arr.length > 0)
          setSelectedOrgId(arr[0].orgId);
        return;
      } catch {
        // cae a fromMe
      }
    }

    const arr = fromMe.map((t) => ({
      ...t,
      name: t.name ?? t.slug ?? undefined,
    }));
    setTenants(arr);
    if (!selectedOrgId && arr.length > 0)
      setSelectedOrgId(arr[0].orgId);
  }, [me, isSuperAdmin, selectedOrgId]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Cargar boards
  const loadBoards = useCallback(async () => {
    setMsg("");
    if (!selectedOrgId) {
      setBoards([]);
      setMsg("Selecciona un condominio para ver sus colonias.");
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
      const arr: Board[] = list.map((b: any) => ({
        id: b.id ?? b.boardId ?? b._id,
        orgId: b.orgId,
        name: b.name,
        description: b.description,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        status: b.status,
      }));
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

  // Resolver nombres faltantes por lookup
  useEffect(() => {
    const ids = Array.from(new Set(boards.map((b) => String(b.orgId))));
    const missing = ids.filter((id) => {
      const val = tenantIndex.get(id);
      const resolved = orgNameById[id];
      if (resolved) return false;
      if (!val) return true;
      const isPlaceholder = val === id || val.endsWith("…");
      return isPlaceholder;
    });
    if (missing.length) {
      (async () => {
        const dic = await fetchTenantsByIds(missing);
        setOrgNameById((prev) => ({ ...prev, ...dic }));
      })();
    }
  }, [boards, tenantIndex, orgNameById]);

  // CRUD
  const createBoard = async () => {
    if (!canCrudBoards) {
      setMsg("No tienes permisos para crear boards.");
      return;
    }
    try {
      setMsg("");
      if (!selectedOrgId || !name.trim()) {
        setMsg("Selecciona un condominio y escribe un nombre.");
        return;
      }
      await apiAuth(`/board/boards`, "POST", {
        orgId: selectedOrgId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      await loadBoards();
      setShowCreate(false);
      setMsg("Board creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const updateBoard = async (id: string) => {
    if (!canCrudBoards) {
      setMsg("No tienes permisos para editar boards.");
      return;
    }
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
      setMsg("Board actualizado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const deleteBoard = async (id: string) => {
    if (!canCrudBoards) {
      setMsg("No tienes permisos para eliminar boards.");
      return;
    }
    try {
      await apiAuth(`/board/boards/${id}`, "DELETE");
      await loadBoards();
      setMsg("Board eliminado ❌");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (id: string, status: BoardStatus) => {
    if (!canCrudBoards) {
      setMsg("No tienes permisos para cambiar estado.");
      return;
    }
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

  /* ===== Métricas y filtros en memoria ===== */
  const totalBoards = boards.length;
  const activeCount = boards.filter((b) => b.status !== "ARCHIVED").length;
  const archivedCount = boards.filter((b) => b.status === "ARCHIVED").length;

  const filteredBoards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return boards.filter((b) => {
      if (!includeArchived && b.status === "ARCHIVED") return false;
      if (!term) return true;
      return (
        b.name.toLowerCase().includes(term) ||
        (b.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [boards, includeArchived, search]);

  /* ===== Estilos base y grid ===== */
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

  const cardWidth = useMemo(() => {
    if (numColumns === 1) return maxW - 32; // 16+16 padding
    const totalGutters = gutter * (numColumns - 1);
    return (maxW - 32 - totalGutters) / numColumns;
  }, [maxW, numColumns, gutter]);

  /* ===== Render ===== */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
      <View style={{ flex: 1, alignItems: "center", backgroundColor: ui.bg }}>
        <View style={{ width: maxW, flex: 1 }}>
          {/* TOP BAR */}
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
                  Gestión de condominios
                </Text>
              </View>
            </View>

            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
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
                label="Menú principal"
                tone="secondary"
                size="sm"
                onPress={() => router.replace("/(app)/home")}
              />
              <PillButton
                label="Salir"
                tone="danger"
                size="sm"
                onPress={logout}
              />
            </View>
          </View>

          {/* SUB HEADER + FILTROS */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: ui.border,
              backgroundColor: ui.bgSoft,
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
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
                  Condominios y colonias
                </Text>
                <Text style={{ fontSize: 12, color: ui.textMuted }}>
                  Configura los tableros donde se gestionan las tareas.
                </Text>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Select
                  value={selectedOrgId as any}
                  onChange={(v) => setSelectedOrgId(String(v))}
                  options={tenants.map((t) => ({
                    label: labelOfTenant(t),
                    value: t.orgId as any,
                  }))}
                  minWidth={220}
                />
              </View>
            </View>

            {/* Fila de métricas */}
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <MetricCard label="Total" value={totalBoards} />
              <MetricCard label="Activos" value={activeCount} />
              <MetricCard label="Archivados" value={archivedCount} />
            </View>

            {/* Filtros secundarios: buscador + estado */}
            <View
              style={{
                flexDirection: isPhone ? "column" : "row",
                gap: 10,
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1 }}>
                <TextInput
                  placeholder="Buscar condominio por nombre o descripción..."
                  placeholderTextColor={ui.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  style={input}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {/* Segmented control Activos / Activos + Archivados (web y native igual) */}
                <View
                  style={{
                    flexDirection: "row",
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: ui.border,
                    overflow: "hidden",
                  }}
                >
                  <Pressable
                    onPress={() => setIncludeArchived(false)}
                    style={({ pressed }) => ({
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      backgroundColor: !includeArchived
                        ? ui.primarySoft
                        : ui.bgSoft,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: !includeArchived ? ui.primary : ui.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      SOLO ACTIVOS
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setIncludeArchived(true)}
                    style={({ pressed }) => ({
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      backgroundColor: includeArchived
                        ? ui.primarySoft
                        : ui.bgSoft,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: includeArchived ? ui.primary : ui.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      ACTIVOS + ARCHIVADOS
                    </Text>
                  </Pressable>
                </View>

                {canCrudBoards && (
                  <PillButton
                    label={showCreate ? "Ocultar" : "Crear condominio"}
                    tone={showCreate ? "secondary" : "primary"}
                    size="sm"
                    onPress={() => setShowCreate((v) => !v)}
                  />
                )}

                <PillButton
                  label="Recargar"
                  size="sm"
                  onPress={loadBoards}
                />
              </View>
            </View>
          </View>

          {/* LISTA */}
          <FlatList
            data={filteredBoards}
            keyExtractor={(b) => b.id}
            numColumns={numColumns}
            columnWrapperStyle={
              numColumns > 1 ? { gap: gutter } : undefined
            }
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 100,
              gap: 12,
              backgroundColor: ui.bg,
            }}
            refreshing={loading}
            onRefresh={loadBoards}
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
                        color: msg.includes("✅")
                          ? "#BFDBFE"
                          : "#FCA5A5",
                      }}
                    >
                      {msg}
                    </Text>
                  </View>
                )}

                {/* Crear: SOLO admin/superadmin — con toggle */}
                {canCrudBoards && showCreate && (
                  <View style={[cardBase, { gap: 8 }]}>
                    <Text
                      style={{
                        fontWeight: "800",
                        color: ui.text,
                        marginBottom: 4,
                      }}
                    >
                      Crear nuevo condominio
                    </Text>
                    <TextInput
                      placeholder="Nombre del condominio"
                      placeholderTextColor={ui.textMuted}
                      value={name}
                      onChangeText={setName}
                      style={input}
                    />
                    <TextInput
                      placeholder="Descripción (opcional)"
                      placeholderTextColor={ui.textMuted}
                      value={description}
                      onChangeText={setDescription}
                      style={input}
                    />
                    <PillButton
                      label="Crear"
                      onPress={createBoard}
                      disabled={!name.trim() || !selectedOrgId}
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
                      gap: 8,
                      justifyContent: "space-between",
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontWeight: "800",
                        color: ui.text,
                      }}
                      numberOfLines={1}
                    >
                      {selectedTenantLabel
                        ? `Colonias de ${selectedTenantLabel}`
                        : "Selecciona una empresa para ver sus colonias"}
                    </Text>
                    <Text
                      style={{
                        color: ui.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {filteredBoards.length} resultados
                      {search.trim()
                        ? ` para "${search.trim()}"`
                        : ""}
                    </Text>
                  </View>
                  {loading && (
                    <ActivityIndicator color={ui.primary} />
                  )}
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
                    No se encontraron condominios
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
                    un nuevo condominio.
                  </Text>
                </View>
              )
            }
            renderItem={({ item: b }) => (
              <Pressable style={[cardBase, { width: cardWidth }]}>
                {editingId === b.id ? (
                  canCrudBoards ? (
                    <>
                      <Text
                        style={{
                          color: ui.textMuted,
                          fontSize: 12,
                          marginBottom: 4,
                        }}
                      >
                        Editar condominio
                      </Text>
                      <TextInput
                        placeholder="Nuevo nombre"
                        placeholderTextColor={ui.textMuted}
                        value={name}
                        onChangeText={setName}
                        style={[input, { marginBottom: 6 }]}
                      />
                      <TextInput
                        placeholder="Nueva descripción (opcional)"
                        placeholderTextColor={ui.textMuted}
                        value={description}
                        onChangeText={setDescription}
                        style={[input, { marginBottom: 10 }]}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                        }}
                      >
                        <PillButton
                          label="Guardar"
                          size="sm"
                          onPress={() => updateBoard(b.id)}
                        />
                        <PillButton
                          label="Cancelar"
                          tone="secondary"
                          size="sm"
                          onPress={() => {
                            setEditingId(null);
                            setName("");
                            setDescription("");
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                      No tienes permisos para editar este condominio.
                    </Text>
                  )
                ) : (
                  <>
                    {/* Header card */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text
                          style={{
                            fontWeight: "800",
                            fontSize: 15,
                            color: ui.text,
                          }}
                          numberOfLines={1}
                        >
                          {b.name}
                        </Text>
                        <Text
                          style={{
                            color: ui.textMuted,
                            fontSize: 11,
                          }}
                          numberOfLines={1}
                        >
                          {orgLabel(b.orgId)}
                        </Text>
                      </View>
                      {!!b.status && <StatusBadge status={b.status} />}
                    </View>

                    {/* Meta info */}
                    <View style={{ marginBottom: 8 }}>
                      <Text
                        style={{ color: ui.textMuted, fontSize: 11 }}
                        numberOfLines={1}
                      >
                        ID: {b.id}
                      </Text>
                      {!!b.description && (
                        <Text
                          style={{
                            color: ui.text,
                            marginTop: 4,
                            fontSize: 13,
                          }}
                          numberOfLines={2}
                        >
                          {b.description}
                        </Text>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                          marginTop: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {!!b.createdAt && (
                          <Text
                            style={{
                              color: ui.textMuted,
                              fontSize: 11,
                            }}
                          >
                            Creado:{" "}
                            {new Date(
                              b.createdAt
                            ).toLocaleDateString()}
                          </Text>
                        )}
                        {!!b.updatedAt && (
                          <Text
                            style={{
                              color: ui.textMuted,
                              fontSize: 11,
                            }}
                          >
                            · Actualizado:{" "}
                            {new Date(
                              b.updatedAt
                            ).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Acciones */}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 4,
                      }}
                    >
                      <PillButton
                        label="Tareas"
                        size="sm"
                        onPress={() =>
                          router.push({
                            pathname: "/(company)/board-tasks",
                            params: {
                              boardId: b.id,
                              orgId: b.orgId,
                              boardName: b.name,
                            },
                          })
                        }
                      />

                      {canCrudBoards && (
                        <>
                          <PillButton
                            label="Editar"
                            tone="secondary"
                            size="sm"
                            onPress={() => {
                              setEditingId(b.id);
                              setName(b.name);
                              setDescription(b.description ?? "");
                            }}
                          />
                          {b.status !== "ARCHIVED" ? (
                            <PillButton
                              label="Archivar"
                              tone="danger"
                              size="sm"
                              onPress={() =>
                                changeStatus(b.id, "ARCHIVED")
                              }
                            />
                          ) : (
                            <PillButton
                              label="Activar"
                              size="sm"
                              onPress={() =>
                                changeStatus(b.id, "ACTIVE")
                              }
                            />
                          )}
                          <PillButton
                            label="Eliminar"
                            tone="danger"
                            size="sm"
                            onPress={() => deleteBoard(b.id)}
                          />
                        </>
                      )}
                    </View>
                  </>
                )}
              </Pressable>
            )}
            ListFooterComponent={<View style={{ height: 60 }} />}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}