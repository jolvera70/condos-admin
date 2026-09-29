// app/(operator)/unidades.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";

const ui = {
  bg: "#FBF1E1",
  surface: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
  danger: "#DC2626",
  success: "#16A34A",
};

type Board = { id: string; name: string };
type UnitStatus = "ACTIVE" | "INACTIVE";
type Unit = {
  id: string;
  identifier: string;
  ownerName?: string;
  residentUserId?: string;
  committeeMember?: boolean;
  status: UnitStatus;
};

export default function UnidadesOperador() {
  const { me } = useApp();
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [loadingBoards, setLoadingBoards] = useState(true);

  const [units, setUnits] = useState<Unit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoadingBoards(true);
      try {
        const raw = await apiAuth(`/board/boards?page=0&size=1000&orgId=${encodeURIComponent(orgId)}`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: Board[] = list.map((b: any) => ({ id: String(b.id), name: String(b.name ?? b.id) }));
        setBoards(arr);
        if (arr.length && !boardId) setBoardId(arr[0].id);
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoadingBoards(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadUnits = useCallback(async () => {
    if (!boardId) return;
    setLoadingUnits(true);
    try {
      const raw = await apiAuth(
        `/board/boards/${boardId}/units?includeInactive=${includeInactive}&size=200`,
        "GET"
      );
      const list: any[] = Array.isArray(raw) ? raw : raw?.content ?? [];
      setUnits(
        list.map((u) => ({
          id: String(u.id),
          identifier: String(u.identifier),
          ownerName: u.ownerName ?? undefined,
          residentUserId: u.residentUserId ?? undefined,
          committeeMember: !!u.committeeMember,
          status: u.status as UnitStatus,
        }))
      );
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoadingUnits(false);
    }
  }, [boardId, includeInactive]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const createUnit = async () => {
    if (!identifier.trim() || !boardId) {
      setMsg("Escribe un identificador (ej. Casa 12)");
      return;
    }
    setCreating(true);
    setMsg("");
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
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (id: string, status: UnitStatus) => {
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
      (u) => u.identifier.toLowerCase().includes(q) || (u.ownerName ?? "").toLowerCase().includes(q)
    );
  }, [units, search]);

  const activeCount = units.filter((u) => u.status === "ACTIVE").length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 900, gap: 16 }}>
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text, marginBottom: 4 }}>
            Domicilios / Unidades
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Carga y administra los domicilios de tu colonia.
          </Text>
        </Card>

        {!!msg && (
          <Card tone={msg.includes("✅") ? "default" : "danger"}>
            <Text style={{ color: msg.includes("✅") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
          </Card>
        )}

        <Card>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Colonia">
              {loadingBoards ? (
                <ActivityIndicator color={ui.primary} />
              ) : (
                <Select value={boardId} onChange={setBoardId} options={boards.map((b) => ({ label: b.name, value: b.id }))} />
              )}
            </Field>
            <PillButton
              label={showCreate ? "Ocultar" : "Cargar domicilio"}
              onPress={() => setShowCreate((v) => !v)}
            />
          </View>

          {showCreate && (
            <View style={{ marginTop: 12, gap: 8 }}>
              <TextInput
                placeholder="Identificador (ej. Casa 12, Depto 4B)"
                placeholderTextColor={ui.textMuted}
                value={identifier}
                onChangeText={setIdentifier}
                style={inputStyle}
              />
              <TextInput
                placeholder="Nombre del propietario (opcional)"
                placeholderTextColor={ui.textMuted}
                value={ownerName}
                onChangeText={setOwnerName}
                style={inputStyle}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <PillButton label={creating ? "Creando…" : "Crear"} onPress={createUnit} disabled={creating} />
                <PillButton label="Cancelar" tone="secondary" onPress={() => setShowCreate(false)} />
              </View>
              <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                Para dar de alta el acceso del condómino a esta unidad, pide a tu administrador que lo
                vincule desde Condominios · Unidades.
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <TextInput
              placeholder="Buscar por identificador o dueño..."
              placeholderTextColor={ui.textMuted}
              value={search}
              onChangeText={setSearch}
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <Pressable onPress={() => setIncludeInactive((v) => !v)}>
              <Text style={{ color: includeInactive ? ui.primary : ui.textMuted, fontSize: 12, fontWeight: "600" }}>
                {includeInactive ? "✓ Mostrando bajas" : "Mostrar bajas"}
              </Text>
            </Pressable>
          </View>

          <Text style={{ color: ui.textMuted, fontSize: 11, marginBottom: 8 }}>
            {activeCount} activa{activeCount === 1 ? "" : "s"} de {units.length} total
          </Text>

          {loadingUnits ? (
            <ActivityIndicator color={ui.primary} />
          ) : filtered.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>No hay unidades registradas todavía.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {filtered.map((u) => (
                <View
                  key={u.id}
                  style={{
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    padding: 10,
                    gap: 4,
                    opacity: u.status === "INACTIVE" ? 0.55 : 1,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13 }}>{u.identifier}</Text>
                    <Text
                      style={{
                        color: u.status === "ACTIVE" ? ui.primary : ui.danger,
                        fontSize: 10,
                        fontWeight: "800",
                      }}
                    >
                      {u.status === "ACTIVE" ? "ACTIVA" : "BAJA"}
                    </Text>
                  </View>
                  {u.ownerName && (
                    <Text style={{ color: ui.textMuted, fontSize: 12 }}>Propietario: {u.ownerName}</Text>
                  )}
                  <Text style={{ color: u.residentUserId ? ui.primary : ui.textMuted, fontSize: 11 }}>
                    {u.residentUserId ? "🔑 Con acceso de condómino" : "Sin acceso de condómino"}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                    {u.status === "ACTIVE" ? (
                      <Pressable onPress={() => changeStatus(u.id, "INACTIVE")}>
                        <Text style={{ color: ui.danger, fontSize: 11, fontWeight: "700" }}>Dar de baja</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => changeStatus(u.id, "ACTIVE")}>
                        <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>Reactivar</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function Card({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "danger" }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 16,
        padding: 16,
        backgroundColor: tone === "danger" ? "rgba(220,38,38,0.06)" : ui.surface,
        gap: 10,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.08)" } as any) : {}),
      }}
    >
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: ui.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: ui.bg,
  borderWidth: 1,
  borderColor: ui.border,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 10,
  color: ui.text,
  fontSize: 14,
  minWidth: 140,
} as const;

function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}) {
  const palette = {
    primary: { bg: ui.primary, fg: "#FFFFFF" },
    secondary: { bg: ui.borderSoft, fg: ui.text },
  } as const;
  const p = palette[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? ui.borderSoft : p.bg,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 999,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: p.fg, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  if (Platform.OS === "web") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={{
          padding: 10,
          borderRadius: 8,
          border: `1px solid ${ui.border}`,
          backgroundColor: ui.bg,
          color: ui.text,
          fontSize: 14,
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
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: value === o.value ? ui.primary : ui.border,
            backgroundColor: value === o.value ? ui.primarySoft : "transparent",
          }}
        >
          <Text style={{ color: value === o.value ? ui.primary : ui.text, fontSize: 12, fontWeight: "600" }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
