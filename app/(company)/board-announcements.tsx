// app/(company)/board-announcements.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { openUploadedFile, pickAndUploadFile } from "../../lib/attachments";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";

const ui = {
  bg: "#FBF1E1",
  bgSoft: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
  danger: "#DC2626",
};

type AnnouncementStatus = "ACTIVE" | "ARCHIVED";

type Announcement = {
  id: string;
  title: string;
  body: string;
  attachmentFileId?: string;
  attachmentFileName?: string;
  publishedBy?: string;
  status: AnnouncementStatus;
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

function PillButton({
  label,
  onPress,
  disabled,
  tone = "primary",
  size = "md",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
}) {
  const palette = {
    primary: { bg: "#1D4ED8", fg: "#F9FAFB" },
    secondary: { bg: "rgba(21,19,31,0.06)", fg: ui.text },
    danger: { bg: "#B91C1C", fg: "#F9FAFB" },
  } as const;
  const p = palette[tone];
  const pv = size === "sm" ? 7 : 9;
  const ph = size === "sm" ? 12 : 14;
  const fs = size === "sm" ? 11 : 13;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? ui.borderSoft : p.bg,
        paddingVertical: pv,
        paddingHorizontal: ph,
        borderRadius: 999,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: p.fg, fontSize: fs, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export default function BoardAnnouncementsScreen() {
  const router = useRouter();
  const { me, token } = useApp();
  const { boardId, orgId: orgIdParam, boardName } = useLocalSearchParams<{
    boardId: string;
    orgId: string;
    boardName?: string;
  }>();
  const orgId = String(orgIdParam || "");

  const myRole: Role = highestRoleInOrg(me, orgId);
  const canManage = myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR" || myRole === "SUPERADMIN";
  const canPublish = canManage || myRole === "OPERATIVO";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachmentFileId, setAttachmentFileId] = useState<string | null>(null);
  const [attachmentFileName, setAttachmentFileName] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!boardId) return;
    setMsg("");
    setLoading(true);
    try {
      const raw = await apiAuth(
        `/board/boards/${boardId}/announcements?includeArchived=${includeArchived}`,
        "GET"
      );
      const list: Announcement[] = (Array.isArray(raw) ? raw : []).map((a: any) => ({
        id: String(a.id),
        title: String(a.title ?? ""),
        body: String(a.body ?? ""),
        attachmentFileId: a.attachmentFileId ?? undefined,
        attachmentFileName: a.attachmentFileName ?? undefined,
        publishedBy: a.publishedBy,
        status: a.status,
        createdAt: a.createdAt,
      }));
      setAnnouncements(list);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId, includeArchived]);

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
    setShowCreate(true);
  };

  const publish = async () => {
    if (!canPublish) return;
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
      setShowCreate(false);
      await load();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async (id: string) => {
    if (!canManage) return;
    try {
      await apiAuth(`/board/announcements/${id}/archive`, "PATCH");
      setMsg("Comunicado archivado");
      await load();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: ui.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: ui.primary, fontSize: 14, fontWeight: "700" }}>← Volver</Text>
          </Pressable>
          <View>
            <Text style={{ color: ui.text, fontSize: 16, fontWeight: "800" }}>
              Comunicados {boardName ? `· ${boardName}` : ""}
            </Text>
            <Text style={{ color: ui.textMuted, fontSize: 11 }}>
              Publica avisos que verán los condóminos de esta colonia.
            </Text>
          </View>
        </View>
        {canPublish && (
          <PillButton
            label={showCreate ? "Ocultar" : "Publicar comunicado"}
            size="sm"
            onPress={() => {
              if (showCreate) resetForm();
              setShowCreate((s) => !s);
            }}
          />
        )}
      </View>

      {!!msg && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: ui.primary, fontSize: 12 }}>{msg}</Text>
        </View>
      )}

      {canPublish && showCreate && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: ui.border,
            backgroundColor: ui.bgSoft,
            gap: 8,
          }}
        >
          <Text style={{ color: ui.text, fontWeight: "800", fontSize: 13 }}>
            {editingId ? "Editar comunicado" : "Nuevo comunicado"}
          </Text>
          <TextInput
            placeholder="Título (ej. Corte de agua programado)"
            placeholderTextColor={ui.textMuted}
            value={title}
            onChangeText={setTitle}
            style={{
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: ui.text,
              fontSize: 13,
            }}
          />
          <TextInput
            placeholder="Mensaje"
            placeholderTextColor={ui.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            style={{
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              color: ui.text,
              fontSize: 13,
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />
          <Pressable
            onPress={pickAttachment}
            disabled={uploadingAttachment}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: attachmentFileId ? "#16A34A" : ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            {uploadingAttachment ? (
              <ActivityIndicator size="small" color={ui.primary} />
            ) : (
              <Text style={{ fontSize: 15 }}>📎</Text>
            )}
            <Text
              style={{
                color: attachmentFileId ? "#16A34A" : ui.textMuted,
                fontSize: 12,
                fontWeight: attachmentFileId ? "700" : "400",
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {uploadingAttachment
                ? "Subiendo…"
                : attachmentFileId
                ? attachmentFileName ?? "Archivo adjuntado"
                : "Adjuntar imagen, PDF o Word (opcional)"}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton
              label={submitting ? "Guardando…" : editingId ? "Guardar cambios" : "Publicar"}
              size="sm"
              onPress={publish}
              disabled={submitting}
            />
            <PillButton
              label="Cancelar"
              tone="secondary"
              size="sm"
              onPress={() => {
                resetForm();
                setShowCreate(false);
              }}
            />
          </View>
        </View>
      )}

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable onPress={() => setIncludeArchived((v) => !v)}>
          <Text style={{ color: includeArchived ? ui.primary : ui.textMuted, fontSize: 12, fontWeight: "600" }}>
            {includeArchived ? "✓ Mostrando archivados" : "Mostrar archivados"}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={ui.primary} />
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <Text style={{ color: ui.textMuted, textAlign: "center", marginTop: 24 }}>
              No hay comunicados publicados todavía.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                borderWidth: 1,
                borderColor: ui.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: ui.bgSoft,
                gap: 6,
                opacity: item.status === "ARCHIVED" ? 0.55 : 1,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ color: ui.text, fontWeight: "800", fontSize: 14, flex: 1 }}>{item.title}</Text>
                {item.status === "ARCHIVED" && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: "rgba(21,19,31,0.06)",
                    }}
                  >
                    <Text style={{ color: ui.textMuted, fontSize: 10, fontWeight: "800" }}>ARCHIVADO</Text>
                  </View>
                )}
              </View>
              {!!item.body && <Text style={{ color: ui.text, fontSize: 13 }}>{item.body}</Text>}
              {!!item.attachmentFileId && (
                <Pressable onPress={() => openAttachment(item.attachmentFileId!)}>
                  <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
                    📎 {item.attachmentFileName ?? "Ver archivo adjunto"}
                  </Text>
                </Pressable>
              )}
              <Text style={{ color: ui.textMuted, fontSize: 11 }}>{fmtDate(item.createdAt)}</Text>
              {canPublish && item.status === "ACTIVE" && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <PillButton label="Editar" tone="secondary" size="sm" onPress={() => startEdit(item)} />
                  {canManage && (
                    <PillButton label="Archivar" tone="danger" size="sm" onPress={() => archive(item.id)} />
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
