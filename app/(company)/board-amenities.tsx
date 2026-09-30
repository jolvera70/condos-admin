// app/(company)/board-amenities.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";

const ui = {
  bg: "#FBF1E1",
  bgSoft: "#FFFFFF",
  surface: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
  danger: "#DC2626",
};

type AmenityStatus = "ACTIVE" | "INACTIVE";

type Amenity = {
  id: string;
  boardId: string;
  name: string;
  description?: string;
  maxPeoplePerReservation?: number;
  maxReservationsPerUnitPerDay?: number;
  maxReservationsPerDay?: number;
  advanceBookingDays?: number;
  openTime?: string;
  closeTime?: string;
  slotDurationMinutes?: number;
  blockedDates?: BlockedDate[];
  recurringBlocks?: RecurringBlock[];
  notes?: string;
  status: AmenityStatus;
};

type BlockedDate = { date: string; reason: string };
type RecurringBlock = { anchorDate: string; intervalWeeks: number; until?: string; reason: string };

type FormState = {
  name: string;
  description: string;
  maxPeoplePerReservation: string;
  maxReservationsPerUnitPerDay: string;
  maxReservationsPerDay: string;
  advanceBookingDays: string;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: string;
  blockedDates: BlockedDate[];
  recurringBlocks: RecurringBlock[];
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  maxPeoplePerReservation: "",
  maxReservationsPerUnitPerDay: "1",
  maxReservationsPerDay: "",
  advanceBookingDays: "",
  openTime: "",
  closeTime: "",
  slotDurationMinutes: "",
  blockedDates: [],
  recurringBlocks: [],
  notes: "",
};

const WEEKDAY_LABEL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function weekdayOf(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return Number.isNaN(d.getTime()) ? "" : WEEKDAY_LABEL[d.getDay()];
}

