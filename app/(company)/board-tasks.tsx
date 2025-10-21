// app/(company)/board-tasks.tsx
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View
} from "react-native";
import { apiAuth } from "../../lib/api";
import { Role, highestRoleInOrg, isSelf } from "../../lib/rbac";
import { useApp } from "../../lib/store";

/* ======================= Tipos ======================= */
type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
type Task = {
  id: string;
  orgId: string;
  boardId: string;
  title: string;
  description?: string;
  assigneeId?: string;
  status: TaskStatus;
  createdAt?: string;
  updatedAt?: string;
};

type Member = { id: string; fullName?: string; email: string };

/* ======================= Pantalla ======================= */
export default function BoardTasks() {
  const router = useRouter();
  const { me, logout } = useApp();
  const params = useLocalSearchParams<{ boardId?: string; orgId?: string; boardName?: string }>();
  const boardId = params.boardId ? String(params.boardId) : "";
  const orgId = params.orgId ? String(params.orgId) : "";
  const boardName = params.boardName ? String(params.boardName) : "";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // create/edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");

  // members
  const [members, setMembers] = useState<Member[]>([]);
  const [membersMsg, setMembersMsg] = useState("");

  // RBAC
  const myRole: Role = useMemo(() => highestRoleInOrg(me, orgId), [me, orgId]);

  const canCrudTasks =
    myRole === "SUPERADMIN" || myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR";
  const canHardDelete = myRole === "SUPERADMIN" || myRole === "ADMINISTRADOR";
  const canArchive = canCrudTasks;
  const canReassign = canCrudTasks;

  const canOperativeEditOwn = (t: Task) => myRole === "OPERATIVO" && isSelf(me, t.assigneeId);
  const canEditTask = (t: Task) => canCrudTasks || canOperativeEditOwn(t);
  const canChangeStatus = (t: Task) => canCrudTasks || canOperativeEditOwn(t);

  /* ---------- helpers ---------- */
  const memberById = useMemo(() => new Map(members.map((m) => [String(m.id), m])), [members]);
  const displayAssignee = (id?: string) => {
    if (!id) return "—";
    const m = memberById.get(id);
    return m ? `${m.fullName || m.email}` : id;
  };

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

  /* ---------- cargar miembros ---------- */
  useEffect(() => {
    async function loadMembers() {
      setMembersMsg("");
      setMembers([]);
      if (!orgId) return;
      try {
        const raw = await apiAuth(
          `/user/users?orgId=${encodeURIComponent(orgId)}&status=ACTIVE`,
          "GET"
        );
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        const arr: Member[] = list.map((u: any) => ({
          id: String(u.id ?? u._id),
          fullName: u.fullName,
          email: u.email,
        }));
        setMembers(arr);
      } catch (e: any) {
        setMembersMsg(e.message ?? String(e));
      }
    }
    loadMembers();
  }, [orgId]);

  /* ---------- guard sin params ---------- */
  if (!boardId || !orgId) {
    return (
      <View style={{ padding: 16 }}>
        <TopBar meEmail={me?.email} onLogout={logout} />
        <SubHeader title="Tareas" right={<PillButton label="Volver" onPress={() => router.back()} />} />
        <Text style={{ marginTop: 8 }}>
          Abre esta pantalla desde un condominio/board para ver sus tareas.
        </Text>
      </View>
    );
  }

  /* ---------- data ---------- */
  async function loadTasks() {
    setMsg("");
    setLoading(true);
    try {
      const qs = `?page=0&size=1000&includeArchived=false`;
      const raw = await apiAuth(
        `/board/boards/${encodeURIComponent(boardId)}/tasks${qs}`,
        "GET"
      );
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];
      const arr: Task[] = list.map((x: any) => ({
        id: x.id ?? x.taskId ?? x._id,
        orgId: String(x.orgId),
        boardId: String(x.boardId),
        title: String(x.title),
        description: x.description,
        assigneeId: x.assigneeId ? String(x.assigneeId) : undefined,
        status: x.status as TaskStatus,
        createdAt: x.createdAt,
        updatedAt: x.updatedAt,
      }));
      setTasks(arr);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadTasks();
  }, [boardId]);

  /* ---------- actions ---------- */
  async function createTask() {
    if (!canCrudTasks) {
      setMsg("No tienes permisos para crear tareas.");
      return;
    }
    const body = {
      orgId,
      boardId,
      title: title.trim(),
      description: desc.trim() || undefined,
      assigneeId: assigneeId || undefined,
    };
    if (!body.title) {
      setMsg("Título requerido");
      return;
    }
    try {
      await apiAuth(`/board/boards/${encodeURIComponent(boardId)}/tasks`, "POST", body);
      setTitle("");
      setDesc("");
      setAssigneeId("");
      await loadTasks();
      setMsg("Tarea creada ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }

  async function updateTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || !canEditTask(t)) {
      setMsg("No tienes permisos para editar esta tarea.");
      return;
    }
    try {
      const payload: any = { title: title.trim(), description: desc.trim() || undefined };
      if (canReassign) payload.assigneeId = assigneeId || undefined;
      await apiAuth(`/board/boards/tasks/${id}`, "PUT", payload);
      setEditingId(null);
      setTitle("");
      setDesc("");
      setAssigneeId("");
      await loadTasks();
      setMsg("Tarea actualizada ✅");
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }

  async function changeStatus(id: string, status: TaskStatus) {
    const t = tasks.find((x) => x.id === id);
    if (!t || !canChangeStatus(t)) {
      setMsg("No puedes cambiar el estado de esta tarea.");
      return;
    }
    try {
      await apiAuth(
        `/board/boards/tasks/${id}/status?status=${encodeURIComponent(status)}`,
        "PATCH"
      );
      await loadTasks();
      setMsg(`Estado: ${status} ✅`);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }

  async function archiveTask(id: string) {
    if (!canArchive) {
      setMsg("No puedes archivar esta tarea.");
      return;
    }
    await changeStatus(id, "ARCHIVED");
  }

  async function deleteTask(id: string) {
    if (!canHardDelete) {
      setMsg("No puedes eliminar definitivamente esta tarea.");
      return;
    }
    const go = async () => {
      try {
        await apiAuth(`/board/boards/tasks/${id}`, "DELETE");
        await loadTasks();
        setMsg("Tarea eliminada ❌");
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      }
    };
    if (Platform.OS === "web") {
      if (confirm("¿Eliminar definitivamente?")) await go();
    } else {
      Alert.alert("Confirmar", "¿Eliminar definitivamente?", [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: go },
      ]);
    }
  }

  /* ---------- estilos base ---------- */
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

  /* ---------- UI ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFB" }}>
      {/* TOP BAR */}
      <TopBar meEmail={me?.email} onLogout={logout} />

      {/* SUB HEADER */}
      <SubHeader
        title={`Tareas — ${boardName || boardId}`}
        right={<PillButton label="Volver" onPress={() => router.back()} />}
      />

      {/* SCROLL PRINCIPAL */}
      <View style={{ flex: 1, minHeight: 0 }}>
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          data={tasks}
          refreshing={loading}
          onRefresh={loadTasks}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              {!!msg && (
                <Banner
                  text={msg}
                  tone={msg.includes("✅") ? "success" : "error"}
                />
              )}

              {/* Crear (Supervisor↑) */}
              {canCrudTasks && (
                <View style={{ ...card, gap: 8 }}>
                  <Text style={{ fontWeight: "800" }}>Nueva tarea</Text>
                  <TextInput
                    placeholder="Título"
                    value={title}
                    onChangeText={setTitle}
                    style={input}
                  />
                  <TextInput
                    placeholder="Descripción (opcional)"
                    value={desc}
                    onChangeText={setDesc}
                    style={input}
                  />

                  {/* Responsable */}
                  {canReassign && (
                    <AssigneeSelector
                      assigneeId={assigneeId}
                      setAssigneeId={setAssigneeId}
                      members={members}
                      membersMsg={membersMsg}
                    />
                  )}

                  <PillButton label="Crear" onPress={createTask} disabled={!title.trim()} />
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <Text style={{ color: "#777", paddingTop: 12 }}>
              {loading ? "Cargando..." : "Sin tareas."}
            </Text>
          }
          renderItem={({ item: t }) => {
            const iCanEdit = canEditTask(t);
            const iCanChangeStatus = canChangeStatus(t);
            return (
              <Pressable
                style={{
                  ...card,
                  marginTop: 10,
                  gap: 8,
                }}
              >
                {editingId === t.id ? (
                  <>
                    <Text style={{ fontWeight: "800" }}>Editar tarea</Text>
                    <TextInput
                      placeholder="Título"
                      value={title}
                      onChangeText={setTitle}
                      style={input}
                    />
                    <TextInput
                      placeholder="Descripción"
                      value={desc}
                      onChangeText={setDesc}
                      style={input}
                    />
                    {canReassign && (
                      <AssigneeSelector
                        assigneeId={assigneeId}
                        setAssigneeId={setAssigneeId}
                        members={members}
                        membersMsg={membersMsg}
                      />
                    )}
                    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                      <PillButton label="Guardar" onPress={() => updateTask(t.id)} />
                      <PillButton
                        label="Cancelar"
                        tone="secondary"
                        onPress={() => {
                          setEditingId(null);
                          setTitle("");
                          setDesc("");
                          setAssigneeId("");
                        }}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    {/* Header item */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontWeight: "800", fontSize: 16 }}>
                        {t.title}
                      </Text>
                      <StatusBadge status={t.status} />
                    </View>

                    {/* Meta */}
                    {!!t.description && (
                      <Text style={{ color: "#475569" }}>{t.description}</Text>
                    )}
                    {!!t.assigneeId && (
                      <Text style={{ color: "#64748B" }}>
                        Responsable: {displayAssignee(t.assigneeId)}
                      </Text>
                    )}
                    <Text style={{ color: "#94A3B8", fontSize: 12 }}>
                      Creado: {fmt(t.createdAt)} · Actualizado: {fmt(t.updatedAt)}
                    </Text>

                    {/* Acciones */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                      {iCanEdit && (
                        <PillButton
                          label="Editar"
                          tone="secondary"
                          onPress={() => {
                            setEditingId(t.id);
                            setTitle(t.title);
                            setDesc(t.description ?? "");
                            setAssigneeId(t.assigneeId ?? "");
                          }}
                        />
                      )}
                      {iCanChangeStatus && t.status !== "IN_PROGRESS" && (
                        <PillButton
                          label="En progreso"
                          onPress={() => changeStatus(t.id, "IN_PROGRESS")}
                        />
                      )}
                      {iCanChangeStatus && t.status !== "DONE" && (
                        <PillButton
                          label="Completar"
                          onPress={() => changeStatus(t.id, "DONE")}
                        />
                      )}
                      {canArchive && t.status !== "ARCHIVED" && (
                        <PillButton
                          label="Archivar"
                          tone="warning"
                          onPress={() => archiveTask(t.id)}
                        />
                      )}
                      {canHardDelete && (
                        <PillButton
                          label="Eliminar"
                          tone="danger"
                          onPress={() => deleteTask(t.id)}
                        />
                      )}
                    </View>
                  </>
                )}
              </Pressable>
            );
          }}
          ListFooterComponent={<View style={{ height: 60 }} />}
        />
      </View>
    </View>
  );
}

