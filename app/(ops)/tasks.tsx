// app/(ops)/tasks.tsx – Kanban/List con Adjuntos (presign→PUT→complete) + Comentarios

import { apiAuth } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Picker } from "@react-native-picker/picker";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Upload (nativo)
import * as FileSystem from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";
import * as ImagePicker from "expo-image-picker";

/* ======================= Tipos ======================= */

type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
type Priority = "LOW" | "MEDIUM" | "HIGH";

type Task = {
  id: string;
  title: string;
  boardId: string;
  boardName?: string;
  status: TaskStatus;
  priority?: Priority;
  dueDate?: string;
  assigneeId?: string;
};

type Member = { id: string; fullName?: string; email: string };

type Attachment = {
  id: string;
  key: string;
  contentType: string;
  size?: number;
  url: string; // presigned GET url
};

type PresignResp = { key: string; uploadUrl: string };
type CompleteResp = Attachment;

type CommentDto = {
  id: string;
  taskId: string;
  authorId: string;
  text: string;
  createdAt: number | string;
};

/* ======================= Helpers comunes ======================= */

function guessMimeFromName(name?: string | null): string {
  const ext = name?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    case "mp4":
      return "video/mp4";
    default:
      return "application/octet-stream";
  }
}

// baseURL de apiAuth: http://localhost:8088/condos/api/board
// ===== Comentarios
async function listComments(boardId: string, taskId: string) {
  return apiAuth(
    `/board/${boardId}/tasks/${taskId}/comments?page=0&size=50`,
    "GET"
  ) as Promise<CommentDto[]>;
}
async function postComment(
  boardId: string,
  taskId: string,
  authorId: string,
  text: string
) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/comments`, "POST", {
    authorId,
    text,
  }) as Promise<CommentDto>;
}

// ===== Adjuntos
async function fetchTaskAttachments(boardId: string, taskId: string) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/attachments`, "GET") as Promise<
    Attachment[]
  >;
}
async function presignAttachment(
  boardId: string,
  taskId: string,
  contentType: string,
  size: number
) {
  return (await apiAuth(
    `/board/${boardId}/tasks/${taskId}/attachments/presign`,
    "POST",
    { contentType, size }
  )) as PresignResp;
}
async function completeAttachment(
  boardId: string,
  taskId: string,
  key: string,
  contentType: string,
  size: number
) {
  return (await apiAuth(
    `/board/${boardId}/tasks/${taskId}/attachments/complete`,
    "POST",
    { key, contentType, size }
  )) as CompleteResp;
}

/* ======================= Pantalla ======================= */

const ALL_STATUS: TaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];

