// app/(operator)/egresos.tsx
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
import { pickAndUploadFile, openUploadedFile } from "../../lib/attachments";
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
type ExpenseCategory = "SERVICES" | "SUPPLIERS" | "PAYROLL" | "MAINTENANCE" | "INSURANCE" | "OTHER";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "CHECK" | "OTHER";
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
  status: "ACTIVE" | "CANCELLED";
};

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "SERVICES", label: "Servicios" },
  { value: "SUPPLIERS", label: "Proveedores" },
  { value: "PAYROLL", label: "Nómina" },
  { value: "MAINTENANCE", label: "Mantenimiento" },
  { value: "INSURANCE", label: "Seguros" },
  { value: "OTHER", label: "Otro" },
];

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
  { value: "CHECK", label: "Cheque" },
  { value: "OTHER", label: "Otro" },
];

function money(n?: number) {
  const v = typeof n === "number" ? n : 0;
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
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

export default function EgresosOperador() {
  const { me, token } = useApp();
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);

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

  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

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

  const loadExpenses = useCallback(async () => {
    if (!boardId) return;
    setLoadingExpenses(true);
    try {
      const raw = await apiAuth(
        `/billing/boards/${boardId}/expenses?orgId=${encodeURIComponent(orgId)}&size=50`,
        "GET"
      );
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];
      setExpenses(
        list.map((e: any) => ({
          id: String(e.id),
          concept: String(e.concept ?? ""),
          category: e.category,
          providerName: e.providerName ?? undefined,
          amount: Number(e.amount ?? 0),
          method: e.method,
          expenseDate: e.expenseDate,
          receiptFileId: e.receiptFileId ?? undefined,
          receiptFileName: e.receiptFileName ?? undefined,
          status: e.status,
        }))
      );
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoadingExpenses(false);
    }
  }, [boardId, orgId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const pickReceipt = async () => {
    if (!boardId) return;
    setUploadingReceipt(true);
    setMsg("");
    try {
      const uploaded = await pickAndUploadFile(`expenses/${orgId}/${boardId}`, token);
      if (!uploaded) return;
      setReceiptFileId(uploaded.fileId);
      setReceiptFileName(uploaded.fileName);
      setMsg("Comprobante adjuntado ✅");
    } catch (e: any) {
      setMsg("Error subiendo comprobante: " + (e.message ?? String(e)));
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

  const registrar = async () => {
    setMsg("");
    if (!concept.trim()) {
      setMsg("Escribe el concepto del egreso");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMsg("Escribe un monto válido");
      return;
    }
    setSubmitting(true);
    try {
      await apiAuth(`/billing/boards/${boardId}/expenses?orgId=${encodeURIComponent(orgId)}`, "POST", {
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
      setMsg("Egreso registrado ✅");
      setConcept("");
      setProviderName("");
      setAmount("");
      setNotes("");
      setReceiptFileId(null);
      setReceiptFileName(null);
      await loadExpenses();
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
        <Card>
          <Text style={{ fontSize: 18, fontWeight: "800", color: ui.text, marginBottom: 4 }}>
            Registrar egreso
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Registra pagos a proveedores y servicios de la colonia.
          </Text>
        </Card>

        {!!msg && (
          <Card tone={msg.includes("✅") ? "default" : "danger"}>
            <Text style={{ color: msg.includes("✅") ? ui.success : ui.danger, fontSize: 12 }}>{msg}</Text>
          </Card>
        )}

        <Card>
          <Field label="Colonia">
            {loadingBoards ? (
              <ActivityIndicator color={ui.primary} />
            ) : (
              <Select value={boardId} onChange={setBoardId} options={boards.map((b) => ({ label: b.name, value: b.id }))} />
            )}
          </Field>

          <Field label="Concepto">
            <TextInput
              placeholder="Ej. Mantenimiento de elevador"
              placeholderTextColor={ui.textMuted}
              value={concept}
              onChangeText={setConcept}
              style={inputStyle}
            />
          </Field>

          <Field label="Categoría">
            <Select value={category} onChange={(v) => setCategory(v as ExpenseCategory)} options={CATEGORIES} />
          </Field>

          <Field label="Proveedor (opcional)">
            <TextInput
              placeholder="Nombre del proveedor"
              placeholderTextColor={ui.textMuted}
              value={providerName}
              onChangeText={setProviderName}
              style={inputStyle}
            />
          </Field>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="Monto">
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={ui.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  style={inputStyle}
                />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Fecha">
                <TextInput
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={ui.textMuted}
                  value={expenseDate}
                  onChangeText={setExpenseDate}
                  style={inputStyle}
                />
              </Field>
            </View>
          </View>

          <Field label="Método de pago">
            <Select value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={METHODS} />
          </Field>

          <Field label="Notas (opcional)">
            <TextInput
              placeholder="Notas adicionales"
              placeholderTextColor={ui.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              style={[inputStyle, { minHeight: 60, textAlignVertical: "top" }]}
            />
          </Field>

          <Field label="Comprobante (opcional)">
            <Pressable
              onPress={pickReceipt}
              disabled={uploadingReceipt}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: ui.bg,
                borderWidth: 1,
                borderColor: receiptFileId ? ui.success : ui.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 10,
              }}
            >
              {uploadingReceipt ? (
                <ActivityIndicator size="small" color={ui.primary} />
              ) : (
                <Text style={{ fontSize: 16 }}>📎</Text>
              )}
              <Text
                style={{
                  color: receiptFileId ? ui.success : ui.textMuted,
                  fontSize: 13,
                  fontWeight: receiptFileId ? "700" : "400",
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {uploadingReceipt
                  ? "Subiendo…"
                  : receiptFileId
                  ? receiptFileName ?? "Comprobante adjuntado"
                  : "Adjuntar factura o comprobante"}
              </Text>
            </Pressable>
          </Field>

          <Pressable
            onPress={registrar}
            disabled={submitting}
            style={{
              backgroundColor: submitting ? ui.borderSoft : ui.primary,
              paddingVertical: 12,
              borderRadius: 10,
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
              {submitting ? "Registrando…" : "Registrar egreso"}
            </Text>
          </Pressable>
        </Card>

        <Card>
          <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13, marginBottom: 8 }}>
            Egresos recientes de esta colonia
          </Text>
          {loadingExpenses ? (
            <ActivityIndicator color={ui.primary} />
          ) : expenses.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>Sin egresos registrados aún.</Text>
          ) : (
            <View style={{ gap: 6 }}>
              {expenses.map((e) => (
                <View
                  key={e.id}
                  style={{
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    gap: 4,
                    opacity: e.status === "CANCELLED" ? 0.55 : 1,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700", flex: 1 }}>{e.concept}</Text>
                    <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{money(e.amount)}</Text>
                  </View>
                  <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                    {CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category} ·{" "}
                    {METHODS.find((m) => m.value === e.method)?.label ?? e.method} · {fmtDate(e.expenseDate)}
                    {e.status === "CANCELLED" ? " · CANCELADO" : ""}
                  </Text>
                  {!!e.receiptFileId && (
                    <Pressable onPress={() => openReceipt(e.receiptFileId!)}>
                      <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>
                        📎 {e.receiptFileName ?? "Ver comprobante"}
                      </Text>
                    </Pressable>
                  )}
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
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
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
        {placeholder && <option value="">{placeholder}</option>}
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