/* ======================= UI helpers ======================= */

function TopBar({ meEmail, onLogout }: { meEmail?: string; onLogout: () => void }) {
  return (
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
        {!!meEmail && (
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
            {meEmail}
          </Text>
        )}
        <PillButton label="Salir" tone="danger" onPress={onLogout} />
      </View>
    </View>
  );
}

function SubHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
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
      <Text style={{ fontSize: 18, fontWeight: "800" }}>{title}</Text>
      {right}
    </View>
  );
}

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
      <Text style={{ color: p.fg, fontWeight: "800" }}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

function Banner({ text, tone = "info" }: { text: string; tone?: "info" | "success" | "error" }) {
  const map = {
    info: { bg: "#EFF6FF", bd: "#DBEAFE", fg: "#1E40AF" },
    success: { bg: "#ECFDF5", bd: "#D1FAE5", fg: "#065F46" },
    error: { bg: "#FEF2F2", bd: "#FECACA", fg: "#991B1B" },
  } as const;
  const p = map[tone];
  return (
    <View style={{ padding: 10, borderRadius: 12, backgroundColor: p.bg, borderWidth: 1, borderColor: p.bd }}>
      <Text style={{ color: p.fg }}>{text}</Text>
    </View>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, { bg: string; fg: string }> = {
    OPEN: { bg: "#E6F4FF", fg: "#0958D9" },
    IN_PROGRESS: { bg: "#FFF4E5", fg: "#B25E09" },
    DONE: { bg: "#E6FFED", fg: "#136F3A" },
    ARCHIVED: { bg: "#F1F5F9", fg: "#0F172A" },
  };
  const p = map[status];
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: p.bg }}>
      <Text style={{ color: p.fg, fontWeight: "800", fontSize: 12 }}>{status}</Text>
    </View>
  );
}

