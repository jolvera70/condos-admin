// app/(ops)/tasks.tsx – Kanban/List con Adjuntos (presign→PUT→complete) + Comentarios + Modal Preview (expo-video + cámara)
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
  return apiAuth(`/board/${boardId}/tasks/${taskId}/comments?page=0&size=50`, "GET") as Promise<CommentDto[]>;
}
async function postComment(boardId: string, taskId: string, authorId: string, text: string) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/comments`, "POST", { authorId, text }) as Promise<CommentDto>;
}
async function fetchTaskAttachments(boardId: string, taskId: string) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/attachments`, "GET") as Promise<Attachment[]>;
}
async function presignAttachment(boardId: string, taskId: string, contentType: string, size: number) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/attachments/presign`, "POST", { contentType, size }) as Promise<PresignResp>;
}
async function completeAttachment(boardId: string, taskId: string, key: string, contentType: string, size: number) {
  return apiAuth(`/board/${boardId}/tasks/${taskId}/attachments/complete`, "POST", { key, contentType, size }) as Promise<CompleteResp>;
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

  const [kanban, setKanban] = useState(!isMobile);
  const { me, logout } = useApp();
  const router = useRouter();

  const orgId = useMemo(() => me?.orgId ?? me?.orgs?.[0]?.orgId ?? "", [me]);
  const meId = useMemo(() => String(me?.id ?? me?.userId ?? me?.email ?? "me"), [me]);

  const [status, setStatus] = useState<"" | TaskStatus>("");
  const [items, setItems] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [attachmentsByTask, setAttachmentsByTask] = useState<Record<string, Attachment[]>>({});
  const [commentsByTask, setCommentsByTask] = useState<Record<string, CommentDto[]>>({});

  const refetchTaskAttachments = async (boardId: string, taskId: string) => {
    const list = await fetchTaskAttachments(boardId, taskId);
    setAttachmentsByTask((prev) => ({ ...prev, [taskId]: list }));
  };

  const addAttachment = (taskId: string, att: Attachment) =>
    setAttachmentsByTask((prev) => ({ ...prev, [taskId]: [att, ...(prev[taskId] ?? [])] }));

  const refetchComments = async (boardId: string, taskId: string) => {
    const list = await listComments(boardId, taskId);
    setCommentsByTask((prev) => ({ ...prev, [taskId]: list }));
  };

  const [members, setMembers] = useState<Member[]>([]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const displayAssignee = (id?: string) => {
    if (!id) return "—";
    const m = memberById.get(id);
    return m ? m.fullName || m.email : id;
  };

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

  const statusStyle: Record<TaskStatus, { bg: string; fg: string; title: string }> = {
    OPEN: { bg: "#EFF6FF", fg: "#1D4ED8", title: "Abiertas" },
    IN_PROGRESS: { bg: "#FFF7ED", fg: "#B45309", title: "En progreso" },
    DONE: { bg: "#ECFDF5", fg: "#065F46", title: "Completadas" },
  };

  const cardShadow =
    Platform.OS === "web" ? { boxShadow: "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)" } : {};

  // 👉 Listener para navegar cuando el usuario toca la notificación
  // cargar miembros
  useEffect(() => {
    const loadMembers = async () => {
      if (!orgId) return;
      try {
        const raw = await apiAuth(`/user/users?orgId=${encodeURIComponent(orgId)}&status=ACTIVE`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        setMembers(list.map((u: any) => ({ id: String(u.id ?? u._id), fullName: u.fullName, email: u.email })));
      } catch { }
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
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: next } : it)));
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const byStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { OPEN: [], IN_PROGRESS: [], DONE: [] };
    for (const t of items) map[t.status].push(t);
    return map;
  }, [items]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <TopBar
        email={me?.email}
        onMenu={() => router.push("/home")}
        onLogout={() => logout()}
      />
      {/* HEADER */}
      <View
        style={{
          height: 56,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderColor: "#E5E7EB",
          backgroundColor: "#F9FAFB",
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "600" }}>Tareas</Text>
      </View>

      {/* CONTENIDO */}
      {busy ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : msg ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: "red" }}>{msg}</Text>
        </View>
      ) : (
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
// Miniatura
// Miniatura (nativo): descarga con headers y luego replace()
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
    return () => { alive = false; };
  }, [uri]);

  // 👇 SIEMPRE creamos el player (sin fuente inicial)
  const player = useVideoPlayer(undefined as any, (p) => {
    p.loop = false;
    p.muted = true;
  });

  // Cuando ya hay archivo local, asignamos la fuente
  React.useEffect(() => {
    if (localUri) player.replace({ uri: localUri });
  }, [localUri, player]);

  return (
    <VideoView
      player={player}
      style={{ width, height, borderRadius: 10, backgroundColor: "#000" }}
      contentFit="cover"
    />
  );
}

/* ======================= Modal de Previsualización (fix) ======================= */
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
  // Carga perezosa de helpers web (no se evalúa en nativo)
  const Web = React.useMemo(
    () => (isWeb ? require("@/components/auth-media-web") : null),
    [isWeb]
  );
  const useTextWithAuth = isWeb ? Web!.useTextWithAuth : () => undefined;

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
  const apiFileUrl = (att: Attachment | string) =>
    typeof att === "string"
      ? att.includes("/minio/") ? `${API_BASE}/condos/api/files/${att.split("/condos-attachments/")[1]}` : att
      : att.url.includes("/minio/") ? `${API_BASE}/condos/api/files/${att.key}` : att.url;

  const urlForView = apiFileUrl(attachment);

  const _isImage = isImage(attachment);
  const _isVideo = isVideo(attachment);
  const _isPdf   = isPdf(attachment);
  const _isText  = isText(attachment);
  const _isOffice= isOffice(attachment);

  const docUrl   = _isOffice ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(urlForView)}` : urlForView;
  const textBody = useTextWithAuth(urlForView);

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" }}>
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", top: 50, right: 20, zIndex: 10, backgroundColor: "#fff",
                   borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: "#111", fontWeight: "700" }}>Cerrar</Text>
        </Pressable>

        {_isImage && (
          isWeb ? (
            <Web.AuthImgWeb
              url={urlForView}
              width={0}
              height={0}
              style={{ width: "90%", height: "70%", borderRadius: 12, objectFit: "contain" }}
            />
          ) : (
            <Image
              source={{ uri: attachment.url, headers: { Authorization: `Bearer ${useApp.getState().token ?? ""}` } }}
              style={{ width: "90%", height: "70%", borderRadius: 12 }}
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
              style={{ width: "90%", height: "70%", borderRadius: 12, objectFit: "contain" }}
            />
          ) : (
            <VideoPreview uri={attachment.url} visible={visible} />
          )
        )}

        {_isText && (
          isWeb ? (
            <div style={{ width: "90%", height: "70%", background: "#fff", color: "#111",
                          borderRadius: 12, overflow: "auto", padding: 16 }}>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 13 }}>
                {textBody ?? "Cargando…"}
              </pre>
            </div>
          ) : (
            <ScrollView style={{ width: "90%", height: "70%", backgroundColor: "#fff", borderRadius: 12, padding: 16 }}>
              <Text style={{ color: "#111", fontFamily: "Menlo" }}>
                {/** En nativo, si el endpoint exige JWT, mejor descarga y muestra con otra estrategia */}
                Texto no soportado via fetch aquí.
              </Text>
            </ScrollView>
          )
        )}

        {_isPdf && (
          isWeb ? (
            <Web.AuthPdfIframeWeb url={urlForView} style={{ width: "90%", height: "70%" }} />
          ) : (
            <View style={{ width: "90%", height: "70%", borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" }}>
              <WebView source={{ uri: urlForView }} startInLoadingState />
            </View>
          )
        )}

        {!_isImage && !_isVideo && !_isPdf && !_isText && !_isOffice && (
          <View style={{ backgroundColor: "#fff", padding: 20, borderRadius: 12 }}>
            <Text style={{ color: "#111", fontSize: 14, textAlign: "center" }}>
              {filenameFromKeyOrUrl(attachment.key, attachment.url)}
            </Text>
            <Text style={{ color: "#6B7280", fontSize: 12, textAlign: "center", marginTop: 6 }}>
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
  const RAIL_H = TILE_H + 24; // alto fijo para que no empuje el layout

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
      const { key, uploadUrl } = await presignAttachment(boardId, taskId, mime, size);
      const up = await fetch(uploadUrl, {
        method: "PUT", // o "PUT" si tu FilesController tiene @PutMapping("/**")
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

  /* ======== Pick archivo o cámara en móvil ======== */
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
        const camRes = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All });
        if (!camRes.canceled && camRes.assets[0]) {
          fileUri = camRes.assets[0].uri;
          name = camRes.assets[0].fileName ?? "foto.jpg";
          mime = camRes.assets[0].mimeType ?? "image/jpeg";
          size = camRes.assets[0].fileSize ?? 0;
        }
      } else {
        const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
        if (!res.canceled && res.assets?.[0]) {
          const f = res.assets[0];
          fileUri = f.uri;
          name = f.name ?? "archivo";
          mime = f.mimeType ?? guessMimeFromName(f.name);
          size = f.size ?? 0;
        }
      }

      if (!fileUri) return;

      // 1) Pides URL de subida a tu API
      const { key, uploadUrl } = await presignAttachment(boardId, taskId, mime, size);
      // 3) SUBIR binario con expo-file-system (NO usar fetch(fileUri).blob())
      const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
        httpMethod: "PUT", // o "POST" si tu FilesController usa @PostMapping
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          "Content-Type": mime,
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
      });

      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed: ${result.status} ${result.body || ""}`);
      }

      // 4) Completar en backend y refrescar lista
      const saved = await completeAttachment(boardId, taskId, key, mime, size);
      addAttachment(taskId, saved);
      await refetchTaskAttachments(boardId, taskId);
      alert("✅ Adjuntado");
    } catch (e: any) {
      alert("Error subiendo: " + (e?.message ?? String(e)));
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 4 }}>Adjuntos</Text>

      {/* 🔒 Contenedor con alto fijo (scroll interno horizontal) */}
      <View
        style={{
          height: RAIL_H,
          width: "100%",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
  style={{
    flex: 1,
    ...(Platform.OS === "web" ? { overflowX: "scroll" as any } : {}),
  }}
          contentContainerStyle={{
            alignItems: "center",
            paddingHorizontal: 6,
            gap: 12,
            height: RAIL_H,
          }}
        >
          {attachments.map((att) => {
            const isImg = isImage(att);
            const isVid = isVideo(att);
            const isDoc = isPdf(att) || isText(att) || isOffice(att);
            const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
            const apiFileUrl = (att: Attachment | string) =>
              typeof att === "string"
                ? att.includes("/minio/") ? `${API_BASE}/condos/api/files/${att.split("/condos-attachments/")[1]}` : att
                : att.url.includes("/minio/") ? `${API_BASE}/condos/api/files/${att.key}` : att.url;
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
                  backgroundColor: "#000",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {isImg ? (
                  Platform.OS === "web" ? (
                    // 👇 ahora usa <img> con blob + Authorization
                    <AuthImgWeb
                      url={urlForView}
                      width={TILE_W}
                      height={TILE_H}
                      style={{ objectFit: "cover", borderRadius: 10 }}
                    />
                  ) : (
                    <Image
                      // en nativo puedes mandar headers en source
                      source={{ uri: att.url, headers: { Authorization: `Bearer ${getToken()}` } }}
                      style={{ width: TILE_W, height: TILE_H, borderRadius: 10 }}
                      resizeMode="cover"
                    />
                  )
                ) : isVid ? (
                  Platform.OS === "web" ? (
                    // 👇 video con blob + Authorization
                    <AuthVideoWeb url={urlForView} width={TILE_W} height={TILE_H} />
                  ) : (
                    <VideoThumb uri={att.url} width={TILE_W} height={TILE_H} />
                  )
                ) : (

                  <View style={{ alignItems: "center", justifyContent: "center", padding: 8 }}>
                    <Text style={{ color: "#fff", fontSize: 30 }}>📄</Text>
                    <Text
                      style={{ color: "#fff", fontSize: 11, textAlign: "center", marginTop: 4 }}
                      numberOfLines={2}
                    >
                      {filenameFromKeyOrUrl(att.key, att.url)}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}

          {/* Botón agregar */}
          {Platform.OS === "web" ? (
            <View
              style={{
                width: TILE_W,
                height: TILE_H,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                backgroundColor: "#fff",
              }}
            >
              <input
                ref={webInputRef as any}
                type="file"
                accept={WEB_ACCEPT}
                style={{ opacity: 0, position: "absolute", inset: 0, cursor: "pointer" }}
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  (e.target as HTMLInputElement).value = "";
                  if (file) onPickWeb(file);
                }}
              />
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>+ Agregar</Text>
            </View>
          ) : (
            <Pressable
              onPress={pickAndUploadNative}
              style={{
                width: TILE_W,
                height: TILE_H,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#fff",
              }}
            >
              <Text style={{ color: "#2563EB", fontWeight: "600" }}>+ Agregar</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Botón Descargar */}
      {preview && (
        <Pressable
          onPress={() => downloadToDevice(preview.url, safeDownloadName(preview), preview.contentType)}
          style={{
            marginTop: 6,
            backgroundColor: "#111827",
            borderRadius: 8,
            paddingVertical: 6,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", textAlign: "center" }}>Descargar</Text>
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
function CommentList({ boardId, taskId, comments, refetchComments }: any) {
  const [text, setText] = useState("");

  const send = async () => {
    if (!text.trim()) return;
    await postComment(boardId, taskId, "me", text.trim());
    setText("");
    await refetchComments(boardId, taskId);
  };

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 4 }}>Comentarios</Text>
      <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
        {comments.map((c: CommentDto) => (
          <View key={c.id} style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: "#374151" }}>{c.text}</Text>
            <Text style={{ fontSize: 10, color: "#9CA3AF" }}>{new Date(c.createdAt).toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
        <TextInput
          placeholder="Escribir comentario..."
          value={text}
          onChangeText={setText}
          style={{ flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 8, height: 36 }}
        />
        <Pressable
          onPress={send}
          style={{ marginLeft: 6, backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Enviar</Text>
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
          borderRadius: 10,
          border: "1px solid #E5E7EB" as any,
          minWidth: 200,
          background: "#fff",
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
          height: 44,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          justifyContent: "center",
          backgroundColor: "#fff",
          minWidth: isMobile ? 180 : 220,
        }}
      >
        <Text style={{ color: "#111827", fontWeight: "600" }}>{label}</Text>
      </Pressable>
    );
  }

  // Android
  return (
    <View
      style={{
        borderWidth: 1,
        borderRadius: 10,
        borderColor: "#E5E7EB",
        height: 44,
        minWidth: isMobile ? 180 : 220,
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
      }}
    >
      <Picker
        selectedValue={value}
        onValueChange={(v) => onChange(v as any)}
        mode={isMobile ? "dialog" : "dropdown"}
        style={{ height: "100%", width: "100%" }}
        dropdownIconColor="#374151"
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

/* ======================= VideoPreview (solo para modal) ======================= */
// Modal: igual, nunca condicional; replace() cuando listo
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
    return () => { alive = false; };
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
      style={{ width: "90%", height: "70%", borderRadius: 12, backgroundColor: "#000" }}
      contentFit="contain"
      nativeControls
    />
  );
}

async function downloadToDevice(url: string, filename: string, contentType?: string) {
  // Web: descarga via <a>
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

  // Nativo (iOS/Android)
  try {
    const safeName = filename || "archivo";
    const dest = `${FileSystem.cacheDirectory}${safeName}`;

    // Descarga al caché del dispositivo
    const res = await FileSystem.downloadAsync(url, dest);

    // Si es imagen o video intenta guardarlo directo en galería
    if (contentType?.startsWith("image/") || contentType?.startsWith("video/")) {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status === "granted") {
        await MediaLibrary.saveToLibraryAsync(res.uri);
        alert("✅ Guardado en la galería.");
        return;
      }
    }

    // Si no, compartir/abrir con app nativa
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(res.uri, { dialogTitle: "Guardar/Compartir archivo" });
    } else {
      alert(`Descargado en: ${res.uri}`);
    }
  } catch (e: any) {
    alert("No se pudo descargar el archivo: " + (e?.message ?? String(e)));
  }
}

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
  const { width: vw, height: vh } = useWindowDimensions();
  const COLS = Object.keys(byStatus).length;   // 3
  const GAP = 14;
  const OUTER = vw < 768 ? 12 : 20;

  // alto con scroll interno por columna
  const headerReserve = 56 + 12 + 8;
  const colHeight = Math.max(420, vh - headerReserve - 24);

  const available = vw - OUTER * 2 - GAP * (COLS - 1);
  const MIN = 260;                              // ancho mínimo que mantiene legibilidad

  const ideal = Math.floor(available / COLS);

  // ¿Caben sin scroll?
  const fitMode = ideal >= MIN;

  // En fitMode llenamos 100% (sin límite superior); en scrollMode fijamos MIN
  const colW = fitMode ? ideal : MIN;

  // En fitMode usamos minWidth = vw para ocupar todo;
  // en scrollMode, forzamos el ancho total de las columnas para que aparezca scroll
  const rackMinWidth = fitMode ? vw : (colW * COLS + GAP * (COLS - 1) + OUTER * 2);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      nestedScrollEnabled
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{
        paddingHorizontal: OUTER,
        paddingVertical: 12,
        minWidth: rackMinWidth,                 // 👈 ocupa 100% o fuerza scroll
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: GAP,
          alignItems: "stretch",
          // reparte columnas para que llenen 100% en fitMode (evita hueco)
          justifyContent: fitMode ? "space-between" : "flex-start",
          width: "100%",
        }}
      >
        {Object.entries(byStatus).map(([st, list]: [string, any[]]) => {
          const style = statusStyle[st as keyof typeof statusStyle];
          return (
            <View
              key={st}
              style={{
                width: colW,                    // 👈 ancho calculado
                flexShrink: 0,
                backgroundColor: "#FFFFFF",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 10,
                minHeight: colHeight,
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: style.fg, marginBottom: 8 }}>
                {style.title}
              </Text>

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 60, gap: 8 }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                {list.map((t: any) => (
                  <View
                    key={t.id}
                    style={{
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 10,
                      backgroundColor: "#fff",
                      padding: 8,
                      ...cardShadow,
                    }}
                  >
                    <Text style={{ fontWeight: "600", fontSize: 15 }}>{t.title}</Text>
                    <Text style={{ fontSize: 12, color: "#6B7280" }}>{displayAssignee(t.assigneeId)}</Text>
                    <Text style={{ fontSize: 12, color: "#9CA3AF" }}>{fmt(t.dueDate)}</Text>

                    <TaskAttachments
                      boardId={t.boardId}
                      taskId={t.id}
                      attachments={attachmentsByTask[t.id] ?? []}
                      refetchTaskAttachments={refetchTaskAttachments}
                      addAttachment={addAttachment}
                    />

                    <CommentList
                      boardId={t.boardId}
                      taskId={t.id}
                      comments={commentsByTask[t.id] ?? []}
                      refetchComments={refetchComments}
                    />

                    <View style={{ flexDirection: "row", flexWrap: "wrap" as const, gap: 8, marginTop: 6 }}>
                      {(["OPEN", "IN_PROGRESS", "DONE"] as const)
                        .filter((s) => s !== t.status)
                        .map((s) => (
                          <Pressable
                            key={s}
                            onPress={() => updateStatus(t.id, s)}
                            style={{
                              backgroundColor: statusStyle[s].bg,
                              borderRadius: 6,
                              paddingVertical: 4,
                              paddingHorizontal: 8,
                            }}
                          >
                            <Text style={{ color: statusStyle[s].fg, fontSize: 11 }}>{s}</Text>
                          </Pressable>
                        ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function TopBar({
  email,
  onMenu,
  onLogout,
}: {
  email?: string;
  onMenu: () => void;
  onLogout: () => void;
}) {
  return (
    <View
      style={{
        height: 56,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        backgroundColor: "#F9FAFB",
        borderBottomWidth: 1,
        borderColor: "#E5E7EB",
        // 👇 que no desaparezca ni quede debajo del scroll en web
        ...(Platform.OS === "web" ? { position: "sticky", top: 0, zIndex: 100 } : {}),
      }}
    >
      {/* IZQ: título */}
      <View style={{ minWidth: 0 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Condos</Text>
      </View>

      {/* FLEX spacer */}
      <View style={{ flex: 1 }} />

      {/* DER: chips + botones */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {!!email && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: "#EEF2FF",
              borderRadius: 999,
            }}
          >
            <Text style={{ fontWeight: "700", color: "#1F2937" }}>{email}</Text>
          </View>
        )}

        <Pressable
          onPress={onMenu}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: "#E5EAF2",
            borderRadius: 999,
          }}
        >
          <Text style={{ fontWeight: "800", color: "#0F172A" }}>MENÚ PRINCIPAL</Text>
        </Pressable>

        <Pressable
          onPress={onLogout}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: "#ef4444",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>SALIR</Text>
        </Pressable>
      </View>
    </View>
  );
}