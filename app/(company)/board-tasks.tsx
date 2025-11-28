// app/(app)/admin/board-tasks.tsx
import { Picker } from "@react-native-picker/picker";
import * as Notifications from "expo-notifications";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

/* =============== Tema Lokaly / Condos =============== */
const ui = {
  bg: "#020617",
  bgSoft: "#030712",
  card: "#020617",
  border: "#1F2937",
  borderSoft: "#111827",
  primary: "#F4C15D",
  primarySoft: "rgba(244,193,93,0.12)",
  text: "#E5E7EB",
  textMuted: "#94A3B8",
};

/* =============== Tipos =============== */
type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "ARCHIVED" | string;
type Task = {
  id: string;
  orgId: string;
  boardId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  dueDate?: string; // yyyy-MM-dd
  createdAt?: string;
  updatedAt?: string;
};

type UserOpt = { id: string; label: string };
type StatusFilter = "ALL" | "OPEN" | "IN_PROGRESS" | "DONE" | "ARCHIVED";

/* =============== Breakpoints =============== */
const useBreakpoints = () => {
  const { width } = useWindowDimensions();
  return {
    width,
    isPhone: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
};

/* =============== Notificaciones web/native =============== */
async function webNotify(title: string, body: string, data?: any) {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    alert(`${title}\n${body}`);
    return;
  }
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    const n = new Notification(title, { body, data });
    n.onclick = () => {
      if (data?.taskId) window.location.hash = `/tasks/${data.taskId}`;
    };
  } else {
    alert(`${title}\n${body}`);
  }
}

async function ensureNativeNotificationPermission() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  return finalStatus === "granted";
}

/* =============== UI helpers compartidos =============== */
function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
  size = "md",
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "warning" | "danger";
  size?: "sm" | "md";
  style?: any;
}) {
  const palette = {
    primary: { bg: "#1D4ED8", fg: "#F9FAFB" },
    secondary: { bg: ui.bgSoft, fg: ui.text },
    warning: { bg: "#F59E0B", fg: "#111827" },
    danger: { bg: "#B91C1C", fg: "#F9FAFB" },
  } as const;
  const p = palette[tone];
  const pv = size === "sm" ? 7 : 9;
  const ph = size === "sm" ? 12 : 14;
  const fs = size === "sm" ? 11 : 13;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: p.bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderRadius: 999,
          paddingVertical: pv,
          paddingHorizontal: ph,
        },
        style,
      ]}
    >
      <Text style={{ color: p.fg, fontWeight: "700", fontSize: fs }}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status?: TaskStatus }) {
  const key = String(status || "OPEN").toUpperCase();

  const palette: Record<string, { bg: string; fg: string }> = {
    OPEN: { bg: "rgba(96,165,250,0.18)", fg: "#BFDBFE" },
    IN_PROGRESS: { bg: "rgba(250,204,21,0.18)", fg: "#FACC15" },
    DONE: { bg: "rgba(34,197,94,0.18)", fg: "#BBF7D0" },
    ARCHIVED: { bg: "rgba(148,163,184,0.18)", fg: "#E5E7EB" },
    DEFAULT: { bg: ui.bgSoft, fg: ui.textMuted },
  };

  const { bg, fg } = palette[key] ?? palette.DEFAULT;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: 11 }}>
        {key.replaceAll("_", " ")}
      </Text>
    </View>
  );
}

function Chip({
  label,
  tone = "secondary",
}: {
  label: string;
  tone?: "primary" | "secondary" | "warning";
}) {
  const palette = {
    primary: { bg: "rgba(244,193,93,0.16)", fg: ui.primary },
    secondary: { bg: ui.bgSoft, fg: ui.textMuted },
    warning: { bg: "rgba(250,204,21,0.18)", fg: "#FACC15" },
  }[tone];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: palette.bg,
      }}
    >
      <Text style={{ color: palette.fg, fontWeight: "600", fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 90,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: ui.border,
        backgroundColor: ui.bgSoft,
      }}
    >
      <Text
        style={{
          color: ui.textMuted,
          fontSize: 11,
          marginBottom: 4,
        }}
      >
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          color: ui.text,
          fontWeight: "800",
          fontSize: 18,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/* =============== Select de asignado =============== */
