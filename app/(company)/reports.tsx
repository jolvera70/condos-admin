// app/(company)/reports.tsx
import { apiAuth } from "@/lib/api";
import { useApp } from "@/lib/store";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";

type Tenant = { orgId: string; name: string };
type TasksByDay = { date: string; open: number; done: number; overdue: number };
type TasksByBoard = { boardId: string; boardName?: string; open: number; inProgress: number; done: number };

const isWeb = Platform.OS === "web";
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export default function ReportsCompany() {
  const router = useRouter();
  const { me } = useApp();

  // ---- ORGS ----
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantNameById, setTenantNameById] = useState<Record<string, string>>(
    {}
  );
  const [orgId, setOrgId] = useState("");

  // ---- BOARDS ----
  const [boardNameById, setBoardNameById] = useState<Record<string, string>>(
    {}
  );

  // ---- FECHAS ----
  const today = useMemo(() => new Date(), []);
  const aWeekAgo = useMemo(
    () => new Date(Date.now() - 6 * 24 * 3600 * 1000),
    []
  );
  const [dateFrom, setDateFrom] = useState(fmtDate(aWeekAgo));
  const [dateTo, setDateTo] = useState(fmtDate(today));

  // ---- DATA ----
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeBoards, setActiveBoards] = useState(0);
  const [openTasks, setOpenTasks] = useState(0);
  const [overdueTasks, setOverdueTasks] = useState(0);
  const [done30d, setDone30d] = useState(0);
  const [byDay, setByDay] = useState<TasksByDay[]>([]);
  const [byBoard, setByBoard] = useState<TasksByBoard[]>([]);

  // --- cargar tenants desde me.orgs y luego hidratar nombres ---
  const hydrateTenantNames = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await apiAuth(
        `/tenant/tenants?ids=${encodeURIComponent(ids.join(","))}`,
        "GET"
      );
      const list = Array.isArray(res) ? res : res?.content ?? [];
      const dic: Record<string, string> = {};
      list.forEach((t: any) => {
        const id = String(t.orgId ?? t.id);
        if (id) dic[id] = String(t.name ?? t.slug ?? id);
      });
      if (Object.keys(dic).length) {
        setTenantNameById((prev) => ({ ...prev, ...dic }));
      }
    } catch {
      /* noop */
    }
  }, []);

  const loadTenants = useCallback(() => {
    if (!me) return;
    const arr: Tenant[] = (me.orgs ?? []).map((o: any) => ({
      orgId: String(o.orgId),
      name: String(o.name ?? o.orgId),
    }));
    setTenants(arr);
    setTenantNameById(Object.fromEntries(arr.map((t) => [t.orgId, t.name])));
    if (!orgId && arr.length) setOrgId(arr[0].orgId);
    hydrateTenantNames(arr.map((t) => t.orgId));
  }, [me, orgId, hydrateTenantNames]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const orgName = tenantNameById[orgId] ?? orgId;

  // --- boards para traducir boardId -> nombre ---
  const loadBoardsForOrg = useCallback(async () => {
    if (!orgId) {
      setBoardNameById({});
      return;
    }
    try {
      const raw = await apiAuth(
        `/board/boards?orgId=${encodeURIComponent(orgId)}&page=0&size=1000`,
        "GET"
      );
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];
      const dic = Object.fromEntries(
        list.map((b: any) => [
          String(b.id ?? b.boardId ?? b._id),
          String(b.name ?? ""),
        ])
      );
      setBoardNameById(dic);
    } catch {
      setBoardNameById({});
    }
  }, [orgId]);

  useEffect(() => {
    loadBoardsForOrg();
  }, [loadBoardsForOrg]);

  // --- estadísticas ---
  const loadStats = useCallback(async () => {
    if (!orgId) return;
    setMsg("");
    setLoading(true);
    try {
      // boards activos
      try {
        const rawB = await apiAuth(
          `/board/boards?orgId=${encodeURIComponent(orgId)}&page=0&size=1`,
          "GET"
        );
        const total =
          typeof rawB?.totalElements === "number"
            ? rawB.totalElements
            : Array.isArray(rawB)
            ? rawB.length
            : rawB?.content?.length ?? 0;
        setActiveBoards(total);
      } catch {
        setActiveBoards(0);
      }
      // tareas abiertas
      try {
        const openRaw = await apiAuth(
          `/board/tasks/stats/open-count?orgId=${encodeURIComponent(orgId)}`,
          "GET"
        );
        setOpenTasks(Number(openRaw?.count ?? 0));
      } catch {
        setOpenTasks(0);
      }
      // vencidas
      try {
        const ov = await apiAuth(
          `/board/tasks/stats/overdue-count?orgId=${encodeURIComponent(orgId)}`,
          "GET"
        );
        setOverdueTasks(Number(ov?.count ?? 0));
      } catch {
        setOverdueTasks(0);
      }
      // completadas 30d
      try {
        const d30 = await apiAuth(
          `/board/tasks/stats/done-last-30d?orgId=${encodeURIComponent(orgId)}`,
          "GET"
        );
        setDone30d(Number(d30?.count ?? 0));
      } catch {
        setDone30d(0);
      }
      // por día
      try {
        const day = await apiAuth(
          `/board/tasks/stats/by-day?orgId=${encodeURIComponent(
            orgId
          )}&from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(
            dateTo
          )}`,
          "GET"
        );
        setByDay(Array.isArray(day) ? day : []);
      } catch {
        setByDay([]);
      }
      // por board
      try {
        const bb = await apiAuth(
          `/board/tasks/stats/by-board?orgId=${encodeURIComponent(
            orgId
          )}&from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(
            dateTo
          )}`,
          "GET"
        );
        const list: TasksByBoard[] = (Array.isArray(bb) ? bb : []).map(
          (r: any) => ({
            boardId: String(r.boardId),
            boardName: r.boardName,
            open: Number(r.open ?? 0),
            inProgress: Number(r.inProgress ?? 0),
            done: Number(r.done ?? 0),
          })
        );
        setByBoard(list);
      } catch {
        setByBoard([]);
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId, dateFrom, dateTo]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // export CSV por colonia
  const exportCSV = () => {
    const header = ["Condominio", "Colonia", "Open", "InProgress", "Done"];
    const rows = byBoard.map((r) => [
      orgName,
      r.boardName ?? boardNameById[r.boardId] ?? r.boardId,
      String(r.open),
      String(r.inProgress),
      String(r.done),
    ]);
    const csv =
      header.join(",") +
      "\n" +
      rows.map((rr) => rr.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report_${orgName}_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- UI helpers (estética) ----
  const cardStyle: any = {
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
    ...(isWeb
      ? {
          boxShadow:
            "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
        }
      : {}),
  };

  const Chip = ({ text, tone = "default" }: { text: string; tone?: "default" | "warn" | "success" }) => {
    const colors =
      tone === "success"
        ? { bg: "#E6FFED", fg: "#136F3A" }
        : tone === "warn"
        ? { bg: "#FFF4E5", fg: "#B25E09" }
        : { bg: "#EEF2FF", fg: "#3730A3" };
    return (
      <Text
        style={{
          fontSize: 12,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: colors.bg,
          color: colors.fg,
          fontWeight: "600",
        }}
      >
        {text}
      </Text>
    );
  };

  const Empty = ({ children }: React.PropsWithChildren) => (
    <View
      style={{
        ...cardStyle,
        backgroundColor: "#FCFCFD",
        borderStyle: "dashed" as any,
      }}
    >
      <Text style={{ color: "#667085" }}>{children}</Text>
    </View>
  );

  // barras horizontales simples
  const Bar = ({ label, value, max, right }: { label: string; value: number; max: number; right?: string }) => {
    const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
    return (
      <View style={{ marginVertical: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "600" }}>{label}</Text>
          <Text style={{ color: "#667085" }}>{right ?? value}</Text>
        </View>
        <View
          style={{
            height: 10,
            borderRadius: 999,
            backgroundColor: "#F2F4F7",
            overflow: "hidden",
            marginTop: 6,
          }}
        >
          <View
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: "#3B82F6",
            }}
          />
        </View>
      </View>
    );
  };

  // máximos para escalas
  const maxPerDay = Math.max(
    0,
    ...byDay.map((d) => Math.max(d.open || 0, d.overdue || 0, d.done || 0))
  );
  const maxPerBoard = Math.max(
    0,
    ...byBoard.map((b) => b.open + b.inProgress + b.done)
  );

  return (
    <ScrollView style={{ padding: 16, backgroundColor: "#FAFAFB" }}>
      {/* Header */}
      <View
        style={{
          marginBottom: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.2 }}>
          Reportes de {orgName || "…"}
        </Text>
        <Pressable
          onPress={() => router.replace("/(app)/home")}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: "#111827",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>MENÚ PRINCIPAL</Text>
        </Pressable>
      </View>

      {!!msg && (
        <View style={{ ...cardStyle, borderColor: "#FEE2E2", backgroundColor: "#FEF2F2", marginBottom: 12 }}>
          <Text style={{ color: "#B91C1C" }}>{msg}</Text>
        </View>
      )}

      {/* Toolbar filtros */}
      <View
        style={{
          ...cardStyle,
          position: isWeb ? "sticky" : "relative",
          top: isWeb ? 8 : 0,
          zIndex: 1,
          marginBottom: 14,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Org selector */}
          {isWeb ? (
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.currentTarget.value)}
              style={{
                padding: 10,
                borderRadius: 10,
                borderWidth: 1 as any,
                borderColor: "#E5E7EB",
                minWidth: 180,
              }}
            >
              {tenants.map((t) => (
                <option key={t.orgId} value={t.orgId}>
                  {tenantNameById[t.orgId] ?? t.name ?? t.orgId}
                </option>
              ))}
            </select>
          ) : (
            <TextInput
              placeholder="orgId"
              value={orgId}
              onChangeText={setOrgId}
              style={{ borderWidth: 1, borderColor: "#E5E7EB", padding: 10, borderRadius: 10, minWidth: 180 }}
            />
          )}

          {/* fechas */}
          {isWeb ? (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.currentTarget.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" }}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.currentTarget.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" }}
              />
            </>
          ) : (
            <>
              <TextInput
                placeholder="YYYY-MM-DD (desde)"
                value={dateFrom}
                onChangeText={setDateFrom}
                style={{ borderWidth: 1, borderColor: "#E5E7EB", padding: 10, borderRadius: 10, minWidth: 140 }}
              />
              <TextInput
                placeholder="YYYY-MM-DD (hasta)"
                value={dateTo}
                onChangeText={setDateTo}
                style={{ borderWidth: 1, borderColor: "#E5E7EB", padding: 10, borderRadius: 10, minWidth: 140 }}
              />
            </>
          )}

          <Pressable
            onPress={exportCSV}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: "#2563EB",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>EXPORTAR CSV</Text>
          </Pressable>

          <View style={{ marginLeft: "auto" }}>
            <Chip text={loading ? "Actualizando…" : "Listo"} />
          </View>
        </View>
      </View>

      {/* Metric cards */}
      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <MetricCard title="Colonias activas" value={activeBoards} />
        <MetricCard title="Tareas abiertas" value={openTasks} tone="warn" />
        <MetricCard title="Vencidas" value={overdueTasks} tone="warn" />
        <MetricCard title="Completadas (30d)" value={done30d} tone="success" />
      </View>

      {/* By Day */}
      <View style={{ ...cardStyle, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontWeight: "800", fontSize: 16 }}>Tareas por día</Text>
          <Chip text={`${dateFrom} → ${dateTo}`} />
        </View>

        {!byDay.length ? (
          <Empty>No hay datos en el rango seleccionado.</Empty>
        ) : (
          <View>
            {byDay.map((d) => (
              <View key={d.date} style={{ marginBottom: 10 }}>
                <Text style={{ color: "#667085", marginBottom: 4 }}>{d.date}</Text>
                <Bar label="Abiertas" value={d.open} max={maxPerDay} />
                <Bar label="Vencidas" value={d.overdue} max={maxPerDay} />
                <Bar label="Completadas" value={d.done} max={maxPerDay} />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* By Board */}
      <View style={{ ...cardStyle, marginBottom: 24 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontWeight: "800", fontSize: 16 }}>Tareas por colonia</Text>
          <Chip text={`${byBoard.length} colonias`} />
        </View>

        {!byBoard.length ? (
          <Empty>No hay datos.</Empty>
        ) : (
          <View>
            {byBoard.map((b) => {
              const total = b.open + b.inProgress + b.done;
              const name = b.boardName ?? boardNameById[b.boardId] ?? b.boardId;
              return (
                <View key={b.boardId} style={{ marginBottom: 12 }}>
                  <Bar label={name} value={total} max={maxPerBoard} right={`${total}`} />
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <Chip text={`Open ${b.open}`} />
                    <Chip text={`InProgress ${b.inProgress}`} tone="warn" />
                    <Chip text={`Done ${b.done}`} tone="success" />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function MetricCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "warn" | "success";
}) {
  const color =
    tone === "success"
      ? { bg: "#E6FFED", fg: "#136F3A" }
      : tone === "warn"
      ? { bg: "#FFF4E5", fg: "#B25E09" }
      : { bg: "#EEF2FF", fg: "#3730A3" };

  const isWeb = Platform.OS === "web";
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "#EAEAEA",
        borderRadius: 16,
        padding: 16,
        minWidth: 220,
        backgroundColor: "#fff",
        ...(isWeb
          ? {
              boxShadow:
                "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
            }
          : {}),
      }}
    >
      <Text style={{ color: "#6B7280", marginBottom: 8 }}>{title}</Text>
      <Text style={{ fontSize: 28, fontWeight: "800", marginBottom: 8 }}>
        {value}
      </Text>
      <Text
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: color.bg,
          color: color.fg,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {tone === "success"
          ? "Saludable"
          : tone === "warn"
          ? "Revisar"
          : "Resumen"}
      </Text>
    </View>
  );
}