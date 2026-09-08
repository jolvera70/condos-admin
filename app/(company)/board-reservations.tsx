// app/(company)/board-reservations.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";

const ui = {
  bg: "#FBF1E1",
  bgSoft: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
  danger: "#DC2626",
  success: "#16A34A",
};

type Reservation = {
  id: string;
  unitId: string;
  date: string;
  peopleCount?: number;
  note?: string;
  status: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function BoardReservationsScreen() {
  const router = useRouter();
  const { amenityId, boardId, amenityName } = useLocalSearchParams<{
    amenityId: string;
    boardId: string;
    orgId: string;
    amenityName?: string;
  }>();

  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [unitLabelById, setUnitLabelById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!boardId) return;
    (async () => {
      try {
        const raw = await apiAuth(`/board/boards/${boardId}/units?includeInactive=true&size=500`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const map: Record<string, string> = {};
        list.forEach((u: any) => (map[String(u.id)] = String(u.identifier)));
        setUnitLabelById(map);
      } catch {
        // no bloquea la pantalla si falla
      }
    })();
  }, [boardId]);

  const load = useCallback(async () => {
    if (!amenityId || !dateFrom || !dateTo) return;
    setLoading(true);
    setMsg("");
    try {
      const raw = await apiAuth(
        `/board/amenities/${amenityId}/reservations?from=${dateFrom}&to=${dateTo}`,
        "GET"
      );
      const list: Reservation[] = (Array.isArray(raw) ? raw : [])
        .map((r: any) => ({
          id: String(r.id),
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
  }, [amenityId, dateFrom, dateTo]);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: ui.border,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: ui.primary, fontSize: 14, fontWeight: "700" }}>← Volver</Text>
        </Pressable>
        <Text style={{ color: ui.text, fontSize: 16, fontWeight: "800" }}>
          Reservas {amenityName ? `· ${amenityName}` : ""}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16, flexWrap: "wrap" }}>
        <Text style={{ color: ui.textMuted, fontSize: 12, fontWeight: "600" }}>Desde:</Text>
        <TextInput
          value={dateFrom}
          onChangeText={setDateFrom}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={ui.textMuted}
          style={{
            backgroundColor: ui.bgSoft,
            borderWidth: 1,
            borderColor: ui.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: ui.text,
            fontSize: 13,
            minWidth: 130,
          }}
        />
        <Text style={{ color: ui.textMuted, fontSize: 12, fontWeight: "600" }}>Hasta:</Text>
        <TextInput
          value={dateTo}
          onChangeText={setDateTo}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={ui.textMuted}
          style={{
            backgroundColor: ui.bgSoft,
            borderWidth: 1,
            borderColor: ui.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: ui.text,
            fontSize: 13,
            minWidth: 130,
          }}
        />
        <Pressable
          onPress={() => {
            setDateFrom(todayISO());
            setDateTo(todayISO());
          }}
        >
          <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>Hoy</Text>
        </Pressable>
        {loading && <ActivityIndicator color={ui.primary} />}
      </View>

      {!loading && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ color: ui.textMuted, fontSize: 12 }}>
            {reservations.length} reservación{reservations.length === 1 ? "" : "es"}
            {" · "}
            {reservations.reduce((s, r) => s + (r.peopleCount ?? 0), 0)} persona(s) en total
          </Text>
        </View>
      )}

      {!!msg && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Text style={{ color: msg.includes("cancel") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 8 }}>
        {!loading && reservations.length === 0 && (
          <Text style={{ color: ui.textMuted, textAlign: "center", marginTop: 24 }}>
            Sin reservaciones en este rango de fechas.
          </Text>
        )}
        {reservations.map((r) => (
          <View
            key={r.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderWidth: 1,
              borderColor: ui.borderSoft,
              borderRadius: 12,
              backgroundColor: ui.bgSoft,
              paddingHorizontal: 12,
              paddingVertical: 10,
              opacity: r.status === "CANCELLED" ? 0.5 : 1,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>
                {r.date} · {unitLabelById[r.unitId] ?? r.unitId}
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
      </ScrollView>
    </SafeAreaView>
  );
}
