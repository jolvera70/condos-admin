// app/(app)/admin/boards.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
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
  name: string;
  slug?: string;
};

export default function BoardsAdmin() {
  const { me, logout } = useApp();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // 2 columnas en iPad/desktop
  const twoCols = width >= 820;

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
      (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"))
    );
  }, [me]);

  const myRoleInOrg = useMemo(() => {
    if (!me || !selectedOrgId) return "";
    const found = (me.orgs ?? []).find((o: any) => o.orgId === selectedOrgId);
    return (found?.role || (me.roles ?? [])[0] || "").toString().toUpperCase();
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
        if (!selectedOrgId && fallback.length > 0) setSelectedOrgId(fallback[0].orgId);
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
      const rawStatus = (b.status ?? b.boardStatus ?? b.state ?? "").toString().trim().toUpperCase();
      const norm: BoardStatus = rawStatus === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
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
            const fixed = raw2 === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
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
      await apiAuth(`/board/boards/${id}/status?status=${encodeURIComponent(status)}`, "PATCH");
      await loadBoards();
      setMsg(`Estado cambiado a ${status} ✅`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* =================== UI helpers =================== */
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


function getBoardStatusUI(status?: BoardStatus) {
  const s = String(status || "ACTIVE").toUpperCase() as BoardStatus;
  if (s === "ARCHIVED") return { pillBg: "#F1F5F9", pillFg: "#475569", bar: "#9CA3AF", label: "ARCHIVED" };
  return { pillBg: "#E6FFED", pillFg: "#136F3A", bar: "#10B981", label: "ACTIVE" };
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

  function StatusPill({ status, style }: { status?: BoardStatus; style?: any }) {
    const ui = getBoardStatusUI(status);
    return (
      <View style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: ui.pillBg }, style]}>
        <Text style={{ color: ui.pillFg, fontWeight: "800", fontSize: 12 }}>{ui.label}</Text>
      </View>
    );
  }

  /* ============== Selector Tenant (iOS bonito) ============== */
  /* ============== Selector Tenant (robusto por plataforma) ============== */
  const selectedTenant = tenants.find((t) => t.orgId === selectedOrgId);

  const TenantSelector = () => {
    // WEB: <select>
    if (Platform.OS === "web") {
      return (
        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.currentTarget.value)}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any, minWidth: 260 }}
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

    // ANDROID: Picker en modo dropdown (no rompe layout)
    if (Platform.OS === "android") {
      return (
        <View
          style={{
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 10,
            minHeight: 44,
            justifyContent: "center",
            backgroundColor: "#fff",
          }}
        >
          <Picker
            selectedValue={selectedOrgId}
            onValueChange={(val) => setSelectedOrgId(String(val))}
            mode="dropdown"
            style={{ height: 44 }}
            itemStyle={{ fontSize: 14 }}
          >
            {!selectedOrgId && <Picker.Item label="— elige —" value="" />}
            {tenants.map((t) => (
              <Picker.Item key={t.orgId} label={`${t.name} (${t.slug ?? t.orgId})`} value={t.orgId} />
            ))}
          </Picker>
        </View>
      );
    }

    // iOS/iPad: ActionSheet (estable, no encimado)
    const currentLabel = selectedTenant
      ? `${selectedTenant.name} (${selectedTenant.slug ?? selectedTenant.orgId})`
      : "— elige —";

    const options = ["— elige —", ...tenants.map((t) => `${t.name} (${t.slug ?? t.orgId})`), "Cancelar"];
    const cancelButtonIndex = options.length - 1;

    const openSheet = () => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Selecciona empresa",
          options,
          cancelButtonIndex,
          userInterfaceStyle: "light",
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
          borderColor: "#E5E7EB",
          borderRadius: 10,
          minHeight: 44,
          backgroundColor: pressed ? "#F8FAFC" : "#fff",
          justifyContent: "center",
          paddingHorizontal: 12,
          minWidth: 260,
        })}
      >
        <Text style={{ fontWeight: "700", color: "#111827" }} numberOfLines={1}>
          {currentLabel}
        </Text>
        <Text style={{ position: "absolute", right: 12, color: "#94A3B8" }}>▼</Text>
      </Pressable>
    );
  };

  /* =================== Render =================== */
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Gestión de Colonias</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
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
          <PillButton label="RECARGAR" tone="secondary" onPress={loadBoards} />
        </View>
      </View>

      {/* LISTA */}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
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
                  backgroundColor: msg.includes("✅") ? "#F1F5FF" : "#FEF2F2",
                  borderWidth: 1,
                  borderColor: msg.includes("✅") ? "#DBEAFE" : "#FECACA",
                }}
              >
                <Text style={{ color: msg.includes("✅") ? "#1E40AF" : "#B91C1C" }}>{msg}</Text>
              </View>
            )}

            {/* Filtros / empresa / archivados */}
            <View style={{ ...card, gap: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                <Text style={{ fontWeight: "800" }}>Empresa</Text>
                <TenantSelector />
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
                    label={includeArchived ? "OCULTAR ARCHIVADOS" : "INCLUIR ARCHIVADOS"}
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
                  <TextInput placeholder="Nombre" value={name} onChangeText={setName} style={input} />
                  <TextInput
                    placeholder="Descripción (opcional)"
                    value={description}
                    onChangeText={setDescription}
                    style={input}
                  />
                  <PillButton label="CREAR" onPress={createBoard} disabled={!name.trim() || !selectedOrgId} />
                </View>
              )}
            </View>

            {/* Encabezado listado */}
            <View style={{ ...card, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>
                Colonias de {(tenants.find((t) => t.orgId === selectedOrgId)?.name ?? selectedOrgId) || "…"}
              </Text>
              {loading && <ActivityIndicator />}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: "#777", padding: 12 }}>
            {loading ? "Cargando..." : "No hay colonias para mostrar."}
          </Text>
        }
        renderItem={({ item: b }) => {
          const isEditing = editingId === b.id;
          const ui = getBoardStatusUI(b.status);
          if (Platform.OS === "web") {
            console.log("Board status raw:", b.status, "name:", b.name);
          }
          return (
            <View
              style={{
                position: "relative",               // 👈 para posicionar el pill
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
                borderLeftWidth: 6,                 // 👈 barra por estado
                borderLeftColor: ui.bar,
              }}

            >
              {/* Pill en la esquina superior derecha */}
              <StatusPill status={b.status} style={{ position: "absolute", top: 10, right: 12 }} />

              {!isEditing ? (
                <>
                  <Text style={{ fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
                    {b.name}
                  </Text>

                  <Text style={{ color: "#64748B", fontSize: 12 }}>ID: {b.id}</Text>
                  <Text style={{ color: "#64748B", fontSize: 12 }}>Empresa: {b.orgId}</Text>
                  {!!b.description && <Text>Descripción: {b.description}</Text>}
                  {!!b.updatedAt && (
                    <Text style={{ color: "#64748B" }}>
                      Actualizado: {new Date(b.updatedAt).toLocaleString()}
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <PillButton label="EDITAR" tone="secondary" onPress={() => { setEditingId(b.id); setName(b.name); setDescription(b.description ?? ""); }} />
                    {b.status !== "ARCHIVED" ? (
                      <PillButton label="ARCHIVAR" tone="warning" onPress={() => changeStatus(b.id, "ARCHIVED")} />
                    ) : (
                      <PillButton label="ACTIVAR" onPress={() => changeStatus(b.id, "ACTIVE")} />
                    )}
                    <PillButton
                      label="TAREAS"
                      onPress={() =>
                        router.push({ pathname: "../(admin)/board-tasks", params: { boardId: b.id, orgId: b.orgId, boardName: b.name } })
                      }
                    />
                  </View>
                </>
              ) : (
                // ... editor igual que ya lo tienes ...
                <>
                  <Text style={{ fontWeight: "800" }}>Editar condominio</Text>
                  {/* ... */}
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