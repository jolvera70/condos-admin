import { apiAuth } from "@/lib/api";
import { useApp } from "@/lib/store";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import {
  VictoryArea,
  VictoryAxis,
  VictoryChart,
  VictoryGroup,
  VictoryLegend,
  VictoryLine,
  VictoryPie,
  VictoryTheme,
} from "victory-native";
const condosLogo = require("../../assets/images/iconCondos.png");

/* ====================== Tipos esperados del backend ====================== */
type ReportRes = {
  kpis?: {
    activeColonies?: number;
    openTasks?: number;
    overdueTasks?: number;
    completedTasks?: number;
    completionRate?: number; // 0..1
  };
  trend?: {
    labels: string[];
    open: number[];
    overdue: number[];
    completed: number[];
  };
  statusPie?: Array<{ label: string; value: number }>;
  overdueBuckets?: Array<{ label: string; value: number }>;
  overdueByColony?: Array<{ label: string; value: number }>;
  topOverdueColonies?: Array<{ label: string; value: number }>;
  heatmap?: {
    days: number[];
    hours: number[];
    matrix: number[][];
  };
};

/* ====================== Utils ====================== */
const isWeb = Platform.OS === "web";
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

/** Tema dark unificado con Condos/Lokaly */
const ui = {
  bg: "#020617",
  bgSoft: "#030712",
  card: "#020617",
  border: "#1F2937",
  primary: "#F4C15D",
  primarySoft: "rgba(244,193,93,0.16)",
  text: "#E5E7EB",
  textMuted: "#94A3B8",
  info: "#60A5FA",
  warn: "#FBBF24",
  ok: "#22C55E",
};

/** Alias de colores que ya usaba el componente */
const C = {
  bg: ui.bg,
  card: ui.card,
  border: ui.border,
  text: ui.text,
  sub: ui.textMuted,
  info: ui.info,
  warn: ui.warn,
  ok: ui.ok,
};

