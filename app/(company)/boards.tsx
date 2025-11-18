// app/(company)/boards.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";

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
  const pretty = t.name && t.name !== t.orgId ? t.name : (t.slug ?? `${t.orgId.slice(0, 6)}…`);
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
              if (idx != null && idx >= 0 && idx < options.length) onChange(options[idx].value);
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

function StatusBadge({ status }: { status: BoardStatus }) {
  const palette: Record<BoardStatus, { bg: string; fg: string }> = {
    ACTIVE: { bg: "#E6FFED", fg: "#136F3A" },
    ARCHIVED: { bg: "#F1F5F9", fg: "#475569" },
  };
  const p = palette[status] ?? { bg: "#F1F5F9", fg: "#0F172A" };
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: p.bg }}>
      <Text style={{ color: p.fg, fontWeight: "800", fontSize: 12 }}>{status}</Text>
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
    () => new Map(tenants.map(t => [t.orgId, t.name ?? t.slug ?? t.orgId])),
    [tenants]
  );

  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // NEW: toggle para mostrar/ocultar formulario de creación
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
      const res = await apiAuth(`/tenant/lookup?ids=${encodeURIComponent(ids.join(","))}`, "GET");
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
  const myRole: Role = useMemo(() => highestRoleInOrg(me, selectedOrgId), [me, selectedOrgId]);
  const canCrudBoards = myRole === "ADMINISTRADOR" || myRole === "SUPERADMIN";

  const isSuperAdmin = useMemo(() => {
    if (!me) return false;
    return (
      (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
      (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"))
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
            const prevName = prev.name && prev.name !== prev.orgId ? prev.name : undefined;
            const nextName = t.name && t.name !== t.orgId ? t.name : undefined;
            map.set(
              t.orgId,
              nextName ? { ...prev, ...t, name: nextName } : prevName ? prev : { ...prev, ...t }
            );
          }
        });

        const arr = [...map.values()].map((t) => ({
          ...t,
          name: t.name ?? t.slug ?? undefined,
        }));

        setTenants(arr);
        if (!selectedOrgId && arr.length > 0) setSelectedOrgId(arr[0].orgId);
        return;
      } catch {
        // cae a fromMe
      }
    }

    const arr = fromMe.map((t) => ({ ...t, name: t.name ?? t.slug ?? undefined }));
    setTenants(arr);
    if (!selectedOrgId && arr.length > 0) setSelectedOrgId(arr[0].orgId);
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
    const ids = Array.from(new Set(boards.map(b => String(b.orgId))));
    const missing = ids.filter(id => {
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
        setOrgNameById(prev => ({ ...prev, ...dic }));
      })();
    }
  }, [boards, tenantIndex, orgNameById]);

  // CRUD
  const createBoard = async () => {
    if (!canCrudBoards) { setMsg("No tienes permisos para crear boards."); return; }
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
      setShowCreate(false); // cerrar formulario al crear
      setMsg("Board creado ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const updateBoard = async (id: string) => {
    if (!canCrudBoards) { setMsg("No tienes permisos para editar boards."); return; }
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
    if (!canCrudBoards) { setMsg("No tienes permisos para eliminar boards."); return; }
    try {
      await apiAuth(`/board/boards/${id}`, "DELETE");
      await loadBoards();
      setMsg("Board eliminado ❌");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (id: string, status: BoardStatus) => {
    if (!canCrudBoards) { setMsg("No tienes permisos para cambiar estado."); return; }
    try {
      await apiAuth(`/board/boards/${id}/status?status=${encodeURIComponent(status)}`, "PATCH");
      await loadBoards();
      setMsg(`Estado cambiado a ${status} ✅`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ===== Estilos base y grid ===== */
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

  const cardWidth = useMemo(() => {
    if (numColumns === 1) return maxW - 32; // 16+16 padding
    const totalGutters = gutter * (numColumns - 1);
    return (maxW - 32 - totalGutters) / numColumns;
  }, [maxW, numColumns, gutter]);

  /* ===== Render ===== */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
      <View style={{ flex: 1, alignItems: "center" }}>
        <View style={{ width: maxW, flex: 1 }}>
          {/* TOP BAR */}
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
            <Text style={{ fontSize: isTablet || isDesktop ? 20 : 18, fontWeight: "800" }}>Condos</Text>
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
              <PillButton label="Menú principal" tone="secondary" onPress={() => router.replace("/(app)/home")} />
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
            <Text style={{ fontSize: 18, fontWeight: "800" }}>Condominios</Text>

            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Select
                value={selectedOrgId as any}
                onChange={(v) => setSelectedOrgId(String(v))}
                options={tenants.map((t) => ({ label: labelOfTenant(t), value: t.orgId as any }))}
                minWidth={220}
              />

              {/* Toggle archivados */}
              {Platform.OS === "web" ? (
                <label style={{ display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={includeArchived}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeArchived(e.target.checked)}
                  />
                  Incluir archivados
                </label>
              ) : (
                <PillButton
                  label={includeArchived ? "Ocultar archivados" : "Incluir archivados"}
                  tone="secondary"
                  onPress={() => setIncludeArchived((v) => !v)}
                />
              )}

              {/* NEW: botón para mostrar/ocultar formulario de creación */}
              {canCrudBoards && (
                <PillButton
                  label={showCreate ? "Ocultar" : "Crear condominio"}
                  tone={showCreate ? "secondary" : "primary"}
                  onPress={() => setShowCreate((v) => !v)}
                />
              )}

              <PillButton label="Recargar" onPress={loadBoards} />
            </View>
          </View>

          {/* LISTA */}
          <FlatList
            data={boards}
            keyExtractor={(b) => b.id}
            numColumns={numColumns}
            columnWrapperStyle={numColumns > 1 ? { gap: gutter } : undefined}
            contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
            refreshing={loading}
            onRefresh={loadBoards}
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

                {/* Crear: SOLO admin/superadmin — ahora con toggle */}
                {canCrudBoards && showCreate && (
                  <View style={[cardBase, { gap: 8 }]}>
                    <Text style={{ fontWeight: "800" }}>Crear nuevo condominio</Text>
                    <TextInput
                      placeholder="Nombre del condominio"
                      value={name}
                      onChangeText={setName}
                      style={input}
                    />
                    <TextInput
                      placeholder="Descripción (opcional)"
                      value={description}
                      onChangeText={setDescription}
                      style={input}
                    />
                    <PillButton label="Crear" onPress={createBoard} disabled={!name.trim() || !selectedOrgId} />
                  </View>
                )}

                {/* Encabezado listado */}
                <View style={[cardBase, { padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }]}>
                  <Text style={{ fontWeight: "800" }}>
                    {selectedTenantLabel ? `Colonias de ${selectedTenantLabel}` : "Selecciona una empresa"}
                  </Text>
                  {loading && <ActivityIndicator />}
                </View>
              </View>
            }
            ListEmptyComponent={
              <Text style={{ color: "#777", padding: 12 }}>
                {loading ? "Cargando..." : "No hay boards para mostrar."}
              </Text>
            }
            renderItem={({ item: b }) => (
              <Pressable style={[cardBase, { width: cardWidth }]}>
                {editingId === b.id ? (
                  canCrudBoards ? (
                    <>
                      <TextInput
                        placeholder="Nuevo nombre"
                        value={name}
                        onChangeText={setName}
                        style={input}
                      />
                      <TextInput
                        placeholder="Nueva descripción (opcional)"
                        value={description}
                        onChangeText={setDescription}
                        style={input}
                      />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <PillButton label="Guardar" onPress={() => updateBoard(b.id)} />
                        <PillButton
                          label="Cancelar"
                          tone="secondary"
                          onPress={() => {
                            setEditingId(null);
                            setName("");
                            setDescription("");
                          }}
                        />
                      </View>
                    </>
                  ) : (
                    <Text>No tienes permisos para editar este condominio.</Text>
                  )
                ) : (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontWeight: "800", fontSize: 16 }} numberOfLines={1}>{b.name}</Text>
                      {!!b.status && <StatusBadge status={b.status} />}
                    </View>

                    <Text style={{ color: "#475569" }} numberOfLines={1}>ID: {b.id}</Text>
                    <Text style={{ color: "#64748B" }} numberOfLines={1}>Empresa (orgId): {orgLabel(b.orgId)}</Text>
                    {!!b.description && <Text style={{ color: "#475569" }}>{b.description}</Text>}
                    {!!b.createdAt && (
                      <Text style={{ color: "#94A3B8" }}>Creado: {new Date(b.createdAt).toLocaleString()}</Text>
                    )}
                    {!!b.updatedAt && (
                      <Text style={{ color: "#94A3B8" }}>Actualizado: {new Date(b.updatedAt).toLocaleString()}</Text>
                    )}

                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {canCrudBoards && (
                        <>
                          <PillButton
                            label="Editar"
                            tone="secondary"
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
                              onPress={() => changeStatus(b.id, "ARCHIVED")}
                            />
                          ) : (
                            <PillButton label="Activar" onPress={() => changeStatus(b.id, "ACTIVE")} />
                          )}
                          <PillButton label="Eliminar" tone="danger" onPress={() => deleteBoard(b.id)} />
                        </>
                      )}

                      <PillButton
                        label="Tareas"
                        onPress={() =>
                          router.push({
                            pathname: "/(company)/board-tasks",
                            params: { boardId: b.id, orgId: b.orgId, boardName: b.name },
                          })
                        }
                      />
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