type AssigneeSelectorProps = {
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  users: UserOpt[];
};

const AssigneeSelector = ({
  assigneeId,
  setAssigneeId,
  users,
}: AssigneeSelectorProps) => {
  // Web
  if (Platform.OS === "web") {
    return (
      <select
        value={assigneeId}
        onChange={(e) => setAssigneeId(e.currentTarget.value)}
        style={{
          padding: 10,
          borderRadius: 999,
          border: `1px solid ${ui.border}` as any,
          minWidth: 220,
          background: ui.bgSoft,
          color: ui.text,
          fontSize: 13,
        }}
      >
        <option value="">— sin asignar —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </select>
    );
  }

  // Android
  if (Platform.OS === "android") {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: ui.border,
          borderRadius: 999,
          minHeight: 44,
          justifyContent: "center",
          backgroundColor: ui.bgSoft,
        }}
      >
        <Picker
          selectedValue={assigneeId}
          onValueChange={(v) => setAssigneeId(String(v))}
          mode="dropdown"
          style={{ height: 44, color: ui.text }}
          dropdownIconColor={ui.text}
        >
          <Picker.Item label="— sin asignar —" value="" />
          {users.map((u) => (
            <Picker.Item key={u.id} label={u.label} value={u.id} />
          ))}
        </Picker>
      </View>
    );
  }

  // iOS: ActionSheet
  const options = ["— sin asignar —", ...users.map((u) => u.label), "Cancelar"];
  const cancelButtonIndex = options.length - 1;

  const currentLabel =
    assigneeId
      ? users.find((u) => u.id === assigneeId)?.label ?? assigneeId
      : "— sin asignar —";

  const openSheet = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Asignar a…",
        options,
        cancelButtonIndex,
        userInterfaceStyle: "dark",
      },
      (idx) => {
        if (idx === cancelButtonIndex) return;
        if (idx === 0) {
          setAssigneeId("");
        } else {
          const selectedUser = users[idx - 1];
          if (selectedUser) setAssigneeId(selectedUser.id);
        }
      }
    );
  };

  return (
    <Pressable
      onPress={openSheet}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 999,
        minHeight: 44,
        backgroundColor: pressed ? "#020617" : ui.bgSoft,
        justifyContent: "center",
        paddingHorizontal: 12,
      })}
    >
      <Text style={{ fontWeight: "700", color: ui.text }} numberOfLines={1}>
        {currentLabel}
      </Text>
      <Text
        style={{
          position: "absolute",
          right: 12,
          color: ui.textMuted,
          fontSize: 10,
        }}
      >
        ▼
      </Text>
    </Pressable>
  );
};

