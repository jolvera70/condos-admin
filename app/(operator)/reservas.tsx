// app/(operator)/reservas.tsx
import React, { useCallback, useEffect, useState } from "react";
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
type Amenity = { id: string; name: string };
type Unit = { id: string; identifier: string };
type Reservation = {
  id: string;
  amenityId: string;
  unitId: string;
  date: string;
  peopleCount?: number;
  note?: string;
  status: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReservasOperador() {
  const { me } = useApp();
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());

  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

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

  useEffect(() => {
    if (!boardId) return;
    (async () => {
      try {
        const [amenitiesRaw, unitsRaw] = await Promise.all([
          apiAuth(`/board/boards/${boardId}/amenities?includeInactive=true`, "GET"),
          apiAuth(`/board/boards/${boardId}/units?includeInactive=true&size=500`, "GET"),
        ]);
        setAmenities(
          (Array.isArray(amenitiesRaw) ? amenitiesRaw : []).map((a: any) => ({
            id: String(a.id),
            name: String(a.name ?? ""),
          }))
        );
        const unitList = Array.isArray(unitsRaw) ? unitsRaw : unitsRaw?.content ?? [];
        setUnits(unitList.map((u: any) => ({ id: String(u.id), identifier: String(u.identifier) })));
      } catch {
        setAmenities([]);
        setUnits([]);
      }
    })();
  }, [boardId]);

  const load = useCallback(async () => {
    if (!boardId || !dateFrom || !dateTo) return;
    setLoading(true);
    setMsg("");
    try {
      const raw = await apiAuth(
        `/board/boards/${boardId}/reservations?from=${dateFrom}&to=${dateTo}`,
        "GET"
      );
      const list: Reservation[] = (Array.isArray(raw) ? raw : [])
        .map((r: any) => ({
          id: String(r.id),
          amenityId: String(r.amenityId),
          unitId: String(r.unitId),
          date: String(r.date),
          peopleCount: r.peopleCount,
          note: r.note,
          status: r.status,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
      setReservations(list);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelReservation = async (id: string) => {
    setMsg("");
    try {
      await apiAuth(`/board/reservations/${id}/cancel`, "PATCH");
      setMsg("Reservación cancelada");
      await load();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const amenityName = (id: string) => amenities.find((a) => a.id === id)?.name ?? "Amenidad";
  const unitLabel = (id: string) => units.find((u) => u.id === id)?.identifier ?? id;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 720, gap: 16 }}>
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text, marginBottom: 4 }}>
            Reservas de áreas comunes
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Consulta y administra las reservaciones de tu colonia.
          </Text>
        </Card>

        {!!msg && (
          <Card tone={msg.includes("cancel") ? "default" : "danger"}>
            <Text style={{ color: msg.includes("cancel") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
          </Card>
        )}

        <Card>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Field label="Colonia">
              {loadingBoards ? (
                <ActivityIndicator color={ui.primary} />
              ) : (
                <Select value={boardId} onChange={setBoardId} options={boards.map((b) => ({ label: b.name, value: b.id }))} />
              )}
            </Field>
            <Field label="Desde">
              <TextInput
                value={dateFrom}
                onChangeText={setDateFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={ui.textMuted}
                style={inputStyle}
              />
            </Field>
            <Field label="Hasta">
              <TextInput
                value={dateTo}
                onChangeText={setDateTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={ui.textMuted}
                style={inputStyle}
              />
            </Field>
            <Pressable
              onPress={() => {
                setDateFrom(todayISO());
                setDateTo(todayISO());
              }}
              style={{ justifyContent: "flex-end", paddingBottom: 10 }}
            >
              <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>Hoy</Text>
            </Pressable>
          </View>
        </Card>

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 2 }}>
            Reservaciones
          </Text>
          {!loading && (
            <Text style={{ color: ui.textMuted, fontSize: 11, marginBottom: 8 }}>
              {reservations.length} reservación{reservations.length === 1 ? "" : "es"}
              {" · "}
              {reservations.reduce((s, r) => s + (r.peopleCount ?? 0), 0)} persona(s) en total
            </Text>
          )}
          {loading ? (
            <ActivityIndicator color={ui.primary} />
          ) : reservations.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>Sin reservaciones en este rango de fechas.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {reservations.map((r) => (
                <View
                  key={r.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    opacity: r.status === "CANCELLED" ? 0.5 : 1,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>
                      {r.date} · {amenityName(r.amenityId)} · {unitLabel(r.unitId)}
                    </Text>
                    <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                      {r.peopleCount ? `${r.peopleCount} persona(s)` : ""}
                      {r.note ? ` · ${r.note}` : ""}
                    </Text>
                  </View>
                  {r.status === "CONFIRMED" && (
                    <Pressable
                      onPress={() => cancelReservation(r.id)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: "rgba(220,38,38,0.10)",
                      }}
                    >
                      <Text style={{ color: ui.danger, fontSize: 11, fontWeight: "700" }}>Cancelar</Text>
                    </Pressable>
                  )}
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
