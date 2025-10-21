// app/(app)/admin/board-tasks.tsx
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { useApp } from "../../lib/store";

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
  const { boardId, orgId: orgIdParam, boardName } =
    useLocalSearchParams<{ boardId: string; orgId: string; boardName?: string }>();

  const orgId = String(orgIdParam || "");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Crear
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(""); // "2025-10-03"

  // Mapa para mostrar nombre del asignado en la lista
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
      setDueDate("");
      await loadTasks();
      setMsg("Tarea creada ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ------------------------ helpers UI / estilos ------------------------ */
  const card: any = {
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)" }
      : {}),
  };
  const input = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
  } as const;

  /* ------------------------ Render ------------------------ */
  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
      {/* --- TOP BAR --- */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderColor: "#ECECEC",
          backgroundColor: "#FFFFFF",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Condos Admin</Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          {!!me?.email && (
            <Text
              style={{
                color: "#475569",
                backgroundColor: "#F1F5F9",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 10,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {me.email}
            </Text>
          )}
          <PillButton label="Salir" tone="danger" onPress={logout} />
        </View>
      </View>

      {/* --- SUB HEADER --- */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: "#ECECEC",
          backgroundColor: "#F9FAFB",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "800" }}>
          Tareas · {boardName || boardId}
        </Text>
        <PillButton label="Volver" onPress={() => router.back()} />
      </View>

      {/* --- SCROLL PRINCIPAL --- */}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        data={tasks}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        onRefresh={loadTasks}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {!!msg && (
              <View
                style={{
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: msg.includes("✅") ? "#F1F5FF" : "#FEF2F2",
                  borderWidth: 1,
                  borderColor: msg.includes("✅") ? "#DBEAFE" : "#FECACA",
                }}
              >
                <Text style={{ color: msg.includes("✅") ? "#1E40AF" : "#B91C1C" }}>{msg}</Text>
              </View>
            )}

            {/* Crear tarea */}
            <View style={{ ...card, gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>Crear tarea</Text>

              <TextInput
                placeholder="Título"
                value={title}
                onChangeText={setTitle}
                style={input}
              />

              <TextInput
                placeholder="Descripción (opcional)"
                value={description}
                onChangeText={setDescription}
                style={input}
              />

              {/* Selector de asignado */}
              {Platform.OS === "web" ? (
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.currentTarget.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any }}
                >
                  <option value="">— sin asignar —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              ) : (
                <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}>
                  <Picker selectedValue={assigneeId} onValueChange={(v) => setAssigneeId(String(v))}>
                    <Picker.Item label="— sin asignar —" value="" />
                    {users.map((u) => (
                      <Picker.Item key={u.id} label={u.label} value={u.id} />
                    ))}
                  </Picker>
                </View>
              )}

              {/* Fecha límite (yyyy-MM-dd) */}
              {Platform.OS === "web" ? (
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.currentTarget.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any }}
                />
              ) : (
                <TextInput
                  placeholder="yyyy-MM-dd"
                  value={dueDate}
                  onChangeText={setDueDate}
                  style={input}
                />
              )}

              <PillButton label="Crear" onPress={createTask} disabled={!title.trim()} />
            </View>

            {/* Encabezado listado */}
            <View style={{ ...card, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontWeight: "800" }}>Tareas</Text>
              {loading && <ActivityIndicator />}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: "#777", padding: 12 }}>
            {loading ? "Cargando..." : "No hay tareas para este board."}
          </Text>
        }
        renderItem={({ item: t }) => (
          <View
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: "#F3F4F6",
              borderRadius: 12,
              backgroundColor: "#fff",
              marginTop: 8,
              gap: 6,
              ...(Platform.OS === "web"
                ? { boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 1px 2px rgba(16,24,40,.06)" }
                : {}),
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800", fontSize: 16 }}>{t.title}</Text>
              <StatusBadge status={t.status} />
            </View>

            {!!t.description && <Text>{t.description}</Text>}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {t.assigneeId && (
                <Chip label={`Asignado: ${userNameById[t.assigneeId] ?? t.assigneeId}`} />
              )}
              {t.dueDate && <Chip label={`Vence: ${t.dueDate}`} tone="warning" />}
              {!!t.createdAt && (
                <Chip
                  label={`Creada: ${new Date(t.createdAt).toLocaleString()}`}
                  tone="secondary"
                />
              )}
            </View>

            {/* Acciones futuras (editar/estado) podrían ir aquí con PillButton */}
          </View>
        )}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </View>
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
    primary: { bg: "#2563EB", bg2: "#1D4ED8", fg: "#fff" },
    secondary: { bg: "#F1F5F9", bg2: "#E2E8F0", fg: "#0F172A" },
    warning: { bg: "#F59E0B", bg2: "#D97706", fg: "#fff" },
    danger: { bg: "#EF4444", bg2: "#DC2626", fg: "#fff" },
  }[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: disabled ? "#CBD5E1" : pressed ? palette.bg2 : palette.bg,
      })}
    >
      <Text style={{ color: palette.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status?: TaskStatus }) {
  const key = String(status || "OPEN").toUpperCase();

  const palette: Record<string, { bg: string; fg: string }> = {
    OPEN:        { bg: "#EFF6FF", fg: "#1D4ED8" },
    IN_PROGRESS: { bg: "#FEF3C7", fg: "#92400E" },
    DONE:        { bg: "#E6FFED", fg: "#136F3A" },
    ARCHIVED:    { bg: "#F1F5F9", fg: "#475569" },
    DEFAULT:     { bg: "#F1F5F9", fg: "#0F172A" },
  };

  const { bg, fg } = palette[key] ?? palette.DEFAULT;

  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color: fg, fontWeight: "800", fontSize: 12 }}>
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
    primary: { bg: "#EEF2FF", fg: "#3730A3" },
    secondary: { bg: "#F1F5F9", fg: "#0F172A" },
    warning: { bg: "#FFFBEB", fg: "#92400E" },
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
      <Text style={{ color: palette.fg, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}