/* =============== Pantalla principal =============== */
export default function BoardTasks() {
  const router = useRouter();
  const { me, token, logout } = useApp();
  const { width, isPhone, isTablet, isDesktop } = useBreakpoints();
  const twoCols = width >= 880;

  const { boardId, orgId: orgIdParam, boardName } =
    useLocalSearchParams<{ boardId: string; orgId: string; boardName?: string }>();

  const orgId = String(orgIdParam || "");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Crear (oculto hasta presionar el botón)
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const userNameById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.label])),
    [users]
  );

  // Listener de notificación tap
  useEffect(() => {
    const sub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as any;
        console.log("Notification tapped", data);
        // Aquí podrías navegar a detalle de tarea si tienes ruta
      });
    return () => sub.remove();
  }, []);

  /* -------- cargar usuarios de la org -------- */
  const loadUsers = useCallback(async () => {
    if (!orgId) return;
    try {
      const list = await apiAuth(
        `/user/users?orgId=${encodeURIComponent(orgId)}&status=ACTIVE`,
        "GET",
        undefined,
        token ?? undefined
      );
      const arr: UserOpt[] = (Array.isArray(list) ? list : []).map(
        (u: any) => ({
          id: String(u.id),
          label: String(u.fullName?.trim() || u.email),
        })
      );
      setUsers(arr);
      if (!assigneeId && arr.length) setAssigneeId(arr[0].id);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }, [orgId, token, assigneeId]);

  /* -------- cargar tareas del board -------- */
  const loadTasks = useCallback(
    async () => {
      if (!boardId) return;
      setMsg("");
      setLoading(true);
      try {
        const raw = await apiAuth(
          `/board/boards/${boardId}/tasks?page=0&size=1000`,
          "GET",
          undefined,
          token ?? undefined
        );
        const list: Task[] = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr = list.map((t: any) => ({
          id: String(t.id ?? t.taskId ?? t._id),
          orgId: String(t.orgId),
          boardId: String(t.boardId),
          title: String(t.title),
          description: t.description,
          status: t.status as TaskStatus,
          assigneeId: t.assigneeId ? String(t.assigneeId) : undefined,
          dueDate: t.dueDate ? String(t.dueDate) : undefined,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        setTasks(arr);
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    },
    [boardId, token]
  );

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* -------- crear tarea -------- */
  const createTask = async () => {
    try {
      if (!title.trim()) {
        setMsg("Escribe un título");
        return;
      }
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined, // "YYYY-MM-DD"
      };

      const created = await apiAuth(
        `/board/boards/${boardId}/tasks`,
        "POST",
        payload
      );
      const taskId = String(created?.id ?? created?.taskId ?? created?._id);

      await notifyTaskAssigned({
        assigneeId: assigneeId || undefined,
        taskId,
        title: payload.title,
      });

      setDescription("");
      setAssigneeId(assigneeId);
      setDueDate("");
      setTitle("");
      await loadTasks();
      setMsg("Tarea creada ✅");
      setShowCreate(false);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* -------- métricas + filtros en memoria -------- */
  const totalTasks = tasks.length;
  const openTasks = tasks.filter(
    (t) => String(t.status).toUpperCase() === "OPEN"
  ).length;
  const inProgressTasks = tasks.filter(
    (t) => String(t.status).toUpperCase() === "IN_PROGRESS"
  ).length;
  const doneTasks = tasks.filter(
    (t) => String(t.status).toUpperCase() === "DONE"
  ).length;

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tasks.filter((t) => {
      const key = String(t.status).toUpperCase();
      if (statusFilter !== "ALL" && key !== statusFilter) return false;

      if (!term) return true;

      const titleMatch = t.title.toLowerCase().includes(term);
      const descMatch = (t.description ?? "").toLowerCase().includes(term);
      const assigneeName = t.assigneeId
        ? (userNameById[t.assigneeId] ?? "").toLowerCase()
        : "";
      const assigneeMatch = assigneeName.includes(term);

      return titleMatch || descMatch || assigneeMatch;
    });
  }, [tasks, statusFilter, search, userNameById]);

  /* -------- estilos base -------- */
  const cardBase = {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 16,
    backgroundColor: ui.card,
    padding: 14,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 18px 40px rgba(15,23,42,0.75)" }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 4,
        }),
  } as const;

  const input = {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "android" ? 8 : 11,
    minHeight: 44,
    fontSize: 14,
    backgroundColor: ui.bgSoft,
    color: ui.text,
  } as const;

  const taskCardWidth = useMemo(() => {
    if (!twoCols) return "100%";
    return "48%";
  }, [twoCols]);

  /* -------- Render -------- */
  return (
    <View style={{ flex: 1, backgroundColor: ui.bg }}>
      {/* TOP BAR */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: isPhone ? 10 : 12,
          borderBottomWidth: 1,
          borderColor: ui.border,
          backgroundColor: ui.bgSoft,
          flexDirection: isPhone ? "column" : "row",
          alignItems: isPhone ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: isPhone ? 10 : 8,
        }}
      >
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
            <Text style={{ fontSize: 11, color: ui.textMuted }}>
              Tareas del condominio
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {!!me?.email && (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: ui.border,
                backgroundColor: ui.bg,
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
                {me.email}
              </Text>
            </View>
          )}
          <PillButton
            label="Volver"
            tone="secondary"
            size="sm"
            onPress={() => router.back()}
          />
          <PillButton label="Salir" tone="danger" size="sm" onPress={logout} />
        </View>
      </View>

      {/* SUB HEADER: info de board + métricas + filtros */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: ui.border,
          backgroundColor: ui.bgSoft,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <View style={{ flexShrink: 1, maxWidth: "70%" }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: ui.text,
              }}
              numberOfLines={1}
            >
              {boardName || "Tareas del board"}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: ui.textMuted,
              }}
              numberOfLines={1}
            >
              ID board: {boardId}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {/* botón mostrar formulario */}
            <PillButton
              label={showCreate ? "Ocultar" : "Crear tarea"}
              tone={showCreate ? "secondary" : "primary"}
              size="sm"
              onPress={() => setShowCreate((v) => !v)}
            />
          </View>
        </View>

        {/* Métricas */}
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <MetricCard label="Total tareas" value={totalTasks} />
          <MetricCard label="Abiertas" value={openTasks} />
          <MetricCard label="En progreso" value={inProgressTasks} />
          <MetricCard label="Completadas" value={doneTasks} />
        </View>

        {/* Buscador + filtro estado */}
        <View
          style={{
            flexDirection: isPhone ? "column" : "row",
            gap: 10,
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <TextInput
              placeholder="Buscar por título, descripción o asignado…"
              placeholderTextColor={ui.textMuted}
              value={search}
              onChangeText={setSearch}
              style={input}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                borderRadius: 999,
                borderWidth: 1,
                borderColor: ui.border,
                overflow: "hidden",
              }}
            >
              {(
                ["ALL", "OPEN", "IN_PROGRESS", "DONE"] as StatusFilter[]
              ).map((key) => {
                const isActive = statusFilter === key;
                const labels: Record<StatusFilter, string> = {
                  ALL: "Todas",
                  OPEN: "Abiertas",
                  IN_PROGRESS: "En progreso",
                  DONE: "Completadas",
                  ARCHIVED: "Archivadas",
                };
                return (
                  <Pressable
                    key={key}
                    onPress={() => setStatusFilter(key)}
                    style={({ pressed }) => ({
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      backgroundColor: isActive
                        ? ui.primarySoft
                        : ui.bgSoft,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: isActive ? ui.primary : ui.textMuted,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {labels[key].toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {/* LISTA PRINCIPAL */}
      <FlatList
        style={{ flex: 1, backgroundColor: ui.bg }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 80,
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
        data={filteredTasks}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        onRefresh={loadTasks}
        numColumns={twoCols ? 2 : 1}
        columnWrapperStyle={twoCols ? { gap: 16 } : undefined}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {!!msg && (
              <View
                style={{
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: msg.includes("✅")
                    ? "rgba(37,99,235,0.16)"
                    : "rgba(248,113,113,0.12)",
                  borderWidth: 1,
                  borderColor: msg.includes("✅")
                    ? "#2563EB"
                    : "#F87171",
                }}
              >
                <Text
                  style={{
                    color: msg.includes("✅") ? "#BFDBFE" : "#FCA5A5",
                  }}
                >
                  {msg}
                </Text>
              </View>
            )}

            {/* Crear tarea */}
            {showCreate && (
              <View style={[cardBase, { gap: 10 }]}>
                <Text
                  style={{
                    fontWeight: "800",
                    fontSize: 16,
                    color: ui.text,
                  }}
                >
                  Crear nueva tarea
                </Text>
                <TextInput
                  placeholder="Título"
                  placeholderTextColor={ui.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  style={input}
                />
                <TextInput
                  placeholder="Descripción (opcional)"
                  placeholderTextColor={ui.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  style={input}
                />
                <AssigneeSelector
                  assigneeId={assigneeId}
                  setAssigneeId={setAssigneeId}
                  users={users}
                />
                {Platform.OS === "web" ? (
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.currentTarget.value)}
                    style={{
                      padding: 10,
                      borderRadius: 999,
                      border: `1px solid ${ui.border}` as any,
                      background: ui.bgSoft,
                      color: ui.text,
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <TextInput
                    placeholder="yyyy-MM-dd"
                    placeholderTextColor={ui.textMuted}
                    value={dueDate}
                    onChangeText={setDueDate}
                    style={input}
                  />
                )}
                <PillButton
                  label="Crear tarea"
                  onPress={createTask}
                  disabled={!title.trim()}
                />
              </View>
            )}

            {/* Encabezado listado */}
            <View
              style={[
                cardBase,
                {
                  padding: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
              ]}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontWeight: "800", color: ui.text }}>
                  Tareas del board
                </Text>
                <Text
                  style={{
                    color: ui.textMuted,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {filteredTasks.length} resultado
                  {filteredTasks.length === 1 ? "" : "s"}
                  {search.trim() ? ` para "${search.trim()}"` : ""}
                </Text>
              </View>
              {loading && <ActivityIndicator color={ui.primary} />}
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading && (
            <View
              style={{
                alignItems: "center",
                paddingVertical: 40,
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: ui.text,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                No hay tareas para este board
              </Text>
              <Text
                style={{
                  color: ui.textMuted,
                  fontSize: 12,
                  textAlign: "center",
                  maxWidth: 260,
                }}
              >
                Ajusta los filtros o crea una nueva tarea para iniciar el
                seguimiento.
              </Text>
            </View>
          )
        }
        renderItem={({ item: t }) => (
          <View
            style={[
              cardBase,
              {
                width: taskCardWidth as any,
                marginTop: 8,
                gap: 6,
              },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 15,
                  color: ui.text,
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {t.title}
              </Text>
              <StatusBadge status={t.status} />
            </View>

            {!!t.description && (
              <Text
                style={{ color: ui.textMuted, fontSize: 12 }}
                numberOfLines={3}
              >
                {t.description}
              </Text>
            )}

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 4,
              }}
            >
              {t.assigneeId && (
                <Chip
                  label={`Asignado: ${
                    userNameById[t.assigneeId] ?? t.assigneeId
                  }`}
                />
              )}
              {t.dueDate && <Chip label={`Vence: ${t.dueDate}`} tone="warning" />}
              {!!t.createdAt && (
                <Chip
                  label={`Creada: ${new Date(
                    t.createdAt
                  ).toLocaleString()}`}
                  tone="secondary"
                />
              )}
            </View>
          </View>
        )}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </View>
  );
}

/* =============== Notificación helper =============== */
async function notifyTaskAssigned({
  assigneeId,
  taskId,
  title,
}: {
  assigneeId?: string;
  taskId: string;
  title: string;
}) {
  try {
    // 1) Notificación real por backend
    if (assigneeId) {
      await apiAuth(`/notify/task-assigned`, "POST", {
        assigneeId,
        taskId,
        title,
      });
    }

    // 2) Fallback local
    const body = "Tienes una nueva tarea pendiente";
    const data = { taskId };

    if (Platform.OS === "web") {
      await webNotify("Nueva tarea asignada", body, data);
    } else {
      const ok = await ensureNativeNotificationPermission();
      if (ok) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "Nueva tarea asignada", body, data },
          trigger: null,
        });
      }
    }
  } catch (e) {
    console.warn("notifyTaskAssigned error", e);
  }
}