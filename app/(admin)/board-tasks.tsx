// app/(app)/admin/board-tasks.tsx
import { Picker } from "@react-native-picker/picker";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

/* ======================= Theme estilo Lokaly ======================= */

const lokalyTheme = {
  bg: "#050509",
  bgAlt: "#080812",
  surface: "#101018",
  surfaceSoft: "#171725",
  border: "#262637",
  borderSoft: "#202033",
  primary: "#F4C15D",
  primarySoft: "rgba(244, 193, 93, 0.14)",
  danger: "#F87171",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textSubtle: "#6B7280",
  chipBg: "#111827",
  chipBorder: "#1F2937",
};

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

export default function BoardTasks() {
  const router = useRouter();
  const { me, token, logout } = useApp();
  const { width } = useWindowDimensions();
  const twoCols = width >= 820; // tablet/web: 2 columnas

  const { boardId, orgId: orgIdParam, boardName } =
    useLocalSearchParams<{ boardId: string; orgId: string; boardName?: string }>();

  const orgId = String(orgIdParam || "");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Crear (form oculto hasta presionar el botón)
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const userNameById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.label])),
    [users]
  );

  /* ------------------------ cargar usuarios de la org ------------------------ */
  const loadUsers = useCallback(async () => {
    if (!orgId) return;
    try {
      const list = await apiAuth(
        `/user/users?orgId=${encodeURIComponent(orgId)}&status=ACTIVE`,
        "GET",
        undefined,
        token ?? undefined
      );
      const arr: UserOpt[] = (Array.isArray(list) ? list : []).map((u: any) => ({
        id: String(u.id),
        label: String(u.fullName?.trim() || u.email),
      }));
      setUsers(arr);
      if (!assigneeId && arr.length) setAssigneeId(arr[0].id);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }, [orgId, token, assigneeId]);

  /* ------------------------ cargar tareas del board ------------------------ */
  const loadTasks = useCallback(async () => {
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
  }, [boardId, token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  /* ------------------------ crear tarea ------------------------ */
  const createTask = async () => {
    try {
      if (!title.trim()) {
        setMsg("Escribe un título");
        return;
      }
      await apiAuth(`/board/boards/${boardId}/tasks`, "POST", {
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined, // "YYYY-MM-DD"
      });
      setTitle("");
      setDescription("");
      setAssigneeId(assigneeId);
      setDueDate("");
      await loadTasks();
      setMsg("Tarea creada ✅");
      setShowCreate(false);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------------------------ helpers UI / estilos ------------------------ */

  const card: any = {
    borderWidth: 1,
    borderColor: lokalyTheme.borderSoft,
    borderRadius: 16,
    backgroundColor: lokalyTheme.surface,
    padding: 14,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 18px 45px rgba(0,0,0,0.65)",
        }
      : {}),
  };

  const input = {
    borderWidth: 1,
    borderColor: lokalyTheme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    backgroundColor: lokalyTheme.bgAlt,
    color: lokalyTheme.text,
    fontSize: 13,
  } as const;

  /* ============ Selector de Asignado ============ */
  const AssigneeSelector = () => {
    // 1) WEB: <select>
    if (Platform.OS === "web") {
      return (
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.currentTarget.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #4B5563",
            minWidth: 220,
            backgroundColor: "#020617",
            color: "#E5E7EB",
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

    // 2) ANDROID: Picker
    if (Platform.OS === "android") {
      return (
        <View
          style={{
            borderWidth: 1,
            borderColor: lokalyTheme.border,
            borderRadius: 10,
            minHeight: 44,
            justifyContent: "center",
            backgroundColor: lokalyTheme.bgAlt,
          }}
        >
          <Picker
            selectedValue={assigneeId}
            onValueChange={(v) => setAssigneeId(String(v))}
            mode="dropdown"
            style={{ height: 44, color: lokalyTheme.text }}
            dropdownIconColor={lokalyTheme.text}
          >
            <Picker.Item label="— sin asignar —" value="" />
            {users.map((u) => (
              <Picker.Item key={u.id} label={u.label} value={u.id} />
            ))}
          </Picker>
        </View>
      );
    }

    // 3) iOS: ActionSheet
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
          borderColor: lokalyTheme.border,
          borderRadius: 10,
          minHeight: 44,
          backgroundColor: pressed ? lokalyTheme.surfaceSoft : lokalyTheme.bgAlt,
          justifyContent: "center",
          paddingHorizontal: 12,
        })}
      >
        <Text
          style={{ fontWeight: "700", color: lokalyTheme.text }}
          numberOfLines={1}
        >
          {currentLabel}
        </Text>
        <Text
          style={{
            position: "absolute",
            right: 12,
            color: lokalyTheme.textMuted,
          }}
        >
          ▼
        </Text>
      </Pressable>
    );
  };

  /* ------------------------ Render ------------------------ */
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: lokalyTheme.bg,
      }}
    >
      {/* TOP BAR uniforme */}
      <TopBar
        email={me?.email}
        onMenu={() => router.replace("/(app)/home")}
        onLogout={logout}
      />

      {/* HEADER de la página */}
      <View
        style={{
          height: 64,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 18,
          borderBottomWidth: 1,
          borderColor: lokalyTheme.borderSoft,
          backgroundColor: lokalyTheme.bgAlt,
        }}
      >
        <View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: lokalyTheme.primary,
            }}
          >
            Tareas del condominio
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: lokalyTheme.textMuted,
              marginTop: 2,
            }}
          >
            {boardName
              ? `Board: ${boardName}`
              : `Board ID: ${boardId}`}
          </Text>
        </View>

        <PillButton
          label="VOLVER"
          tone="secondary"
          onPress={() => router.back()}
        />
      </View>

      {/* LISTA PRINCIPAL */}
      <FlatList
        style={{ flex: 1, backgroundColor: lokalyTheme.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        data={tasks}
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
                    ? "rgba(22,163,74,0.12)"
                    : "rgba(248,113,113,0.10)",
                  borderWidth: 1,
                  borderColor: msg.includes("✅")
                    ? "rgba(34,197,94,0.6)"
                    : "rgba(248,113,113,0.65)",
                }}
              >
                <Text
                  style={{
                    color: msg.includes("✅")
                      ? "#4ADE80"
                      : lokalyTheme.danger,
                    fontSize: 12,
                  }}
                >
                  {msg}
                </Text>
              </View>
            )}

            {/* Crear tarea */}
            <View style={{ ...card, gap: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontWeight: "800",
                    color: lokalyTheme.text,
                  }}
                >
                  Nueva tarea
                </Text>
                <PillButton
                  label={showCreate ? "OCULTAR" : "CREAR TAREA"}
                  tone={showCreate ? "secondary" : "primary"}
                  onPress={() => setShowCreate((v) => !v)}
                />
              </View>

              {showCreate && (
                <View style={{ gap: 8 }}>
                  <TextInput
                    placeholder="Título"
                    placeholderTextColor={lokalyTheme.textMuted}
                    value={title}
                    onChangeText={setTitle}
                    style={input}
                  />
                  <TextInput
                    placeholder="Descripción (opcional)"
                    placeholderTextColor={lokalyTheme.textMuted}
                    value={description}
                    onChangeText={setDescription}
                    style={input}
                  />
                  <AssigneeSelector />
                  {Platform.OS === "web" ? (
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) =>
                        setDueDate(e.currentTarget.value)
                      }
                      style={{
                        padding: 10,
                        borderRadius: 10,
                        border: "1px solid #4B5563",
                        backgroundColor: "#020617",
                        color: "#E5E7EB",
                      }}
                    />
                  ) : (
                    <TextInput
                      placeholder="yyyy-MM-dd"
                      placeholderTextColor={lokalyTheme.textMuted}
                      value={dueDate}
                      onChangeText={setDueDate}
                      style={input}
                    />
                  )}
                  <PillButton
                    label="CREAR"
                    onPress={createTask}
                    disabled={!title.trim()}
                  />
                </View>
              )}
            </View>

            {/* Encabezado listado */}
            <View
              style={{
                ...card,
                padding: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  color: lokalyTheme.text,
                }}
              >
                Tareas ({tasks.length})
              </Text>
              {loading && (
                <ActivityIndicator color={lokalyTheme.primary} />
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text
            style={{
              color: lokalyTheme.textMuted,
              padding: 12,
            }}
          >
            {loading
              ? "Cargando..."
              : "No hay tareas para este board."}
          </Text>
        }
        renderItem={({ item: t }) => (
          <View
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: lokalyTheme.borderSoft,
              borderRadius: 16,
              backgroundColor: lokalyTheme.surface,
              marginTop: 8,
              gap: 6,
              ...(Platform.OS === "web"
                ? {
                    boxShadow:
                      "0 16px 40px rgba(15,23,42,0.8)",
                  }
                : {}),
              flexBasis: twoCols ? "48%" : "100%",
              maxWidth: twoCols ? "48%" : "100%",
              borderLeftWidth: 6,
              borderLeftColor: statusStripeColor(t.status),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 16,
                  color: lokalyTheme.text,
                }}
              >
                {t.title}
              </Text>
              <StatusBadge status={t.status} />
            </View>

            {!!t.description && (
              <Text
                style={{
                  color: lokalyTheme.text,
                  fontSize: 13,
                }}
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
              {t.dueDate && (
                <Chip
                  label={`Vence: ${t.dueDate}`}
                  tone="warning"
                />
              )}
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
    </SafeAreaView>
  );
}

/* --------- UI helpers --------- */

function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "warning" | "danger";
}) {
  const palette = {
    primary: { bg: lokalyTheme.primary, bg2: "#E0A93F", fg: "#111827" },
    secondary: { bg: "#111827", bg2: "#020617", fg: "#E5E7EB" },
    warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#111827" },
    danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#F9FAFB" },
  }[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: disabled
          ? "rgba(148,163,184,0.45)"
          : pressed
          ? palette.bg2
          : palette.bg,
      })}
    >
      <Text
        style={{
          color: palette.fg,
          fontWeight: "800",
          fontSize: 11,
          letterSpacing: 0.7,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function statusStripeColor(status?: TaskStatus) {
  const key = String(status || "OPEN").toUpperCase();
  switch (key) {
    case "OPEN":
      return "#3B82F6";
    case "IN_PROGRESS":
      return "#F59E0B";
    case "DONE":
      return "#10B981";
    case "ARCHIVED":
      return "#6B7280";
    default:
      return lokalyTheme.borderSoft;
  }
}

function StatusBadge({ status }: { status?: TaskStatus }) {
  const key = String(status || "OPEN").toUpperCase();

  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    OPEN: {
      bg: "rgba(59,130,246,0.18)",
      fg: "#93C5FD",
      label: "ABIERTA",
    },
    IN_PROGRESS: {
      bg: "rgba(245,158,11,0.18)",
      fg: "#FACC15",
      label: "EN PROGRESO",
    },
    DONE: {
      bg: "rgba(16,185,129,0.18)",
      fg: "#6EE7B7",
      label: "COMPLETADA",
    },
    ARCHIVED: {
      bg: "#1E293B",
      fg: "#CBD5F5",
      label: "ARCHIVADA",
    },
    DEFAULT: {
      bg: "#1F2933",
      fg: "#E5E7EB",
      label: key,
    },
  };

  const p = palette[key] ?? palette.DEFAULT;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: p.bg,
      }}
    >
      <Text
        style={{
          color: p.fg,
          fontWeight: "800",
          fontSize: 11,
          letterSpacing: 0.7,
        }}
      >
        {p.label}
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
    primary: {
      bg: "rgba(59,130,246,0.18)",
      fg: "#93C5FD",
    },
    secondary: {
      bg: lokalyTheme.chipBg,
      fg: lokalyTheme.text,
    },
    warning: {
      bg: "rgba(245,158,11,0.18)",
      fg: "#FACC15",
    },
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
      <Text
        style={{
          color: palette.fg,
          fontWeight: "700",
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ======================= TopBar reutilizable ======================= */

function TopBar({
  email,
  onMenu,
  onLogout,
}: {
  email?: string;
  onMenu: () => void;
  onLogout: () => void;
}) {
  const { width } = useWindowDimensions();
  const isSmall = width < 400;
  const isVerySmall = width < 340;

  return (
    <View
      style={{
        height: 60,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 18,
        backgroundColor: "#020617",
        borderBottomWidth: 1,
        borderColor: lokalyTheme.border,
        ...(Platform.OS === "web"
          ? { position: "sticky", top: 0, zIndex: 100 }
          : {}),
      }}
    >
      {/* IZQ: Logo / nombre */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            backgroundColor: lokalyTheme.primarySoft,
            borderWidth: 1,
            borderColor: lokalyTheme.primary,
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
        {!isVerySmall && (
          <View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: "800",
                color: lokalyTheme.primary,
                letterSpacing: 0.4,
              }}
            >
              S. Admin
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: lokalyTheme.textMuted,
              }}
            >
              Panel de operaciones
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* DER: email + botones */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {!isVerySmall && !!email && (
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: lokalyTheme.chipBg,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: lokalyTheme.chipBorder,
              maxWidth: isSmall ? 120 : 190,
            }}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                fontWeight: "600",
                color: lokalyTheme.primary,
                fontSize: 11,
              }}
            >
             
            </Text>
          </View>
        )}

        <Pressable
          onPress={onMenu}
          style={{
            paddingHorizontal: isSmall ? 10 : 14,
            paddingVertical: 7,
            backgroundColor: lokalyTheme.surface,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: lokalyTheme.borderSoft,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              color: lokalyTheme.primary,
              fontSize: isSmall ? 11 : 12,
            }}
          >
            {isSmall ? "MENÚ" : "MENÚ PRINCIPAL"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onLogout}
          style={{
            paddingHorizontal: isSmall ? 10 : 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "#B91C1C",
          }}
        >
          <Text
            style={{
              color: "#F9FAFB",
              fontWeight: "700",
              fontSize: isSmall ? 11 : 12,
            }}
          >
            SALIR
          </Text>
        </Pressable>
      </View>
    </View>
  );
}