// app/(operator)/incidencias.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
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
  danger: "#DC2626",
  success: "#16A34A",
};

type Board = { id: string; name: string };
type UserOpt = { id: string; label: string };
type Task = {
  id: string;
  boardId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  reportedBy?: string;
  status: string;
  createdAt?: string;
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierta",
  IN_PROGRESS: "En progreso",
  DONE: "Resuelta",
  CANCELED: "Cancelada",
  ARCHIVED: "Archivada",
};

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-MX");
  } catch {
    return s;
  }
}

export default function IncidenciasOperador() {
  const router = useRouter();
  const { me } = useApp();
  const myId = (me as any)?.id ?? (me as any)?.sub;
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [assigneeId, setAssigneeId] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const [recent, setRecent] = useState<Task[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const [boardTasks, setBoardTasks] = useState<Task[]>([]);
  const [loadingBoardTasks, setLoadingBoardTasks] = useState(false);
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);
  const [savingAssignee, setSavingAssignee] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        const rawBoards = await apiAuth(`/board/boards?page=0&size=1000&orgId=${encodeURIComponent(orgId)}`, "GET");
        const boardList = (Array.isArray(rawBoards) ? rawBoards : rawBoards?.content ?? []).map((b: any) => ({
          id: String(b.id),
          name: String(b.name ?? b.id),
        }));
        setBoards(boardList);
        if (boardList.length) setBoardId(boardList[0].id);
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      }

      try {
        const rawUsers = await apiAuth(`/user/users?orgId=${encodeURIComponent(orgId)}&status=ACTIVE`, "GET");
        const userList: UserOpt[] = (Array.isArray(rawUsers) ? rawUsers : []).map((u: any) => ({
          id: String(u.id),
          label: String(u.fullName?.trim() || u.email),
        }));
        setUsers(userList);
        setAssigneeId(myId ? String(myId) : userList[0]?.id ?? "");
      } catch {
        // si falla, se queda sin asignar
      }
    })();
  }, [orgId, myId]);

  const loadRecent = useCallback(async () => {
    if (!orgId) return;
    setLoadingRecent(true);
    try {
      const raw = await apiAuth(
        `/board/tasks?orgId=${encodeURIComponent(orgId)}&reportedBy=me&size=20&sortBy=createdAt&dir=DESC`,
        "GET"
      );
      const list = (Array.isArray(raw) ? raw : raw?.content ?? []).map((t: any) => ({
        id: String(t.id),
        boardId: String(t.boardId),
        title: String(t.title ?? ""),
        description: t.description,
        assigneeId: t.assigneeId,
        status: t.status,
        createdAt: t.createdAt,
      }));
      setRecent(list);
    } catch {
      setRecent([]);
    } finally {
      setLoadingRecent(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const loadBoardTasks = useCallback(async () => {
    if (!boardId) return;
    setLoadingBoardTasks(true);
    try {
      const raw = await apiAuth(`/board/boards/${boardId}/tasks?page=0&size=1000`, "GET");
      const list = (Array.isArray(raw) ? raw : raw?.content ?? []).map((t: any) => ({
        id: String(t.id),
        boardId: String(t.boardId),
        title: String(t.title ?? ""),
        description: t.description,
        assigneeId: t.assigneeId ? String(t.assigneeId) : undefined,
        reportedBy: t.reportedBy ? String(t.reportedBy) : undefined,
        status: t.status,
        createdAt: t.createdAt,
      }));
      setBoardTasks(list);
    } catch {
      setBoardTasks([]);
    } finally {
      setLoadingBoardTasks(false);
    }
  }, [boardId]);

  useEffect(() => {
    loadBoardTasks();
  }, [loadBoardTasks]);

  const unassignedInBoard = boardTasks.filter(
    (t) => !t.assigneeId && t.status !== "DONE" && t.status !== "CANCELED" && t.status !== "ARCHIVED"
  );

  const userLabel = (id?: string) => {
    if (!id) return "—";
    const u = users.find((u) => u.id === id);
    return u ? u.label : id;
  };

  const reassign = async (t: Task, newAssigneeId: string) => {
    setSavingAssignee(true);
    setMsg("");
    try {
      await apiAuth(`/board/tasks/${t.id}`, "PUT", {
        title: t.title,
        description: t.description,
        assigneeId: newAssigneeId,
      });
      setReassigningTaskId(null);
      await loadBoardTasks();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSavingAssignee(false);
    }
  };

  const crear = async () => {
    setMsg("");
    if (!boardId) {
      setMsg("Selecciona una colonia");
      return;
    }
    if (!title.trim()) {
      setMsg("Escribe un título para la incidencia");
      return;
    }
    setSubmitting(true);
    try {
      await apiAuth(`/board/boards/${boardId}/tasks`, "POST", {
        title: title.trim(),
        description: description.trim() || undefined,
        assigneeId: assigneeId || undefined,
      });
      setTitle("");
      setDescription("");
      setMsg("Incidencia registrada ✅");
      await loadRecent();
      await loadBoardTasks();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        ...(Platform.OS === "web" ? { alignItems: "center" } : {}),
      }}
    >
      <View style={{ width: "100%", maxWidth: 720, gap: 16 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <View>
            <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text }}>Incidencias</Text>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Registra una incidencia y asígnala a quien va a atenderla.
            </Text>
          </View>
          <Pressable onPress={() => router.push("/(ops)/tasks" as any)}>
            <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
              Ver tablero completo →
            </Text>
          </Pressable>
        </View>

        {!!msg && (
          <Card tone={msg.includes("✅") ? "default" : "danger"}>
            <Text style={{ color: msg.includes("✅") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
          </Card>
        )}

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 15, marginBottom: 4 }}>
            Nueva incidencia
          </Text>

          <Field label="Colonia">
            <Select value={boardId} onChange={setBoardId} options={boards.map((b) => ({ label: b.name, value: b.id }))} />
          </Field>

          <Field label="Título">
            <TextInput
              placeholder="Ej. Fuga de agua en jardín común"
              placeholderTextColor={ui.textMuted}
              value={title}
              onChangeText={setTitle}
              style={inputStyle}
            />
          </Field>

          <Field label="Descripción (opcional)">
            <TextInput
              placeholder="Detalles adicionales…"
              placeholderTextColor={ui.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              style={[inputStyle, { minHeight: 70, textAlignVertical: "top" }]}
            />
          </Field>

          <Field label="Asignar a">
            <Select
              value={assigneeId}
              onChange={setAssigneeId}
              options={users.map((u) => ({
                label: myId && u.id === String(myId) ? `${u.label} (yo)` : u.label,
                value: u.id,
              }))}
              placeholder="Sin asignar"
            />
          </Field>

          <Pressable
            onPress={crear}
            disabled={submitting}
            style={{
              backgroundColor: submitting ? ui.borderSoft : ui.primary,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
              {submitting ? "Registrando…" : "Registrar incidencia"}
            </Text>
          </Pressable>
        </Card>

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 4 }}>
            Sin asignar en esta colonia
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 12, marginBottom: 4 }}>
            Incluye lo reportado por condóminos y por el personal. Asígnalas a ti o a otro
            operador para empezar a atenderlas.
          </Text>
          {loadingBoardTasks ? (
            <ActivityIndicator color={ui.primary} />
          ) : unassignedInBoard.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>
              No hay incidencias sin asignar en esta colonia.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {unassignedInBoard.map((t) => (
                <View
                  key={t.id}
                  style={{
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    padding: 10,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Text>
                  </View>
                  {!!t.reportedBy && (
                    <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                      Reportada por: {userLabel(t.reportedBy)}
                    </Text>
                  )}
                  {reassigningTaskId === t.id ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Select
                          value=""
                          onChange={(v) => reassign(t, v)}
                          options={users.map((u) => ({
                            label: myId && u.id === String(myId) ? `${u.label} (yo)` : u.label,
                            value: u.id,
                          }))}
                          placeholder="Elige a quién asignar"
                        />
                      </View>
                      {savingAssignee && <ActivityIndicator size="small" color={ui.primary} />}
                    </View>
                  ) : (
                    <Pressable onPress={() => setReassigningTaskId(t.id)}>
                      <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
                        Asignar
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 8 }}>
            Incidencias que he registrado
          </Text>
          {loadingRecent ? (
            <ActivityIndicator color={ui.primary} />
          ) : recent.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>Todavía no registras ninguna.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {recent.map((t) => (
                <View
                  key={t.id}
                  style={{
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    padding: 10,
                    gap: 2,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }} numberOfLines={1}>
                      {t.title}
                    </Text>
                    <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </Text>
                  </View>
                  <Text style={{ color: ui.textMuted, fontSize: 11 }}>{fmtDate(t.createdAt)}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function Card({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "danger" }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 16,
        padding: 16,
        backgroundColor: tone === "danger" ? "rgba(220,38,38,0.06)" : ui.surface,
        gap: 10,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.08)" } as any) : {}),
      }}
    >
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: ui.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  backgroundColor: ui.bg,
  borderWidth: 1,
  borderColor: ui.border,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 10,
  color: ui.text,
  fontSize: 14,
} as const;

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  if (Platform.OS === "web") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        style={{
          padding: 10,
          borderRadius: 8,
          border: `1px solid ${ui.border}`,
          backgroundColor: ui.bg,
          color: ui.text,
          fontSize: 14,
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: value === o.value ? ui.primary : ui.border,
            backgroundColor: value === o.value ? ui.primarySoft : "transparent",
          }}
        >
          <Text style={{ color: value === o.value ? ui.primary : ui.text, fontSize: 12, fontWeight: "600" }}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
