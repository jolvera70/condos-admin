// app/(company)/boards.tsx
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  name: string;
  slug?: string;
};

export default function BoardsCompany() {
  const { me, logout } = useApp();
  const router = useRouter();

  // Datos base
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Listado de boards
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Crear / Editar
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // ---- RBAC: mi rol en esta org y permisos de CRUD de boards
  const myRole: Role = useMemo(
    () => highestRoleInOrg(me, selectedOrgId),
    [me, selectedOrgId]
  );
  const canCrudBoards = myRole === "ADMINISTRADOR" || myRole === "SUPERADMIN";

  const isSuperAdmin = useMemo(() => {
    if (!me) return false;
    return (
      (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) ||
      (Array.isArray(me.orgs) && me.orgs.some((o: any) => o.role === "SUPERADMIN"))
    );
  }, [me]);

  // Inicializa selectedOrgId desde me.orgs (si aún no hay)
  useEffect(() => {
    if (!selectedOrgId && Array.isArray(me?.orgs) && me!.orgs.length > 0) {
      setSelectedOrgId(me!.orgs[0].orgId);
    }
  }, [me, selectedOrgId]);

  // Cargar Tenants
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

  // Cargar Boards (requiere orgId)
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

  // ---- acciones CRUD (protegidas en UI y aquí) ----
  const createBoard = async () => {
    if (!canCrudBoards) { setMsg("No tienes permisos para crear boards."); return; }
    try {
      setMsg("");
      if (!selectedOrgId || !name.trim()) {
        setMsg("Selecciona un condominio y escribe un nombre.");
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
      await loadBoards();
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

  /* ------------------------ estilos base ------------------------ */
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

  const TenantSelector = () => {
    if (Platform.OS === "web") {
      return (
        <View style={{ marginRight: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text>Empresa:</Text>
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.currentTarget.value)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #E5E7EB" as any }}
          >
            {!selectedOrgId && <option value="">— elige —</option>}
            {tenants.map((t) => (
              <option key={t.orgId} value={t.orgId}>
                {t.name}{t.slug ? ` (${t.slug})` : ""}
              </option>
            ))}
          </select>
        </View>
      );
    }
    return (
      <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}>
        <Picker selectedValue={selectedOrgId} onValueChange={(val) => setSelectedOrgId(String(val))}>
          {!selectedOrgId && <Picker.Item label="— elige —" value="" />}
          {tenants.map((t) => (
            <Picker.Item key={t.orgId} label={`${t.name} (${t.slug ?? t.orgId})`} value={t.orgId} />
          ))}
        </Picker>
      </View>
    );
  };

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
          <TenantSelector />

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

          <PillButton label="Recargar" onPress={loadBoards} />
        </View>
      </View>

      {/* SCROLL PRINCIPAL */}
      <View style={{ flex: 1, minHeight: 0 }}>
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          data={boards}
          refreshing={loading}
          onRefresh={loadBoards}
          keyExtractor={(b) => b.id}
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

              {/* Crear: SOLO admin/superadmin */}
              {canCrudBoards && (
                <View style={{ ...card, gap: 8 }}>
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
              <View style={{ ...card, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontWeight: "800" }}>
                  {selectedOrgId ? `Colonias de ${selectedOrgId}` : "Selecciona una empresa"}
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
            <Pressable
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
                    <Text style={{ fontWeight: "800", fontSize: 16 }}>{b.name}</Text>
                    {!!b.status && <StatusBadge status={b.status} />}
                  </View>

                  <Text style={{ color: "#475569" }}>ID: {b.id}</Text>
                  <Text style={{ color: "#64748B" }}>Condominio (orgId): {b.orgId}</Text>
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
        opacity: disabled ? 0.7 : 1,
      })}
    >
      <Text style={{ color: p.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
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