export default function OpsTasks() {
  const { me, logout } = useApp();
  const orgId = useMemo(
    () => me?.orgId ?? me?.orgs?.[0]?.orgId ?? "",
    [me]
  );
  const meId = useMemo(
    () => String(me?.id ?? me?.userId ?? me?.email ?? "me"),
    [me]
  );

  // filtros / estado
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | TaskStatus>("");
  const [overdue, setOverdue] = useState(false);
  const [items, setItems] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [kanban, setKanban] = useState(true);

  // 🔹 Adjuntos en memoria (por tarea)
  const [attachmentsByTask, setAttachmentsByTask] = useState<
    Record<string, Attachment[]>
  >({});
  const refetchTaskAttachments = async (boardId: string, taskId: string) => {
    const list = await fetchTaskAttachments(boardId, taskId);
    // (opcional) cache-bust imágenes:
    // const withBust = list.map(a => ({ ...a, url: `${a.url}&t=${Date.now()}` }));
    setAttachmentsByTask((prev) => ({ ...prev, [taskId]: list }));
  };
  const addAttachment = (taskId: string, att: Attachment) =>
    setAttachmentsByTask((prev) => ({
      ...prev,
      [taskId]: [att, ...(prev[taskId] ?? [])],
    }));

  // 🔹 Comentarios en memoria (por tarea)
  const [commentsByTask, setCommentsByTask] = useState<
    Record<string, CommentDto[]>
  >({});
  const refetchComments = async (boardId: string, taskId: string) => {
    const list = await listComments(boardId, taskId);
    setCommentsByTask((prev) => ({ ...prev, [taskId]: list }));
  };

  // miembros (resolver assignee → nombre)
  const [members, setMembers] = useState<Member[]>([]);
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );
  const displayAssignee = (id?: string) => {
    if (!id) return "—";
    const m = memberById.get(id);
    return m ? m.fullName || m.email : id;
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString() : "—";
  const statusStyle: Record<
    TaskStatus,
    { bg: string; fg: string; title: string }
  > = {
    OPEN: { bg: "#EFF6FF", fg: "#1D4ED8", title: "Abiertas" },
    IN_PROGRESS: { bg: "#FFF7ED", fg: "#B45309", title: "En progreso" },
    DONE: { bg: "#ECFDF5", fg: "#065F46", title: "Completadas" },
    CANCELLED: { bg: "#FEF2F2", fg: "#991B1B", title: "Canceladas" },
  };
  const cardShadow =
    Platform.OS === "web"
      ? {
          boxShadow:
            "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
        }
      : {};

  // miembros activos
  useEffect(() => {
    const loadMembers = async () => {
      if (!orgId) return;
      try {
        const raw = await apiAuth(
          `/user/users?orgId=${encodeURIComponent(
            orgId
          )}&status=ACTIVE`,
          "GET"
        );
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        setMembers(
          list.map((u: any) => ({
            id: String(u.id ?? u._id),
            fullName: u.fullName,
            email: u.email,
          }))
        );
      } catch {}
    };
    loadMembers();
  }, [orgId]);

  // cargar mis tareas
  const load = async () => {
    if (!orgId) return;
    setBusy(true);
    setMsg("");
    try {
      const qs = new URLSearchParams({
        orgId,
        assigneeId: "me",
        page: "0",
        size: "100",
        ...(q ? { q } : {}),
        ...(status ? { status } : {}),
        ...(overdue ? { overdue: "true" } : {}),
      }).toString();

      // ✅ TaskController: GET /condos/api/board/tasks
      const raw = await apiAuth(`/board/tasks?${qs}`, "GET");
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];
      const mapped: Task[] = list.map((t: any) => ({
        id: String(t.id ?? t.taskId ?? t._id),
        title: String(t.title ?? t.name ?? "Tarea"),
        boardId: String(t.boardId ?? ""),
        boardName: t.boardName,
        status: t.status as TaskStatus,
        priority: t.priority as Priority | undefined,
        dueDate: t.dueDate,
        assigneeId: t.assigneeId ? String(t.assigneeId) : undefined,
      }));
      setItems(mapped);

      // precarga: adjuntos + comentarios de las tarjetas visibles
      for (const it of mapped) {
        refetchTaskAttachments(it.boardId, it.id);
        refetchComments(it.boardId, it.id);
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, status, overdue]);

  // actualizar estado
  const updateStatus = async (id: string, next: TaskStatus) => {
    try {
      // ✅ TaskController: PATCH /tasks/{id}/status
      await apiAuth(`/tasks/${id}/status`, "PATCH", { status: next });
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: next } : it))
      );
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      OPEN: [],
      IN_PROGRESS: [],
      DONE: [],
      CANCELLED: [],
    };
    for (const t of items) map[t.status].push(t);
    return map;
  }, [items]);

  /* ------------------------------- render ----------------------------------- */
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
        {/* TOP BAR */}
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
          <Text style={{ fontSize: 18, fontWeight: "800" }}>Condos</Text>
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

        {/* SUB HEADER */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderColor: "#ECECEC",
            backgroundColor: "#F9FAFB",
            gap: 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <TextInput
              placeholder="Buscar…"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={load}
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: Platform.OS === "web" ? 10 : 12,
                minWidth: 180,
              }}
            />
            {Platform.OS === "web" ? (
              <select
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value as any)}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #E5E7EB" as any,
                }}
              >
                <option value="">Todos</option>
                {ALL_STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <View
                style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}
              >
                <Picker
                  selectedValue={status}
                  onValueChange={(v) => setStatus(v as any)}
                >
                  <Picker.Item label="Todos" value="" />
                  {ALL_STATUS.map((s) => (
                    <Picker.Item key={s} label={s} value={s} />
                  ))}
                </Picker>
              </View>
            )}
            <PillButton
              label={overdue ? "Vencidas ✓" : "Vencidas"}
              tone={overdue ? "warning" : "secondary"}
              onPress={() => setOverdue((v) => !v)}
            />
            <PillButton label="Recargar" onPress={load} />
            <PillButton
              label={kanban ? "Vista lista" : "Vista kanban"}
              tone="secondary"
              onPress={() => setKanban((v) => !v)}
            />
            {busy && <ActivityIndicator />}
          </View>
        </View>

        {/* CONTENIDO */}
        {kanban ? (
          <Kanban
            byStatus={byStatus}
            statusStyle={statusStyle}
            cardShadow={cardShadow}
            displayAssignee={displayAssignee}
            fmt={fmt}
            onDrop={(taskId, newStatus) => updateStatus(taskId, newStatus)}
            getAttachments={(id) => attachmentsByTask[id] ?? []}
            onAttachmentAdded={(id, att) => addAttachment(id, att)}
            onRefetch={(t) => refetchTaskAttachments(t.boardId, t.id)}
            // comentarios
            getComments={(id) => commentsByTask[id] ?? []}
            onRefetchComments={(t) => refetchComments(t.boardId, t.id)}
            meId={meId}
          />
        ) : (
          <ListView
            items={items}
            statusStyle={statusStyle}
            cardShadow={cardShadow}
            displayAssignee={displayAssignee}
            fmt={fmt}
            onQuickAdvance={(id, current) =>
              updateStatus(id, current === "OPEN" ? "IN_PROGRESS" : "DONE")
            }
            busy={busy}
            msg={msg}
            getAttachments={(id) => attachmentsByTask[id] ?? []}
            onAttachmentAdded={(id, att) => addAttachment(id, att)}
            onRefetch={(t) => refetchTaskAttachments(t.boardId, t.id)}
            // comentarios
            getComments={(id) => commentsByTask[id] ?? []}
            onRefetchComments={(t) => refetchComments(t.boardId, t.id)}
            meId={meId}
          />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

/* ======================= Kanban ======================= */

// Web DnD
let DnD: any = {};
if (Platform.OS === "web") {
  try {
    // @ts-ignore
    const mod = require("@hello-pangea/dnd");
    DnD = {
      DragDropContext: mod.DragDropContext,
      Droppable: mod.Droppable,
      Draggable: mod.Draggable,
    };
  } catch {}
}

// Native DnD (opcional)
let Drax: any = {};
if (Platform.OS !== "web") {
  try {
    // @ts-ignore
    const mod = require("react-native-drax");
    Drax = {
      DraxProvider: mod.DraxProvider,
      DraxView: mod.DraxView,
      DraxScrollView: mod.DraxScrollView,
    };
  } catch {}
}

function Kanban({
  byStatus,
  statusStyle,
  cardShadow,
  displayAssignee,
  fmt,
  onDrop,
  getAttachments,
  onAttachmentAdded,
  onRefetch,
  // comentarios
  getComments,
  onRefetchComments,
  meId,
}: {
  byStatus: Record<TaskStatus, Task[]>;
  statusStyle: Record<TaskStatus, { bg: string; fg: string; title: string }>;
  cardShadow: any;
  displayAssignee: (id?: string) => string;
  fmt: (iso?: string) => string;
  onDrop: (taskId: string, newStatus: TaskStatus) => void;
  getAttachments: (taskId: string) => Attachment[];
  onAttachmentAdded: (taskId: string, att: Attachment) => void;
  onRefetch: (t: Task) => Promise<void>;
  // comentarios
  getComments: (taskId: string) => CommentDto[];
  onRefetchComments: (t: Task) => Promise<void>;
  meId: string;
}) {
  // WEB
  if (Platform.OS === "web" && DnD.DragDropContext) {
    const { DragDropContext, Droppable, Draggable } = DnD;
    const columns: TaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];

    const handleDragEnd = (result: any) => {
      const { destination, draggableId, source } = result || {};
      if (!destination) return;
      const destStatus = destination.droppableId as TaskStatus;
      if (destination.droppableId === source?.droppableId) return;
      onDrop(String(draggableId), destStatus);
    };

    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <View
          style={{
            flex: 1,
            padding: 16,
            rowGap: 12,
            columnGap: 12,
            ...(Platform.OS === "web"
              ? { display: "flex", flexDirection: "row", overflowX: "auto" as any }
              : {}),
          }}
        >
          {columns.map((st) => (
            <Droppable droppableId={st} key={st}>
              {(provided: any, snapshot: any) => (
                <View
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    width: 320,
                    backgroundColor: "#FFFFFF",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: snapshot.isDraggingOver ? "#BFDBFE" : "#E5E7EB",
                    padding: 12,
                  }}
                >
                  <ColumnHeader
                    title={statusStyle[st].title}
                    color={statusStyle[st].fg}
                    bg={statusStyle[st].bg}
                  />

                  {byStatus[st].map((t, idx) => (
                    <Draggable draggableId={String(t.id)} index={idx} key={t.id}>
                      {(dragProvided: any, dragSnapshot: any) => {
                        const dragStyle = dragProvided.draggableProps.style || {};
                        return (
                          <View
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            style={{
                              marginTop: 10,
                              backgroundColor: "#fff",
                              borderWidth: 1,
                              borderColor: dragSnapshot.isDragging
                                ? "#93C5FD"
                                : "#F3F4F6",
                              borderRadius: 12,
                              padding: 10,
                              ...(dragStyle as any),
                            }}
                          >
                            <TaskCard
                              t={t}
                              displayAssignee={displayAssignee}
                              fmt={fmt}
                              attachments={getAttachments(t.id)}
                              onAttachmentAdded={(att) =>
                                onAttachmentAdded(t.id, att)
                              }
                              onRefetch={() => onRefetch(t)}
                              comments={getComments(t.id)}
                              onRefetchComments={() => onRefetchComments(t)}
                              meId={meId}
                            />
                          </View>
                        );
                      }}
                    </Draggable>
                  ))}

                  {provided.placeholder}
                </View>
              )}
            </Droppable>
          ))}
        </View>
      </DragDropContext>
    );
  }

  // Fallback simple (sin drag) – también sirve en nativo si no usas Drax
  const columns: TaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];
  return (
    <ScrollView
      horizontal
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {columns.map((st) => (
        <View
          key={st}
          style={{
            width: 320,
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            padding: 12,
          }}
        >
          <ColumnHeader
            title={statusStyle[st].title}
            color={statusStyle[st].fg}
            bg={statusStyle[st].bg}
          />
          {byStatus[st].map((t) => (
            <View
              key={t.id}
              style={{
                marginTop: 10,
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#F3F4F6",
                borderRadius: 12,
                padding: 10,
              }}
            >
              <TaskCard
                t={t}
                displayAssignee={displayAssignee}
                fmt={fmt}
                attachments={getAttachments(t.id)}
                onAttachmentAdded={(att) => onAttachmentAdded(t.id, att)}
                onRefetch={() => onRefetch(t)}
                comments={getComments(t.id)}
                onRefetchComments={() => onRefetchComments(t)}
                meId={meId}
              />
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

/* ======================= Lista ======================= */

function ListView({
  items,
  statusStyle,
  cardShadow,
  displayAssignee,
  fmt,
  onQuickAdvance,
  busy,
  msg,
  getAttachments,
  onAttachmentAdded,
  onRefetch,
  // comentarios
  getComments,
  onRefetchComments,
  meId,
}: {
  items: Task[];
  statusStyle: Record<TaskStatus, { bg: string; fg: string; title: string }>;
  cardShadow: any;
  displayAssignee: (id?: string) => string;
  fmt: (iso?: string) => string;
  onQuickAdvance: (id: string, current: TaskStatus) => void;
  busy: boolean;
  msg: string;
  getAttachments: (taskId: string) => Attachment[];
  onAttachmentAdded: (taskId: string, att: Attachment) => void;
  onRefetch: (t: Task) => Promise<void>;
  // comentarios
  getComments: (taskId: string) => CommentDto[];
  onRefetchComments: (t: Task) => Promise<void>;
  meId: string;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
    >
      {!!msg && (
        <View
          style={{
            padding: 10,
            borderRadius: 12,
            backgroundColor: msg.includes("✅") ? "#F1F5FF" : "#FEF2F2",
            borderWidth: 1,
            borderColor: msg.includes("✅") ? "#DBEAFE" : "#FECACA",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: msg.includes("✅") ? "#1E40AF" : "#B91C1C" }}>
            {msg}
          </Text>
        </View>
      )}
      <View
        style={{
          backgroundColor: "#fff",
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#EAEAEA",
          ...cardShadow,
        }}
      >
        <Text style={{ fontWeight: "800" }}>Mis tareas</Text>
        {busy && <ActivityIndicator style={{ marginTop: 6 }} />}
      </View>

      {items.map((t) => {
        const pal = statusStyle[t.status];
        const isOverdue =
          t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE";
        return (
          <View
            key={t.id}
            style={{
              marginTop: 10,
              backgroundColor: "fff",
              borderWidth: 1,
              borderColor: "#F3F4F6",
              borderRadius: 12,
              padding: 10,
              ...cardShadow,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "800", fontSize: 16 }}>{t.title}</Text>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: pal.bg,
                }}
              >
                <Text style={{ color: pal.fg, fontWeight: "800", fontSize: 12 }}>
                  {t.status}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 4, gap: 2 }}>
              <Text style={{ color: "#475569" }}>
                Tablero: {t.boardName ?? t.boardId}
              </Text>
              <Text style={{ color: "#64748B" }}>
                Responsable: {displayAssignee(t.assigneeId)}
              </Text>
              <Text style={{ color: isOverdue ? "#B42318" : "#64748B" }}>
                Vence: {fmt(t.dueDate)} {isOverdue ? "⏰" : ""}
              </Text>
            </View>
            {t.status !== "DONE" && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <PillButton
                  label="Avanzar"
                  onPress={() => onQuickAdvance(t.id, t.status)}
                />
              </View>
            )}

            {/* Adjuntos */}
            <View style={{ marginTop: 8 }}>
              <TaskAttachments
                task={t}
                attachments={getAttachments(t.id)}
                onAttachmentAdded={(att) => onAttachmentAdded(t.id, att)}
                onRefetch={() => onRefetch(t)}
              />
            </View>

            {/* Comentarios */}
            <View style={{ marginTop: 8 }}>
              <TaskComments
                boardId={t.boardId}
                taskId={t.id}
                meId={meId}
                comments={getComments(t.id)}
                onRefetch={() => onRefetchComments(t)}
              />
            </View>
          </View>
        );
      })}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

/* ======================= Subcomponentes ======================= */

function ColumnHeader({
  title,
  color,
  bg,
}: {
  title: string;
  color: string;
  bg: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontWeight: "800" }}>{title}</Text>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: bg,
        }}
      >
        <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{title}</Text>
      </View>
    </View>
  );
}

