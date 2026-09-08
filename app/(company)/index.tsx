// app/(company)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { api, apiAuth } from "../../lib/api";
import { Role, highestRoleInOrg } from "../../lib/rbac";
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

type Board = {
    id: string;
    orgId: string;
    name: string;
    status: "ACTIVE" | "ARCHIVED";
    supervisorUserId?: string;
    supervisorName?: string;
};

type CondoRow = {
    name: string;
    supervisor: string | null;
    status: "AL_DIA" | "ATENCION";
    pending: number;
};

type QuickViewRow = {
    id: string;
    name: string;
    supervisor: string | null;
    status: "AL_DIA" | "ATENCION";
    pending: number;
};

type BoardTaskStats = {
    boardId: string;
    open: number;
    inProgress: number;
};

type SupervisorWorkload = {
    userId: string;
    name: string;
    condos: number;
    pending: number;
};

const AVATAR_COLORS = ["#5B9EF9", "#F97362", "#4ADE80", "#C084FC", "#F1C84A"];
function avatarColorFor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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
    const myRole: Role = highestRoleInOrg(me, orgId);
    const isSupervisorView = myRole === "SUPERVISOR";

    const [boards, setBoards] = useState<Board[]>([]);
    const [operatorCount, setOperatorCount] = useState<number | null>(null);
    const [supervisorCount, setSupervisorCount] = useState<number | null>(null);
    const [taskStatsByBoard, setTaskStatsByBoard] = useState<BoardTaskStats[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        (async () => {
            setLoading(true);
            try {
                // Un SUPERVISOR solo ve sus propios condominios; ADMINISTRADOR/SUPERADMIN ven toda la empresa.
                // /board/tasks/stats/by-board devuelve el desglose por condominio de toda la org (sin filtro
                // de boardId), así que se pide siempre igual y cada vista suma solo los boards que le tocan
                // (boardList, más abajo, ya viene filtrado por rol).
                const taskStatsUrl = `/board/tasks/stats/by-board?orgId=${orgId}&from=2000-01-01&to=2100-01-01`;

                // Promise.allSettled (no Promise.all): si un endpoint todavía no está desplegado
                // en el backend, esa sección se queda vacía en vez de tumbar TODO el panel.
                //
                // IMPORTANTE: solo `boards` usa `apiAuth` (que desloguea automáticamente en
                // 401/403 — comportamiento correcto cuando el token realmente expiró). Las
                // otras llamadas son métricas complementarias del dashboard: usan `api()`
                // directo (sin el callback de auto-logout) para que un 401/403 puntual en
                // una tarjeta secundaria no cierre la sesión de todo el panel.
                const [boardsRes, operatorsRes, supervisorsRes, taskStatsRes] =
                    await Promise.allSettled([
                        apiAuth(`/board/boards?orgId=${orgId}&size=100`, "GET"),
                        api(`/user/users?orgId=${orgId}&role=OPERATIVO`, "GET", undefined, token ?? undefined),
                        api(`/user/users?orgId=${orgId}&role=SUPERVISOR`, "GET", undefined, token ?? undefined),
                        api(taskStatsUrl, "GET", undefined, token ?? undefined),
                    ]);

                [
                    ["board/boards", boardsRes],
                    ["user/users?role=OPERATIVO", operatorsRes],
                    ["user/users?role=SUPERVISOR", supervisorsRes],
                    ["board/tasks/stats/by-board", taskStatsRes],
                ].forEach(([label, res]: any) => {
                    if (res.status === "rejected") {
                        const status = res.reason?.status ?? "sin status";
                        console.warn(
                            `[CompanyHome] falló ${label} (HTTP ${status}):`,
                            res.reason?.message ?? res.reason
                        );
                    }
                });

                const boardsRaw = boardsRes.status === "fulfilled" ? boardsRes.value : null;
                const operatorsRaw = operatorsRes.status === "fulfilled" ? operatorsRes.value : null;
                const supervisorsRaw = supervisorsRes.status === "fulfilled" ? supervisorsRes.value : null;
                const taskStatsRaw = taskStatsRes.status === "fulfilled" ? taskStatsRes.value : null;

                const rawList: any[] = Array.isArray(boardsRaw) ? boardsRaw : boardsRaw?.content ?? [];
                const boardList = rawList
                    .filter((b) => b.status === "ACTIVE")
                    .filter((b) => !isSupervisorView || b.supervisorUserId === me?.id);
                setBoards(
                    boardList.map((b) => ({
                        id: b.id,
                        orgId: b.orgId,
                        name: b.name,
                        status: b.status,
                        supervisorUserId: b.supervisorUserId,
                        supervisorName: b.supervisorName,
                    }))
                );
                setOperatorCount(Array.isArray(operatorsRaw) ? operatorsRaw.length : null);
                setSupervisorCount(Array.isArray(supervisorsRaw) ? supervisorsRaw.length : null);
                setTaskStatsByBoard(Array.isArray(taskStatsRaw) ? taskStatsRaw : []);
            } finally {
                setLoading(false);
            }
        })();
    }, [orgId, token, isSupervisorView, me?.id]);

    const displayName = (me as any)?.name ?? (me?.email ?? "").split("@")[0] ?? "";

    /**
     * El "supervisor asignado" por condominio, el resumen de "Equipo activo" y
     * "Incidencias abiertas" / "Tareas pendientes" (OPEN/IN_PROGRESS vía
     * /board/tasks/stats/by-board) ya usan datos reales del backend.
     */
    const taskStatsByBoardId = useMemo(() => {
        const map = new Map<string, BoardTaskStats>();
        for (const s of taskStatsByBoard) map.set(String(s.boardId), s);
        return map;
    }, [taskStatsByBoard]);

    function pendingForBoard(boardId: string) {
        const s = taskStatsByBoardId.get(boardId);
        return s ? (s.open ?? 0) + (s.inProgress ?? 0) : 0;
    }

    const openTasksCount = useMemo(
        () => boards.reduce((sum, b) => sum + pendingForBoard(b.id), 0),
        [boards, taskStatsByBoardId]
    );

    const condoRows: CondoRow[] = useMemo(
        () =>
            boards.slice(0, 3).map((b) => ({
                name: b.name,
                supervisor: b.supervisorName ?? null,
                status: b.supervisorName ? "AL_DIA" : "ATENCION",
                pending: pendingForBoard(b.id),
            })),
        [boards, taskStatsByBoardId]
    );

    const sinSupervisorCount = boards.filter((b) => !b.supervisorName).length;

    /**
     * "Tareas pendientes por supervisor" (solo vista ADMINISTRADOR/SUPERADMIN):
     * suma de tareas OPEN/IN_PROGRESS de todos los condominios que tiene asignados
     * cada supervisor. Se calcula en el frontend combinando `boards` (que ya trae
     * supervisorUserId/supervisorName) con el desglose por condominio de
     * /board/tasks/stats/by-board — no requiere un endpoint nuevo.
     * Ordenado de mayor a menor carga pendiente, para resaltar primero al
     * supervisor que necesita más atención.
     */
    const supervisorWorkloads: SupervisorWorkload[] = useMemo(() => {
        const map = new Map<string, SupervisorWorkload>();
        for (const b of boards) {
            if (!b.supervisorUserId) continue;
            const existing = map.get(b.supervisorUserId) ?? {
                userId: b.supervisorUserId,
                name: b.supervisorName ?? "Supervisor",
                condos: 0,
                pending: 0,
            };
            existing.condos += 1;
            existing.pending += pendingForBoard(b.id);
            map.set(b.supervisorUserId, existing);
        }
        return Array.from(map.values()).sort((a, b) => b.pending - a.pending || b.condos - a.condos);
    }, [boards, taskStatsByBoardId]);

    /** Alerta de la columna derecha del Panel General: prioriza condominios sin
     * supervisor asignado; si todos tienen supervisor, avisa del supervisor con
     * más tareas pendientes acumuladas (umbral: 5 o más). */
    const alertBanner = useMemo(() => {
        if (sinSupervisorCount > 0) {
            return { type: "sin_supervisor" as const, count: sinSupervisorCount };
        }
        const highest = supervisorWorkloads[0];
        if (highest && highest.pending >= 5) {
            return { type: "high_pending" as const, name: highest.name, pending: highest.pending };
        }
        return null;
    }, [sinSupervisorCount, supervisorWorkloads]);

    /** "Condominios (vista rápida)" del Panel General: todos los condominios
     * activos con su supervisor y tareas pendientes, ordenados para resaltar
     * primero los que necesitan más atención (mayor número de pendientes primero). */
    const quickViewRows: QuickViewRow[] = useMemo(
        () =>
            boards
                .map((b) => ({
                    id: b.id,
                    name: b.name,
                    supervisor: b.supervisorName ?? null,
                    status: (b.supervisorName ? "AL_DIA" : "ATENCION") as "AL_DIA" | "ATENCION",
                    pending: pendingForBoard(b.id),
                }))
                .sort((a, b) => b.pending - a.pending)
                .slice(0, 8),
        [boards, taskStatsByBoardId]
    );

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
                        {isSupervisorView ? "Panel de supervisión" : "Panel General"}
                    </Text>
                    <Text style={{ color: ui.textGray, fontSize: 13, marginTop: 2 }}>
                        {loading
                            ? "Cargando…"
                            : isSupervisorView
                                ? `${boards.length} condominios bajo tu gestión`
                                : "Toda la operación de la empresa, en un vistazo"}
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
                {isSupervisorView ? (
                    <>
                        <MetricCard label="Condominios activos" value={String(boards.length)} tone="purple" />
                        <MetricCard label="Operadores" value={operatorCount != null ? String(operatorCount) : "—"} />
                        <MetricCard label="Incidencias abiertas" value={String(openTasksCount)} />
                    </>
                ) : (
                    <>
                        <MetricCard label="Condominios totales" value={String(boards.length)} tone="purple" />
                        <MetricCard
                            label="Supervisores"
                            value={supervisorCount != null ? String(supervisorCount) : "—"}
                        />
                        <MetricCard label="Operadores" value={operatorCount != null ? String(operatorCount) : "—"} />
                        <MetricCard label="Tareas pendientes" value={String(openTasksCount)} />
                    </>
                )}
            </View>

            {loading ? (
                <ActivityIndicator color={ui.purple} style={{ marginTop: 20 }} />
            ) : isSupervisorView ? (
                // ============ Vista SUPERVISOR ============
                <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
                    <View style={{ flex: 1, minWidth: 300, gap: 12 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <Text style={{ color: ui.textDark, fontSize: 15, fontWeight: "800" }}>
                                Tus condominios
                            </Text>
                            <Pressable onPress={() => router.push("/(company)/boards")}>
                                <Text style={{ color: ui.purple, fontSize: 13, fontWeight: "700" }}>Ver todos</Text>
                            </Pressable>
                        </View>

                        {condoRows.length === 0 && !loading && (
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

                        {condoRows.map((row) => (
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
                                        {row.supervisor ? `Supervisor: ${row.supervisor}` : "Sin supervisor asignado"}
                                    </Text>
                                    <Text style={{ color: ui.textGray, fontSize: 11, marginTop: 1 }}>
                                        Tareas pendientes: {row.pending}
                                    </Text>
                                </View>
                                <StatusChip status={row.status} />
                            </Pressable>
                        ))}
                    </View>
                </View>
            ) : (
                // ============ Vista ADMINISTRADOR/SUPERADMIN — "Panel General" ============
                <>
                    <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
                        {/* Columna izquierda: Supervisores y su cartera */}
                        <View style={{ flex: 2, minWidth: 320, gap: 12 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                                <Text style={{ color: ui.textDark, fontSize: 15, fontWeight: "800" }}>
                                    Tareas pendientes por supervisor
                                </Text>
                                <Pressable onPress={() => router.push("/(company)/users")}>
                                    <Text style={{ color: ui.purple, fontSize: 13, fontWeight: "700" }}>Ver todos</Text>
                                </Pressable>
                            </View>

                            {supervisorWorkloads.length === 0 && !loading && (
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
                                        Todavía no has asignado supervisores a tus condominios.
                                    </Text>
                                </View>
                            )}

                            {supervisorWorkloads.map((s) => (
                                <Pressable
                                    key={s.userId}
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
                                            borderRadius: 19,
                                            backgroundColor: avatarColorFor(s.userId),
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }}>
                                            {s.name.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: ui.textDark, fontSize: 14, fontWeight: "700" }}>
                                            {s.name}
                                        </Text>
                                        <Text style={{ color: ui.textGray, fontSize: 12, marginTop: 1 }}>
                                            {s.condos} condominio{s.condos === 1 ? "" : "s"}
                                        </Text>
                                    </View>
                                    <View
                                        style={{
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 999,
                                            backgroundColor: s.pending === 0 ? ui.greenSoft : ui.orangeSoft,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: s.pending === 0 ? ui.green : ui.orange,
                                                fontSize: 11,
                                                fontWeight: "700",
                                            }}
                                        >
                                            {s.pending} pendiente{s.pending === 1 ? "" : "s"}
                                        </Text>
                                    </View>
                                </Pressable>
                            ))}
                        </View>

                        {/* Columna derecha: alerta */}
                        <View style={{ flex: 1, minWidth: 260, gap: 16 }}>
                            {alertBanner?.type === "sin_supervisor" && (
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
                                        <Text style={{ fontWeight: "800" }}>{alertBanner.count} condominio(s)</Text> sin
                                        supervisor asignado esta semana. Revisa la asignación de equipo.
                                    </Text>
                                </View>
                            )}
                            {alertBanner?.type === "high_pending" && (
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
                                        <Text style={{ fontWeight: "800" }}>{alertBanner.name}</Text> tiene{" "}
                                        {alertBanner.pending} tareas pendientes — la carga más alta del equipo.
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Condominios (vista rápida) */}
                    <View style={{ marginTop: 24 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 12,
                            }}
                        >
                            <Text style={{ color: ui.textDark, fontSize: 15, fontWeight: "800" }}>
                                Condominios (vista rápida)
                            </Text>
                            <Pressable onPress={() => router.push("/(company)/boards")}>
                                <Text style={{ color: ui.purple, fontSize: 13, fontWeight: "700" }}>Ver todos</Text>
                            </Pressable>
                        </View>

                        <View
                            style={{
                                backgroundColor: ui.card,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: ui.cardBorder,
                                overflow: "hidden",
                            }}
                        >
                            <View
                                style={{
                                    flexDirection: "row",
                                    paddingHorizontal: 16,
                                    paddingVertical: 10,
                                    borderBottomWidth: 1,
                                    borderBottomColor: ui.cardBorder,
                                }}
                            >
                                <Text style={{ flex: 2, color: ui.textGray, fontSize: 11, fontWeight: "700" }}>
                                    CONDOMINIO
                                </Text>
                                <Text style={{ flex: 1, color: ui.textGray, fontSize: 11, fontWeight: "700" }}>
                                    SUPERVISOR
                                </Text>
                                <Text style={{ flex: 1, color: ui.textGray, fontSize: 11, fontWeight: "700" }}>
                                    PENDIENTES
                                </Text>
                                <Text
                                    style={{
                                        flex: 1,
                                        color: ui.textGray,
                                        fontSize: 11,
                                        fontWeight: "700",
                                        textAlign: "right",
                                    }}
                                >
                                    ESTADO
                                </Text>
                            </View>

                            {quickViewRows.length === 0 && (
                                <Text style={{ color: ui.textGray, fontSize: 13, padding: 16 }}>
                                    No hay condominios activos todavía.
                                </Text>
                            )}

                            {quickViewRows.map((row, i) => (
                                <Pressable
                                    key={row.id}
                                    onPress={() => router.push("/(company)/boards")}
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        paddingHorizontal: 16,
                                        paddingVertical: 12,
                                        borderBottomWidth: i < quickViewRows.length - 1 ? 1 : 0,
                                        borderBottomColor: ui.cardBorder,
                                    }}
                                >
                                    <Text
                                        style={{ flex: 2, color: ui.textDark, fontSize: 13, fontWeight: "600" }}
                                        numberOfLines={1}
                                    >
                                        {row.name}
                                    </Text>
                                    <Text style={{ flex: 1, color: ui.textGray, fontSize: 12 }} numberOfLines={1}>
                                        {row.supervisor ?? "—"}
                                    </Text>
                                    <Text
                                        style={{
                                            flex: 1,
                                            fontSize: 12,
                                            fontWeight: "700",
                                            color: row.pending > 0 ? ui.orange : ui.green,
                                        }}
                                    >
                                        {row.pending}
                                    </Text>
                                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                                        <StatusChip status={row.status} />
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </>
            )}
        </ScrollView>
    );
}

