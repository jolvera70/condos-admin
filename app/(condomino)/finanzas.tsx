// app/(condomino)/finanzas.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { apiAuth } from "../../lib/api";
import { useMyUnits } from "../../lib/condomino";

const ui = {
  bg: "#FBF1E1",
  surface: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
};

type Collection = { billed: number; collected: number; percentage: number };

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FinanzasCondominio() {
  const { units, loading: unitsLoading } = useMyUnits();
  const selectedUnit = units[0];

  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (unitsLoading) return;
    if (!selectedUnit) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const coll = await apiAuth(
          `/billing/stats/collection-by-board/mine?orgId=${encodeURIComponent(selectedUnit.orgId)}&boardId=${encodeURIComponent(selectedUnit.boardId)}&period=${currentPeriod()}`,
          "GET"
        ).catch(() => null);
        setCollection(coll);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedUnit, unitsLoading]);

  const busy = unitsLoading || loading;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        padding: 20,
        gap: 14,
        ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 900, gap: 14 }}>
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text, marginBottom: 4 }}>
            Finanzas del condominio
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Fondo de reserva, cobranza y gastos del mes de tu colonia.
          </Text>
        </Card>

        {busy ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color="#5B4CE0" />
          </View>
        ) : !selectedUnit ? (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Todavía no tienes una unidad asignada. Contacta a la administración de tu condominio.
            </Text>
          </Card>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Kpi title="Fondo de reserva" value="—" hint="Próximamente" />
            <Kpi
              title="Cobranza del mes"
              value={collection ? `${Math.round(collection.percentage)}%` : "—"}
              hint={collection ? "de tu colonia" : "Sin datos del mes"}
            />
            <Kpi title="Gasto del mes" value="—" hint="Próximamente" />
          </View>
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
        gap: 10,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.08)" } as any) : {}),
      }}
    >
      {children}
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
