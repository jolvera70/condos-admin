// app/(ops)/tasks.tsx – Kanban/List con Adjuntos + Comentarios + Modal Preview

import { AuthImgWeb, AuthVideoWeb } from "@/components/auth-media-web";
import { apiAuth } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Picker } from "@react-native-picker/picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
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

  // 👇 NUEVO: tablero claro
  boardBg: "#F9FAFB",
  boardCard: "#FFFFFF",
  boardBorder: "#E5E7EB",
  boardText: "#111827",
  boardTextMuted: "#6B7280",
};

/* ======================= Tipos ======================= */

type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE";
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
  description?: string;
};

type Member = { id: string; fullName?: string; email: string };

type Attachment = {
  id: string;
  key: string;
  contentType: string;
  size?: number;
  url: string;
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

/* ======================= Helpers ======================= */

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
    case "mov":
      return "video/quicktime";
    case "txt":
      return "text/plain; charset=utf-8";
    case "csv":
      return "text/csv; charset=utf-8";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

function filenameFromKeyOrUrl(key?: string, url?: string) {
  const raw = key || url || "archivo";
  const part = raw.split("?")[0];
  const name = part.split("/").pop() || "archivo";
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ensureExt(baseName: string, mime?: string) {
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(baseName);
  if (hasExt) return baseName;
  if (mime?.includes("pdf")) return baseName + ".pdf";
  if (mime?.includes("word")) return baseName + ".docx";
  if (mime?.includes("sheet")) return baseName + ".xlsx";
  if (mime?.includes("presentation")) return baseName + ".pptx";
  if (mime?.includes("text")) return baseName + ".txt";
  return baseName;
}

function safeDownloadName(att: Attachment) {
  const raw = filenameFromKeyOrUrl(att.key, att.url);
  return ensureExt(raw, att.contentType);
}

/* ======================= API ======================= */

async function listComments(boardId: string, taskId: string) {
  return apiAuth(
    `/board/${boardId}/tasks/${taskId}/comments?page=0&size=50`,
    "GET"
  ) as Promise<CommentDto[]>;
}

async function postComment(boardId: string, taskId: string, authorId: string, text: string) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/comments`, "POST", {
    authorId,
    text,
  }) as Promise<CommentDto>;
}

async function fetchTaskAttachments(boardId: string, taskId: string) {
  return apiAuth(
    `/board/${boardId}/tasks/${taskId}/attachments`,
    "GET"
  ) as Promise<Attachment[]>;
}

async function presignAttachment(boardId: string, taskId: string, contentType: string, size: number) {
  return apiAuth(
    `/board/${boardId}/tasks/${taskId}/attachments/presign`,
    "POST",
    { contentType, size }
  ) as Promise<PresignResp>;
}

async function completeAttachment(boardId: string, taskId: string, key: string, contentType: string, size: number) {
  return apiAuth(
    `/board/${boardId}/tasks/${taskId}/attachments/complete`,
    "POST",
    { key, contentType, size }
  ) as Promise<CompleteResp>;
}

/* ======================= Pantalla principal ======================= */

const ALL_STATUS: TaskStatus[] = ["OPEN", "IN_PROGRESS", "DONE"];
const getToken = () => useApp.getState().token;

export default function OpsTasks() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024 && width < 1440;
  const isWide = width >= 1440;
  const isMobile = !isTablet && !isDesktop && !isWide;

  const HEADER_H = isMobile ? 120 : 96;
  const CONTENT_H = Math.max(320, height - HEADER_H);

  const [kanban] = useState(true); // por ahora siempre Kanban
  const { me, logout } = useApp();
  const router = useRouter();

  const orgId = useMemo(
    () => me?.orgId ?? me?.orgs?.[0]?.orgId ?? "",
    [me]
  );
  const meId = useMemo(
    () => String(me?.id ?? me?.userId ?? me?.email ?? "me"),
    [me]
  );

  const [status, setStatus] = useState<"" | TaskStatus>("");
  const [items, setItems] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [attachmentsByTask, setAttachmentsByTask] = useState<
    Record<string, Attachment[]>
  >({});
  const [commentsByTask, setCommentsByTask] = useState<
    Record<string, CommentDto[]>
  >({});

  const refetchTaskAttachments = async (boardId: string, taskId: string) => {
    const list = await fetchTaskAttachments(boardId, taskId);
    setAttachmentsByTask((prev) => ({ ...prev, [taskId]: list }));
  };

  const addAttachment = (taskId: string, att: Attachment) =>
    setAttachmentsByTask((prev) => ({
      ...prev,
      [taskId]: [att, ...(prev[taskId] ?? [])],
    }));

  const refetchComments = async (boardId: string, taskId: string) => {
    const list = await listComments(boardId, taskId);
    setCommentsByTask((prev) => ({ ...prev, [taskId]: list }));
  };

  const [members, setMembers] = useState<Member[]>([]);
  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m] as const)),
    [members]
  );
  const displayAssignee = (id?: string) => {
    if (!id) return "—";
    const m = memberById.get(id);
    return m ? m.fullName || m.email : id;
  };

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString() : "—";

  const statusStyle: Record<TaskStatus, { bg: string; fg: string; title: string }> = {
    OPEN: {
      bg: "#111827",
      fg: "#60A5FA",
      title: "Abiertas",
    },
    IN_PROGRESS: {
      bg: "#1F2937",
      fg: "#FACC15",
      title: "En progreso",
    },
    DONE: {
      bg: "#022C22",
      fg: "#6EE7B7",
      title: "Completadas",
    },
  };

  const cardShadow =
    Platform.OS === "web"
      ? {
        boxShadow:
          "0 14px 30px rgba(0,0,0,0.45)",
      }
      : {};

  /* ====== cargar miembros ====== */
  useEffect(() => {
    const loadMembers = async () => {
      if (!orgId) return;
      try {
        const raw = await apiAuth(
          `/user/users?orgId=${encodeURIComponent(orgId)}&status=ACTIVE`,
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
      } catch {
        // ignore
      }
    };
    loadMembers();
  }, [orgId]);

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
        ...(status ? { status } : {}),
      }).toString();

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
        description: t.description ?? t.details ?? "",
      }));
      setItems(mapped);
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
  }, [orgId, status]);

  const updateStatus = async (id: string, next: TaskStatus) => {
    try {
      await apiAuth(`/board/tasks/${id}/status`, "PATCH", { status: next });
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
    };
    for (const t of items) map[t.status].push(t);
    return map;
  }, [items]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: lokalyTheme.bg,
      }}
    >
      <TopBar
        email={me?.email}
        onMenu={() => router.push("/home")}
        onLogout={() => logout()}
      />

      {/* HEADER de página */}
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
            Tareas
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: lokalyTheme.boardTextMuted,
              marginTop: 2,
            }}
          >
            Kanban de tareas asignadas a ti
          </Text>
        </View>

        <StatusFilter
          value={status}
          onChange={setStatus}
          isMobile={isMobile}
        />
      </View>

      {/* CONTENIDO */}
      {busy ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: lokalyTheme.bg,
          }}
        >
          <ActivityIndicator size="large" color={lokalyTheme.primary} />
          <Text
            style={{
              marginTop: 12,
              color: lokalyTheme.boardTextMuted,
            }}
          >
            Cargando tareas…
          </Text>
        </View>
      ) : msg ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
            backgroundColor: lokalyTheme.bg,
          }}
        >
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: "rgba(248, 113, 113, 0.12)",
              borderWidth: 1,
              borderColor: lokalyTheme.danger,
            }}
          >
            <Text
              style={{
                color: lokalyTheme.danger,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {msg}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: lokalyTheme.bg }}>
          {Platform.OS === "web" ? (
            // 👉 WEB: scroll vertical usando View + overflowY
      <View
        style={
          {
            height: "calc(100vh - 124px)",
            overflowY: "auto",
            paddingBottom: 32,
          } as any
        }
      >
              <Kanban
                byStatus={byStatus}
                statusStyle={statusStyle}
                attachmentsByTask={attachmentsByTask}
                commentsByTask={commentsByTask}
                refetchTaskAttachments={refetchTaskAttachments}
                addAttachment={addAttachment}
                refetchComments={refetchComments}
                displayAssignee={displayAssignee}
                fmt={fmt}
                cardShadow={cardShadow}
                updateStatus={updateStatus}
              />
            </View>
          ) : (
            // 👉 NATIVO: ScrollView normal
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingBottom: 32,
              }}
              nestedScrollEnabled
            >
              <Kanban
                byStatus={byStatus}
                statusStyle={statusStyle}
                attachmentsByTask={attachmentsByTask}
                commentsByTask={commentsByTask}
                refetchTaskAttachments={refetchTaskAttachments}
                addAttachment={addAttachment}
                refetchComments={refetchComments}
                displayAssignee={displayAssignee}
                fmt={fmt}
                cardShadow={cardShadow}
                updateStatus={updateStatus}
              />
            </ScrollView>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

/* ======================= Detección de tipo de archivo ======================= */

function isImage(att: Attachment) {
  const ct = att.contentType.toLowerCase();
  return ct.startsWith("image/") || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(att.url);
}
function isVideo(att: Attachment) {
  const ct = att.contentType.toLowerCase();
  return ct.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(att.url);
}
function isPdf(att: Attachment) {
  return att.contentType === "application/pdf" || /\.pdf$/i.test(att.url);
}
function isText(att: Attachment) {
  return att.contentType.startsWith("text/") || /\.(txt|csv|log)$/i.test(att.url);
}
function isOffice(att: Attachment) {
  const ct = att.contentType;
  return (
    [
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ].includes(ct) ||
    /\.(docx?|xlsx?|pptx?)$/i.test(att.url)
  );
}
function officeViewerUrl(url: string) {
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
}

/* ======================= VideoThumb (fix) ======================= */

function VideoThumb({ uri, width, height }: { uri: string; width: number; height: number }) {
  const [localUri, setLocalUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = useApp.getState().token || "";
        const dest = `${FileSystem.cacheDirectory}thumb-${encodeURIComponent(uri)}.mp4`;
        const res = await FileSystem.downloadAsync(uri, dest, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (alive) setLocalUri(res.uri);
      } catch {
        if (alive) setLocalUri(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri]);

  const player = useVideoPlayer(undefined as any, (p) => {
    p.loop = false;
    p.muted = true;
  });

  React.useEffect(() => {
    if (localUri) player.replace({ uri: localUri });
  }, [localUri, player]);

  return (
    <VideoView
      player={player}
      style={{
        width,
        height,
        borderRadius: 10,
        backgroundColor: "#000",
      }}
      contentFit="cover"
    />
  );
}

/* ======================= Modal de Previsualización ======================= */

function AttachmentPreviewModal({
  visible,
  onClose,
  attachment,
}: {
  visible: boolean;
  onClose: () => void;
  attachment?: Attachment | null;
}) {
  if (!attachment) return null;

  const isWeb = Platform.OS === "web";
  const Web = React.useMemo(
    () => (isWeb ? require("@/components/auth-media-web") : null),
    [isWeb]
  );
  const useTextWithAuth = isWeb ? Web!.useTextWithAuth : () => undefined;

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const apiFileUrl = (att: Attachment | string) =>
    typeof att === "string"
      ? att.includes("/minio/")
        ? `${API_BASE}/condos/api/files/${att.split("/condos-attachments/")[1]
        }`
        : att
      : att.url.includes("/minio/")
        ? `${API_BASE}/condos/api/files/${att.key}`
        : att.url;

  const urlForView = apiFileUrl(attachment);

  const _isImage = isImage(attachment);
  const _isVideo = isVideo(attachment);
  const _isPdf = isPdf(attachment);
  const _isText = isText(attachment);
  const _isOffice = isOffice(attachment);

  const docUrl = _isOffice
    ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(
      urlForView
    )}`
    : urlForView;
  const textBody = useTextWithAuth(urlForView);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.92)",
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: "absolute",
            top: 40,
            right: 18,
            zIndex: 10,
            backgroundColor: lokalyTheme.surface,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: lokalyTheme.border,
          }}
        >
          <Text
            style={{
              color: lokalyTheme.boardText,
              fontWeight: "700",
              fontSize: 13,
            }}
          >
            Cerrar
          </Text>
        </Pressable>

        {_isImage && (
          isWeb ? (
            <Web.AuthImgWeb
              url={urlForView}
              width={0}
              height={0}
              style={{
                width: "92%",
                height: "72%",
                borderRadius: 16,
                objectFit: "contain",
                background: "#020617",
              }}
            />
          ) : (
            <Image
              source={{
                uri: attachment.url,
                headers: {
                  Authorization: `Bearer ${useApp.getState().token ?? ""}`,
                },
              }}
              style={{
                width: "92%",
                height: "72%",
                borderRadius: 16,
              }}
              resizeMode="contain"
            />
          )
        )}

        {_isVideo && (
          isWeb ? (
            <Web.AuthVideoWeb
              url={urlForView}
              width={0}
              height={0}
              controls
              style={{
                width: "92%",
                height: "72%",
                borderRadius: 16,
                objectFit: "contain",
                background: "#020617",
              }}
            />
          ) : (
            <VideoPreview uri={attachment.url} visible={visible} />
          )
        )}

        {_isText && (
          isWeb ? (
            <div
              style={{
                width: "92%",
                height: "72%",
                background: "#020617",
                color: "#E5E7EB",
                borderRadius: 16,
                overflow: "auto",
                padding: 18,
                border: `1px solid ${lokalyTheme.border}`,
              }}
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  fontSize: 13,
                }}
              >
                {textBody ?? "Cargando…"}
              </pre>
            </div>
          ) : (
            <ScrollView
              style={{
                width: "92%",
                height: "72%",
                backgroundColor: "#020617",
                borderRadius: 16,
                padding: 18,
              }}
            >
              <Text
                style={{
                  color: "#E5E7EB",
                  fontFamily: "Menlo",
                }}
              >
                Texto no soportado via fetch aquí.
              </Text>
            </ScrollView>
          )
        )}

        {_isPdf && (
          isWeb ? (
            <Web.AuthPdfIframeWeb
              url={urlForView}
              style={{ width: "92%", height: "72%", borderRadius: 16 }}
            />
          ) : (
            <View
              style={{
                width: "92%",
                height: "72%",
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: "#020617",
              }}
            >
              <WebView source={{ uri: urlForView }} startInLoadingState />
            </View>
          )
        )}

        {!_isImage &&
          !_isVideo &&
          !_isPdf &&
          !_isText &&
          !_isOffice && (
            <View
              style={{
                backgroundColor: "#020617",
                padding: 18,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: lokalyTheme.border,
              }}
            >
              <Text
                style={{
                  color: lokalyTheme.boardText,
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                {filenameFromKeyOrUrl(attachment.key, attachment.url)}
              </Text>
              <Text
                style={{
                  color: lokalyTheme.boardTextMuted,
                  fontSize: 12,
                  textAlign: "center",
                  marginTop: 6,
                }}
              >
                Tipo no soportado para preview. Usa “Descargar”.
              </Text>
            </View>
          )}
      </View>
    </Modal>
  );
}

