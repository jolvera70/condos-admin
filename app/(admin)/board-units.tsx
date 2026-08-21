// app/(admin)/board-units.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiAuth } from "../../lib/api";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

/* ======================= Theme estilo Lokaly (igual que board-tasks) ======================= */
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

type UnitStatus = "ACTIVE" | "INACTIVE";

type Unit = {
  id: string;
  boardId: string;
  orgId: string;
  identifier: string;
  ownerName?: string;
  status: UnitStatus;
};

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
    primary: { bg: lokalyTheme.primary, bg2: "#E0A93F", fg: "#111827" },
    secondary: { bg: "#111827", bg2: "#020617", fg: "#E5E7EB" },
    warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#111827" },
    danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#F9FAFB" },
  }[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: disabled
          ? "rgba(148,163,184,0.45)"
          : pressed
          ? palette.bg2
          : palette.bg,
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
        {label}
      </Text>
    </Pressable>
  );
}

export default function BoardUnitsAdminScreen() {
  const router = useRouter();
  const { me, token } = useApp();

  const { boardId, orgId: orgIdParam, boardName } = useLocalSearchParams<{
    boardId: string;
    orgId: string;
    boardName?: string;
  }>();
  const orgId = String(orgIdParam || "");

  const myRole: Role = useMemo(() => highestRoleInOrg(me, orgId), [me, orgId]);
  const canCrudUnits =
    myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR" || myRole === "SUPERADMIN";

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [ownerName, setOwnerName] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editOwnerName, setEditOwnerName] = useState("");

  const loadUnits = useCallback(async () => {
    if (!boardId) return;
    setMsg("");
    setLoading(true);
    try {
      const raw = await apiAuth(
        `/board/boards/${boardId}/units?includeInactive=${includeInactive}&size=200`,
        "GET"
      );
      const list: any[] = Array.isArray(raw) ? raw : raw?.content ?? [];
      setUnits(
        list.map((u) => ({
          id: String(u.id),
          boardId: String(u.boardId),
          orgId: String(u.orgId),
          identifier: String(u.identifier),
          ownerName: u.ownerName ?? undefined,
          status: u.status as UnitStatus,
        }))
      );
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId, includeInactive]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const createUnit = async () => {
    if (!canCrudUnits) return;
    if (!identifier.trim()) {
      setMsg("Escribe un identificador (ej. Casa 12)");
      return;
    }
    try {
      await apiAuth(`/board/boards/${boardId}/units`, "POST", {
        identifier: identifier.trim(),
        ownerName: ownerName.trim() || undefined,
      });
      setIdentifier("");
      setOwnerName("");
      setShowCreate(false);
      setMsg("Unidad creada ✅");
      await loadUnits();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const startEdit = (u: Unit) => {
    setEditingId(u.id);
    setEditIdentifier(u.identifier);
    setEditOwnerName(u.ownerName ?? "");
  };

  const saveEdit = async () => {
    if (!editingId || !canCrudUnits) return;
    try {
      await apiAuth(`/board/units/${editingId}`, "PUT", {
        identifier: editIdentifier.trim(),
        ownerName: editOwnerName.trim() || undefined,
      });
      setEditingId(null);
      setMsg("Unidad actualizada ✅");
      await loadUnits();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (id: string, status: UnitStatus) => {
    if (!canCrudUnits) return;
    try {
      await apiAuth(`/board/units/${id}/status`, "PATCH", { status });
      setMsg(status === "ACTIVE" ? "Unidad activada ✅" : "Unidad dada de baja ❌");
      await loadUnits();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return units;
    return units.filter(
      (u) =>
        u.identifier.toLowerCase().includes(q) ||
        (u.ownerName ?? "").toLowerCase().includes(q)
    );
  }, [units, search]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: lokalyTheme.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: lokalyTheme.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: lokalyTheme.primary, fontSize: 14, fontWeight: "700" }}>
              ← Volver
            </Text>
          </Pressable>
          <Image source={condosLogo} style={{ width: 24, height: 24, borderRadius: 6 }} />
          <Text style={{ color: lokalyTheme.text, fontSize: 16, fontWeight: "800" }}>
            Unidades {boardName ? `· ${boardName}` : ""}
          </Text>
        </View>
        {canCrudUnits && (
          <PillButton
            label={showCreate ? "OCULTAR" : "AGREGAR CASA"}
            onPress={() => setShowCreate((s) => !s)}
          />
        )}
      </View>

      {!!msg && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: lokalyTheme.primary, fontSize: 12 }}>{msg}</Text>
        </View>
      )}

      {canCrudUnits && showCreate && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: lokalyTheme.border,
            backgroundColor: lokalyTheme.surface,
            gap: 8,
          }}
        >
          <TextInput
            placeholder="Identificador (ej. Casa 12, Depto 4B)"
            placeholderTextColor={lokalyTheme.textMuted}
            value={identifier}
            onChangeText={setIdentifier}
            style={{
              backgroundColor: lokalyTheme.bgAlt,
              borderWidth: 1,
              borderColor: lokalyTheme.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: lokalyTheme.text,
              fontSize: 13,
            }}
          />
          <TextInput
            placeholder="Nombre del propietario (opcional)"
            placeholderTextColor={lokalyTheme.textMuted}
            value={ownerName}
            onChangeText={setOwnerName}
            style={{
              backgroundColor: lokalyTheme.bgAlt,
              borderWidth: 1,
              borderColor: lokalyTheme.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: lokalyTheme.text,
              fontSize: 13,
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton label="CREAR" onPress={createUnit} />
            <PillButton label="CANCELAR" tone="secondary" onPress={() => setShowCreate(false)} />
          </View>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
        <TextInput
          placeholder="Buscar por identificador o dueño..."
          placeholderTextColor={lokalyTheme.textMuted}
          value={search}
          onChangeText={setSearch}
          style={{
            flex: 1,
            backgroundColor: lokalyTheme.surface,
            borderWidth: 1,
            borderColor: lokalyTheme.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: lokalyTheme.text,
            fontSize: 13,
          }}
        />
        <Pressable onPress={() => setIncludeInactive((v) => !v)}>
          <Text
            style={{
              color: includeInactive ? lokalyTheme.primary : lokalyTheme.textMuted,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {includeInactive ? "✓ Mostrando bajas" : "Mostrar bajas"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={lokalyTheme.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <Text style={{ color: lokalyTheme.textMuted, textAlign: "center", marginTop: 24 }}>
              No hay unidades registradas todavía.
            </Text>
          }
          renderItem={({ item }) => {
            const isEditing = editingId === item.id;
            return (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: lokalyTheme.border,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: lokalyTheme.surface,
                  gap: 8,
                  opacity: item.status === "INACTIVE" ? 0.55 : 1,
                }}
              >
                {isEditing ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      value={editIdentifier}
                      onChangeText={setEditIdentifier}
                      style={{
                        backgroundColor: lokalyTheme.bgAlt,
                        borderWidth: 1,
                        borderColor: lokalyTheme.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: lokalyTheme.text,
                        fontSize: 13,
                      }}
                    />
                    <TextInput
                      value={editOwnerName}
                      onChangeText={setEditOwnerName}
                      placeholder="Nombre del propietario"
                      placeholderTextColor={lokalyTheme.textMuted}
                      style={{
                        backgroundColor: lokalyTheme.bgAlt,
                        borderWidth: 1,
                        borderColor: lokalyTheme.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: lokalyTheme.text,
                        fontSize: 13,
                      }}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <PillButton label="GUARDAR" onPress={saveEdit} />
                      <PillButton label="CANCELAR" tone="secondary" onPress={() => setEditingId(null)} />
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: lokalyTheme.text, fontWeight: "800", fontSize: 14 }}>
                        {item.identifier}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor:
                            item.status === "ACTIVE" ? lokalyTheme.primarySoft : "rgba(248,113,113,0.12)",
                        }}
                      >
                        <Text
                          style={{
                            color: item.status === "ACTIVE" ? lokalyTheme.primary : lokalyTheme.danger,
                            fontSize: 10,
                            fontWeight: "800",
                          }}
                        >
                          {item.status === "ACTIVE" ? "ACTIVA" : "BAJA"}
                        </Text>
                      </View>
                    </View>
                    {item.ownerName && (
                      <Text style={{ color: lokalyTheme.textMuted, fontSize: 12 }}>
                        Propietario: {item.ownerName}
                      </Text>
                    )}
                    {canCrudUnits && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        <PillButton label="EDITAR" tone="secondary" onPress={() => startEdit(item)} />
                        {item.status === "ACTIVE" ? (
                          <PillButton label="DAR DE BAJA" tone="danger" onPress={() => changeStatus(item.id, "INACTIVE")} />
                        ) : (
                          <PillButton label="REACTIVAR" tone="secondary" onPress={() => changeStatus(item.id, "ACTIVE")} />
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
