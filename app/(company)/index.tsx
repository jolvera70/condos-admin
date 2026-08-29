// app/(company)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";

const ui = {
  content: "#FBF1E1",
  card: "#FFFFFF",
  cardBorder: "rgba(21,19,31,0.08)",
  purple: "#5B4CE0",
  purpleSoft: "rgba(91,76,224,0.08)",
  yellow: "#F1E94A",
  textDark: "#211F2E",
  textGray: "#8A8A94",
  green: "#16A34A",
  greenSoft: "rgba(22,163,74,0.12)",
  red: "#DC2626",
  orange: "#EA8C2E",
  orangeSoft: "rgba(234,140,46,0.14)",
};

type Board = { id: string; orgId: string; name: string; status: "ACTIVE" | "ARCHIVED" };

/** Ejemplo de "operador asignado a un condominio" — ver nota grande al final del archivo. */
type MockCondoRow = { name: string; operator: string | null; status: "AL_DIA" | "ATENCION" };

function MetricCard({
  label,
  value,
  tone = "white",
}: {
  label: string;
  value: string;
  tone?: "white" | "purple";
}) {
  const isPurple = tone === "purple";
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        backgroundColor: isPurple ? ui.purple : ui.card,
        borderRadius: 16,
        borderWidth: isPurple ? 0 : 1,
        borderColor: ui.cardBorder,
        padding: 16,
        gap: 6,
      }}
    >
      <Text
        style={{
          color: isPurple ? "rgba(255,255,255,0.85)" : ui.textGray,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: isPurple ? "#FFFFFF" : ui.textDark,
          fontSize: 26,
          fontWeight: "800",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function StatusChip({ status }: { status: "AL_DIA" | "ATENCION" }) {
  const ok = status === "AL_DIA";
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: ok ? ui.greenSoft : ui.orangeSoft,
      }}
    >
      <Text style={{ color: ok ? ui.green : ui.orange, fontSize: 11, fontWeight: "700" }}>
        {ok ? "Al día" : "Atención"}
      </Text>
    </View>
  );
}

