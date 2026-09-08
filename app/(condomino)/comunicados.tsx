// app/(condomino)/comunicados.tsx
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { apiAuth } from "../../lib/api";
import { openUploadedFile } from "../../lib/attachments";
import { useMyUnits } from "../../lib/condomino";
import { useApp } from "../../lib/store";

const ui = {
  bg: "#FBF1E1",
  surface: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  text: "#2B2B33",
  textMuted: "#8A8A94",
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  attachmentFileId?: string;
  attachmentFileName?: string;
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

export default function ComunicadosCondomino() {
  const { token } = useApp();
  const { units, loading: unitsLoading } = useMyUnits();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (unitsLoading) return;
    const boardIds = [...new Set(units.map((u) => u.boardId))];
    if (boardIds.length === 0) return;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const results = await Promise.all(
          boardIds.map((bid) =>
            apiAuth(`/board/boards/${bid}/announcements`, "GET").catch(() => [])
          )
        );
        const all: Announcement[] = results
          .flat()
          .map((a: any) => ({
            id: String(a.id),
            title: String(a.title ?? ""),
            body: String(a.body ?? ""),
            attachmentFileId: a.attachmentFileId ?? undefined,
            attachmentFileName: a.attachmentFileName ?? undefined,
            createdAt: a.createdAt,
          }))
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        setAnnouncements(all);
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [units, unitsLoading]);

  const busy = unitsLoading || loading;

  const openAttachment = async (fileId: string) => {
    try {
      await openUploadedFile(fileId, token);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
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
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text, marginBottom: 4 }}>
            Comunicados
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Avisos de la administración de tu colonia.
          </Text>
        </Card>

        {busy ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={ui.primary} />
          </View>
        ) : units.length === 0 ? (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>
              Todavía no tienes una unidad asignada. Contacta a la administración de tu condominio.
            </Text>
          </Card>
        ) : announcements.length === 0 ? (
          <Card>
            <Text style={{ color: ui.textMuted, fontSize: 13 }}>Todavía no hay comunicados.</Text>
          </Card>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <Text style={{ color: ui.text, fontSize: 15, fontWeight: "800", marginBottom: 4 }}>
                {a.title}
              </Text>
              {!!a.body && (
                <Text style={{ color: ui.text, fontSize: 13, marginBottom: 6 }}>{a.body}</Text>
              )}
              {!!a.attachmentFileId && (
                <Pressable onPress={() => openAttachment(a.attachmentFileId!)} style={{ marginBottom: 6 }}>
                  <Text style={{ color: ui.primary, fontSize: 13, fontWeight: "700" }}>
                    📎 {a.attachmentFileName ?? "Ver archivo adjunto"}
                  </Text>
                </Pressable>
              )}
              <Text style={{ color: ui.textMuted, fontSize: 11 }}>{fmtDate(a.createdAt)}</Text>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 16,
        padding: 16,
        backgroundColor: ui.surface,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.08)" } as any) : {}),
      }}
    >
      {children}
    </View>
  );
}