function TaskCard({
  t,
  displayAssignee,
  fmt,
  attachments,
  onAttachmentAdded,
  onRefetch,
  comments,
  onRefetchComments,
  meId,
}: {
  t: Task;
  displayAssignee: (id?: string) => string;
  fmt: (iso?: string) => string;
  attachments: Attachment[];
  onAttachmentAdded: (att: Attachment) => void;
  onRefetch: () => Promise<void>;
  comments: CommentDto[];
  onRefetchComments: () => Promise<void>;
  meId: string;
}) {
  const isOverdue =
    t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "DONE";
  return (
    <View>
      <Text style={{ fontWeight: "700" }}>{t.title}</Text>
      <Text style={{ color: "#64748B" }}>
        Responsable: {displayAssignee(t.assigneeId)}
      </Text>
      <Text style={{ color: isOverdue ? "#B42318" : "#64748B" }}>
        Vence: {fmt(t.dueDate)} {isOverdue ? "⏰" : ""}
      </Text>

      <View style={{ marginTop: 8 }}>
        <TaskAttachments
          task={t}
          attachments={attachments}
          onAttachmentAdded={onAttachmentAdded}
          onRefetch={onRefetch}
        />
      </View>

      <View style={{ marginTop: 8 }}>
        <TaskComments
          boardId={t.boardId}
          taskId={t.id}
          meId={meId}
          comments={comments}
          onRefetch={onRefetchComments}
        />
      </View>
    </View>
  );
}

