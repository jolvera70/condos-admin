// app/(condomino)/mis-pagos.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
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

type Charge = {
  id: string;
  concept: string;
  amount: number;
  paidAmount?: number;
  period?: string;
  dueDate?: string;
  status: string;
};

type Payment = {
  id: string;
  amount: number;
  method: string;
  reconciliationStatus: string;
  reportedAt?: string;
};

type Statement = {
  unitId: string;
  totalCharged: number;
  totalPaid: number;
  balance: number;
  creditBalance?: number;
  charges: Charge[];
  payments: Payment[];
};

function money(n?: number) {
  const v = typeof n === "number" ? n : 0;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-MX");
  } catch {
    return s;
  }
}

export default function MisPagos() {
  const { units, loading: unitsLoading, error: unitsError } = useMyUnits();
  const [statements, setStatements] = useState<Record<string, Statement>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (unitsLoading) return;
    (async () => {
      setLoading(true);
      const entries = await Promise.all(
        units.map(async (u) => {
          try {
            const st: Statement = await apiAuth(
              `/billing/account-statement?orgId=${encodeURIComponent(u.orgId)}&unitId=${encodeURIComponent(u.id)}`,
              "GET"
            );
            return [u.id, st] as const;
          } catch {
            return [u.id, null] as const;
          }
        })
      );
      const map: Record<string, Statement> = {};
      entries.forEach(([id, st]) => {
        if (st) map[id] = st;
      });
      setStatements(map);
      setLoading(false);
    })();
  }, [units, unitsLoading]);

  const busy = unitsLoading || loading;

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
            Mis pagos
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Cuotas, cargos y pagos de tus unidades.
          </Text>
        </Card>

        {busy && (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={ui.primary} />
          </View>
        )}

        {!!unitsError && !busy && (
          <Card tone="danger">
            <Text style={{ color: ui.danger, fontSize: 12 }}>{unitsError}</Text>
          </Card>
        )}

        {!busy && !unitsError && units.length === 0 && (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Todavía no tienes una unidad asignada. Contacta a la
              administración de tu condominio.
            </Text>
          </Card>
        )}

        {!busy &&
          units.map((u) => {
            const st = statements[u.id];
            return (
              <Card key={u.id}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: "800", color: ui.text }}>
                    {u.identifier}
                  </Text>
                  <Badge
                    label={u.status === "ACTIVE" ? "ACTIVA" : "BAJA"}
                    tone={u.status === "ACTIVE" ? "primary" : "default"}
                  />
                </View>

                {!st ? (
                  <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                    No se pudo cargar el estado de cuenta de esta unidad.
                  </Text>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
                      <SummaryTile label="Cargado" value={money(st.totalCharged)} />
                      <SummaryTile label="Pagado" value={money(st.totalPaid)} />
                      <SummaryTile
                        label="Saldo"
                        value={money(st.balance)}
                        tone={st.balance > 0 ? "danger" : "success"}
                      />
                      {!!st.creditBalance && st.creditBalance > 0 && (
                        <SummaryTile label="A favor" value={money(st.creditBalance)} tone="success" />
                      )}
                    </View>

                    <Text style={{ fontWeight: "700", color: ui.text, fontSize: 13, marginBottom: 6 }}>
                      Cuotas y cargos
                    </Text>
                    {st.charges.length === 0 ? (
                      <Text style={{ color: ui.textMuted, fontSize: 12, marginBottom: 12 }}>
                        Sin cargos registrados.
                      </Text>
                    ) : (
                      <View style={{ gap: 6, marginBottom: 14 }}>
                        {st.charges.map((c) => (
                          <Row
                            key={c.id}
                            left={c.concept}
                            mid={
                              c.status === "PARTIALLY_PAID"
                                ? `Vence: ${fmtDate(c.dueDate)} · pagado ${money(c.paidAmount)}`
                                : `Vence: ${fmtDate(c.dueDate)}`
                            }
                            right={money(c.amount)}
                            tag={c.status}
                          />
                        ))}
                      </View>
                    )}

                    <Text style={{ fontWeight: "700", color: ui.text, fontSize: 13, marginBottom: 6 }}>
                      Pagos
                    </Text>
                    {st.payments.length === 0 ? (
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                        Sin pagos registrados.
                      </Text>
                    ) : (
                      <View style={{ gap: 6 }}>
                        {st.payments.map((p) => (
                          <Row
                            key={p.id}
                            left={p.method}
                            mid={`Reportado: ${fmtDate(p.reportedAt)}`}
                            right={money(p.amount)}
                            tag={p.reconciliationStatus}
                          />
                        ))}
                      </View>
                    )}
                  </>
                )}
              </Card>
            );
          })}
      </View>
    </ScrollView>
  );
}

function Card({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
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

function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "primary" }) {
  const isPrimary = tone === "primary";
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: isPrimary ? ui.primarySoft : "rgba(21,19,31,0.05)",
        borderWidth: 1,
        borderColor: isPrimary ? ui.primary : ui.border,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: isPrimary ? ui.primary : ui.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const color = tone === "danger" ? ui.danger : tone === "success" ? ui.success : ui.text;
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: 140,
        borderWidth: 1,
        borderColor: ui.borderSoft,
        borderRadius: 12,
        padding: 10,
      }}
    >
      <Text style={{ color: ui.textMuted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color, fontWeight: "800", fontSize: 16 }}>{value}</Text>
    </View>
  );
}

function Row({
  left,
  mid,
  right,
  tag,
}: {
  left: string;
  mid?: string;
  right: string;
  tag?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: ui.borderSoft,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: ui.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
          {left}
        </Text>
        {!!mid && (
          <Text style={{ color: ui.textMuted, fontSize: 11 }} numberOfLines={1}>
            {mid}
          </Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{right}</Text>
        {!!tag && (
          <Text style={{ color: ui.textMuted, fontSize: 10 }}>{tag}</Text>
        )}
      </View>
    </View>
  );
}
