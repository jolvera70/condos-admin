// app/(company)/board-units.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
const condosLogo = require("../../assets/images/iconCondos.png");

/* ========= Tema Condos / Lokaly (oscuro) — igual que boards.tsx ========= */
const ui = {
  bg: "#FBF1E1",
  bgSoft: "#FFFFFF",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
  danger: "#DC2626",
};

type UnitStatus = "ACTIVE" | "INACTIVE";

type Unit = {
  id: string;
  boardId: string;
  orgId: string;
  identifier: string;
  ownerName?: string;
  residentUserId?: string;
  coefficient?: number;
  committeeMember?: boolean;
  status: UnitStatus;
  createdAt?: string;
  updatedAt?: string;
};

function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
  size = "md",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "warning" | "danger";
  size?: "sm" | "md";
}) {
  const palette = {
    primary: { bg: "#1D4ED8", fg: "#F9FAFB" },
    secondary: { bg: "rgba(21,19,31,0.06)", fg: ui.text },
    warning: { bg: "#F59E0B", fg: "#111827" },
    danger: { bg: "#B91C1C", fg: "#F9FAFB" },
  } as const;
  const p = palette[tone];
  const pv = size === "sm" ? 7 : 9;
  const ph = size === "sm" ? 12 : 14;
  const fs = size === "sm" ? 11 : 13;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? ui.borderSoft : p.bg,
        paddingVertical: pv,
        paddingHorizontal: ph,
        borderRadius: 999,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: p.fg, fontSize: fs, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Checkbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: value ? ui.primary : ui.border,
          backgroundColor: value ? ui.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {value && <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>✓</Text>}
      </View>
      <Text style={{ color: ui.text, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export default function BoardUnitsScreen() {
  const router = useRouter();
  const { me, token } = useApp();
  const { width } = useWindowDimensions();
  const isPhone = width < 768;

  const { boardId, orgId: orgIdParam, boardName } = useLocalSearchParams<{
    boardId: string;
    orgId: string;
    boardName?: string;
  }>();
  const orgId = String(orgIdParam || "");

  const myRole: Role = useMemo(
    () => highestRoleInOrg(me, orgId),
    [me, orgId]
  );
  const canCrudUnits = myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR" || myRole === "SUPERADMIN";

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  // crear
  const [showCreate, setShowCreate] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [residentEmail, setResidentEmail] = useState("");
  const [residentPassword, setResidentPassword] = useState("");
  const [committeeMember, setCommitteeMember] = useState(false);

  // editar
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editResidentUserId, setEditResidentUserId] = useState<string | undefined>(undefined);
  const [editResidentEmail, setEditResidentEmail] = useState("");
  const [editResidentPassword, setEditResidentPassword] = useState("");
  const [editCommitteeMember, setEditCommitteeMember] = useState(false);

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
      const arr: Unit[] = list.map((u) => ({
        id: String(u.id),
        boardId: String(u.boardId),
        orgId: String(u.orgId),
        identifier: String(u.identifier),
        ownerName: u.ownerName ?? undefined,
        residentUserId: u.residentUserId ?? undefined,
        coefficient: u.coefficient ?? undefined,
        committeeMember: !!u.committeeMember,
        status: u.status as UnitStatus,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));
      setUnits(arr);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId, includeInactive]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  // Crea (o falla si ya existe) la cuenta del condómino en user-api con rol
  // CONDOMINO, y devuelve su id para enlazarlo como residentUserId de la unidad.
  const provisionCondominoAccount = async (email: string, fullName: string, password: string) => {
    const created = await apiAuth("/user/users", "POST", {
      fullName: fullName || undefined,
      email,
      orgId,
      role: "CONDOMINO",
      status: "ACTIVE",
      provisionAccount: true,
      tempPassword: password,
    });
    return created?.id as string | undefined;
  };

  const createUnit = async () => {
    if (!canCrudUnits) return;
    if (!identifier.trim()) {
      setMsg("Escribe un identificador (ej. Casa 12)");
      return;
    }
    const email = residentEmail.trim().toLowerCase();
    if (email && !residentPassword.trim()) {
      setMsg("Escribe una contraseña temporal para el acceso del condómino");
      return;
    }
    try {
      let residentUserId: string | undefined;
      if (email) {
        residentUserId = await provisionCondominoAccount(email, ownerName.trim(), residentPassword.trim());
      }
      await apiAuth(`/board/boards/${boardId}/units`, "POST", {
        identifier: identifier.trim(),
        ownerName: ownerName.trim() || undefined,
        residentUserId,
        committeeMember: residentUserId ? committeeMember : false,
      });
      setIdentifier("");
      setOwnerName("");
      setResidentEmail("");
      setResidentPassword("");
      setCommitteeMember(false);
      setShowCreate(false);
      setMsg(email ? "Unidad creada y acceso del condómino habilitado ✅" : "Unidad creada ✅");
      await loadUnits();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const startEdit = (u: Unit) => {
    setEditingId(u.id);
    setEditIdentifier(u.identifier);
    setEditOwnerName(u.ownerName ?? "");
    setEditResidentUserId(u.residentUserId);
    setEditResidentEmail("");
    setEditResidentPassword("");
    setEditCommitteeMember(!!u.committeeMember);
  };

  const saveEdit = async () => {
    if (!editingId || !canCrudUnits) return;
    const email = editResidentEmail.trim().toLowerCase();
    if (email && !editResidentPassword.trim()) {
      setMsg("Escribe una contraseña temporal para el acceso del condómino");
      return;
    }
    try {
      let residentUserId = editResidentUserId;
      if (email) {
        residentUserId = await provisionCondominoAccount(email, editOwnerName.trim(), editResidentPassword.trim());
      }
      await apiAuth(`/board/units/${editingId}`, "PUT", {
        identifier: editIdentifier.trim(),
        ownerName: editOwnerName.trim() || undefined,
        residentUserId,
        committeeMember: residentUserId ? editCommitteeMember : false,
      });
      setEditingId(null);
      setMsg(email ? "Unidad actualizada y acceso del condómino habilitado ✅" : "Unidad actualizada ✅");
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

  const activeCount = units.filter((u) => u.status === "ACTIVE").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: ui.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: ui.primary, fontSize: 14, fontWeight: "700" }}>
              ← Volver
            </Text>
          </Pressable>
          <View>
            <Text style={{ color: ui.text, fontSize: 16, fontWeight: "800" }}>
              Unidades {boardName ? `· ${boardName}` : ""}
            </Text>
            <Text style={{ color: ui.textMuted, fontSize: 11 }}>
              {activeCount} activa{activeCount === 1 ? "" : "s"} de {units.length} total
            </Text>
          </View>
        </View>
        {canCrudUnits && (
          <PillButton
            label={showCreate ? "Ocultar" : "Agregar casa"}
            size="sm"
            onPress={() => setShowCreate((s) => !s)}
          />
        )}
      </View>

      {!!msg && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: ui.primary, fontSize: 12 }}>{msg}</Text>
        </View>
      )}

      {/* Formulario de creación */}
      {canCrudUnits && showCreate && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.bgSoft,
            gap: 8,
          }}
        >
          <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13 }}>
            Nueva unidad
          </Text>
          <TextInput
            placeholder="Identificador (ej. Casa 12, Depto 4B)"
            placeholderTextColor={ui.textMuted}
            value={identifier}
            onChangeText={setIdentifier}
            style={{
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: ui.text,
              fontSize: 13,
            }}
          />
          <TextInput
            placeholder="Nombre del propietario (opcional)"
            placeholderTextColor={ui.textMuted}
            value={ownerName}
            onChangeText={setOwnerName}
            style={{
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: ui.text,
              fontSize: 13,
            }}
          />

          <Text style={{ color: ui.textMuted, fontSize: 11, marginTop: 4 }}>
            Acceso del condómino (opcional): si capturas un correo, se crea su
            cuenta para que pueda entrar a ver su unidad y sus cuotas/pagos.
          </Text>
          <TextInput
            placeholder="Correo del condómino (opcional)"
            placeholderTextColor={ui.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={residentEmail}
            onChangeText={setResidentEmail}
            style={{
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: ui.text,
              fontSize: 13,
            }}
          />
          {!!residentEmail.trim() && (
            <TextInput
              placeholder="Contraseña temporal para el condómino"
              placeholderTextColor={ui.textMuted}
              secureTextEntry
              value={residentPassword}
              onChangeText={setResidentPassword}
              style={{
                backgroundColor: ui.bg,
                borderWidth: 1,
                borderColor: ui.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                color: ui.text,
                fontSize: 13,
              }}
            />
          )}
          {!!residentEmail.trim() && (
            <Checkbox
              label="Es parte del comité de vigilancia de esta colonia"
              value={committeeMember}
              onChange={setCommitteeMember}
            />
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton label="Crear" size="sm" onPress={createUnit} />
            <PillButton
              label="Cancelar"
              tone="secondary"
              size="sm"
              onPress={() => setShowCreate(false)}
            />
          </View>
        </View>
      )}

      {/* Búsqueda + filtro */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
        }}
      >
        <TextInput
          placeholder="Buscar por identificador o dueño..."
          placeholderTextColor={ui.textMuted}
          value={search}
          onChangeText={setSearch}
          style={{
            flex: 1,
            backgroundColor: ui.bgSoft,
            borderWidth: 1,
            borderColor: ui.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: ui.text,
            fontSize: 13,
          }}
        />
        <Pressable onPress={() => setIncludeInactive((v) => !v)}>
          <Text
            style={{
              color: includeInactive ? ui.primary : ui.textMuted,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {includeInactive ? "✓ Mostrando bajas" : "Mostrar bajas"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={ui.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <Text style={{ color: ui.textMuted, textAlign: "center", marginTop: 24 }}>
              No hay unidades registradas todavía.
            </Text>
          }
          renderItem={({ item }) => {
            const isEditing = editingId === item.id;
            return (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: ui.border,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: ui.bgSoft,
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
                        backgroundColor: ui.bg,
                        borderWidth: 1,
                        borderColor: ui.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: ui.text,
                        fontSize: 13,
                      }}
                    />
                    <TextInput
                      value={editOwnerName}
                      onChangeText={setEditOwnerName}
                      placeholder="Nombre del propietario"
                      placeholderTextColor={ui.textMuted}
                      style={{
                        backgroundColor: ui.bg,
                        borderWidth: 1,
                        borderColor: ui.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: ui.text,
                        fontSize: 13,
                      }}
                    />
                    {!editResidentUserId && (
                      <>
                        <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                          Esta unidad todavía no tiene acceso de condómino.
                          Captura su correo para habilitarlo.
                        </Text>
                        <TextInput
                          placeholder="Correo del condómino (opcional)"
                          placeholderTextColor={ui.textMuted}
                          autoCapitalize="none"
                          keyboardType="email-address"
                          value={editResidentEmail}
                          onChangeText={setEditResidentEmail}
                          style={{
                            backgroundColor: ui.bg,
                            borderWidth: 1,
                            borderColor: ui.border,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            color: ui.text,
                            fontSize: 13,
                          }}
                        />
                        {!!editResidentEmail.trim() && (
                          <TextInput
                            placeholder="Contraseña temporal para el condómino"
                            placeholderTextColor={ui.textMuted}
                            secureTextEntry
                            value={editResidentPassword}
                            onChangeText={setEditResidentPassword}
                            style={{
                              backgroundColor: ui.bg,
                              borderWidth: 1,
                              borderColor: ui.border,
                              borderRadius: 8,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              color: ui.text,
                              fontSize: 13,
                            }}
                          />
                        )}
                      </>
                    )}
                    {(!!editResidentUserId || !!editResidentEmail.trim()) && (
                      <Checkbox
                        label="Es parte del comité de vigilancia de esta colonia"
                        value={editCommitteeMember}
                        onChange={setEditCommitteeMember}
                      />
                    )}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <PillButton label="Guardar" size="sm" onPress={saveEdit} />
                      <PillButton
                        label="Cancelar"
                        tone="secondary"
                        size="sm"
                        onPress={() => setEditingId(null)}
                      />
                    </View>
                  </View>
                ) : (
                  <>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: ui.text, fontWeight: "800", fontSize: 14 }}>
                        {item.identifier}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor:
                            item.status === "ACTIVE" ? ui.primarySoft : "rgba(248,113,113,0.12)",
                        }}
                      >
                        <Text
                          style={{
                            color: item.status === "ACTIVE" ? ui.primary : ui.danger,
                            fontSize: 10,
                            fontWeight: "800",
                          }}
                        >
                          {item.status === "ACTIVE" ? "ACTIVA" : "BAJA"}
                        </Text>
                      </View>
                    </View>
                    {item.ownerName && (
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                        Propietario: {item.ownerName}
                      </Text>
                    )}
                    <Text style={{ color: item.residentUserId ? ui.primary : ui.textMuted, fontSize: 11 }}>
                      {item.residentUserId ? "🔑 Con acceso de condómino" : "Sin acceso de condómino"}
                      {item.residentUserId && item.committeeMember ? " · 🛡️ Comité de vigilancia" : ""}
                    </Text>
                    {canCrudUnits && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        <PillButton
                          label="Editar"
                          tone="secondary"
                          size="sm"
                          onPress={() => startEdit(item)}
                        />
                        {item.status === "ACTIVE" ? (
                          <PillButton
                            label="Dar de baja"
                            tone="danger"
                            size="sm"
                            onPress={() => changeStatus(item.id, "INACTIVE")}
                          />
                        ) : (
                          <PillButton
                            label="Reactivar"
                            tone="secondary"
                            size="sm"
                            onPress={() => changeStatus(item.id, "ACTIVE")}
                          />
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