/* ======================= Comentarios ======================= */

function TaskComments({
  boardId,
  taskId,
  meId,
  comments,
  onRefetch,
}: {
  boardId: string;
  taskId: string;
  meId: string;
  comments: CommentDto[];
  onRefetch: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    onRefetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, taskId]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await postComment(boardId, taskId, meId, trimmed);
      setText("");
      await onRefetch();
    } catch (e: any) {
      alert("Error comentando: " + (e?.message ?? String(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {/* input */}
      {Platform.OS === "web" ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Escribe un comentario…"
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            style={{
              flex: 1,
              border: "1px solid #E5E7EB",
              borderRadius: 8,
              padding: 10,
            }}
          />
          <button
            disabled={sending || !text.trim()}
            onClick={send}
            style={{
              borderRadius: 999,
              padding: "10px 14px",
              background: "#2563EB",
              color: "#fff",
              fontWeight: 800,
            }}
          >
            ENVIAR
          </button>
        </div>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            placeholder="Escribe un comentario…"
            value={text}
            onChangeText={setText}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />
          <PillButton
            label={sending ? "..." : "Enviar"}
            onPress={send}
            disabled={sending || !text.trim()}
          />
        </View>
      )}

      {/* lista */}
      {comments?.length ? (
        <View style={{ gap: 6 }}>
          {comments.map((c) => (
            <View
              key={c.id}
              style={{
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: "#F1F5F9",
              }}
            >
              <Text style={{ fontWeight: "700" }}>{c.authorId}</Text>
              <Text style={{ color: "#334155" }}>{c.text}</Text>
              <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                {new Date(c.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ======================= Adjuntos ======================= */

function TaskAttachments({
  task: t,
  attachments,
  onAttachmentAdded,
  onRefetch,
}: {
  task: Task;
  attachments: Attachment[];
  onAttachmentAdded: (att: Attachment) => void;
  onRefetch?: () => Promise<void>;
}) {
  // Releer adjuntos al montar/cambiar de tarea
  useEffect(() => {
    onRefetch?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.boardId, t.id]);

  return (
    <View>
      {/* Botones Adjuntar (Web + Nativo) */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        {Platform.OS === "web" ? (
          <label>
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const input = e.currentTarget as HTMLInputElement | null;
                const file = input?.files?.[0] ?? null;
                if (input) input.value = "";
                if (!file) return;

                try {
                  const contentType =
                    file.type || guessMimeFromName(file.name) || "image/jpeg";
                  const size = file.size ?? 0;

                  const { key, uploadUrl } = await presignAttachment(
                    t.boardId,
                    t.id,
                    contentType,
                    size
                  );

                  const put = await fetch(uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": contentType },
                    body: file,
                  });
                  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

                  const saved = await completeAttachment(
                    t.boardId,
                    t.id,
                    key,
                    contentType,
                    size
                  );
                  onAttachmentAdded(saved); // optimista
                  await onRefetch?.(); // sincroniza con backend
                  alert("✅ Adjuntado");
                } catch (err: any) {
                  alert("Error subiendo: " + (err?.message ?? String(err)));
                }
              }}
            />
            <PillButton label="Adjuntar" onPress={() => {}} />
          </label>
        ) : (
          <PillButton
            label="Adjuntar"
            onPress={async () => {
              try {
                const res = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  allowsEditing: false,
                  quality: 0.9,
                });
                if (res.canceled || !res.assets?.[0]) return;

                const asset: ImagePickerAsset = res.assets[0];
                const uri = asset.uri; // file://...

                const nameFromUri = uri.split("/").pop();
                const safeName = asset.fileName ?? nameFromUri ?? "image.jpg";
                let contentType = asset.mimeType ?? guessMimeFromName(safeName);
                let size = asset.fileSize ?? 0;
                if (!size) {
                  try {
                    const info = await FileSystem.getInfoAsync(uri);
                    if (info.exists && typeof info.size === "number")
                      size = info.size;
                  } catch {}
                }

                // 1) presign
                const { key, uploadUrl } = await presignAttachment(
                  t.boardId,
                  t.id,
                  contentType,
                  size
                );

                // 2) PUT (fetch sobre file:// en Expo)
                const fileResp = await fetch(uri);
                const blob = await fileResp.blob();
                const resUp = await fetch(uploadUrl, {
                  method: "PUT",
                  headers: { "Content-Type": contentType },
                  body: blob,
                });
                if (!resUp.ok) throw new Error(`Upload failed: ${resUp.status}`);

                // 3) complete
                const saved = await completeAttachment(
                  t.boardId,
                  t.id,
                  key,
                  contentType,
                  size
                );
                onAttachmentAdded(saved);
                await onRefetch?.();

                alert("✅ Adjuntado");
              } catch (e: any) {
                alert("Error: " + (e?.message ?? String(e)));
              }
            }}
          />
        )}
      </View>

      {/* Thumbnails */}
      {attachments?.length ? (
        <ScrollView horizontal style={{ gap: 8 }}>
          {attachments.map((att) => (
            <View key={att.id ?? att.key} style={{ marginRight: 8 }}>
              {att.contentType.startsWith("image/") ? (
                Platform.OS === "web" ? (
                  // @ts-ignore
                  <img
                    src={att.url}
                    alt="adjunto"
                    style={{
                      width: 120,
                      height: 80,
                      objectFit: "cover",
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <Image
                    source={{ uri: att.url }}
                    style={{ width: 120, height: 80, borderRadius: 8 }}
                  />
                )
              ) : (
                <Text style={{ maxWidth: 200 }} numberOfLines={1}>
                  {att.key}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

/* ======================= Botón ======================= */

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
  } as const;
  const p = palette[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: disabled ? "#CBD5E1" : pressed ? p.bg2 : p.bg,
        opacity: disabled ? 0.7 : 1,
      })}
    >
      <Text style={{ color: p.fg, fontWeight: "800" }}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}