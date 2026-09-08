// lib/taskAttachments.ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { apiAuth, BASE } from "./api";

export type PickedEvidence = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  webFile?: File;
};

export type TaskAttachment = {
  id: string;
  key: string;
  contentType: string;
  size: number;
  url: string;
};

/** Abre el selector de imágenes (foto/evidencia) sin subirla todavía — se sube hasta que exista la tarea. */
export async function pickEvidence(): Promise<PickedEvidence | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["image/*"],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const f = res.assets[0];
  return {
    uri: f.uri,
    name: f.name ?? "foto.jpg",
    mimeType: f.mimeType ?? "image/jpeg",
    size: f.size ?? 0,
    webFile: (f as any).file as File | undefined,
  };
}

/**
 * Sube una evidencia ya elegida a una tarea existente: presign -> PUT del
 * binario -> complete (registra el adjunto en Mongo, igual que el Kanban
 * de tareas en (ops)/tasks.tsx).
 */
export async function uploadEvidence(
  boardId: string,
  taskId: string,
  file: PickedEvidence,
  token: string | null | undefined
): Promise<TaskAttachment> {
  const presign = await apiAuth(`/board/${boardId}/tasks/${taskId}/attachments/presign`, "POST", {
    contentType: file.mimeType,
    size: file.size,
  });
  const key = String(presign.key);
  const uploadUrl = String(presign.uploadUrl);

  if (Platform.OS === "web") {
    if (!file.webFile) throw new Error("No se pudo leer el archivo seleccionado (web).");
    const resp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.mimeType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file.webFile,
    });
    if (!resp.ok) throw new Error(`Subida falló: ${resp.status}`);
  } else {
    const result = await FileSystem.uploadAsync(uploadUrl, file.uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "Content-Type": file.mimeType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Subida falló: ${result.status}`);
    }
  }

  const completed = await apiAuth(`/board/${boardId}/tasks/${taskId}/attachments/complete`, "POST", {
    key,
    contentType: file.mimeType,
    size: file.size,
  });

  return {
    id: String(completed.id),
    key: String(completed.key),
    contentType: String(completed.contentType),
    size: Number(completed.size ?? 0),
    url: String(completed.url ?? `${BASE}/files/${key}`),
  };
}
