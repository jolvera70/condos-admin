// app/(condomino)/incidencias.tsx
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
};

type Task = {
  id: string;
  title: string;
  description?: string;
  status: string;
  createdAt?: string;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Reportada",
  IN_PROGRESS: "En atención",
  DONE: "Resuelta",
  CANCELED: "Cancelada",
  ARCHIVED: "Archivada",
};

const STATUS_TONE: Record<string, "warn" | "ok" | "muted"> = {
  OPEN: "warn",
  IN_PROGRESS: "warn",
  DONE: "ok",
  CANCELED: "muted",
  ARCHIVED: "muted",
};

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-MX");
  } catch {
    return s;
  }
}

export default function IncidenciasCondomino() {
  const { units, loading: unitsLoading } = useMyUnits();
  const [unitId, setUnitId] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const [reported, setReported] = useState<Task[]>([]);
  const [loadingReported, setLoadingReported] = useState(false);

  useEffect(() => {
    if (!unitId && units.length > 0) setUnitId(units[0].id);
  }, [units, unitId]);

  const selectedUnit = units.find((u) => u.id === unitId);

  const loadReported = useCallback(async () => {
    if (!selectedUnit) return;
    setLoadingReported(true);
    try {
      const raw = await apiAuth(
        `/board/tasks?orgId=${encodeURIComponent(selectedUnit.orgId)}&reportedBy=me&size=50&sortBy=createdAt&dir=DESC`,
        "GET"
      );
      const list = (Array.isArray(raw) ? raw : raw?.content ?? []).map((t: any) => ({
        id: String(t.id),
        title: String(t.title ?? ""),
        description: t.description,
        status: t.status,
        createdAt: t.createdAt,
      }));
      setReported(list);
    } catch {
      setReported([]);
    } finally {
      setLoadingReported(false);
    }
  }, [selectedUnit]);

  useEffect(() => {
    loadReported();
  }, [loadReported]);

  const reportar = async () => {
    setMsg("");
    if (!selectedUnit) {
      setMsg("Selecciona tu unidad");
      return;
    }
    if (!title.trim()) {
      setMsg("Escribe un título para la incidencia");
      return;
    }
    setSubmitting(true);
    try {
      await apiAuth(`/board/boards/${selectedUnit.boardId}/tasks`, "POST", {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setMsg("Incidencia reportada ✅ La administración la revisará pronto.");
      await loadReported();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

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
            Incidencias
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Reporta una falla o problema de tu unidad o de las áreas comunes.
          </Text>
        </Card>

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
            {!!msg && (
              <Card tone={msg.includes("✅") ? "default" : "danger"}>
                <Text style={{ color: msg.includes("✅") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
              </Card>
            )}

            <Card>
              <Text style={{ fontWeight: "800", color: ui.text, fontSize: 15, marginBottom: 4 }}>
                Reportar incidencia
              </Text>

              {units.length > 1 && (
                <Field label="Unidad">
                  <Select
                    value={unitId}
                    onChange={setUnitId}
                    options={units.map((u) => ({ label: u.identifier, value: u.id }))}
                  />
                </Field>
              )}

              <Field label="Título">
                <TextInput
                  placeholder="Ej. Fuga de agua en el baño"
                  placeholderTextColor={ui.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  style={inputStyle}
                />
              </Field>

              <Field label="Descripción (opcional)">
                <TextInput
                  placeholder="Cuéntanos más detalles…"
                  placeholderTextColor={ui.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
                />
              </Field>

              <Pressable
                onPress={reportar}
                disabled={submitting}
                style={{
                  backgroundColor: submitting ? ui.borderSoft : ui.primary,
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                  {submitting ? "Enviando…" : "Reportar incidencia"}
                </Text>
              </Pressable>
            </Card>

            <Card>
              <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 8 }}>
                Mis incidencias reportadas
              </Text>
              {loadingReported ? (
                <ActivityIndicator color={ui.primary} />
              ) : reported.length === 0 ? (
                <Text style={{ color: ui.textMuted, fontSize: 12 }}>Todavía no has reportado ninguna.</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {reported.map((t) => (
                    <View
                      key={t.id}
                      style={{
                        borderWidth: 1,
                        borderColor: ui.borderSoft,
                        borderRadius: 10,
                        padding: 10,
                        gap: 2,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                          {t.title}
                        </Text>
                        <StatusBadge status={t.status} />
                      </View>
                      <Text style={{ color: ui.textMuted, fontSize: 11 }}>{fmtDate(t.createdAt)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}
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

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  const bg = tone === "ok" ? "#DCFCE7" : tone === "warn" ? "#FFF7E0" : "rgba(21,19,31,0.06)";
  const color = tone === "ok" ? "#166534" : tone === "warn" ? "#8A6D1F" : ui.textMuted;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ color, fontSize: 10, fontWeight: "700" }}>{STATUS_LABEL[status] ?? status}</Text>
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
