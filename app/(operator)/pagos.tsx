// app/(operator)/pagos.tsx
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
import { pickAndUploadFile } from "../../lib/attachments";
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
type Unit = { id: string; identifier: string };
type Charge = { id: string; concept: string; amount: number; dueDate?: string; status: string };
type PaymentMethod = "TRANSFER" | "CARD" | "CASH" | "OTHER";
type PendingPayment = { id: string; amount: number; method: PaymentMethod; reportedAt?: string };

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "CARD", label: "Tarjeta" },
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

export default function PagosOperador() {
  const { me, token } = useApp();
  const orgId = (me as any)?.orgId ?? me?.orgs?.[0]?.orgId ?? "";

  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState("");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [receiptFileId, setReceiptFileId] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [loadingCharges, setLoadingCharges] = useState(false);
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

  const loadPendingPayments = useCallback(async () => {
    if (!boardId) return;
    try {
      const raw = await apiAuth(
        `/billing/payments?orgId=${encodeURIComponent(orgId)}&boardId=${encodeURIComponent(boardId)}&reconciliationStatus=PENDING&size=50`,
        "GET"
      );
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];
      setPendingPayments(
        list.map((p: any) => ({
          id: String(p.id),
          amount: Number(p.amount ?? 0),
          method: p.method,
          reportedAt: p.reportedAt,
        }))
      );
    } catch {
      setPendingPayments([]);
    }
  }, [boardId, orgId]);

  useEffect(() => {
    if (!boardId) return;
    setUnitId("");
    setCharges([]);
    setSelected([]);
    (async () => {
      setLoadingUnits(true);
      try {
        const raw = await apiAuth(`/board/boards/${boardId}/units?includeInactive=false&size=500`, "GET");
        const list = Array.isArray(raw) ? raw : raw?.content ?? [];
        setUnits(list.map((u: any) => ({ id: String(u.id), identifier: String(u.identifier) })));
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoadingUnits(false);
      }
    })();
    loadPendingPayments();
  }, [boardId, loadPendingPayments]);

  const loadCharges = useCallback(async () => {
    if (!unitId) return;
    setLoadingCharges(true);
    setSelected([]);
    setAmount("");
    setReceiptFileId(null);
    setReceiptFileName(null);
    try {
      const raw = await apiAuth(
        `/billing/charges?orgId=${encodeURIComponent(orgId)}&unitId=${encodeURIComponent(unitId)}&status=PENDING&size=100`,
        "GET"
      );
      const list = Array.isArray(raw) ? raw : raw?.content ?? [];
      setCharges(
        list.map((c: any) => ({
          id: String(c.id),
          concept: String(c.concept ?? ""),
          amount: Number(c.amount ?? 0),
          dueDate: c.dueDate,
          status: c.status,
        }))
      );
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoadingCharges(false);
    }
  }, [unitId, orgId]);

  useEffect(() => {
    loadCharges();
  }, [loadCharges]);

  const toggleCharge = (id: string, chargeAmount: number) => {
    setSelected((prev) => {
      const isSelected = prev.includes(id);
      const next = isSelected ? prev.filter((x) => x !== id) : [...prev, id];
      const sum = charges
        .filter((c) => next.includes(c.id))
        .reduce((s, c) => s + c.amount, 0);
      setAmount(sum > 0 ? String(sum) : "");
      return next;
    });
  };

  const pickAndUploadReceipt = async () => {
    if (!unitId) return;
    setUploadingReceipt(true);
    setMsg("");
    try {
      const uploaded = await pickAndUploadFile(`payments/${orgId}/${unitId}`, token, [
        "image/*",
        "application/pdf",
      ]);
      if (!uploaded) return; // canceló el picker
      setReceiptFileId(uploaded.fileId);
      setReceiptFileName(uploaded.fileName);
      setMsg("Comprobante adjuntado ✅");
    } catch (e: any) {
      setMsg("Error subiendo comprobante: " + (e.message ?? String(e)));
    } finally {
      setUploadingReceipt(false);
    }
  };

  const registrarPago = async () => {
    setMsg("");
    if (!unitId) {
      setMsg("Selecciona una unidad");
      return;
    }
    if (selected.length === 0) {
      setMsg("Selecciona al menos un cargo a cubrir");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMsg("Escribe un monto válido");
      return;
    }
    setSubmitting(true);
    try {
      await apiAuth(
        `/billing/boards/${boardId}/payments?orgId=${encodeURIComponent(orgId)}`,
        "POST",
        { unitId, chargeIds: selected, amount: amt, method, receiptFileId: receiptFileId ?? undefined }
      );
      setMsg("Pago registrado ✅ Queda pendiente de conciliar por administración.");
      setReceiptFileId(null);
      setReceiptFileName(null);
      await loadCharges();
      await loadPendingPayments();
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
            Registrar pago
          </Text>
          <Text style={{ color: ui.textMuted, fontSize: 13 }}>
            Reporta un pago recibido de un condómino. Queda pendiente de conciliar por administración.
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

          <Field label="Unidad">
            {loadingUnits ? (
              <ActivityIndicator color={ui.primary} />
            ) : (
              <Select
                value={unitId}
                onChange={setUnitId}
                placeholder="Selecciona una unidad"
                options={units.map((u) => ({ label: u.identifier, value: u.id }))}
              />
            )}
          </Field>

          {!!unitId && (
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13, marginBottom: 6 }}>
                Cargos pendientes
              </Text>
              {loadingCharges ? (
                <ActivityIndicator color={ui.primary} />
              ) : charges.length === 0 ? (
                <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                  Esta unidad no tiene cargos pendientes.
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {charges.map((c) => {
                    const isSel = selected.includes(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => toggleCharge(c.id, c.amount)}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: isSel ? ui.primary : ui.borderSoft,
                          backgroundColor: isSel ? ui.primarySoft : "transparent",
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                        }}
                      >
                        <View>
                          <Text style={{ color: ui.text, fontSize: 13, fontWeight: "600" }}>{c.concept}</Text>
                          <Text style={{ color: ui.textMuted, fontSize: 11 }}>Vence: {fmtDate(c.dueDate)}</Text>
                        </View>
                        <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{money(c.amount)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {!!unitId && (
            <>
              <Field label="Monto recibido">
                <TextInput
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={ui.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  style={inputStyle}
                />
              </Field>

              <Field label="Método">
                <Select value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={METHODS} />
              </Field>

              <Field label="Comprobante (opcional)">
                <Pressable
                  onPress={pickAndUploadReceipt}
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
                      : "Adjuntar imagen o PDF del comprobante"}
                  </Text>
                </Pressable>
              </Field>

              <Pressable
                onPress={registrarPago}
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
                  {submitting ? "Registrando…" : "Registrar pago"}
                </Text>
              </Pressable>
            </>
          )}
        </Card>

        {pendingPayments.length > 0 && (
          <Card>
            <Text style={{ color: ui.text, fontWeight: "700", fontSize: 13, marginBottom: 8 }}>
              Pagos registrados, esperando conciliación
            </Text>
            <View style={{ gap: 6 }}>
              {pendingPayments.map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    borderWidth: 1,
                    borderColor: ui.borderSoft,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                    {METHODS.find((m) => m.value === p.method)?.label ?? p.method} · {fmtDate(p.reportedAt)}
                  </Text>
                  <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{money(p.amount)}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}
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
  // Fallback simple para nativo: lista de pills
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