function AssigneeSelector({
  assigneeId,
  setAssigneeId,
  members,
  membersMsg,
}: {
  assigneeId: string;
  setAssigneeId: (v: string) => void;
  members: Member[];
  membersMsg?: string;
}) {
  if (Platform.OS === "web") {
    return (
      <View style={{ marginBottom: 4 }}>
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>Responsable</Text>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.currentTarget.value)}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #E5E7EB" as any }}
        >
          <option value="">— Sin responsable —</option>
          {members.map((m) => (
            <option key={m.id} value={String(m.id)}>
              {(m.fullName || m.email) + " · " + m.email}
            </option>
          ))}
        </select>
        {!!membersMsg && <Text style={{ color: "red", marginTop: 4 }}>{membersMsg}</Text>}
      </View>
    );
  }
  // Nativo
  return (
    <View style={{ borderWidth: 1, borderRadius: 10, borderColor: "#E5E7EB" }}>
      <Picker selectedValue={assigneeId} onValueChange={(val) => setAssigneeId(String(val))}>
        <Picker.Item label="— Sin responsable —" value="" />
        {members.map((m) => (
          <Picker.Item
            key={m.id}
            label={`${m.fullName || m.email} · ${m.email}`}
            value={String(m.id)}
          />
        ))}
      </Picker>
    </View>
  );
}