// app/(operator)/index.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
  warnBg: "#FFF7E0",
  warnText: "#8A6D1F",
};

type Board = { id: string; name: string };
type Task = { id: string; boardId: string; title: string; status: string; createdAt?: string };

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function hoursAgo(iso?: string) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.max(0, Math.round(ms / (3600 * 1000)));
  if (h < 1) return "hace unos minutos";
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.round(h / 24)}d`;
}

const ISSUE_ICONS = ["💧", "💡", "🔒", "🌳", "🛠️"];
function issueIcon(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return ISSUE_ICONS[Math.abs(hash) % ISSUE_ICONS.length];
}

export default function OperatorDashboard() {
  const router = useRouter();
  const { me } = useApp();
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";
  const shortName = me?.email ? me.email.split("@")[0] : "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [loadingBoards, setLoadingBoards] = useState(true);

  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [pendingChargesCount, setPendingChargesCount] = useState<number | null>(null);
  const [collectionPct, setCollectionPct] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoadingBoards(true);
      try {
        const raw = await apiAuth(`/board/boards?page=0&size=1000&orgId=${encodeURIComponent(orgId)}`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: Board[] = list.map((b: any) => ({ id: String(b.id), name: String(b.name ?? b.id) }));
        setBoards(arr);
        if (arr.length && !boardId) setBoardId(arr[0].id);
      } finally {
        setLoadingBoards(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId || !boardId) return;
    setLoadingDetail(true);
    try {
      const [tasksRaw, pendingRaw, overdueRaw, collRaw] = await Promise.all([
        apiAuth(
          `/board/tasks?orgId=${encodeURIComponent(orgId)}&assigneeId=me&status=OPEN&size=200`,
          "GET"
        ).catch(() => null),
        apiAuth(
          `/billing/charges?orgId=${encodeURIComponent(orgId)}&boardId=${encodeURIComponent(boardId)}&status=PENDING&size=1`,
          "GET"
        ).catch(() => null),
        apiAuth(
          `/billing/charges?orgId=${encodeURIComponent(orgId)}&boardId=${encodeURIComponent(boardId)}&status=OVERDUE&size=1`,
          "GET"
        ).catch(() => null),
        apiAuth(
          `/billing/stats/collection-by-board?orgId=${encodeURIComponent(orgId)}&period=${currentPeriod()}`,
          "GET"
        ).catch(() => []),
      ]);

      const allTasks: Task[] = (tasksRaw?.content ?? (Array.isArray(tasksRaw) ? tasksRaw : [])).map(
        (t: any) => ({
          id: String(t.id),
          boardId: String(t.boardId),
          title: String(t.title ?? ""),
          status: t.status,
          createdAt: t.createdAt,
        })
      );
      setOpenTasks(allTasks.filter((t) => t.boardId === boardId));

      const pendingTotal = typeof pendingRaw?.totalElements === "number" ? pendingRaw.totalElements : 0;
      const overdueTotal = typeof overdueRaw?.totalElements === "number" ? overdueRaw.totalElements : 0;
      setPendingChargesCount(pendingTotal + overdueTotal);

      const row = (Array.isArray(collRaw) ? collRaw : []).find((r: any) => String(r.boardId) === boardId);
      setCollectionPct(row ? Number(row.percentage) : null);
    } finally {
      setLoadingDetail(false);
    }
  }, [orgId, boardId]);

  useEffect(() => {
    load();
  }, [load]);

  const atender = async (taskId: string) => {
    try {
      await apiAuth(`/board/tasks/${taskId}/status`, "PATCH", { status: "IN_PROGRESS" });
      setOpenTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      // si falla, se refleja al recargar
      load();
    }
  };

  const selectedBoardName = boards.find((b) => b.id === boardId)?.name ?? "—";
  const busy = loadingBoards || loadingDetail;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 1040, gap: 16 }}>
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
              {boards.length} condominio{boards.length === 1 ? "" : "s"} asignado
              {boards.length === 1 ? "" : "s"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {boards.length > 0 && (
              <Pressable
                onPress={() => boards.length > 1 && setBoardPickerOpen(true)}
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
                  {selectedBoardName}
                </Text>
                {boards.length > 1 && <Ionicons name="chevron-down" size={14} color="#FFFFFF" />}
              </Pressable>
            )}

            <IconButton icon="notifications-outline" onPress={() => router.push("/(operator)/configuracion" as any)} />
            <IconButton icon="ellipsis-horizontal" onPress={() => router.push("/(operator)/configuracion" as any)} />
          </View>
        </View>

        {/* Selector de colonia: en Modal para que nunca quede recortado por
            el ScrollView de la página (una View position:absolute normal sí
            se recorta, un Modal no). */}
        <Modal
          visible={boardPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setBoardPickerOpen(false)}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => setBoardPickerOpen(false)}
          >
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
              {boards.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setBoardId(b.id);
                    setBoardPickerOpen(false);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: b.id === boardId ? ui.primarySoft : "transparent",
                  }}
                >
                  <Text style={{ color: ui.text, fontSize: 13, fontWeight: "600" }}>{b.name}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>

        {busy && (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={ui.primary} />
          </View>
        )}

        {!busy && boards.length === 0 && (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Todavía no tienes colonias asignadas en tu empresa.
            </Text>
          </Card>
        )}

        {!busy && boards.length > 0 && (
          <>
            {/* KPIs */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              <Kpi title="Incidencias sin atender" value={String(openTasks.length)} tone="warn" />
              <Kpi
                title="Pagos por registrar"
                value={pendingChargesCount !== null ? String(pendingChargesCount) : "—"}
                tone="warn"
              />
              <Kpi
                title="Cobranza del condominio"
                value={collectionPct !== null ? `${collectionPct}%` : "—"}
                tone="ok"
              />
            </View>

            {/* Acciones rápidas + Incidencias */}
            <View style={{ flexDirection: Platform.OS === "web" ? "row" : "column", gap: 16 }}>
              <View style={{ flex: 1, gap: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: ui.text }}>Acciones rápidas</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  <QuickAction
                    icon="cash-outline"
                    label="Registrar pago"
                    highlight
                    onPress={() => router.push("/(operator)/pagos" as any)}
                  />
                  <QuickAction
                    icon="chatbubble-ellipses-outline"
                    label="Atender incidencia"
                    onPress={() => router.push("/(ops)/tasks" as any)}
                  />
                  <QuickAction
                    icon="megaphone-outline"
                    label="Publicar comunicado"
                    onPress={() => router.push("/(operator)/comunicados" as any)}
                  />
                  <QuickAction
                    icon="calendar-outline"
                    label="Ver reservas"
                    onPress={() => router.push("/(operator)/reservas" as any)}
                  />
                </View>
              </View>

              <View style={{ flex: 1.4 }}>
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
                      Incidencias sin atender
                    </Text>
                    <Pressable onPress={() => router.push("/(ops)/tasks" as any)}>
                      <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>Ver todos</Text>
                    </Pressable>
                  </View>

                  {openTasks.length === 0 ? (
                    <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                      No tienes incidencias sin atender en esta colonia. 🎉
                    </Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {openTasks.slice(0, 4).map((t) => (
                        <View
                          key={t.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            borderWidth: 1,
                            borderColor: ui.borderSoft,
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              backgroundColor: ui.primarySoft,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text style={{ fontSize: 15 }}>{issueIcon(t.id)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                              {t.title}
                            </Text>
                            <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                              Reportado {hoursAgo(t.createdAt)}
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => atender(t.id)}
                            style={{
                              backgroundColor: ui.primarySoft,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 999,
                            }}
                          >
                            <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>Atender</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </Card>
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

function Kpi({ title, value, tone }: { title: string; value: string; tone: "warn" | "ok" }) {
  const color = tone === "ok" ? "#16A34A" : "#D97706";
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: 200,
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 14,
        padding: 14,
        backgroundColor: ui.surface,
      }}
    >
      <Text style={{ color: ui.textMuted, fontSize: 12, marginBottom: 6 }}>{title}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 150,
        borderRadius: 14,
        padding: 14,
        gap: 10,
        backgroundColor: highlight ? "#F1E94A" : ui.surface,
        borderWidth: highlight ? 0 : 1,
        borderColor: ui.border,
      }}
    >
      <Ionicons name={icon} size={18} color={ui.text} />
      <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function IconButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: ui.surface,
        borderWidth: 1,
        borderColor: ui.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={17} color={ui.text} />
    </Pressable>
  );
}
