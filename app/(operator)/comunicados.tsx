// app/(operator)/comunicados.tsx
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
import { openUploadedFile, pickAndUploadFile } from "../../lib/attachments";
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
type Announcement = {
  id: string;
  title: string;
  body: string;
  attachmentFileId?: string;
  attachmentFileName?: string;
  status: string;
  createdAt?: string;
};

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-MX");
  } catch {
    return s;
  }
}

export default function ComunicadosOperador() {
  const { me, token } = useApp();
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [loadingBoards, setLoadingBoards] = useState(true);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachmentFileId, setAttachmentFileId] = useState<string | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoadingBoards(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    setMsg("");
    try {
      const raw = await apiAuth(`/board/boards/${boardId}/announcements`, "GET");
      const list: Announcement[] = (Array.isArray(raw) ? raw : []).map((a: any) => ({
        id: String(a.id),
        title: String(a.title ?? ""),
        body: String(a.body ?? ""),
        attachmentFileId: a.attachmentFileId ?? undefined,
        attachmentFileName: a.attachmentFileName ?? undefined,
        status: a.status,
        createdAt: a.createdAt,
      }));
      setAnnouncements(list);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  const pickAttachment = async () => {
    setUploadingAttachment(true);
    setMsg("");
    try {
      const uploaded = await pickAndUploadFile(`announcements/${orgId}/${boardId}`, token);
      if (!uploaded) return;
      setAttachmentFileId(uploaded.fileId);
      setAttachmentFileName(uploaded.fileName);
    } catch (e: any) {
      setMsg("Error subiendo archivo: " + (e.message ?? String(e)));
    } finally {
      setUploadingAttachment(false);
    }
  };

  const openAttachment = async (fileId: string) => {
    try {
      await openUploadedFile(fileId, token);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setAttachmentFileId(null);
    setAttachmentFileName(null);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setBody(a.body ?? "");
    setAttachmentFileId(a.attachmentFileId ?? null);
    setAttachmentFileName(a.attachmentFileName ?? null);
    setMsg("");
  };

  const publish = async () => {
    setMsg("");
    if (!title.trim()) {
      setMsg("Escribe un título");
      return;
    }
    if (!body.trim() && !attachmentFileId) {
      setMsg("Escribe un mensaje o adjunta un archivo");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim() || undefined,
        attachmentFileId: attachmentFileId ?? undefined,
        attachmentFileName: attachmentFileName ?? undefined,
      };
      if (editingId) {
        await apiAuth(`/board/announcements/${editingId}`, "PATCH", payload);
        setMsg("Comunicado actualizado ✅");
      } else {
        await apiAuth(`/board/boards/${boardId}/announcements`, "POST", payload);
        setMsg("Comunicado publicado ✅");
      }
      resetForm();
      await load();
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
            <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text }}>Comunicados</Text>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Publica avisos para los condóminos de una colonia.
            </Text>
          </View>
        </View>

        {!!msg && (
          <Card tone={msg.includes("✅") ? "default" : "danger"}>
            <Text style={{ color: msg.includes("✅") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
          </Card>
        )}

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14 }}>
            {editingId ? "Editar comunicado" : "Nuevo comunicado"}
          </Text>
          <Field label="Colonia">
            {loadingBoards ? (
              <ActivityIndicator color={ui.primary} />
            ) : (
              <Select value={boardId} onChange={setBoardId} options={boards.map((b) => ({ label: b.name, value: b.id }))} />
            )}
          </Field>

          <Field label="Título">
            <TextInput
              placeholder="Ej. Corte de agua programado"
              placeholderTextColor={ui.textMuted}
              value={title}
              onChangeText={setTitle}
              style={inputStyle}
            />
          </Field>

          <Field label="Mensaje">
            <TextInput
              placeholder="Detalles del aviso…"
              placeholderTextColor={ui.textMuted}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={4}
              style={[inputStyle, { minHeight: 90, textAlignVertical: "top" }]}
            />
          </Field>

          <Field label="Archivo adjunto (opcional)">
            <Pressable
              onPress={pickAttachment}
              disabled={uploadingAttachment}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: ui.bg,
                borderWidth: 1,
                borderColor: attachmentFileId ? ui.success : ui.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
              }}
            >
              {uploadingAttachment ? (
                <ActivityIndicator size="small" color={ui.primary} />
              ) : (
                <Text style={{ fontSize: 16 }}>📎</Text>
              )}
              <Text
                style={{
                  color: attachmentFileId ? ui.success : ui.textMuted,
                  fontSize: 13,
                  fontWeight: attachmentFileId ? "700" : "400",
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {uploadingAttachment
                  ? "Subiendo…"
                  : attachmentFileId
                  ? attachmentFileName ?? "Archivo adjuntado"
                  : "Adjuntar imagen, PDF o Word"}
              </Text>
            </Pressable>
          </Field>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={publish}
              disabled={submitting}
              style={{
                flex: 1,
                backgroundColor: submitting ? ui.borderSoft : ui.primary,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                {submitting ? "Guardando…" : editingId ? "Guardar cambios" : "Publicar comunicado"}
              </Text>
            </Pressable>
            {editingId && (
              <Pressable
                onPress={resetForm}
                disabled={submitting}
                style={{
                  backgroundColor: ui.borderSoft,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <Text style={{ color: ui.text, fontWeight: "700", fontSize: 14 }}>Cancelar</Text>
              </Pressable>
            )}
          </View>
        </Card>

        <Card>
          <Text style={{ fontWeight: "800", color: ui.text, fontSize: 14, marginBottom: 8 }}>
            Comunicados de esta colonia
          </Text>
          {loading ? (
            <ActivityIndicator color={ui.primary} />
          ) : announcements.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>Todavía no hay comunicados.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {announcements.map((a) => (
                <View
                  key={a.id}
                  style={{
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    padding: 10,
                    gap: 2,
                  }}
                >
                  <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{a.title}</Text>
                  {!!a.body && <Text style={{ color: ui.text, fontSize: 12 }}>{a.body}</Text>}
                  {!!a.attachmentFileId && (
                    <Pressable onPress={() => openAttachment(a.attachmentFileId!)}>
                      <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
                        📎 {a.attachmentFileName ?? "Ver archivo adjunto"}
                      </Text>
                    </Pressable>
                  )}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <Text style={{ color: ui.textMuted, fontSize: 11 }}>{fmtDate(a.createdAt)}</Text>
                    {a.status === "ACTIVE" && (
                      <Pressable onPress={() => startEdit(a)}>
                        <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>Editar</Text>
                      </Pressable>
                    )}
                  </View>
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
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