/* ====================== Componente ====================== */
export default function ReportsCompany() {
  const router = useRouter();
  const { me, logout } = useApp();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isMobile = !isTablet && !isDesktop;
  const CONTAINER_W = isDesktop
    ? 1152
    : isTablet
    ? Math.min(960, width - 32)
    : Math.min(720, width - 24);

  // ---- ORGS (colonias) ----
  const tenants = useMemo(
    () =>
      (me?.orgs ?? []).map((o: any) => ({
        orgId: String(o.orgId),
        name: String(o.name ?? o.orgId),
      })),
    [me]
  );
  const [orgId, setOrgId] = useState(() => tenants[0]?.orgId ?? "");
  useEffect(() => {
    // si cambia la lista (e.g., al loguear otro usuario)
    if (!orgId && tenants[0]?.orgId) setOrgId(tenants[0].orgId);
  }, [tenants, orgId]);

  // ---- FECHAS ----
  const today = useMemo(() => new Date(), []);
  const fromD = useMemo(
    () => new Date(Date.now() - 29 * 24 * 3600 * 1000),
    []
  );
  const [dateFrom, setDateFrom] = useState(fmtDate(fromD));
  const [dateTo, setDateTo] = useState(fmtDate(today));

  // ---- DATA ----
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportRes | null>(null);
  const [error, setError] = useState<string>("");

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({
        orgId,
        from: dateFrom,
        to: dateTo,
      }).toString();
      const res = await apiAuth(`/board/reports?${q}`, "GET");

      // --- Normaliza ---
      const perDay = Array.isArray(res?.tasksPerDay)
        ? res.tasksPerDay
        : res?.perDay ?? [];
      const perBoard = Array.isArray(res?.tasksPerBoard)
        ? res.tasksPerBoard
        : res?.perBoard ?? [];

      // ---- Diccionario id -> nombre (org y board) ----
      const idToName: Record<string, string> = {};
      // 1) Colonias del usuario (orgId -> name)
      (tenants ?? []).forEach(
        (t) => (idToName[String(t.orgId)] = String(t.name))
      );
      // 2) Boards del período (boardId -> boardName si existe)
      (perBoard ?? []).forEach((b: any) => {
        const bid = String(b.boardId ?? "");
        if (!bid) return;
        idToName[bid] = String(
          b.boardName ?? idToName[String(b.orgId ?? "")] ?? bid
        );
      });

      const resolve = (s: any) => {
        const key = String(s ?? "");
        return idToName[key] ?? key;
      };

      const labels = perDay.map((d: any) => String(d.date ?? ""));
      const completed = perDay.map((d: any) =>
        Number(d.completed ?? d.count ?? 0)
      );
      const open = perDay.map((d: any) => Number(d.open ?? 0));
      const overdue = perDay.map((d: any) => Number(d.overdue ?? 0));

      // KPI base del backend
      const kpis = {
        activeColonies: Number(
          res?.kpis?.activeColonies ?? res?.activeBoards ?? 0
        ),
        openTasks: Number(res?.kpis?.openTasks ?? res?.openTasks ?? 0),
        overdueTasks: Number(
          res?.kpis?.overdueTasks ?? res?.overdueTasks ?? 0
        ),
        completedTasks: Number(
          res?.kpis?.completedTasks ?? res?.completedLast30d ?? 0
        ),
      };
      const completionRate =
        kpis.completedTasks + kpis.openTasks + kpis.overdueTasks > 0
          ? kpis.completedTasks /
            (kpis.completedTasks + kpis.openTasks + kpis.overdueTasks)
          : 0;

      // Dona
      const statusPie =
        (res?.statusPie ?? []).length > 0
          ? res.statusPie.map((x: any) => ({
              label: String(x.label),
              value: Number(x.value),
            }))
          : [
              { label: "Abiertas", value: kpis.openTasks },
              { label: "Vencidas", value: kpis.overdueTasks },
              { label: "Completadas", value: kpis.completedTasks },
            ];

      // Buckets
      const overdueBuckets = (res?.overdueBuckets ?? []).map((x: any) => ({
        label: String(x.label ?? ""),
        value: Number(x.value ?? 0),
      }));

      // Por colonia
      const totalBoard = perBoard.reduce(
        (s: number, b: any) => s + Number(b.count ?? 0),
        0
      );

      const overdueByColony =
        (res?.overdueByColony ?? []).length > 0
          ? res.overdueByColony.map((x: any) => ({
              label: resolve(x.label),
              value: Number(x.value ?? 0),
            }))
          : perBoard.map((b: any) => ({
              label: resolve(b.boardId ?? b.orgId),
              value: totalBoard
                ? Math.round(
                    ((Number(b.count ?? 0) as number) * 100) / totalBoard
                  )
                : 0,
            }));

      const topOverdueColonies =
        (res?.topOverdueColonies ?? []).length > 0
          ? res.topOverdueColonies.map((x: any) => ({
              label: resolve(x.label),
              value: Number(x.value ?? 0),
            }))
          : overdueByColony
              .slice()
              .sort((a: any, b: any) => b.value - a.value)
              .slice(0, 5);

      const d: ReportRes = {
        kpis: { ...kpis, completionRate },
        trend: { labels, open, overdue, completed },
        statusPie,
        overdueBuckets,
        overdueByColony,
        topOverdueColonies,
        heatmap: {
          days: res?.heatmap?.days ?? [],
          hours: res?.heatmap?.hours ?? [],
          matrix: res?.heatmap?.matrix ?? [],
        },
      };

      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando reporte");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, dateFrom, dateTo]);

  // ---- Export CSV (server-side) ----
  async function exportCsvServer() {
    try {
      if (!orgId) return;
      const q = new URLSearchParams({
        orgId,
        from: dateFrom,
        to: dateTo,
      }).toString();
      const url = `/board/reports/export?${q}`;
      if (isWeb) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `condos-report-${orgId}-${dateFrom}_${dateTo}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const file =
          FileSystem.cacheDirectory! +
          `condos-report-${orgId}-${dateFrom}_${dateTo}.csv`;
        const dl = await FileSystem.downloadAsync(url, file);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(dl.uri);
      }
    } catch (e: any) {
      Alert.alert(
        "Exportar CSV",
        e?.message ?? "No fue posible exportar"
      );
    }
  }

  // ---- Helpers UI ----
  const card = (children: React.ReactNode, style: any = {}) => (
    <View
      style={{
        backgroundColor: ui.card,
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 14,
        padding: 14,
        ...(isWeb
          ? {
              boxShadow: "0 18px 40px rgba(15,23,42,0.75)",
            }
          : {
              shadowColor: "#000",
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 4,
            }),
        ...style,
      }}
    >
      {children}
    </View>
  );

  const Header = () => (
    <View
      style={{
        alignItems: "center",
        backgroundColor: ui.bgSoft,
        borderBottomWidth: 1,
        borderColor: ui.border,
      }}
    >
      <View
        style={{
          width: CONTAINER_W,
          paddingHorizontal: 16,
          paddingVertical: isMobile ? 10 : 12,
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        {/* Logo / título */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 10,
              backgroundColor: ui.primarySoft,
              borderWidth: 1,
              borderColor: ui.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
<Image
  source={condosLogo}
  style={{
    width: 50,
    height: 50,
    alignItems: "flex-end",
  }}
  resizeMode="contain"
/>
          </View>
          <View>
            <Text
              style={{
                fontSize: isTablet || isDesktop ? 18 : 17,
                fontWeight: "800",
                color: ui.primary,
              }}
            >
              Condos Admin
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: ui.textMuted,
              }}
            >
              Reportes y analítica
            </Text>
          </View>
        </View>

        {/* Acciones */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Pill
            label="Menú principal"
            onPress={() => router.replace("/(app)/home")}
          />

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: ui.border,
              backgroundColor: ui.bg,
              maxWidth: isMobile ? 220 : 260,
            }}
          >
            <Text
              style={{
                color: ui.text,
                fontSize: 12,
                fontWeight: "600",
              }}
              numberOfLines={1}
            >
              {me?.email ?? "usuario"}
            </Text>
          </View>

          <Pill label="CSV (server)" onPress={exportCsvServer} />
          <Pill label="Salir" tone="danger" onPress={logout} />
        </View>
      </View>
    </View>
  );

  const Filters = () => (
    <View
      style={{
        alignItems: "center",
        backgroundColor: ui.bgSoft,
        borderBottomWidth: 1,
        borderColor: ui.border,
      }}
    >
      <View
        style={{
          width: CONTAINER_W,
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            gap: 8,
            alignItems: isMobile ? "stretch" : "center",
            flexWrap: "wrap",
          }}
        >
          {/* Org */}
          {isWeb ? (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.currentTarget.value)}
              style={{
                width: 280,
                maxWidth: isMobile ? 240 : 320,
                height: 40,
                padding: "8px 12px",
                borderRadius: 999,
                border: `1px solid ${ui.border}`,
                background: ui.bg,
                fontSize: 13,
                color: ui.text,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                overflow: "hidden",
                WebkitAppearance: "none" as any,
                MozAppearance: "none" as any,
                appearance: "none" as any,
              }}
              title={
                tenants.find((t) => t.orgId === orgId)?.name || orgId
              }
            >
              {tenants.map((t) => (
                <option
                  key={t.orgId}
                  value={t.orgId}
                  title={t.name}
                >
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <TextInput
              placeholder="orgId"
              placeholderTextColor={ui.textMuted}
              value={orgId}
              onChangeText={setOrgId}
              style={{
                borderWidth: 1,
                borderColor: ui.border,
                padding: 10,
                borderRadius: 999,
                minWidth: 180,
                backgroundColor: ui.bg,
                color: ui.text,
              }}
            />
          )}

          {/* Fechas */}
          {isWeb ? (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.currentTarget.value)}
                style={{
                  padding: 9,
                  borderRadius: 999,
                  border: `1px solid ${ui.border}`,
                  background: ui.bg,
                  color: ui.text,
                  fontSize: 13,
                }}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.currentTarget.value)}
                style={{
                  padding: 9,
                  borderRadius: 999,
                  border: `1px solid ${ui.border}`,
                  background: ui.bg,
                  color: ui.text,
                  fontSize: 13,
                }}
              />
            </>
          ) : (
            <>
              <TextInput
                placeholder="YYYY-MM-DD (desde)"
                placeholderTextColor={ui.textMuted}
                value={dateFrom}
                onChangeText={setDateFrom}
                style={{
                  borderWidth: 1,
                  borderColor: ui.border,
                  padding: 10,
                  borderRadius: 999,
                  minWidth: 140,
                  backgroundColor: ui.bg,
                  color: ui.text,
                }}
              />
              <TextInput
                placeholder="YYYY-MM-DD (hasta)"
                placeholderTextColor={ui.textMuted}
                value={dateTo}
                onChangeText={setDateTo}
                style={{
                  borderWidth: 1,
                  borderColor: ui.border,
                  padding: 10,
                  borderRadius: 999,
                  minWidth: 140,
                  backgroundColor: ui.bg,
                  color: ui.text,
                }}
              />
            </>
          )}

          <View style={{ marginLeft: isMobile ? 0 : "auto" }}>
            <Chip text={loading ? "Actualizando…" : "Listo"} />
          </View>
        </View>
      </View>
    </View>
  );

  const k = data?.kpis ?? {};
  const trend = data?.trend ?? {
    labels: [],
    open: [],
    overdue: [],
    completed: [],
  };

  const xTicks =
    trend.labels.length > 10
      ? trend.labels.filter(
          (_, i) => i % Math.ceil(trend.labels.length / 8) === 0
        )
      : trend.labels;

  const yMax = Math.max(
    1,
    ...trend.open.map((n) => n || 0),
    ...trend.overdue.map((n) => n || 0),
    ...trend.completed.map((n) => n || 0)
  );

  // ======== Resolver nombres de colonias (por si llegan ids) ========
  const idToName = useMemo(() => {
    const dict: Record<string, string> = {};
    (tenants ?? []).forEach((t) => (dict[t.orgId] = t.name));
    return dict;
  }, [tenants]);

  const resolveColonyLabel = (label: string) =>
    idToName[label] ?? label;

  const overdueByColonyResolved =
    (data?.overdueByColony ?? []).map((r) => ({
      ...r,
      label: resolveColonyLabel(r.label),
    })) ?? [];

  const topOverdueColoniesResolved =
    (data?.topOverdueColonies ?? []).map((r) => ({
      ...r,
      label: resolveColonyLabel(r.label),
    })) ?? [];

  /* ====================== RENDER ====================== */
  if (isWeb) {
    // 🔹 Web: el ScrollView es root con altura de viewport
    return (
      <ScrollView
        style={{ height: "100vh", backgroundColor: C.bg } as any}
        contentContainerStyle={{
          padding: 12,
          gap: 12,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Header />
        <Filters />

        <View style={{ alignItems: "center" }}>
          <View style={{ width: CONTAINER_W, padding: 16 }}>
            {error
              ? card(
                  <Text style={{ color: "#FCA5A5" }}>
                    {error}
                  </Text>,
                  { marginBottom: 12 }
                )
              : null}

            {/* KPI Cards */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <Kpi
                title="Colonias activas"
                value={k.activeColonies ?? 0}
                tag="Resumen"
                tone="info"
              />
              <Kpi
                title="Tareas abiertas"
                value={k.openTasks ?? 0}
                tag="Revisar"
                tone="warn"
              />
              <Kpi
                title="Vencidas"
                value={k.overdueTasks ?? 0}
                tag="Revisar"
                tone="warn"
              />
              <Kpi
                title="Completadas"
                value={k.completedTasks ?? 0}
                tag={`${Math.round(
                  (k.completionRate ?? 0) * 100
                )}%`}
                tone="ok"
              />
            </View>

            {/* Trend + Donut */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {card(
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 16,
                        color: C.text,
                      }}
                    >
                      Tendencia de tareas (últimos 30 días)
                    </Text>
                    <Chip text="Actividad reciente ▾" />
                  </View>

                  <VictoryChart
                    padding={{
                      top: 28,
                      left: 40,
                      right: 20,
                      bottom: 34,
                    }}
                    height={240}
                    theme={VictoryTheme.material}
                    domain={{ y: [0, yMax * 1.15] }}
                  >
                    <VictoryAxis
                      tickValues={xTicks}
                      tickFormat={(t) => String(t).slice(5)}
                      style={{
                        axis: { stroke: "#334155" },
                        grid: { stroke: "#1F2937", strokeDasharray: "4" },
                        tickLabels: {
                          fontSize: 10,
                          fill: "#CBD5F5",
                        },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      style={{
                        axis: { stroke: "#334155" },
                        grid: { stroke: "#1F2937", strokeDasharray: "4" },
                        tickLabels: {
                          fontSize: 10,
                          fill: "#CBD5F5",
                        },
                      }}
                    />
                    <VictoryGroup>
                      <VictoryArea
                        data={zip(trend.labels, trend.completed)}
                        interpolation="monotoneX"
                        style={{
                          data: {
                            opacity: 0.3,
                          },
                        }}
                      />
                      <VictoryLine
                        data={zip(trend.labels, trend.overdue)}
                        interpolation="monotoneX"
                        style={{
                          data: {
                            strokeWidth: 2,
                          },
                        }}
                      />
                      <VictoryLine
                        data={zip(trend.labels, trend.open)}
                        interpolation="monotoneX"
                        style={{
                          data: {
                            strokeWidth: 2,
                          },
                        }}
                      />
                    </VictoryGroup>
                    <VictoryLegend
                      x={24}
                      y={8}
                      orientation="horizontal"
                      gutter={14}
                      style={{
                        labels: {
                          fontSize: 10,
                          fill: "#E5E7EB",
                        },
                      }}
                      data={[
                        { name: "Completadas" },
                        { name: "Vencidas" },
                        { name: "Abiertas" },
                      ]}
                    />
                  </VictoryChart>
                </>,
                { flex: 1, minWidth: 320 }
              )}

              {card(
                (() => {
                  const W = isDesktop
                    ? (CONTAINER_W - 16) / 2
                    : CONTAINER_W - 32;
                  const pieSize = Math.max(
                    220,
                    Math.min(360, Math.floor(W * 0.72))
                  );
                  const inner = Math.floor(pieSize * 0.46);
                  const font = Math.max(
                    11,
                    Math.min(14, Math.floor(pieSize * 0.04))
                  );

                  const PALETTE: Record<string, string> = {
                    Abiertas: "#2563EB",
                    "En progreso": "#7C3AED",
                    Vencidas: "#F59E0B",
                    Completadas: "#16A34A",
                    Canceladas: "#EF4444",
                    _default: "#64748B",
                  };

                  const raw = (data?.statusPie ?? []).map((x) => ({
                    x: String(x.label ?? ""),
                    y: Number.isFinite(Number(x.value))
                      ? Math.max(0, Number(x.value))
                      : 0,
                  }));
                  const sum = raw.reduce((s, d) => s + d.y, 0);
                  const pieData = raw.filter((d) => d.y > 0);
                  const colorScale = pieData.map(
                    (d) => PALETTE[d.x] ?? PALETTE._default
                  );

                  return (
                    <>
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 16,
                          marginBottom: 6,
                          color: C.text,
                        }}
                      >
                        Estado actual
                      </Text>
                      <View
                        style={{
                          backgroundColor: ui.card,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: pieSize + 12,
                          paddingVertical: 6,
                        }}
                      >
                        {!sum || !pieData.length ? (
                          <Text style={{ color: C.sub }}>
                            Sin datos para el periodo
                          </Text>
                        ) : (
                          <VictoryPie
                            data={pieData}
                            height={pieSize}
                            width={pieSize}
                            innerRadius={inner}
                            padAngle={1}
                            cornerRadius={4}
                            colorScale={colorScale}
                            labels={({ datum }) =>
                              `${datum.x} ${Math.round(
                                (datum.y / sum) * 100
                              )}%`
                            }
                            labelRadius={({ radius }) => radius - 18}
                            style={{
                              labels: {
                                fontSize: font,
                                fill: "#E5E7EB",
                                fontWeight: 500,
                                padding: 4,
                              },
                            }}
                            animate={{ duration: 600 }}
                          />
                        )}
                      </View>
                    </>
                  );
                })(),
                { flex: 1, minWidth: 320 }
              )}
            </View>

            {/* Heatmap + Atraso por antigüedad */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Mapa de calor por día y hora
                  </Text>
                  {(data?.heatmap?.matrix?.length ?? 0) === 0 ? (
                    <Text style={{ color: C.sub }}>
                      Sin datos de actividad por hora
                    </Text>
                  ) : (
                    <Heatmap
                      days={data?.heatmap?.days ?? []}
                      hours={data?.heatmap?.hours ?? []}
                      matrix={data?.heatmap?.matrix ?? []}
                    />
                  )}
                </>,
                { flex: 1, minWidth: 320 }
              )}

              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Atraso por antigüedad
                  </Text>
                  {(data?.overdueBuckets ?? []).map((b) => (
                    <ProgressRow
                      key={b.label}
                      label={b.label}
                      value={b.value}
                    />
                  ))}
                </>,
                { flex: 1, minWidth: 320 }
              )}
            </View>

            {/* Atraso por colonia + Top colonias */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Atraso por colonia
                  </Text>
                  {overdueByColonyResolved.map((r) => (
                    <MiniBar
                      key={`${r.label}-${r.value}`}
                      label={r.label}
                      value={r.value}
                    />
                  ))}
                  <Text
                    style={{
                      color: C.sub,
                      fontSize: 12,
                      marginTop: 10,
                    }}
                  >
                    Nota: Las tareas vencidas omiten los tiempos de
                    revisión.
                  </Text>
                </>,
                { flex: 1, minWidth: 320 }
              )}

              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Top colonias con más vencidas
                  </Text>
                  {topOverdueColoniesResolved.map((r) => (
                    <RankRow
                      key={`${r.label}-${r.value}`}
                      label={r.label}
                      value={r.value}
                    />
                  ))}
                </>,
                { flex: 1, minWidth: 320 }
              )}
            </View>

            {loading && (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 12,
                }}
              >
                <ActivityIndicator color={ui.primary} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    );
  }

  // 🔹 iOS / Android: View + ScrollView con flex:1
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header />
      <Filters />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 12,
          gap: 12,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center" }}>
          <View style={{ width: CONTAINER_W, padding: 16 }}>
            {error
              ? card(
                  <Text style={{ color: "#FCA5A5" }}>
                    {error}
                  </Text>,
                  { marginBottom: 12 }
                )
              : null}

            {/* KPI Cards */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <Kpi
                title="Colonias activas"
                value={k.activeColonies ?? 0}
                tag="Resumen"
                tone="info"
              />
              <Kpi
                title="Tareas abiertas"
                value={k.openTasks ?? 0}
                tag="Revisar"
                tone="warn"
              />
              <Kpi
                title="Vencidas"
                value={k.overdueTasks ?? 0}
                tag="Revisar"
                tone="warn"
              />
              <Kpi
                title="Completadas"
                value={k.completedTasks ?? 0}
                tag={`${Math.round(
                  (k.completionRate ?? 0) * 100
                )}%`}
                tone="ok"
              />
            </View>

            {/* Trend + Donut */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {card(
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 16,
                        color: C.text,
                      }}
                    >
                      Tendencia de tareas (últimos 30 días)
                    </Text>
                    <Chip text="Actividad reciente ▾" />
                  </View>

                  <VictoryChart
                    padding={{
                      top: 28,
                      left: 40,
                      right: 20,
                      bottom: 34,
                    }}
                    height={240}
                    theme={VictoryTheme.material}
                    domain={{ y: [0, yMax * 1.15] }}
                  >
                    <VictoryAxis
                      tickValues={xTicks}
                      tickFormat={(t) => String(t).slice(5)}
                      style={{
                        axis: { stroke: "#334155" },
                        grid: { stroke: "#1F2937", strokeDasharray: "4" },
                        tickLabels: {
                          fontSize: 10,
                          fill: "#CBD5F5",
                        },
                      }}
                    />
                    <VictoryAxis
                      dependentAxis
                      style={{
                        axis: { stroke: "#334155" },
                        grid: { stroke: "#1F2937", strokeDasharray: "4" },
                        tickLabels: {
                          fontSize: 10,
                          fill: "#CBD5F5",
                        },
                      }}
                    />
                    <VictoryGroup>
                      <VictoryArea
                        data={zip(trend.labels, trend.completed)}
                        interpolation="monotoneX"
                        style={{
                          data: {
                            opacity: 0.3,
                          },
                        }}
                      />
                      <VictoryLine
                        data={zip(trend.labels, trend.overdue)}
                        interpolation="monotoneX"
                        style={{
                          data: {
                            strokeWidth: 2,
                          },
                        }}
                      />
                      <VictoryLine
                        data={zip(trend.labels, trend.open)}
                        interpolation="monotoneX"
                        style={{
                          data: {
                            strokeWidth: 2,
                          },
                        }}
                      />
                    </VictoryGroup>
                    <VictoryLegend
                      x={24}
                      y={8}
                      orientation="horizontal"
                      gutter={14}
                      style={{
                        labels: {
                          fontSize: 10,
                          fill: "#E5E7EB",
                        },
                      }}
                      data={[
                        { name: "Completadas" },
                        { name: "Vencidas" },
                        { name: "Abiertas" },
                      ]}
                    />
                  </VictoryChart>
                </>,
                { flex: 1, minWidth: 320 }
              )}

              {card(
                (() => {
                  const W = isDesktop
                    ? (CONTAINER_W - 16) / 2
                    : CONTAINER_W - 32;
                  const pieSize = Math.max(
                    220,
                    Math.min(360, Math.floor(W * 0.72))
                  );
                  const inner = Math.floor(pieSize * 0.46);
                  const font = Math.max(
                    11,
                    Math.min(14, Math.floor(pieSize * 0.04))
                  );

                  const PALETTE: Record<string, string> = {
                    Abiertas: "#2563EB",
                    "En progreso": "#7C3AED",
                    Vencidas: "#F59E0B",
                    Completadas: "#16A34A",
                    Canceladas: "#EF4444",
                    _default: "#64748B",
                  };

                  const raw = (data?.statusPie ?? []).map((x) => ({
                    x: String(x.label ?? ""),
                    y: Number.isFinite(Number(x.value))
                      ? Math.max(0, Number(x.value))
                      : 0,
                  }));
                  const sum = raw.reduce((s, d) => s + d.y, 0);
                  const pieData = raw.filter((d) => d.y > 0);
                  const colorScale = pieData.map(
                    (d) => PALETTE[d.x] ?? PALETTE._default
                  );

                  return (
                    <>
                      <Text
                        style={{
                          fontWeight: "800",
                          fontSize: 16,
                          marginBottom: 6,
                          color: C.text,
                        }}
                      >
                        Estado actual
                      </Text>
                      <View
                        style={{
                          backgroundColor: ui.card,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: pieSize + 12,
                          paddingVertical: 6,
                        }}
                      >
                        {!sum || !pieData.length ? (
                          <Text style={{ color: C.sub }}>
                            Sin datos para el periodo
                          </Text>
                        ) : (
                          <VictoryPie
                            data={pieData}
                            height={pieSize}
                            width={pieSize}
                            innerRadius={inner}
                            padAngle={1}
                            cornerRadius={4}
                            colorScale={colorScale}
                            labels={({ datum }) =>
                              `${datum.x} ${Math.round(
                                (datum.y / sum) * 100
                              )}%`
                            }
                            labelRadius={({ radius }) => radius - 18}
                            style={{
                              labels: {
                                fontSize: font,
                                fill: "#E5E7EB",
                                fontWeight: 500,
                                padding: 4,
                              },
                            }}
                            animate={{ duration: 600 }}
                          />
                        )}
                      </View>
                    </>
                  );
                })(),
                { flex: 1, minWidth: 320 }
              )}
            </View>

            {/* Heatmap + Atraso por antigüedad */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Mapa de calor por día y hora
                  </Text>
                  {(data?.heatmap?.matrix?.length ?? 0) === 0 ? (
                    <Text style={{ color: C.sub }}>
                      Sin datos de actividad por hora
                    </Text>
                  ) : (
                    <Heatmap
                      days={data?.heatmap?.days ?? []}
                      hours={data?.heatmap?.hours ?? []}
                      matrix={data?.heatmap?.matrix ?? []}
                    />
                  )}
                </>,
                { flex: 1, minWidth: 320 }
              )}

              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Atraso por antigüedad
                  </Text>
                  {(data?.overdueBuckets ?? []).map((b) => (
                    <ProgressRow
                      key={b.label}
                      label={b.label}
                      value={b.value}
                    />
                  ))}
                </>,
                { flex: 1, minWidth: 320 }
              )}
            </View>

            {/* Atraso por colonia + Top colonias */}
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Atraso por colonia
                  </Text>
                  {overdueByColonyResolved.map((r) => (
                    <MiniBar
                      key={`${r.label}-${r.value}`}
                      label={r.label}
                      value={r.value}
                    />
                  ))}
                  <Text
                    style={{
                      color: C.sub,
                      fontSize: 12,
                      marginTop: 10,
                    }}
                  >
                    Nota: Las tareas vencidas omiten los tiempos de
                    revisión.
                  </Text>
                </>,
                { flex: 1, minWidth: 320 }
              )}

              {card(
                <>
                  <Text
                    style={{
                      fontWeight: "800",
                      fontSize: 16,
                      marginBottom: 6,
                      color: C.text,
                    }}
                  >
                    Top colonias con más vencidas
                  </Text>
                  {topOverdueColoniesResolved.map((r) => (
                    <RankRow
                      key={`${r.label}-${r.value}`}
                      label={r.label}
                      value={r.value}
                    />
                  ))}
                </>,
                { flex: 1, minWidth: 320 }
              )}
            </View>

            {loading && (
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 12,
                }}
              >
                <ActivityIndicator color={ui.primary} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ====================== Subcomponentes UI ====================== */
function Kpi({
  title,
  value,
  tag,
  tone = "info",
}: {
  title: string;
  value: number | string;
  tag?: string;
  tone?: "info" | "warn" | "ok";
}) {
  const chip =
    tone === "ok"
      ? { bg: C.ok, text: "#022C22" }
      : tone === "warn"
      ? { bg: C.warn, text: "#1F2937" }
      : { bg: C.info, text: "#0B1120" };

  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: 200,
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 14,
        padding: 14,
        ...(isWeb
          ? {
              boxShadow: "0 18px 40px rgba(15,23,42,0.75)",
            }
          : {
              shadowColor: "#000",
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 4,
            }),
      }}
    >
      <Text
        style={{
          color: C.sub,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Text
          style={{
            color: C.text,
            fontSize: 28,
            fontWeight: "800",
          }}
        >
          {value}
        </Text>
        {tag ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: chip.bg,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: chip.text,
                fontWeight: "700",
              }}
            >
              {tag}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View
      style={{
        backgroundColor: C.card,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Text
        style={{
          color: C.sub,
          fontSize: 11,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function Pill({
  label,
  onPress,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "danger";
}) {
  const palette = {
    primary: {
      bg: "#0F172A",
      bg2: "#020617",
      fg: "#F9FAFB",
    },
    danger: {
      bg: "#B91C1C",
      bg2: "#7F1D1D",
      fg: "#F9FAFB",
    },
  } as const;
  const p = palette[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: pressed ? p.bg2 : p.bg,
      })}
    >
      <Text
        style={{
          color: p.fg,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProgressRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={{ marginBottom: 12 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          style={{
            color: C.text,
            fontWeight: "600",
            flex: 1,
            minWidth: 0,
            marginRight: 8,
          }}
          {...(isWeb ? ({ title: label } as any) : {})}
        >
          {label}
        </Text>
        <Text style={{ color: C.sub }}>{pct}%</Text>
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: "#020617",
          borderRadius: 999,
          overflow: "hidden",
          marginTop: 6,
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: C.warn,
            borderRadius: 999,
          }}
        />
      </View>
    </View>
  );
}

function RankRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="middle"
          style={{
            color: C.text,
            fontWeight: "600",
            flex: 1,
            minWidth: 0,
            marginRight: 8,
          }}
          {...(isWeb ? ({ title: label } as any) : {})}
        >
          {label}
        </Text>
        <Text style={{ color: C.sub }}>{pct}%</Text>
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: "#020617",
          borderRadius: 999,
          overflow: "hidden",
          marginTop: 6,
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: C.warn,
            borderRadius: 999,
          }}
        />
      </View>
    </View>
  );
}

function MiniBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="middle"
        style={{
          color: C.sub,
          fontSize: 12,
          width: 200,
          minWidth: 0,
        }}
        {...(isWeb ? ({ title: label } as any) : {})}
      >
        {label}
      </Text>
      <View
        style={{
          flex: 1,
          height: 8,
          backgroundColor: "#020617",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: C.info,
          }}
        />
      </View>
      <Text
        style={{
          color: C.sub,
          fontSize: 12,
          width: 38,
          textAlign: "right",
        }}
      >
        {pct}%
      </Text>
    </View>
  );
}

function Heatmap({
  days,
  hours,
  matrix,
}: {
  days: number[];
  hours: number[];
  matrix: number[][];
}) {
  const flat = (matrix as any)?.flat?.() ?? [];
  const max = flat.length ? Math.max(...flat) : 1;

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          marginBottom: 8,
        }}
      >
        <Text
          style={{ color: C.sub, fontSize: 12, width: 28 }}
        />
        {days.map((d) => (
          <Text
            key={d}
            style={{
              color: C.sub,
              fontSize: 11,
              width: 24,
              textAlign: "center",
            }}
          >
            {d}
          </Text>
        ))}
      </View>
      {hours.map((h, r) => (
        <View
          key={h}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <Text
            style={{ color: C.sub, fontSize: 11, width: 28 }}
          >
            {h}
          </Text>
          {days.map((_, c) => {
            const v = matrix?.[c]?.[r] ?? 0; // columnas = días, filas = horas
            const alpha = 0.12 + (max ? v / max : 0) * 0.8;
            return (
              <View
                key={`${r}-${c}`}
                style={{
                  width: 24,
                  height: 18,
                  marginRight: 4,
                  borderRadius: 3,
                  backgroundColor: `rgba(37,99,235,${alpha})`,
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/* util simple */
function zip(xs?: string[], ys?: number[]) {
  if (!xs || !ys) return [];
  return xs.map((x, i) => ({ x, y: ys[i] ?? 0 }));
}