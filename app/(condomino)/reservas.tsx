// app/(condomino)/reservas.tsx
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
import { useMyUnits } from "../../lib/condomino";

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
  warn: "#D97706",
};

type Amenity = {
  id: string;
  boardId: string;
  name: string;
  description?: string;
  maxPeoplePerReservation?: number;
  maxReservationsPerUnitPerDay?: number;
  maxReservationsPerDay?: number;
  advanceBookingDays?: number;
  notes?: string;
  status: string;
};

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

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    // evita corrimiento de zona horaria al parsear "YYYY-MM-DD"
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return s;
  }
}

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
};

export default function ReservasCondomino() {
  const { units, loading: unitsLoading } = useMyUnits();
  const [unitId, setUnitId] = useState("");

  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [amenityNameById, setAmenityNameById] = useState<Record<string, string>>({});

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [peopleCount, setPeopleCount] = useState("1");
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState<{
    remaining: number | null;
    unitAlreadyReservedToday: boolean;
  } | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editPeopleCount, setEditPeopleCount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!unitId && units.length > 0) setUnitId(units[0].id);
  }, [units, unitId]);

  const selectedUnit = units.find((u) => u.id === unitId);

  useEffect(() => {
    if (!selectedUnit) return;
    (async () => {
      setLoadingAmenities(true);
      try {
        const raw = await apiAuth(`/board/boards/${selectedUnit.boardId}/amenities`, "GET");
        const list: Amenity[] = (Array.isArray(raw) ? raw : []).map((a: any) => ({
          id: String(a.id),
          boardId: String(a.boardId),
          name: String(a.name ?? ""),
          description: a.description,
          maxPeoplePerReservation: a.maxPeoplePerReservation,
          maxReservationsPerUnitPerDay: a.maxReservationsPerUnitPerDay,
          maxReservationsPerDay: a.maxReservationsPerDay,
          advanceBookingDays: a.advanceBookingDays,
          notes: a.notes,
          status: a.status,
        }));
        setAmenities(list);
        setAmenityNameById((prev) => {
          const next = { ...prev };
          list.forEach((a) => (next[a.id] = a.name));
          return next;
        });
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoadingAmenities(false);
      }
    })();
  }, [selectedUnit]);

  const loadMine = useCallback(async () => {
    setLoadingMine(true);
    try {
      const raw = await apiAuth(`/board/reservations/mine`, "GET");
      const list: Reservation[] = (Array.isArray(raw) ? raw : []).map((r: any) => ({
        id: String(r.id),
        amenityId: String(r.amenityId),
        unitId: String(r.unitId),
        date: String(r.date),
        peopleCount: r.peopleCount,
        note: r.note,
        status: r.status,
      }));
      setMyReservations(list);
    } catch {
      setMyReservations([]);
    } finally {
      setLoadingMine(false);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  const openBooking = (a: Amenity) => {
    setExpandedId(a.id);
    setDate(todayISO());
    setPeopleCount("1");
    setNote("");
    setAvailability(null);
    setMsg("");
  };

  const checkAvailability = useCallback(async () => {
    if (!expandedId || !unitId || !date) return;
    setCheckingAvailability(true);
    try {
      const raw = await apiAuth(
        `/board/amenities/${expandedId}/availability?date=${date}&unitId=${encodeURIComponent(unitId)}`,
        "GET"
      );
      setAvailability({
        remaining: raw?.remaining ?? null,
        unitAlreadyReservedToday: !!raw?.unitAlreadyReservedToday,
      });
    } catch {
      setAvailability(null);
    } finally {
      setCheckingAvailability(false);
    }
  }, [expandedId, unitId, date]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  const reservar = async (a: Amenity) => {
    setMsg("");
    if (!unitId) return;
    const people = peopleCount ? Number(peopleCount) : undefined;
    setSubmitting(true);
    try {
      await apiAuth(`/board/amenities/${a.id}/reservations`, "POST", {
        unitId,
        date,
        peopleCount: people,
        note: note.trim() || undefined,
      });
      setMsg("Reservación confirmada ✅");
      setExpandedId(null);
      await loadMine();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (r: Reservation) => {
    setMsg("");
    setEditingId(r.id);
    setEditDate(r.date);
    setEditPeopleCount(r.peopleCount ? String(r.peopleCount) : "");
    setEditNote(r.note ?? "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    setMsg("");
    if (!editDate) {
      setMsg("Indica una fecha");
      return;
    }
    setSavingEdit(true);
    try {
      await apiAuth(`/board/reservations/${id}`, "PATCH", {
        date: editDate,
        peopleCount: editPeopleCount ? Number(editPeopleCount) : undefined,
        note: editNote.trim() || undefined,
      });
      setMsg("Reservación actualizada ✅");
      setEditingId(null);
      await loadMine();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSavingEdit(false);
    }
  };

  const cancelar = async (id: string) => {
    setMsg("");
    try {
      await apiAuth(`/board/reservations/${id}/cancel`, "PATCH");
      setMsg("Reservación cancelada");
      await loadMine();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const busy = unitsLoading || loadingAmenities;

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
            Revisa las reglas de cada amenidad antes de reservar.
          </Text>
        </Card>

        {!!msg && (
          <Card tone={msg.includes("✅") ? "default" : "danger"}>
            <Text style={{ color: msg.includes("✅") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
          </Card>
        )}

        {unitsLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={ui.primary} />
          </View>
        ) : units.length === 0 ? (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Todavía no tienes una unidad asignada. Contacta a la administración de tu condominio.
            </Text>
          </Card>
        ) : (
          <>
            {units.length > 1 && (
              <Field label="Unidad">
                <Select
                  value={unitId}
                  onChange={setUnitId}
                  options={units.map((u) => ({ label: u.identifier, value: u.id }))}
                />
              </Field>
            )}

            {loadingAmenities ? (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <ActivityIndicator color={ui.primary} />
              </View>
            ) : amenities.length === 0 ? (
              <Card>
                <Text style={{ color: ui.textMuted, fontSize: 13 }}>
                  Esta colonia todavía no tiene amenidades configuradas.
                </Text>
              </Card>
            ) : (
              amenities.map((a) => (
                <Card key={a.id}>
                  <Pressable onPress={() => (expandedId === a.id ? setExpandedId(null) : openBooking(a))}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: ui.text }}>{a.name}</Text>
                      <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
                        {expandedId === a.id ? "Cerrar" : "Reservar"}
                      </Text>
                    </View>
                    {!!a.description && (
                      <Text style={{ color: ui.textMuted, fontSize: 12, marginTop: 2 }}>{a.description}</Text>
                    )}
                  </Pressable>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {a.maxPeoplePerReservation != null && (
                      <RuleChip text={`Máx. ${a.maxPeoplePerReservation} personas`} />
                    )}
                    {a.maxReservationsPerUnitPerDay != null && (
                      <RuleChip
                        text={`Máx. ${a.maxReservationsPerUnitPerDay} reserva${a.maxReservationsPerUnitPerDay === 1 ? "" : "s"}/día por casa`}
                      />
                    )}
                    {a.maxReservationsPerDay != null && (
                      <RuleChip text={`Cupo: ${a.maxReservationsPerDay} reservas/día`} />
                    )}
                    {a.advanceBookingDays != null && (
                      <RuleChip text={`Hasta ${a.advanceBookingDays} día(s) de anticipación`} />
                    )}
                  </View>

                  {!!a.notes && (
                    <View
                      style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 8,
                        backgroundColor: "#FFF7E0",
                      }}
                    >
                      <Text style={{ color: "#8A6D1F", fontSize: 12 }}>ℹ️ {a.notes}</Text>
                    </View>
                  )}

                  {expandedId === a.id && (
                    <View style={{ marginTop: 12, gap: 10, borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 12 }}>
                      <Field label="Fecha">
                        <TextInput
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={ui.textMuted}
                          value={date}
                          onChangeText={setDate}
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Número de personas">
                        <TextInput
                          keyboardType="number-pad"
                          value={peopleCount}
                          onChangeText={setPeopleCount}
                          style={inputStyle}
                        />
                      </Field>
                      <Field label="Nota (opcional)">
                        <TextInput
                          placeholder="Ej. cumpleaños de mi hijo"
                          placeholderTextColor={ui.textMuted}
                          value={note}
                          onChangeText={setNote}
                          style={inputStyle}
                        />
                      </Field>

                      {checkingAvailability ? (
                        <ActivityIndicator color={ui.primary} size="small" />
                      ) : availability ? (
                        <View style={{ gap: 2 }}>
                          {availability.remaining !== null && (
                            <Text style={{ color: availability.remaining > 0 ? ui.success : ui.danger, fontSize: 12, fontWeight: "700" }}>
                              {availability.remaining > 0
                                ? `${availability.remaining} lugar(es) disponibles ese día`
                                : "Sin cupo disponible ese día"}
                            </Text>
                          )}
                          {availability.unitAlreadyReservedToday && (
                            <Text style={{ color: ui.warn, fontSize: 12 }}>
                              Tu unidad ya tiene una reservación de esta amenidad ese día.
                            </Text>
                          )}
                        </View>
                      ) : null}

                      <Pressable
                        onPress={() => reservar(a)}
                        disabled={submitting}
                        style={{
                          backgroundColor: submitting ? ui.borderSoft : ui.primary,
                          paddingVertical: 12,
                          borderRadius: 10,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                          {submitting ? "Reservando…" : "Confirmar reservación"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </Card>
              ))
            )}
          </>
        )}

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 8 }}>
            Mis reservas
          </Text>
          {loadingMine ? (
            <ActivityIndicator color={ui.primary} />
          ) : myReservations.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>Todavía no tienes reservaciones.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {myReservations.map((r) => {
                const isFuture = r.date >= todayISO();
                const isEditing = editingId === r.id;
                return (
                  <View
                    key={r.id}
                    style={{
                      borderWidth: 1,
                      borderColor: ui.borderSoft,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      gap: 8,
                      opacity: r.status === "CANCELLED" ? 0.5 : 1,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>
                          {amenityNameById[r.amenityId] ?? "Amenidad"} · {fmtDate(r.date)}
                        </Text>
                        <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                          {r.peopleCount ? `${r.peopleCount} persona(s) · ` : ""}
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Text>
                      </View>
                      {r.status === "CONFIRMED" && isFuture && !isEditing && (
                        <View style={{ flexDirection: "row", gap: 6 }}>
                          <Pressable
                            onPress={() => startEdit(r)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: ui.primarySoft,
                            }}
                          >
                            <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>Editar</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => cancelar(r.id)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: "rgba(220,38,38,0.10)",
                            }}
                          >
                            <Text style={{ color: ui.danger, fontSize: 11, fontWeight: "700" }}>Cancelar</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {isEditing && (
                      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: ui.borderSoft, paddingTop: 8 }}>
                        <Field label="Fecha">
                          <TextInput
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={ui.textMuted}
                            value={editDate}
                            onChangeText={setEditDate}
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Número de personas">
                          <TextInput
                            keyboardType="number-pad"
                            value={editPeopleCount}
                            onChangeText={setEditPeopleCount}
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="Nota (opcional)">
                          <TextInput
                            placeholder="Ej. cumpleaños de mi hijo"
                            placeholderTextColor={ui.textMuted}
                            value={editNote}
                            onChangeText={setEditNote}
                            style={inputStyle}
                          />
                        </Field>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Pressable
                            onPress={() => saveEdit(r.id)}
                            disabled={savingEdit}
                            style={{
                              flex: 1,
                              backgroundColor: savingEdit ? ui.borderSoft : ui.primary,
                              paddingVertical: 10,
                              borderRadius: 10,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>
                              {savingEdit ? "Guardando…" : "Guardar cambios"}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={cancelEdit}
                            disabled={savingEdit}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 10,
                              borderRadius: 10,
                              backgroundColor: ui.borderSoft,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13 }}>Cerrar</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
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

function RuleChip({ text }: { text: string }) {
  return (
    <View
      style={{
        backgroundColor: ui.primarySoft,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>{text}</Text>
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