/* ======================= Adjuntos (UI + carga web/nativo + cámara) ======================= */

function TaskAttachments({
  boardId,
  taskId,
  attachments,
  refetchTaskAttachments,
  addAttachment,
}: {
  boardId: string;
  taskId: string;
  attachments: Attachment[];
  refetchTaskAttachments: (boardId: string, taskId: string) => Promise<void>;
  addAttachment: (taskId: string, att: Attachment) => void;
}) {
  const TILE_W = 160;
  const TILE_H = 90;
  const RAIL_H = TILE_H + 26;

  const [preview, setPreview] = useState<Attachment | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openPreview = (att: Attachment) => {
    setPreview(att);
    setModalVisible(true);
  };

  const webInputRef = useRef<HTMLInputElement | null>(null);
  const WEB_ACCEPT =
    ".png,.jpg,.jpeg,.webp,.gif,.heic,.heif,.mp4,.mov,.webm,.mkv,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

  const onPickWeb = async (file: File) => {
    try {
      const mime = file.type || guessMimeFromName(file.name);
      const size = file.size ?? 0;
      const { key, uploadUrl } = await presignAttachment(
        boardId,
        taskId,
        mime,
        size
      );
      const up = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mime,
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: file,
      });
      if (!up.ok) throw new Error(`Upload failed: ${up.status}`);
      const saved = await completeAttachment(boardId, taskId, key, mime, size);
      addAttachment(taskId, saved);
      await refetchTaskAttachments(boardId, taskId);
      alert("✅ Adjuntado");
    } catch (err: any) {
      alert("Error subiendo: " + (err?.message ?? String(err)));
    }
  };

  const pickAndUploadNative = async () => {
    try {
      const options = ["Usar cámara", "Elegir archivo", "Cancelar"];
      const useCamera =
        Platform.OS === "ios"
          ? await new Promise<boolean>((resolve) => {
            ActionSheetIOS.showActionSheetWithOptions(
              { title: "Adjuntar archivo", options, cancelButtonIndex: 2 },
              (idx) => resolve(idx === 0)
            );
          })
          : true;

      let fileUri: string | null = null;
      let name = "";
      let mime = "";
      let size = 0;

      if (useCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (camPerm.status !== "granted") {
          alert("Se necesita permiso para usar la cámara.");
          return;
        }
        const camRes = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.All,
        });
        if (!camRes.canceled && camRes.assets[0]) {
          fileUri = camRes.assets[0].uri;
          name = camRes.assets[0].fileName ?? "foto.jpg";
          mime = camRes.assets[0].mimeType ?? "image/jpeg";
          size = camRes.assets[0].fileSize ?? 0;
        }
      } else {
        const res = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets?.[0]) {
          const f = res.assets[0];
          fileUri = f.uri;
          name = f.name ?? "archivo";
          mime = f.mimeType ?? guessMimeFromName(f.name);
          size = f.size ?? 0;
        }
      }

      if (!fileUri) return;

      const { key, uploadUrl } = await presignAttachment(
        boardId,
        taskId,
        mime,
        size
      );

      const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": mime,
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
      });

      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `Upload failed: ${result.status} ${result.body || ""}`
        );
      }

      const saved = await completeAttachment(boardId, taskId, key, mime, size);
      addAttachment(taskId, saved);
      await refetchTaskAttachments(boardId, taskId);
      alert("✅ Adjuntado");
    } catch (e: any) {
      alert("Error subiendo: " + (e?.message ?? String(e)));
    }
  };

  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          marginBottom: 4,
          color: lokalyTheme.boardText,
        }}
      >
        Adjuntos
      </Text>

      <View
        style={{
          height: RAIL_H,
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: lokalyTheme.boardCard,   // 👈 blanco
          borderWidth: 1,
          borderColor: lokalyTheme.boardBorder,
        }}
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={{
            flex: 1,
            ...(Platform.OS === "web"
              ? { overflowX: "scroll" as any }
              : {}),
          }}
          contentContainerStyle={{
            alignItems: "center",
            paddingHorizontal: 8,
            gap: 12,
            height: RAIL_H,
          }}
        >
          {attachments.map((att) => {
            const isImg = isImage(att);
            const isVid = isVideo(att);
            const isDoc =
              isPdf(att) || isText(att) || isOffice(att);
            const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
            const apiFileUrl = (att: Attachment | string) =>
              typeof att === "string"
                ? att.includes("/minio/")
                  ? `${API_BASE}/condos/api/files/${att.split("/condos-attachments/")[1]
                  }`
                  : att
                : att.url.includes("/minio/")
                  ? `${API_BASE}/condos/api/files/${att.key}`
                  : att.url;
            const urlForView = apiFileUrl(att);

            return (
              <Pressable
                key={att.id ?? att.key}
                onPress={() => openPreview(att)}
                style={{
                  width: TILE_W,
                  height: TILE_H,
                  borderRadius: 10,
                  overflow: "hidden",
                  backgroundColor: "#0F172A", // azul marino oscuro muy leve
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(148, 163, 184, 0.40)",
                }}
              >
                {isImg ? (
                  Platform.OS === "web" ? (
                    <AuthImgWeb
                      url={urlForView}
                      width={TILE_W}
                      height={TILE_H}
                      style={{
                        objectFit: "cover",
                        borderRadius: 10,
                      }}
                    />
                  ) : (
                    <Image
                      source={{
                        uri: att.url,
                        headers: {
                          Authorization: `Bearer ${getToken()}`,
                        },
                      }}
                      style={{
                        width: TILE_W,
                        height: TILE_H,
                        borderRadius: 10,
                      }}
                      resizeMode="cover"
                    />
                  )
                ) : isVid ? (
                  Platform.OS === "web" ? (
                    <AuthVideoWeb
                      url={urlForView}
                      width={TILE_W}
                      height={TILE_H}
                    />
                  ) : (
                    <VideoThumb
                      uri={att.url}
                      width={TILE_W}
                      height={TILE_H}
                    />
                  )
                ) : (
                  <View
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: "#E5E7EB",
                        fontSize: 30,
                      }}
                    >
                      📄
                    </Text>
                    <Text
                      style={{
                        color: "#E5E7EB",
                        fontSize: 11,
                        textAlign: "center",
                        marginTop: 4,
                      }}
                      numberOfLines={2}
                    >
                      {filenameFromKeyOrUrl(att.key, att.url)}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          {Platform.OS === "web" ? (
            <View
              style={{
                width: TILE_W,
                height: TILE_H,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: lokalyTheme.boardBorder,
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                backgroundColor: lokalyTheme.boardBg,
              }}
            >
              <input
                ref={webInputRef as any}
                type="file"
                accept={WEB_ACCEPT}
                style={{
                  opacity: 0,
                  position: "absolute",
                  inset: 0,
                  cursor: "pointer",
                }}
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  (e.target as HTMLInputElement).value = "";
                  if (file) onPickWeb(file);
                }}
              />
              <Text
                style={{
                  color: lokalyTheme.primary,
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                + Adjuntar
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={pickAndUploadNative}
              style={{
                width: TILE_W,
                height: TILE_H,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.45)",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(15,23,42,0.9)",
              }}
            >
              <Text
                style={{
                  color: lokalyTheme.primary,
                  fontWeight: "600",
                }}
              >
                + Adjuntar
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {preview && (
        <Pressable
          onPress={() =>
            downloadToDevice(
              preview.url,
              safeDownloadName(preview),
              preview.contentType
            )
          }
          style={{
            marginTop: 6,
            backgroundColor: lokalyTheme.primarySoft,
            borderRadius: 999,
            paddingVertical: 6,
            paddingHorizontal: 14,
            alignSelf: "flex-start",
          }}
        >
          <Text
            style={{
              color: lokalyTheme.primary,
              fontWeight: "600",
              fontSize: 12,
            }}
          >
            Descargar archivo seleccionado
          </Text>
        </Pressable>
      )}

      {modalVisible && preview ? (
        <AttachmentPreviewModal
          visible={true}
          onClose={() => setModalVisible(false)}
          attachment={preview}
        />
      ) : null}
    </View>
  );
}

/* ======================= Comentarios ======================= */

function CommentList({
  boardId,
  taskId,
  comments,
  refetchComments,
}: {
  boardId: string;
  taskId: string;
  comments: CommentDto[];
  refetchComments: (boardId: string, taskId: string) => Promise<void>;
}) {
  const [text, setText] = useState("");

  const send = async () => {
    if (!text.trim()) return;
    await postComment(boardId, taskId, "me", text.trim());
    setText("");
    await refetchComments(boardId, taskId);
  };

  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          marginBottom: 4,
          color: lokalyTheme.boardText,
        }}
      >
        Comentarios
      </Text>
      <ScrollView
        style={{
          maxHeight: 120,
          backgroundColor: lokalyTheme.boardCard,   // 👈 blanco
          borderRadius: 10,
          borderWidth: 1,
          borderColor: lokalyTheme.boardBorder,
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
        nestedScrollEnabled
      >
        {comments.map((c: CommentDto) => (
          <View key={c.id} style={{ marginBottom: 6 }}>
            <Text
              style={{
                fontSize: 12,
                color: lokalyTheme.boardText,
              }}
            >
              {c.text}
            </Text>
            <Text
              style={{
                fontSize: 10,
                color: lokalyTheme.boardTextMuted,
                marginTop: 2,
              }}
            >
              {new Date(c.createdAt).toLocaleString()}
            </Text>
          </View>
        ))}
        {comments.length === 0 && (
          <Text
            style={{
              fontSize: 11,
              color: lokalyTheme.boardTextMuted,
            }}
          >
            No hay comentarios todavía.
          </Text>
        )}
      </ScrollView>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 6,
          gap: 6,
        }}
      >
        <TextInput
          placeholder="Escribir comentario..."
          placeholderTextColor={lokalyTheme.boardTextMuted}
          value={text}
          onChangeText={setText}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: lokalyTheme.boardBorder,
            borderRadius: 999,
            paddingHorizontal: 10,
            height: 36,
            fontSize: 12,
            color: lokalyTheme.boardText,
            backgroundColor: lokalyTheme.boardCard,
          }}
        />
        <Pressable
          onPress={send}
          style={{
            backgroundColor: lokalyTheme.primary,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 7,
          }}
        >
          <Text
            style={{
              color: "#111827",
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            Enviar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ======================= Filtro de estado ======================= */

function StatusFilter({
  value,
  onChange,
  isMobile,
}: {
  value: "" | TaskStatus;
  onChange: (v: "" | TaskStatus) => void;
  isMobile: boolean;
}) {
  if (Platform.OS === "web") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.currentTarget.value as any)}
        style={{
          padding: 10,
          borderRadius: 999,
          border: `1px solid ${lokalyTheme.borderSoft}`,
          minWidth: 220,
          background: lokalyTheme.surface,
          color: lokalyTheme.primary,
          fontSize: 13,
          outline: "none",
        }}
      >
        <option value="">Todos los estados</option>
        {ALL_STATUS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    );
  }

  if (Platform.OS === "ios") {
    const label = value || "Todos los estados";
    return (
      <Pressable
        onPress={() =>
          ActionSheetIOS.showActionSheetWithOptions(
            {
              title: "Filtrar por estado",
              options: ["Todos", ...ALL_STATUS, "Cancelar"],
              cancelButtonIndex: ALL_STATUS.length + 1,
            },
            (idx) => {
              if (idx === ALL_STATUS.length + 1) return;
              if (idx === 0) onChange("");
              else onChange(ALL_STATUS[idx - 1]);
            }
          )
        }
        style={{
          height: 40,
          paddingHorizontal: 14,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: lokalyTheme.boardBorder,
          justifyContent: "center",
          backgroundColor: lokalyTheme.primary,
          minWidth: isMobile ? 180 : 220,
        }}
      >
        <Text
          style={{
            color: lokalyTheme.boardText,
            fontWeight: "500",
            fontSize: 13,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderRadius: 999,
        borderColor: lokalyTheme.primary,
        height: 40,
        minWidth: isMobile ? 180 : 220,
        justifyContent: "center",
        backgroundColor: lokalyTheme.boardBorder,
      }}
    >
      <Picker
        selectedValue={value}
        onValueChange={(v) => onChange(v as any)}
        mode={isMobile ? "dialog" : "dropdown"}
        style={{ height: "100%", width: "100%", color: lokalyTheme.primary }}
        dropdownIconColor="#E5E7EB"
        prompt="Filtrar por estado"
      >
        <Picker.Item label="Todos los estados" value="" />
        {ALL_STATUS.map((s) => (
          <Picker.Item key={s} label={s} value={s} />
        ))}
      </Picker>
    </View>
  );
}