export default function CompanyHome() {
  const router = useRouter();
  const { me, token } = useApp();
  const orgId = me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [operatorCount, setOperatorCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const [boardsRaw, usersRaw] = await Promise.all([
          apiAuth(`/board/boards?orgId=${orgId}&size=100`, "GET"),
          apiAuth(`/user/users?orgId=${orgId}&role=OPERATIVO`, "GET"),
        ]);
        const boardList: any[] = Array.isArray(boardsRaw) ? boardsRaw : boardsRaw?.content ?? [];
        setBoards(
          boardList
            .filter((b) => b.status === "ACTIVE")
            .map((b) => ({ id: b.id, orgId: b.orgId, name: b.name, status: b.status }))
        );
        setOperatorCount(Array.isArray(usersRaw) ? usersRaw.length : null);
      } catch {
        // silencioso: esta pantalla es un resumen, no bloquea nada si falla
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId, token]);

  const displayName = (me as any)?.name ?? (me?.email ?? "").split("@")[0] ?? "";

  /**
   * ⚠️ DATOS DE EJEMPLO (no vienen del backend todavía):
   * - "Operador asignado" por condominio, y el estado "Al día"/"Atención"
   *   requieren un campo de asignación operador↔condominio que hoy no
   *   existe en el modelo `Board` (solo tiene id/orgId/name/status).
   * - "Incidencias abiertas" depende del módulo de incidencias (RN-INC),
   *   que todavía no está construido.
   * - "Cobranza del mes" (% cobrado vs facturado a nivel empresa) requeriría
   *   un endpoint agregado nuevo en billing-api; hoy solo existe por unidad.
   * - "Equipo activo" (operador + cuántos condominios lleva) depende de la
   *   misma asignación operador↔condominio que falta arriba.
   * Se dejan aquí como marcador visual fiel al diseño de Figma. En cuanto
   * se construya la asignación de operadores por condominio, esto se
   * reemplaza por datos reales.
   */
  const mockCondoRows: MockCondoRow[] = useMemo(
    () =>
      boards.slice(0, 3).map((b, i) => ({
        name: b.name,
        operator: i === 1 ? null : i === 0 ? "Marco Díaz" : "Ana Ruiz",
        status: i === 1 ? "ATENCION" : "AL_DIA",
      })),
    [boards]
  );
  const mockIncidencias = "—";
  const mockCobranza = "—";
  const mockEquipoActivo = [
    { name: "Marco Díaz", condos: 4 },
    { name: "Ana Ruiz", condos: 6 },
  ];
  const mockSinOperadorCount = mockCondoRows.filter((r) => r.operator === null).length;

  return (
    <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 24 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <View>
          <Text style={{ color: ui.textDark, fontSize: 22, fontWeight: "800" }}>
            Panel de supervisión
          </Text>
          <Text style={{ color: ui.textGray, fontSize: 13, marginTop: 2 }}>
            {loading ? "Cargando…" : `${boards.length} condominios bajo tu gestión`}
          </Text>
        </View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: ui.cardBorder,
          }}
        >
          <Ionicons name="notifications-outline" size={18} color={ui.textDark} />
          <View
            style={{
              position: "absolute",
              top: 8,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: ui.red,
            }}
          />
        </View>
      </View>

      {/* Métricas */}
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <MetricCard label="Condominios activos" value={String(boards.length)} tone="purple" />
        <MetricCard label="Operadores" value={operatorCount != null ? String(operatorCount) : "—"} />
        <MetricCard label="Incidencias abiertas" value={mockIncidencias} />
        <MetricCard label="Cobranza del mes" value={mockCobranza} />
      </View>

      {loading ? (
        <ActivityIndicator color={ui.purple} style={{ marginTop: 20 }} />
      ) : (
        <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
          {/* Columna izquierda: Tus condominios */}
          <View style={{ flex: 2, minWidth: 300, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: ui.textDark, fontSize: 15, fontWeight: "800" }}>
                Tus condominios
              </Text>
              <Pressable onPress={() => router.push("/(company)/boards")}>
                <Text style={{ color: ui.purple, fontSize: 13, fontWeight: "700" }}>Ver todos</Text>
              </Pressable>
            </View>

            {mockCondoRows.length === 0 && !loading && (
              <View
                style={{
                  backgroundColor: ui.card,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: ui.cardBorder,
                  padding: 20,
                }}
              >
                <Text style={{ color: ui.textGray, fontSize: 13 }}>
                  Todavía no tienes condominios registrados.
                </Text>
              </View>
            )}

            {mockCondoRows.map((row) => (
              <Pressable
                key={row.name}
                onPress={() => router.push("/(company)/boards")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  backgroundColor: ui.card,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: ui.cardBorder,
                  padding: 14,
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: ui.purpleSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="business-outline" size={18} color={ui.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: ui.textDark, fontSize: 14, fontWeight: "700" }}>
                    {row.name}
                  </Text>
                  <Text style={{ color: ui.textGray, fontSize: 12, marginTop: 1 }}>
                    {row.operator ? `Operador: ${row.operator}` : "Sin operador asignado"}
                  </Text>
                </View>
                <StatusChip status={row.status} />
              </Pressable>
            ))}
          </View>

          {/* Columna derecha: alerta + equipo activo */}
          <View style={{ flex: 1, minWidth: 260, gap: 16 }}>
            {mockSinOperadorCount > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  backgroundColor: ui.orangeSoft,
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <Ionicons name="warning-outline" size={18} color={ui.orange} />
                <Text style={{ color: "#8A4E12", fontSize: 12.5, flex: 1, lineHeight: 18 }}>
                  <Text style={{ fontWeight: "800" }}>{mockSinOperadorCount} condominio(s)</Text> sin
                  operador asignado esta semana. Revisa la asignación de equipo.
                </Text>
              </View>
            )}

            <View>
              <Text style={{ color: ui.textDark, fontSize: 15, fontWeight: "800", marginBottom: 10 }}>
                Equipo activo
              </Text>
              <View
                style={{
                  backgroundColor: ui.card,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: ui.cardBorder,
                  padding: 6,
                }}
              >
                {mockEquipoActivo.map((op, i) => (
                  <View
                    key={op.name}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 10,
                      borderBottomWidth: i < mockEquipoActivo.length - 1 ? 1 : 0,
                      borderBottomColor: ui.cardBorder,
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: i % 2 === 0 ? "#5B9EF9" : "#F97362",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>
                        {op.name.charAt(0)}
                      </Text>
                    </View>
                    <Text style={{ color: ui.textDark, fontSize: 13 }}>
                      {op.name} — {op.condos} condos
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
