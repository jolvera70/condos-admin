// app/(condomino)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useMyUnits } from "../../lib/condomino";
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
  warnBg: "#FBD5D5",
  warnText: "#8A1F1F",
  okBg: "#DCFCE7",
  okText: "#166534",
};

type Charge = {
  id: string;
  concept: string;
  amount: number;
  dueDate?: string;
  status: string;
};

type Statement = {
  totalCharged: number;
  totalPaid: number;
  balance: number;
  creditBalance?: number;
  charges: Charge[];
};

function money(n?: number) {
  const v = typeof n === "number" ? n : 0;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date) {
  return d.toLocaleDateString("es-MX", { month: "long" });
}

export default function CondominoDashboard() {
  const router = useRouter();
  const { me } = useApp();
  const { units, loading: unitsLoading, isCommitteeMember } = useMyUnits();

  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [collectionPct, setCollectionPct] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!selectedUnitId && units.length > 0) setSelectedUnitId(units[0].id);
  }, [units, selectedUnitId]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId);

  useEffect(() => {
    if (!selectedUnit) return;
    (async () => {
      setLoadingDetail(true);
      try {
        const [st, coll] = await Promise.all([
          apiAuth(
            `/billing/account-statement?orgId=${encodeURIComponent(selectedUnit.orgId)}&unitId=${encodeURIComponent(selectedUnit.id)}`,
            "GET"
          ).catch(() => null),
          apiAuth(
            `/billing/stats/collection-by-board?orgId=${encodeURIComponent(selectedUnit.orgId)}&period=${currentPeriod()}`,
            "GET"
          ).catch(() => []),
        ]);
        setStatement(st);
        const row = (Array.isArray(coll) ? coll : []).find(
          (r: any) => String(r.boardId) === selectedUnit.boardId
        );
        setCollectionPct(row ? Number(row.percentage) : null);
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedUnit]);

  const nextCharge = useMemo(() => {
    const pending = (statement?.charges ?? [])
      .filter((c) => c.status !== "PAID" && c.status !== "CANCELLED" && c.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
    return pending[0] ?? null;
  }, [statement]);

  const daysUntilDue = useMemo(() => {
    if (!nextCharge?.dueDate) return null;
    const ms = new Date(nextCharge.dueDate).getTime() - Date.now();
    return Math.ceil(ms / (24 * 3600 * 1000));
  }, [nextCharge]);

  const shortName = me?.email ? me.email.split("@")[0] : "";
  const isAlDia = (statement?.balance ?? 0) <= 0;
  const busy = unitsLoading || loadingDetail;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        padding: 20,
        gap: 14,
        ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 980, gap: 14 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <View>
            <Text style={{ fontSize: 22, fontWeight: "800", color: ui.text }}>
              Hola{shortName ? `, ${shortName}` : ""}
            </Text>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              {isCommitteeMember ? "Comité" : "Condómino"} · Todo lo que necesitas para tu hogar
            </Text>
          </View>

          {units.length > 0 && (
            <Pressable
              onPress={() => units.length > 1 && setUnitPickerOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: ui.primary,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
              }}
            >
              <Ionicons name="home" size={14} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                {selectedUnit?.identifier ?? "—"}
              </Text>
              {units.length > 1 && (
                <Ionicons name="chevron-down" size={14} color="#FFFFFF" />
              )}
            </Pressable>
          )}

          {/* En Modal para que nunca quede recortado por el ScrollView de
              la página (una View position:absolute normal sí se recorta). */}
          <Modal
            visible={unitPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setUnitPickerOpen(false)}
          >
            <Pressable style={{ flex: 1 }} onPress={() => setUnitPickerOpen(false)}>
              <View
                style={{
                  position: "absolute",
                  top: 70,
                  right: 20,
                  backgroundColor: ui.surface,
                  borderWidth: 1,
                  borderColor: ui.border,
                  borderRadius: 12,
                  padding: 6,
                  minWidth: 200,
                  ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.18)" } as any) : {}),
                }}
              >
                {units.map((u) => (
                  <Pressable
                    key={u.id}
                    onPress={() => {
                      setSelectedUnitId(u.id);
                      setUnitPickerOpen(false);
                    }}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: u.id === selectedUnitId ? ui.primarySoft : "transparent",
                    }}
                  >
                    <Text style={{ color: ui.text, fontSize: 13, fontWeight: "600" }}>
                      {u.identifier}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>
        </View>

        {busy && (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={ui.primary} />
          </View>
        )}

        {!busy && units.length === 0 && (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Todavía no tienes una unidad asignada. Contacta a la
              administración de tu condominio.
            </Text>
          </Card>
        )}

        {!busy && selectedUnit && (
          <>
            {/* Banner de cuota */}
            {nextCharge ? (
              <Banner
                bg={ui.warnBg}
                textColor={ui.warnText}
                icon="🏠"
                text={
                  <>
                    Tu cuota de <Text style={{ fontWeight: "800" }}>{monthLabel(new Date(nextCharge.dueDate!))}</Text>{" "}
                    ({money(nextCharge.amount)}){" "}
                    {daysUntilDue !== null && daysUntilDue >= 0
                      ? `vence en ${daysUntilDue} día${daysUntilDue === 1 ? "" : "s"}`
                      : `venció hace ${Math.abs(daysUntilDue ?? 0)} día${Math.abs(daysUntilDue ?? 0) === 1 ? "" : "s"}`}
                  </>
                }
                actionLabel="Pagar ahora"
                onAction={() => router.push("/(condomino)/mis-pagos" as any)}
              />
            ) : (
              <Banner
                bg={ui.okBg}
                textColor={ui.okText}
                icon="✅"
                text="Estás al día con tus cuotas."
              />
            )}

            {/* Teaser de aprobaciones/actas: igual para todos, el acceso completo solo lo da el menú del comité */}
            <Banner
              bg={ui.primarySoft}
              textColor={ui.primary}
              icon="📋"
              text="Aprobaciones y actas de tu colonia: próximamente."
            />

            {/* KPIs */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <Kpi title="Fondo de reserva" value="—" hint="Próximamente" />
              <Kpi
                title="Cobranza del mes"
                value={collectionPct !== null ? `${collectionPct}%` : "—"}
                hint={collectionPct === null ? "Sin datos del mes" : "de tu colonia"}
              />
              <Kpi title="Gasto del mes" value="—" hint="Próximamente" />
            </View>

            <View
              style={{
                flexDirection: Platform.OS === "web" ? "row" : "column",
                gap: 12,
              }}
            >
              {/* Pendientes de aprobar (placeholder) */}
              <View style={{ flex: 2 }}>
                <Card>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14 }}>
                      Pendientes de aprobar
                    </Text>
                    <Pressable onPress={() => router.push("/(condomino)/aprobaciones" as any)}>
                      <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>Ver todo</Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                    Próximamente: cotizaciones y presupuestos de la colonia.
                  </Text>
                </Card>
              </View>

              <View style={{ flex: 1, gap: 12 }}>
                {/* Mi cuenta */}
                <Card>
                  <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 10 }}>
                    Mi cuenta
                  </Text>
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>Estado de cuenta</Text>
                      <Badge label={isAlDia ? "Al día" : "Con adeudo"} tone={isAlDia ? "success" : "danger"} />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>Próxima cuota</Text>
                      <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>
                        {nextCharge ? money(nextCharge.amount) : "—"}
                      </Text>
                    </View>
                    {!!statement?.creditBalance && statement.creditBalance > 0 && (
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: ui.textMuted, fontSize: 12 }}>Saldo a favor</Text>
                        <Text style={{ color: ui.success, fontSize: 13, fontWeight: "700" }}>
                          {money(statement.creditBalance)}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>

                {/* Reportar incidencia */}
                <Pressable onPress={() => router.push("/(condomino)/incidencias" as any)}>
                  <Card>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: ui.primarySoft,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="alert-circle-outline" size={18} color={ui.primary} />
                      </View>
                      <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14 }}>
                        Reportar incidencia
                      </Text>
                    </View>
                  </Card>
                </Pressable>

                {/* Reservar área común */}
                <Pressable onPress={() => router.push("/(condomino)/reservas" as any)}>
                  <Card>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: ui.primarySoft,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="calendar-outline" size={18} color={ui.primary} />
                      </View>
                      <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14 }}>
                        Reservar área común
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 16,
        padding: 16,
        backgroundColor: ui.surface,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.08)" } as any) : {}),
      }}
    >
      {children}
    </View>
  );
}

function Banner({
  bg,
  textColor,
  icon,
  text,
  actionLabel,
  onAction,
}: {
  bg: string;
  textColor: string;
  icon: string;
  text: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: bg,
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
        <Text style={{ color: textColor, fontSize: 13, flexShrink: 1 }}>{text}</Text>
      </View>
      {!!actionLabel && (
        <Pressable
          onPress={onAction}
          style={{
            backgroundColor: textColor,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "700" }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: 160,
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 14,
        padding: 14,
        backgroundColor: ui.surface,
      }}
    >
      <Text style={{ color: ui.textMuted, fontSize: 12, marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: ui.text, fontSize: 22, fontWeight: "800" }}>{value}</Text>
      {!!hint && <Text style={{ color: ui.textMuted, fontSize: 11, marginTop: 2 }}>{hint}</Text>}
    </View>
  );
}

function Badge({ label, tone }: { label: string; tone: "success" | "danger" }) {
  const bg = tone === "success" ? ui.okBg : ui.warnBg;
  const color = tone === "success" ? ui.okText : ui.warnText;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