/* ======================= VideoPreview ======================= */

function VideoPreview({ uri, visible }: { uri: string; visible: boolean }) {
  const [localUri, setLocalUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = useApp.getState().token || "";
        const dest = `${FileSystem.cacheDirectory}play-${Date.now()}.mp4`;
        const res = await FileSystem.downloadAsync(uri, dest, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (alive) setLocalUri(res.uri);
      } catch {
        if (alive) setLocalUri(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uri]);

  const player = useVideoPlayer(undefined as any, (p) => {
    p.loop = true;
    p.muted = false;
  });

  React.useEffect(() => {
    if (localUri) player.replace({ uri: localUri });
  }, [localUri, player]);

  React.useEffect(() => {
    if (!localUri) return;
    visible ? player.play() : player.pause();
  }, [visible, localUri, player]);

  return (
    <VideoView
      player={player}
      style={{
        width: "92%",
        height: "72%",
        borderRadius: 16,
        backgroundColor: "#000",
      }}
      contentFit="contain"
      nativeControls
    />
  );
}

/* ======================= Descarga ======================= */

async function downloadToDevice(
  url: string,
  filename: string,
  contentType?: string
) {
  if (Platform.OS === "web") {
    try {
      const headers: Record<string, string> = {};
      const token = useApp.getState().token;
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { headers, credentials: "omit" });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      const ct = res.headers.get("content-type") || "application/octet-stream";
      const blob = new Blob([await res.arrayBuffer()], { type: ct });

      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = filename || "archivo";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(obj);
    } catch (e: any) {
      alert("No se pudo descargar en web: " + (e?.message ?? String(e)));
    }
    return;
  }

  try {
    const safeName = filename || "archivo";
    const dest = `${FileSystem.cacheDirectory}${safeName}`;
    const res = await FileSystem.downloadAsync(url, dest);

    if (contentType?.startsWith("image/") || contentType?.startsWith("video/")) {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status === "granted") {
        await MediaLibrary.saveToLibraryAsync(res.uri);
        alert("✅ Guardado en la galería.");
        return;
      }
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(res.uri, {
        dialogTitle: "Guardar/Compartir archivo",
      });
    } else {
      alert(`Descargado en: ${res.uri}`);
    }
  } catch (e: any) {
    alert("No se pudo descargar el archivo: " + (e?.message ?? String(e)));
  }
}