function toIntOrUndefined(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

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
      <Text style={{ color: p.fg, fontSize: fs, fontWeight: "700" }}>{label}</Text>
    </Pressable>
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

function inputBox() {
  return {
    backgroundColor: ui.bg,
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: ui.text,
    fontSize: 13,
  } as const;
}

function AmenityForm({
  form,
  setForm,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [blockDate, setBlockDate] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const addBlockedDate = () => {
    const d = blockDate.trim();
    if (!d) return;
    setForm((f) => ({ ...f, blockedDates: [...f.blockedDates, { date: d, reason: blockReason.trim() }] }));
    setBlockDate("");
    setBlockReason("");
  };

  const removeBlockedDate = (date: string) => {
    setForm((f) => ({ ...f, blockedDates: f.blockedDates.filter((b) => b.date !== date) }));
  };

  const [recurAnchor, setRecurAnchor] = useState("");
  const [recurInterval, setRecurInterval] = useState("1");
  const [recurUntil, setRecurUntil] = useState("");
  const [recurReason, setRecurReason] = useState("");

  const addRecurringBlock = () => {
    const anchor = recurAnchor.trim();
    if (!anchor) return;
    const iv = Number(recurInterval.trim()) || 1;
    setForm((f) => ({
      ...f,
      recurringBlocks: [
        ...f.recurringBlocks,
        { anchorDate: anchor, intervalWeeks: iv, until: recurUntil.trim() || undefined, reason: recurReason.trim() },
      ],
    }));
    setRecurAnchor("");
    setRecurInterval("1");
    setRecurUntil("");
    setRecurReason("");
  };

  const removeRecurringBlock = (idx: number) => {
    setForm((f) => ({ ...f, recurringBlocks: f.recurringBlocks.filter((_, i) => i !== idx) }));
  };

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        placeholder="Nombre (ej. Alberca)"
        placeholderTextColor={ui.textMuted}
        value={form.name}
        onChangeText={set("name")}
        style={inputBox()}
      />
      <TextInput
        placeholder="Descripción (opcional)"
        placeholderTextColor={ui.textMuted}
        value={form.description}
        onChangeText={set("description")}
        style={inputBox()}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Máx. personas/reserva</Text>
          <TextInput
            placeholder="Sin límite"
            placeholderTextColor={ui.textMuted}
            keyboardType="number-pad"
            value={form.maxPeoplePerReservation}
            onChangeText={set("maxPeoplePerReservation")}
            style={inputBox()}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Reservas/día por casa</Text>
          <TextInput
            placeholder="Sin límite"
            placeholderTextColor={ui.textMuted}
            keyboardType="number-pad"
            value={form.maxReservationsPerUnitPerDay}
            onChangeText={set("maxReservationsPerUnitPerDay")}
            style={inputBox()}
          />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Cupo total/día</Text>
          <TextInput
            placeholder="Sin límite"
            placeholderTextColor={ui.textMuted}
            keyboardType="number-pad"
            value={form.maxReservationsPerDay}
            onChangeText={set("maxReservationsPerDay")}
            style={inputBox()}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Días de anticipación máx.</Text>
          <TextInput
            placeholder="Sin límite"
            placeholderTextColor={ui.textMuted}
            keyboardType="number-pad"
            value={form.advanceBookingDays}
            onChangeText={set("advanceBookingDays")}
            style={inputBox()}
          />
        </View>
      </View>
      <Text style={{ color: ui.textMuted, fontSize: 11, marginTop: 2 }}>
        Horario por bloques (opcional): si lo configuras, el condómino elige una hora al reservar en
        vez de solo el día. Déjalo vacío para reservar por día completo.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Abre (HH:mm)</Text>
          <TextInput
            placeholder="08:00"
            placeholderTextColor={ui.textMuted}
            value={form.openTime}
            onChangeText={set("openTime")}
            style={inputBox()}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Cierra (HH:mm)</Text>
          <TextInput
            placeholder="20:00"
            placeholderTextColor={ui.textMuted}
            value={form.closeTime}
            onChangeText={set("closeTime")}
            style={inputBox()}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Bloque (min)</Text>
          <TextInput
            placeholder="60"
            placeholderTextColor={ui.textMuted}
            keyboardType="number-pad"
            value={form.slotDurationMinutes}
            onChangeText={set("slotDurationMinutes")}
            style={inputBox()}
          />
        </View>
      </View>
      <Text style={{ color: ui.textMuted, fontSize: 11, marginTop: 2 }}>
        Días sin disponibilidad (opcional): fechas puntuales en las que nadie puede reservar esta
        amenidad, ej. por mantenimiento.
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          placeholder="YYYY-MM-DD"
          placeholderTextColor={ui.textMuted}
          value={blockDate}
          onChangeText={setBlockDate}
          style={[inputBox(), { flex: 1 }]}
        />
        <TextInput
          placeholder="Motivo (opcional)"
          placeholderTextColor={ui.textMuted}
          value={blockReason}
          onChangeText={setBlockReason}
          style={[inputBox(), { flex: 1 }]}
        />
        <PillButton label="Agregar" tone="secondary" size="sm" onPress={addBlockedDate} />
      </View>
      {form.blockedDates.length > 0 && (
        <View style={{ gap: 4 }}>
          {form.blockedDates.map((b) => (
            <View
              key={b.date}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: "rgba(220,38,38,0.06)",
              }}
            >
              <Text style={{ color: ui.text, fontSize: 12 }}>
                {b.date}
                {b.reason ? ` · ${b.reason}` : ""}
              </Text>
              <Pressable onPress={() => removeBlockedDate(b.date)}>
                <Text style={{ color: ui.danger, fontSize: 12, fontWeight: "700" }}>Quitar</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <Text style={{ color: ui.textMuted, fontSize: 11, marginTop: 2 }}>
        Bloqueos recurrentes (opcional): ej. "todos los martes" (cada 1 semana) o "cada 2 semanas los
        martes" — se repiten a partir de la fecha inicial, en su mismo día de la semana.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 120, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>A partir de</Text>
          <TextInput
            placeholder="YYYY-MM-DD"
            placeholderTextColor={ui.textMuted}
            value={recurAnchor}
            onChangeText={setRecurAnchor}
            style={inputBox()}
          />
        </View>
        <View style={{ width: 110, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Cada (semanas)</Text>
          <TextInput
            placeholder="1"
            placeholderTextColor={ui.textMuted}
            keyboardType="number-pad"
            value={recurInterval}
            onChangeText={setRecurInterval}
            style={inputBox()}
          />
        </View>
        <View style={{ flex: 1, minWidth: 120, gap: 4 }}>
          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Hasta (opcional)</Text>
          <TextInput
            placeholder="YYYY-MM-DD"
            placeholderTextColor={ui.textMuted}
            value={recurUntil}
            onChangeText={setRecurUntil}
            style={inputBox()}
          />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          placeholder="Motivo (opcional)"
          placeholderTextColor={ui.textMuted}
          value={recurReason}
          onChangeText={setRecurReason}
          style={[inputBox(), { flex: 1 }]}
        />
        <PillButton label="Agregar" tone="secondary" size="sm" onPress={addRecurringBlock} />
      </View>
      {form.recurringBlocks.length > 0 && (
        <View style={{ gap: 4 }}>
          {form.recurringBlocks.map((rb, idx) => (
            <View
              key={`${rb.anchorDate}-${idx}`}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: "rgba(220,38,38,0.06)",
              }}
            >
              <Text style={{ color: ui.text, fontSize: 12, flex: 1 }}>
                {rb.intervalWeeks === 1
                  ? `Todos los ${weekdayOf(rb.anchorDate)}`
                  : `Cada ${rb.intervalWeeks} semanas, ${weekdayOf(rb.anchorDate)}`}
                {` (desde ${rb.anchorDate}${rb.until ? ` hasta ${rb.until}` : ""})`}
                {rb.reason ? ` · ${rb.reason}` : ""}
              </Text>
              <Pressable onPress={() => removeRecurringBlock(idx)}>
                <Text style={{ color: ui.danger, fontSize: 12, fontWeight: "700" }}>Quitar</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <TextInput
        placeholder="Notas para el condómino (ej. traer candado propio)"
        placeholderTextColor={ui.textMuted}
        value={form.notes}
        onChangeText={set("notes")}
        multiline
        style={[inputBox(), { minHeight: 60, textAlignVertical: "top" }]}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PillButton label={submitLabel} size="sm" onPress={onSubmit} />
        <PillButton label="Cancelar" tone="secondary" size="sm" onPress={onCancel} />
      </View>
    </View>
  );
}

export default function BoardAmenitiesScreen() {
  const router = useRouter();
  const { me } = useApp();
  const { boardId, orgId: orgIdParam, boardName } = useLocalSearchParams<{
    boardId: string;
    orgId: string;
    boardName?: string;
  }>();
  const orgId = String(orgIdParam || "");

  const myRole: Role = highestRoleInOrg(me, orgId);
  const canManage = myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR" || myRole === "SUPERADMIN";

  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);

  const loadAmenities = useCallback(async () => {
    if (!boardId) return;
    setMsg("");
    setLoading(true);
    try {
      const raw = await apiAuth(
        `/board/boards/${boardId}/amenities?includeInactive=${includeInactive}`,
        "GET"
      );
      const list: Amenity[] = (Array.isArray(raw) ? raw : []).map((a: any) => ({
        id: String(a.id),
        boardId: String(a.boardId),
        name: String(a.name ?? ""),
        description: a.description,
        maxPeoplePerReservation: a.maxPeoplePerReservation,
        maxReservationsPerUnitPerDay: a.maxReservationsPerUnitPerDay,
        maxReservationsPerDay: a.maxReservationsPerDay,
        advanceBookingDays: a.advanceBookingDays,
        openTime: a.openTime,
        closeTime: a.closeTime,
        slotDurationMinutes: a.slotDurationMinutes,
        blockedDates: Array.isArray(a.blockedDates) ? a.blockedDates : [],
        recurringBlocks: Array.isArray(a.recurringBlocks) ? a.recurringBlocks : [],
        notes: a.notes,
        status: a.status,
      }));
      setAmenities(list);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId, includeInactive]);

  useEffect(() => {
    loadAmenities();
  }, [loadAmenities]);

  const createAmenity = async () => {
    if (!canManage) return;
    if (!createForm.name.trim()) {
      setMsg("Escribe un nombre para la amenidad");
      return;
    }
    try {
      await apiAuth(`/board/boards/${boardId}/amenities`, "POST", {
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        maxPeoplePerReservation: toIntOrUndefined(createForm.maxPeoplePerReservation),
        maxReservationsPerUnitPerDay: toIntOrUndefined(createForm.maxReservationsPerUnitPerDay),
        maxReservationsPerDay: toIntOrUndefined(createForm.maxReservationsPerDay),
        advanceBookingDays: toIntOrUndefined(createForm.advanceBookingDays),
        openTime: createForm.openTime.trim() || undefined,
        closeTime: createForm.closeTime.trim() || undefined,
        slotDurationMinutes: toIntOrUndefined(createForm.slotDurationMinutes),
        blockedDates: createForm.blockedDates.length
          ? createForm.blockedDates.map((b) => ({ date: b.date, reason: b.reason || undefined }))
          : undefined,
        recurringBlocks: createForm.recurringBlocks.length
          ? createForm.recurringBlocks.map((r) => ({
              anchorDate: r.anchorDate,
              intervalWeeks: r.intervalWeeks,
              until: r.until || undefined,
              reason: r.reason || undefined,
            }))
          : undefined,
        notes: createForm.notes.trim() || undefined,
      });
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      setMsg("Amenidad creada ✅");
      await loadAmenities();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const startEdit = (a: Amenity) => {
    setEditingId(a.id);
    setEditForm({
      name: a.name,
      description: a.description ?? "",
      maxPeoplePerReservation: a.maxPeoplePerReservation != null ? String(a.maxPeoplePerReservation) : "",
      maxReservationsPerUnitPerDay:
        a.maxReservationsPerUnitPerDay != null ? String(a.maxReservationsPerUnitPerDay) : "",
      maxReservationsPerDay: a.maxReservationsPerDay != null ? String(a.maxReservationsPerDay) : "",
      advanceBookingDays: a.advanceBookingDays != null ? String(a.advanceBookingDays) : "",
      openTime: a.openTime ?? "",
      closeTime: a.closeTime ?? "",
      slotDurationMinutes: a.slotDurationMinutes != null ? String(a.slotDurationMinutes) : "",
      blockedDates: a.blockedDates ?? [],
      recurringBlocks: a.recurringBlocks ?? [],
      notes: a.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId || !canManage) return;
    try {
      await apiAuth(`/board/amenities/${editingId}`, "PUT", {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        maxPeoplePerReservation: toIntOrUndefined(editForm.maxPeoplePerReservation),
        maxReservationsPerUnitPerDay: toIntOrUndefined(editForm.maxReservationsPerUnitPerDay),
        maxReservationsPerDay: toIntOrUndefined(editForm.maxReservationsPerDay),
        advanceBookingDays: toIntOrUndefined(editForm.advanceBookingDays),
        openTime: editForm.openTime.trim() || undefined,
        closeTime: editForm.closeTime.trim() || undefined,
        slotDurationMinutes: toIntOrUndefined(editForm.slotDurationMinutes),
        blockedDates: editForm.blockedDates.length
          ? editForm.blockedDates.map((b) => ({ date: b.date, reason: b.reason || undefined }))
          : undefined,
        recurringBlocks: editForm.recurringBlocks.length
          ? editForm.recurringBlocks.map((r) => ({
              anchorDate: r.anchorDate,
              intervalWeeks: r.intervalWeeks,
              until: r.until || undefined,
              reason: r.reason || undefined,
            }))
          : undefined,
        notes: editForm.notes.trim() || undefined,
      });
      setEditingId(null);
      setMsg("Amenidad actualizada ✅");
      await loadAmenities();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const changeStatus = async (id: string, status: AmenityStatus) => {
    if (!canManage) return;
    try {
      await apiAuth(`/board/amenities/${id}/status`, "PATCH", { status });
      setMsg(status === "ACTIVE" ? "Amenidad activada ✅" : "Amenidad desactivada");
      await loadAmenities();
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
            <Text style={{ color: ui.primary, fontSize: 14, fontWeight: "700" }}>← Volver</Text>
          </Pressable>
          <View>
            <Text style={{ color: ui.text, fontSize: 16, fontWeight: "800" }}>
              Amenidades {boardName ? `· ${boardName}` : ""}
            </Text>
            <Text style={{ color: ui.textMuted, fontSize: 11 }}>
              Configura reglas de reservación por amenidad.
            </Text>
          </View>
        </View>
        {canManage && (
          <PillButton
            label={showCreate ? "Ocultar" : "Agregar amenidad"}
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

      {canManage && showCreate && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.bgSoft,
          }}
        >
          <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13, marginBottom: 8 }}>
            Nueva amenidad
          </Text>
          <AmenityForm
            form={createForm}
            setForm={setCreateForm}
            onSubmit={createAmenity}
            onCancel={() => setShowCreate(false)}
            submitLabel="Crear"
          />
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable onPress={() => setIncludeInactive((v) => !v)}>
          <Text style={{ color: includeInactive ? ui.primary : ui.textMuted, fontSize: 12, fontWeight: "600" }}>
            {includeInactive ? "✓ Mostrando desactivadas" : "Mostrar desactivadas"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={ui.primary} />
      ) : (
        <FlatList
          data={amenities}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <Text style={{ color: ui.textMuted, textAlign: "center", marginTop: 24 }}>
              No hay amenidades registradas todavía.
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
                  <AmenityForm
                    form={editForm}
                    setForm={setEditForm}
                    onSubmit={saveEdit}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Guardar"
                  />
                ) : (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: ui.text, fontWeight: "800", fontSize: 14 }}>{item.name}</Text>
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 999,
                          backgroundColor: item.status === "ACTIVE" ? ui.primarySoft : "rgba(248,113,113,0.12)",
                        }}
                      >
                        <Text
                          style={{
                            color: item.status === "ACTIVE" ? ui.primary : ui.danger,
                            fontSize: 10,
                            fontWeight: "800",
                          }}
                        >
                          {item.status === "ACTIVE" ? "ACTIVA" : "INACTIVA"}
                        </Text>
                      </View>
                    </View>
                    {!!item.description && (
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>{item.description}</Text>
                    )}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {item.maxPeoplePerReservation != null && (
                        <RuleChip text={`Máx. ${item.maxPeoplePerReservation} personas`} />
                      )}
                      {item.maxReservationsPerUnitPerDay != null && (
                        <RuleChip text={`${item.maxReservationsPerUnitPerDay} reserva(s)/día por casa`} />
                      )}
                      {item.maxReservationsPerDay != null && (
                        <RuleChip text={`Cupo: ${item.maxReservationsPerDay}/día`} />
                      )}
                      {item.advanceBookingDays != null && (
                        <RuleChip text={`Hasta ${item.advanceBookingDays} día(s) antes`} />
                      )}
                      {item.openTime && item.closeTime && item.slotDurationMinutes != null && (
                        <RuleChip
                          text={`${item.openTime}–${item.closeTime}, bloques de ${item.slotDurationMinutes} min`}
                        />
                      )}
                      {!!item.blockedDates?.length && (
                        <RuleChip text={`${item.blockedDates.length} día(s) bloqueado(s)`} />
                      )}
                      {!!item.recurringBlocks?.length && (
                        <RuleChip text={`${item.recurringBlocks.length} bloqueo(s) recurrente(s)`} />
                      )}
                    </View>
                    {!!item.notes && (
                      <Text style={{ color: ui.textMuted, fontSize: 11, fontStyle: "italic" }}>
                        Nota: {item.notes}
                      </Text>
                    )}
                    {canManage && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        <PillButton label="Editar" tone="secondary" size="sm" onPress={() => startEdit(item)} />
                        <PillButton
                          label="Ver reservas"
                          tone="secondary"
                          size="sm"
                          onPress={() =>
                            router.push({
                              pathname: "/(company)/board-reservations",
                              params: {
                                amenityId: item.id,
                                boardId: item.boardId,
                                orgId,
                                amenityName: item.name,
                              },
                            })
                          }
                        />
                        {item.status === "ACTIVE" ? (
                          <PillButton
                            label="Desactivar"
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
