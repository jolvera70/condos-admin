// app/(company)/board-expenses.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

type ExpenseStatus = "ACTIVE" | "CANCELLED";
type ExpenseCategory = "SERVICES" | "SUPPLIERS" | "PAYROLL" | "MAINTENANCE" | "INSURANCE" | "OTHER";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "CHECK" | "OTHER";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  SERVICES: "Servicios",
  SUPPLIERS: "Proveedores",
  PAYROLL: "Nómina",
  MAINTENANCE: "Mantenimiento",
  INSURANCE: "Seguros",
  OTHER: "Otro",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
  CHECK: "Cheque",
  OTHER: "Otro",
};

type Expense = {
  id: string;
  concept: string;
  category: ExpenseCategory;
  providerName?: string;
  amount: number;
  method: PaymentMethod;
  expenseDate: string;
  receiptFileId?: string;
  receiptFileName?: string;
  notes?: string;
  registeredBy?: string;
  status: ExpenseStatus;
  createdAt?: string;
};

function fmtMoney(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-MX");
  } catch {
    return s;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function ChipPicker<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: active ? ui.primary : ui.bg,
              borderWidth: 1,
              borderColor: active ? ui.primary : ui.border,
            }}
          >
            <Text style={{ color: active ? "#fff" : ui.text, fontSize: 11, fontWeight: "700" }}>
              {labels[o]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const input = {
  backgroundColor: ui.bg,
  borderWidth: 1,
  borderColor: ui.border,
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  color: ui.text,
  fontSize: 13,
} as const;

export default function BoardExpensesScreen() {
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
  const canRegister = canManage || myRole === "OPERATIVO";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [period, setPeriod] = useState(todayISO().slice(0, 7));

  const [showCreate, setShowCreate] = useState(false);
  const [concept, setConcept] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("SERVICES");
  const [providerName, setProviderName] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [receiptFileId, setReceiptFileId] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!boardId) return;
    setMsg("");
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        orgId,
        includeCancelled: String(includeCancelled),
        ...(period ? { period } : {}),
      });
      const raw = await apiAuth(`/billing/boards/${boardId}/expenses?${qs.toString()}`, "GET");
      const content = Array.isArray(raw) ? raw : raw?.content ?? [];
      const list: Expense[] = content.map((e: any) => ({
        id: String(e.id),
        concept: String(e.concept ?? ""),
        category: e.category,
        providerName: e.providerName ?? undefined,
        amount: Number(e.amount ?? 0),
        method: e.method,
        expenseDate: e.expenseDate,
        receiptFileId: e.receiptFileId ?? undefined,
        receiptFileName: e.receiptFileName ?? undefined,
        notes: e.notes ?? undefined,
        registeredBy: e.registeredBy,
        status: e.status,
        createdAt: e.createdAt,
      }));
      setExpenses(list);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, includeCancelled, period]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(
    () => expenses.filter((e) => e.status === "ACTIVE").reduce((acc, e) => acc + e.amount, 0),
    [expenses]
  );

  const pickReceipt = async () => {
    setUploadingReceipt(true);
    setMsg("");
    try {
      const uploaded = await pickAndUploadFile(`expenses/${orgId}/${boardId}`, token);
      if (!uploaded) return;
      setReceiptFileId(uploaded.fileId);
      setReceiptFileName(uploaded.fileName);
    } catch (e: any) {
      setMsg("Error subiendo archivo: " + (e.message ?? String(e)));
    } finally {
      setUploadingReceipt(false);
    }
  };

  const openReceipt = async (fileId: string) => {
    try {
      await openUploadedFile(fileId, token);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const resetForm = () => {
    setConcept("");
    setCategory("SERVICES");
    setProviderName("");
    setAmount("");
    setMethod("TRANSFER");
    setExpenseDate(todayISO());
    setNotes("");
    setReceiptFileId(null);
    setReceiptFileName(null);
  };

  const register = async () => {
    if (!canRegister) return;
    if (!concept.trim()) {
      setMsg("Escribe el concepto del egreso");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMsg("Indica un monto válido");
      return;
    }
    if (!expenseDate) {
      setMsg("Indica la fecha del egreso");
      return;
    }
    setSubmitting(true);
    try {
      await apiAuth(`/billing/boards/${boardId}/expenses?orgId=${orgId}`, "POST", {
        concept: concept.trim(),
        category,
        providerName: providerName.trim() || undefined,
        amount: amt,
        method,
        expenseDate,
        receiptFileId: receiptFileId ?? undefined,
        receiptFileName: receiptFileName ?? undefined,
        notes: notes.trim() || undefined,
      });
      resetForm();
      setShowCreate(false);
      setMsg("Egreso registrado ✅");
      await load();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelExpense = async (id: string) => {
    if (!canManage) return;
    try {
      await apiAuth(`/billing/expenses/${id}/cancel`, "PATCH");
      setMsg("Egreso cancelado");
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
              Egresos {boardName ? `· ${boardName}` : ""}
            </Text>
            <Text style={{ color: ui.textMuted, fontSize: 11 }}>
              Registra pagos a proveedores y servicios de esta colonia.
            </Text>
          </View>
        </View>
        {canRegister && (
          <PillButton
            label={showCreate ? "Ocultar" : "Registrar egreso"}
            size="sm"
            onPress={() => setShowCreate((s) => !s)}
          />
        )}
      </View>

      {!!msg && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: ui.primary, fontSize: 12 }}>{msg}</Text>
        </View>
      )}

      {canRegister && showCreate && (
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
          <TextInput
            placeholder="Concepto (ej. Mantenimiento de elevador)"
            placeholderTextColor={ui.textMuted}
            value={concept}
            onChangeText={setConcept}
            style={input}
          />
          <Text style={{ color: ui.textMuted, fontSize: 11, fontWeight: "700" }}>Categoría</Text>
          <ChipPicker
            value={category}
            options={["SERVICES", "SUPPLIERS", "PAYROLL", "MAINTENANCE", "INSURANCE", "OTHER"]}
            labels={CATEGORY_LABEL}
            onChange={setCategory}
          />
          <TextInput
            placeholder="Proveedor (opcional)"
            placeholderTextColor={ui.textMuted}
            value={providerName}
            onChangeText={setProviderName}
            style={input}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Monto"
              placeholderTextColor={ui.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              style={[input, { flex: 1 }]}
            />
            <TextInput
              placeholder="AAAA-MM-DD"
              placeholderTextColor={ui.textMuted}
              value={expenseDate}
              onChangeText={setExpenseDate}
              style={[input, { flex: 1 }]}
            />
          </View>
          <Text style={{ color: ui.textMuted, fontSize: 11, fontWeight: "700" }}>Método de pago</Text>
          <ChipPicker
            value={method}
            options={["CASH", "TRANSFER", "CARD", "CHECK", "OTHER"]}
            labels={METHOD_LABEL}
            onChange={setMethod}
          />
          <TextInput
            placeholder="Notas (opcional)"
            placeholderTextColor={ui.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            style={[input, { minHeight: 60, textAlignVertical: "top" }]}
          />
          <Pressable
            onPress={pickReceipt}
            disabled={uploadingReceipt}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: ui.bg,
              borderWidth: 1,
              borderColor: receiptFileId ? "#16A34A" : ui.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            {uploadingReceipt ? (
              <ActivityIndicator size="small" color={ui.primary} />
            ) : (
              <Text style={{ fontSize: 15 }}>📎</Text>
            )}
            <Text
              style={{
                color: receiptFileId ? "#16A34A" : ui.textMuted,
                fontSize: 12,
                fontWeight: receiptFileId ? "700" : "400",
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {uploadingReceipt
                ? "Subiendo…"
                : receiptFileId
                ? receiptFileName ?? "Comprobante adjuntado"
                : "Adjuntar factura o comprobante (opcional)"}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PillButton label={submitting ? "Guardando…" : "Registrar"} size="sm" onPress={register} disabled={submitting} />
            <PillButton label="Cancelar" tone="secondary" size="sm" onPress={() => setShowCreate(false)} />
          </View>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingTop: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            placeholder="AAAA-MM"
            placeholderTextColor={ui.textMuted}
            value={period}
            onChangeText={setPeriod}
            style={[input, { width: 100 }]}
          />
          <Pressable onPress={() => setIncludeCancelled((v) => !v)}>
            <Text style={{ color: includeCancelled ? ui.primary : ui.textMuted, fontSize: 12, fontWeight: "600" }}>
              {includeCancelled ? "✓ Mostrando cancelados" : "Mostrar cancelados"}
            </Text>
          </Pressable>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: ui.primarySoft,
          }}
        >
          <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "800" }}>
            Total: {fmtMoney(total)}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={ui.primary} />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={
            <Text style={{ color: ui.textMuted, textAlign: "center", marginTop: 24 }}>
              No hay egresos registrados en este periodo.
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
                opacity: item.status === "CANCELLED" ? 0.55 : 1,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={{ color: ui.text, fontWeight: "800", fontSize: 14, flex: 1 }}>{item.concept}</Text>
                <Text style={{ color: ui.text, fontWeight: "800", fontSize: 14 }}>{fmtMoney(item.amount)}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Text style={{ color: ui.textMuted, fontSize: 11 }}>{CATEGORY_LABEL[item.category]}</Text>
                <Text style={{ color: ui.textMuted, fontSize: 11 }}>· {METHOD_LABEL[item.method]}</Text>
                {!!item.providerName && <Text style={{ color: ui.textMuted, fontSize: 11 }}>· {item.providerName}</Text>}
                <Text style={{ color: ui.textMuted, fontSize: 11 }}>· {fmtDate(item.expenseDate)}</Text>
                {item.status === "CANCELLED" && (
                  <Text style={{ color: ui.danger, fontSize: 11, fontWeight: "800" }}>CANCELADO</Text>
                )}
              </View>
              {!!item.notes && <Text style={{ color: ui.text, fontSize: 12 }}>{item.notes}</Text>}
              {!!item.receiptFileId && (
                <Pressable onPress={() => openReceipt(item.receiptFileId!)}>
                  <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
                    📎 {item.receiptFileName ?? "Ver comprobante"}
                  </Text>
                </Pressable>
              )}
              {canManage && item.status === "ACTIVE" && (
                <View style={{ flexDirection: "row", marginTop: 4 }}>
                  <PillButton label="Cancelar" tone="danger" size="sm" onPress={() => cancelExpense(item.id)} />
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