/* ======================= Kanban ======================= */

function Kanban({
  byStatus,
  statusStyle,
  attachmentsByTask,
  commentsByTask,
  refetchTaskAttachments,
  addAttachment,
  refetchComments,
  displayAssignee,
  fmt,
  cardShadow,
  updateStatus,
}: any) {
  const { width: vw } = useWindowDimensions();
  const COLS = Object.keys(byStatus).length;
  const GAP = 18;
  const OUTER = vw < 768 ? 14 : 22;

  const available = vw - OUTER * 2 - GAP * (COLS - 1);
  const MIN = 260;

  const ideal = Math.floor(available / COLS);
  const fitMode = ideal >= MIN;
  const colW = fitMode ? ideal : MIN;
  const rackMinWidth = fitMode
    ? vw
    : colW * COLS + GAP * (COLS - 1) + OUTER * 2;

/* ================== WEB: Kanban flotante tipo Trello ================== */
if (Platform.OS === "web") {
  return (
    <View
      style={{
        backgroundColor: lokalyTheme.bg,
        paddingTop: 18,
        paddingBottom: 32,
      }}
    >
      {/* "Card" grande que flota en medio */}
      <View
        style={{
          maxWidth: 1400,
          marginLeft: "auto",
          marginRight: "auto",
          borderRadius: 24,
          backgroundColor: lokalyTheme.surfaceSoft,
          borderWidth: 1,
          borderColor: lokalyTheme.borderSoft,
          paddingVertical: 16,
          paddingHorizontal: 18,
          boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
        } as any}
      >
        <View
          style={{
            flexDirection: "row",
            gap: GAP,
            alignItems: "stretch",
            justifyContent: fitMode ? "space-between" : "flex-start",
            minWidth: rackMinWidth,
          }}
        >
          {Object.entries(byStatus).map(
            ([st, list]: [string, Task[]]) => {
              const style = statusStyle[st as keyof typeof statusStyle];

              return (
                <View
                  key={st}
                  style={{
                    width: colW,
                    flexShrink: 0,
                    borderRadius: 18,
                    padding: 10,
                    backgroundColor: lokalyTheme.boardBg,
                    borderWidth: 1,
                    borderColor: lokalyTheme.boardBg,
                  }}
                >
                  {/* Header columna */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 24,
                          borderRadius: 999,
                          backgroundColor: style.fg,
                        }}
                      />
                      <View>
                        <Text
                          style={{
                            fontWeight: "700",
                            fontSize: 15,
                            color: lokalyTheme.boardText,
                          }}
                        >
                          {style.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: lokalyTheme.boardTextMuted,
                            marginTop: 2,
                          }}
                        >
                          {list.length} tarea
                          {list.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Lista de tarjetas */}
                  <View
                    style={{
                      paddingBottom: 60,
                      gap: 10,
                    }}
                  >
                    {list.map((t: Task) => (
                      <View
                        key={t.id}
                        style={{
                          borderWidth: 1,
                          borderColor: lokalyTheme.boardBorder,
                          borderRadius: 14,
                          backgroundColor: lokalyTheme.boardBorder,
                          padding: 10,
                          gap: 8,
                          ...cardShadow,
                        }}
                      >
                        {/* Título + prioridad */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontWeight: "700",
                                fontSize: 15,
                                color: lokalyTheme.boardText,
                              }}
                              numberOfLines={2}
                            >
                              {t.title}
                            </Text>
                            {!!t.description && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: lokalyTheme.boardTextMuted,
                                  marginTop: 2,
                                }}
                                numberOfLines={2}
                              >
                                {t.description}
                              </Text>
                            )}
                          </View>

                          <View
                            style={{
                              alignItems: "flex-end",
                              gap: 4,
                            }}
                          >
                            {!!t.priority && (
                              <View
                                style={{
                                  borderRadius: 999,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  backgroundColor:
                                    t.priority === "HIGH"
                                      ? "rgba(248,113,113,0.16)"
                                      : t.priority === "MEDIUM"
                                      ? "rgba(250,204,21,0.12)"
                                      : "rgba(45,212,191,0.12)",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "600",
                                    color:
                                      t.priority === "HIGH"
                                        ? "#F87171"
                                        : t.priority === "MEDIUM"
                                        ? "#EAB308"
                                        : "#2DD4BF",
                                  }}
                                >
                                  {t.priority}
                                </Text>
                              </View>
                            )}
                            {!!t.boardName && (
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: lokalyTheme.boardTextMuted,
                                }}
                              >
                                {t.boardName}
                              </Text>
                            )}
                          </View>
                        </View>

                        {/* Meta info */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 4,
                            marginBottom: 2,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                backgroundColor: lokalyTheme.chipBg,
                                borderWidth: 1,
                                borderColor: lokalyTheme.chipBorder,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text
                                style={{
                                  color: lokalyTheme.primary,
                                  fontSize: 11,
                                  fontWeight: "600",
                                }}
                              >
                                {(displayAssignee(t.assigneeId) || "?")
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 11,
                                color: lokalyTheme.boardTextMuted,
                              }}
                              numberOfLines={1}
                            >
                              {displayAssignee(t.assigneeId)}
                            </Text>
                          </View>

                          <Text
                            style={{
                              fontSize: 11,
                              color: lokalyTheme.boardTextMuted,
                            }}
                            numberOfLines={1}
                          >
                            {fmt(t.dueDate)}
                          </Text>
                        </View>

                        {/* Adjuntos */}
                        <TaskAttachments
                          boardId={t.boardId}
                          taskId={t.id}
                          attachments={attachmentsByTask[t.id] ?? []}
                          refetchTaskAttachments={refetchTaskAttachments}
                          addAttachment={addAttachment}
                        />

                        {/* Comentarios */}
                        <CommentList
                          boardId={t.boardId}
                          taskId={t.id}
                          comments={commentsByTask[t.id] ?? []}
                          refetchComments={refetchComments}
                        />

                        {/* Botones de cambio de estado */}
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap" as const,
                            gap: 6,
                            marginTop: 8,
                          }}
                        >
                          {(["OPEN", "IN_PROGRESS", "DONE"] as const)
                            .filter((s) => s !== t.status)
                            .map((s) => (
                              <Pressable
                                key={s}
                                onPress={() => updateStatus(t.id, s)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                  backgroundColor:
                                    s === "DONE"
                                      ? "rgba(16,185,129,0.13)"
                                      : s === "IN_PROGRESS"
                                      ? lokalyTheme.primarySoft
                                      : "#0B1120",
                                  borderRadius: 999,
                                  paddingVertical: 5,
                                  paddingHorizontal: 10,
                                  borderWidth: 1,
                                  borderColor:
                                    s === "DONE"
                                      ? "rgba(34,197,94,0.6)"
                                      : s === "IN_PROGRESS"
                                      ? lokalyTheme.primary
                                      : lokalyTheme.borderSoft,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "600",
                                    color:
                                      s === "DONE"
                                        ? "#4ADE80"
                                        : s === "IN_PROGRESS"
                                        ? lokalyTheme.primary
                                        : "#E5E7EB",
                                  }}
                                >
                                  {s}
                                </Text>
                              </Pressable>
                            ))}
                        </View>
                      </View>
                    ))}

                    {list.length === 0 && (
                      <View
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          backgroundColor: "#020617",
                          borderWidth: 1,
                          borderColor: lokalyTheme.borderSoft,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: lokalyTheme.boardTextMuted,
                            textAlign: "center",
                          }}
                        >
                          No hay tareas en esta columna.
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            }
          )}
        </View>
      </View>
    </View>
  );
}

  /* ================== NATIVO: sí usamos ScrollView horizontal ================== */
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      nestedScrollEnabled
      style={{ backgroundColor: lokalyTheme.bg }}
      contentContainerStyle={{
        paddingHorizontal: OUTER,
        paddingVertical: 14,
        minWidth: rackMinWidth,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: GAP,
          alignItems: "stretch",
          justifyContent: fitMode ? "space-between" : "flex-start",
          width: "100%",
        }}
      >
        {/* 👇 Aquí puedes reutilizar exactamente el mismo map de columnas que arriba */}
        {Object.entries(byStatus).map(
          ([st, list]: [string, Task[]]) => {
            const style = statusStyle[st as keyof typeof statusStyle];

            return (
              <View
                key={st}
                style={{
                  width: colW,
                  flexShrink: 0,
                  borderRadius: 18,
                  padding: 10,
                  backgroundColor: lokalyTheme.boardBg,
                  borderWidth: 1,
                  borderColor: lokalyTheme.boardBg,
                }}
              >
  {/* Header columna */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 24,
                          borderRadius: 999,
                          backgroundColor: style.fg,
                        }}
                      />
                      <View>
                        <Text
                          style={{
                            fontWeight: "700",
                            fontSize: 15,
                            color: lokalyTheme.boardText,
                          }}
                        >
                          {style.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: lokalyTheme.boardTextMuted,
                            marginTop: 2,
                          }}
                        >
                          {list.length} tarea
                          {list.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Lista de tarjetas */}
                  <View
                    style={{
                      paddingBottom: 60,
                      gap: 10,
                    }}
                  >
                    {list.map((t: Task) => (
                      <View
                        key={t.id}
                        style={{
                          borderWidth: 1,
                          borderColor: lokalyTheme.boardBorder,
                          borderRadius: 14,
                          backgroundColor: lokalyTheme.boardBorder,
                          padding: 10,
                          gap: 8,
                          ...cardShadow,
                        }}
                      >
                        {/* Título + prioridad */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontWeight: "700",
                                fontSize: 15,
                                color: lokalyTheme.boardText,
                              }}
                              numberOfLines={2}
                            >
                              {t.title}
                            </Text>
                            {!!t.description && (
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: lokalyTheme.boardTextMuted,
                                  marginTop: 2,
                                }}
                                numberOfLines={2}
                              >
                                {t.description}
                              </Text>
                            )}
                          </View>

                          <View
                            style={{
                              alignItems: "flex-end",
                              gap: 4,
                            }}
                          >
                            {!!t.priority && (
                              <View
                                style={{
                                  borderRadius: 999,
                                  paddingHorizontal: 10,
                                  paddingVertical: 3,
                                  backgroundColor:
                                    t.priority === "HIGH"
                                      ? "rgba(248,113,113,0.16)"
                                      : t.priority === "MEDIUM"
                                      ? "rgba(250,204,21,0.12)"
                                      : "rgba(45,212,191,0.12)",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "600",
                                    color:
                                      t.priority === "HIGH"
                                        ? "#F87171"
                                        : t.priority === "MEDIUM"
                                        ? "#EAB308"
                                        : "#2DD4BF",
                                  }}
                                >
                                  {t.priority}
                                </Text>
                              </View>
                            )}
                            {!!t.boardName && (
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: lokalyTheme.boardTextMuted,
                                }}
                              >
                                {t.boardName}
                              </Text>
                            )}
                          </View>
                        </View>

                        {/* Meta info */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginTop: 4,
                            marginBottom: 2,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 999,
                                backgroundColor: lokalyTheme.chipBg,
                                borderWidth: 1,
                                borderColor: lokalyTheme.chipBorder,
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Text
                                style={{
                                  color: lokalyTheme.primary,
                                  fontSize: 11,
                                  fontWeight: "600",
                                }}
                              >
                                {(displayAssignee(t.assigneeId) || "?")
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontSize: 11,
                                color: lokalyTheme.boardTextMuted,
                              }}
                              numberOfLines={1}
                            >
                              {displayAssignee(t.assigneeId)}
                            </Text>
                          </View>

                          <Text
                            style={{
                              fontSize: 11,
                              color: lokalyTheme.boardTextMuted,
                            }}
                            numberOfLines={1}
                          >
                            {fmt(t.dueDate)}
                          </Text>
                        </View>

                        {/* Adjuntos */}
                        <TaskAttachments
                          boardId={t.boardId}
                          taskId={t.id}
                          attachments={attachmentsByTask[t.id] ?? []}
                          refetchTaskAttachments={refetchTaskAttachments}
                          addAttachment={addAttachment}
                        />

                        {/* Comentarios */}
                        <CommentList
                          boardId={t.boardId}
                          taskId={t.id}
                          comments={commentsByTask[t.id] ?? []}
                          refetchComments={refetchComments}
                        />

                        {/* Botones de cambio de estado */}
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap" as const,
                            gap: 6,
                            marginTop: 8,
                          }}
                        >
                          {(["OPEN", "IN_PROGRESS", "DONE"] as const)
                            .filter((s) => s !== t.status)
                            .map((s) => (
                              <Pressable
                                key={s}
                                onPress={() => updateStatus(t.id, s)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                  backgroundColor:
                                    s === "DONE"
                                      ? "rgba(16,185,129,0.13)"
                                      : s === "IN_PROGRESS"
                                      ? lokalyTheme.primarySoft
                                      : "#0B1120",
                                  borderRadius: 999,
                                  paddingVertical: 5,
                                  paddingHorizontal: 10,
                                  borderWidth: 1,
                                  borderColor:
                                    s === "DONE"
                                      ? "rgba(34,197,94,0.6)"
                                      : s === "IN_PROGRESS"
                                      ? lokalyTheme.primary
                                      : lokalyTheme.borderSoft,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "600",
                                    color:
                                      s === "DONE"
                                        ? "#4ADE80"
                                        : s === "IN_PROGRESS"
                                        ? lokalyTheme.primary
                                        : "#E5E7EB",
                                  }}
                                >
                                  {s}
                                </Text>
                              </Pressable>
                            ))}
                        </View>
                      </View>
                    ))}

                    {list.length === 0 && (
                      <View
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          backgroundColor: "#020617",
                          borderWidth: 1,
                          borderColor: lokalyTheme.borderSoft,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            color: lokalyTheme.boardTextMuted,
                            textAlign: "center",
                          }}
                        >
                          No hay tareas en esta columna.
                        </Text>
                      </View>
                    )}
                  </View>                
              </View>
            );
          }
        )}
      </View>
    </ScrollView>
  );
}

/* ======================= TopBar ======================= */

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
  const isSmall = width < 400;      // teléfonos chicos
  const isVerySmall = width < 340;  // casos extremos
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
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
<View
  style={{
    width: 30,
    height: 30,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: lokalyTheme.primary,
    backgroundColor: lokalyTheme.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  }}
>
  <Image
    source={condosLogo}
    style={{ width: "100%", height: "100%" }}
    resizeMode="contain"
  />
</View>
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
              Condos Admin
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: lokalyTheme.boardTextMuted,
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
              {email}
            </Text>
          </View>
        )}

        <Pressable
          onPress={onMenu}
          style={{
            paddingHorizontal: 14,
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
              fontSize: 12,
            }}
          >
            {isSmall ? "MENÚ" : "MENÚ PRINCIPAL"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onLogout}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "#B91C1C",
          }}
        >
          <Text
            style={{
              color: "#F9FAFB",
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            SALIR
          </Text>
        </Pressable>
      </View>
    </View>
  );
}