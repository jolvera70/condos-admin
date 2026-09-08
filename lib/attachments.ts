// lib/attachments.ts
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { BASE } from "./api";

export type UploadedFile = {
  fileId: string; // key en el bucket de /files
  fileName: string;
  contentType: string;
};

/**
 * Abre el selector de archivos, sube el elegido a board-api (mismo endpoint
 * PUT /files/{key} que ya usa el comprobante de un pago) y regresa la
 * referencia para guardar junto con el recurso (comunicado, pago, etc.).
 * Regresa null si el usuario cancela el picker.
 */
export async function pickAndUploadFile(
  keyPrefix: string,
  token: string | null | undefined,
  types: string[] = ["image/*", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
): Promise<UploadedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;

  const f = res.assets[0];
  const mime = f.mimeType ?? "application/octet-stream";
  const safeName = (f.name ?? "archivo").replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${keyPrefix}/${Date.now()}-${safeName}`;
  const uploadUrl = `${BASE}/files/${key}`;

  if (Platform.OS === "web") {
    // expo-file-system (uploadAsync) no existe en web; en web,
    // expo-document-picker expone el archivo real del navegador en `f.file`.
    const webFile = (f as any).file as File | undefined;
    if (!webFile) throw new Error("No se pudo leer el archivo seleccionado (web).");

    const resp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: webFile,
    });
    if (!resp.ok) throw new Error(`Subida falló: ${resp.status}`);
  } else {
    const result = await FileSystem.uploadAsync(uploadUrl, f.uri, {
      httpMethod: "PUT",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "Content-Type": mime,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Subida falló: ${result.status}`);
    }
  }

  return { fileId: key, fileName: f.name ?? "archivo", contentType: mime };
}

/** Abre un archivo ya subido (solo web por ahora, igual que el comprobante de pagos). */
export async function openUploadedFile(fileId: string, token: string | null | undefined) {
  if (Platform.OS !== "web") {
    throw new Error("Ver archivos adjuntos desde móvil aún no está soportado, ábrelo desde la versión web.");
  }
  const url = `${BASE}/files/${fileId}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`No se pudo abrir el archivo (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank");
}
