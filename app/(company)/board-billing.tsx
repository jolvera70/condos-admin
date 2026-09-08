// app/(company)/board-billing.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth } from "../../lib/api";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";
const condosLogo = require("../../assets/images/iconCondos.png");

import * as XLSX from "xlsx";
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "";

/* ========= Tema (igual que board-units.tsx) ========= */
const ui = {
  bg: "#FBF1E1",
  bgSoft: "#FFFFFF",
  card: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  borderSoft: "rgba(21,19,31,0.06)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
  danger: "#DC2626",
  success: "#16A34A",
};

type FeeFrequency = "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "ANNUAL";
type ChargeStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
type ReconciliationStatus = "PENDING" | "RECONCILED" | "REJECTED";
type PaymentMethod = "TRANSFER" | "CARD" | "CASH" | "OTHER";

type FeeSchedule = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: FeeFrequency;
  dueDayOfPeriod: number;
  active: boolean;
};

type Unit = {
  id: string;
  identifier: string;
  status: "ACTIVE" | "INACTIVE";
};

type Charge = {
  id: string;
  concept: string;
  amount: number;
  paidAmount?: number;
  period?: string;
  dueDate?: string;
  status: ChargeStatus;
  type: "REGULAR" | "EXTRAORDINARY";
};

type Payment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  reconciliationStatus: ReconciliationStatus;
  chargeIds: string[];
  receiptFileId?: string | null;
  createdAt?: string;
};

type AccountStatement = {
  unitId: string;
  totalCharged: number;
  totalPaid: number;
  balance: number;
  creditBalance?: number;
  charges: Charge[];
  payments: Payment[];
};

function money(n?: number, currency = "MXN") {
  if (n == null) return "-";
  return n.toLocaleString("es-MX", { style: "currency", currency });
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: ui.border,
        borderRadius: 14,
        backgroundColor: ui.bgSoft,
        padding: 14,
        gap: 10,
        marginBottom: 16,
      }}
    >
      <Text style={{ color: ui.text, fontWeight: "800", fontSize: 14 }}>{title}</Text>
      {children}
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
  tone?: "primary" | "secondary" | "danger";
}) {
  const palette = {
    primary: { bg: "#1D4ED8", fg: "#F9FAFB" },
    secondary: { bg: ui.borderSoft, fg: ui.text },
    danger: { bg: "#B91C1C", fg: "#F9FAFB" },
  }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? ui.borderSoft : palette.bg,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: palette.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      placeholderTextColor={ui.textMuted}
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
      {...props}
    />
  );
}

function StatusPill({ label, tone }: { label: string; tone: "ok" | "warn" | "bad" }) {
  const color = tone === "ok" ? ui.success : tone === "warn" ? ui.primary : ui.danger;
  const bg = tone === "ok" ? "rgba(74,222,128,0.12)" : tone === "warn" ? ui.primarySoft : "rgba(248,113,113,0.12)";
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ color, fontSize: 10, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

export default function BoardBillingScreen() {
  const router = useRouter();
  const { me, token } = useApp();

  const { boardId, orgId: orgIdParam, boardName } = useLocalSearchParams<{
    boardId: string;
    orgId: string;
    boardName?: string;
  }>();
  const orgId = String(orgIdParam || "");

  const myRole: Role = useMemo(() => highestRoleInOrg(me, orgId), [me, orgId]);
  const canManage = myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR" || myRole === "SUPERADMIN";
  const canReconcile = myRole === "ADMINISTRADOR" || myRole === "SUPERVISOR" || myRole === "SUPERADMIN";

  const [msg, setMsg] = useState("");

  /* ---------- Cuota (FeeSchedule) ---------- */
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [showCreateSchedule, setShowCreateSchedule] = useState(false);
  const [schName, setSchName] = useState("Cuota de mantenimiento mensual");
  const [schAmount, setSchAmount] = useState("");
  const [schDueDay, setSchDueDay] = useState("5");

  const loadSchedules = useCallback(async () => {
    if (!boardId || !orgId) return;
    setLoadingSchedules(true);
    try {
      const raw = await apiAuth(
        `/billing/boards/${boardId}/schedules?orgId=${orgId}&size=50`,
        "GET"
      );
      const list: any[] = Array.isArray(raw) ? raw : raw?.content ?? [];
      setSchedules(list);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setLoadingSchedules(false);
    }
  }, [boardId, orgId]);

  const createSchedule = async () => {
    const amount = parseFloat(schAmount);
    if (!schName.trim() || !amount || amount <= 0) {
      setMsg("Escribe un nombre y un monto válido");
      return;
    }
    try {
      await apiAuth(`/billing/boards/${boardId}/schedules?orgId=${orgId}`, "POST", {
        name: schName.trim(),
        amount,
        currency: "MXN",
        frequency: "MONTHLY" as FeeFrequency,
        dueDayOfPeriod: parseInt(schDueDay || "5", 10),
      });
      setMsg("Cuota configurada ✅");
      setShowCreateSchedule(false);
      setSchAmount("");
      await loadSchedules();
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  /* ---------- Generar cargos del mes ---------- */
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [generating, setGenerating] = useState(false);

  const generateCharges = async () => {
    setGenerating(true);
    setMsg("");
    try {
      const created = await apiAuth(`/billing/charges/generate?orgId=${orgId}`, "POST", {
        boardId,
        period,
      });
      const count = Array.isArray(created) ? created.length : 0;
      setMsg(`Se generaron ${count} cargo(s) para ${period} ✅`);
      if (selectedUnitId) await loadStatement(selectedUnitId);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setGenerating(false);
    }
  };

  /* ---------- Unidades + estado de cuenta ---------- */
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  const loadUnits = useCallback(async () => {
    if (!boardId) return;
    try {
      const raw = await apiAuth(`/board/boards/${boardId}/units?size=200`, "GET");
      const list: any[] = Array.isArray(raw) ? raw : raw?.content ?? [];
      setUnits(list.map((u) => ({ id: String(u.id), identifier: u.identifier, status: u.status })));
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  }, [boardId]);

  const loadStatement = useCallback(
    async (unitId: string) => {
      setLoadingStatement(true);
      try {
        const raw = await apiAuth(
          `/billing/account-statement?orgId=${orgId}&unitId=${unitId}`,
          "GET"
        );
        setStatement(raw);
      } catch (e: any) {
        setMsg(e.message ?? String(e));
      } finally {
        setLoadingStatement(false);
      }
    },
    [orgId]
  );

  useEffect(() => {
    loadSchedules();
    loadUnits();
  }, [loadSchedules, loadUnits]);

  useEffect(() => {
    if (selectedUnitId) loadStatement(selectedUnitId);
  }, [selectedUnitId, loadStatement]);

  /* ---------- Registrar pago ---------- */
  const [selectedChargeIds, setSelectedChargeIds] = useState<string[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("TRANSFER");
  const [showPayForm, setShowPayForm] = useState(false);
  const [receiptFileId, setReceiptFileId] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const pickAndUploadReceipt = async () => {
    if (!selectedUnitId) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const f = res.assets[0];
      const mime = f.mimeType ?? "application/octet-stream";
      const safeName = (f.name ?? "comprobante").replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `payments/${orgId}/${selectedUnitId}/${Date.now()}-${safeName}`;
      const uploadUrl = `${API_BASE}/files/${key}`;

      setUploadingReceipt(true);

      if (Platform.OS === "web") {
        // expo-file-system (uploadAsync/FileSystemUploadType) no existe en web;
        // en web, expo-document-picker expone el archivo real del navegador en `f.file`.
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

      setReceiptFileId(key);
      setReceiptFileName(f.name ?? "comprobante");
      setMsg("Comprobante adjuntado ✅");
    } catch (e: any) {
      setMsg("Error subiendo comprobante: " + (e.message ?? String(e)));
    } finally {
      setUploadingReceipt(false);
    }
  };

  /* ---------- Conciliación masiva (opción A) ---------- */
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [bulkReconciling, setBulkReconciling] = useState(false);

  const togglePaymentSelection = (id: string) => {
    setSelectedPaymentIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAllPendingPayments = () => {
    const pendingIds = (statement?.payments ?? [])
      .filter((p) => p.reconciliationStatus === "PENDING")
      .map((p) => p.id);
    setSelectedPaymentIds(pendingIds);
  };

  const bulkReconcilePayments = async (approve: boolean) => {
    if (selectedPaymentIds.length === 0) return;
    setBulkReconciling(true);
    try {
      const results = await apiAuth(
        `/billing/payments/reconcile-bulk?orgId=${orgId}`,
        "POST",
        { paymentIds: selectedPaymentIds, approve }
      );
      const okCount = Array.isArray(results) ? results.filter((r: any) => r.status === "OK").length : 0;
      const errCount = Array.isArray(results) ? results.filter((r: any) => r.status === "ERROR").length : 0;
      setMsg(
        `${okCount} pago(s) ${approve ? "conciliado(s)" : "rechazado(s)"} ✅` +
          (errCount > 0 ? ` · ${errCount} con error` : "")
      );
      setSelectedPaymentIds([]);
      if (selectedUnitId) await loadStatement(selectedUnitId);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setBulkReconciling(false);
    }
  };

  /* ---------- Importar pagos desde Excel/CSV (opción B) ---------- */
  type ImportRow = { unitIdentifier: string; amount: number; method: PaymentMethod };
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importResults, setImportResults] = useState<any[] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);

  const pickAndParseImportFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;

      const f = res.assets[0];
      const b64 = await FileSystem.readAsStringAsync(f.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(b64, { type: "base64" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // Espera columnas: Unidad (o unitIdentifier), Monto (o amount), Metodo (opcional)
      const parsed: ImportRow[] = raw
        .map((row) => {
          const unitIdentifier = String(
            row.Unidad ?? row.unidad ?? row.unitIdentifier ?? row.Unit ?? ""
          ).trim();
          const amount = parseFloat(
            String(row.Monto ?? row.monto ?? row.amount ?? row.Amount ?? "").replace(/,/g, "")
          );
          const methodRaw = String(row.Metodo ?? row.metodo ?? row.method ?? "TRANSFER")
            .trim()
            .toUpperCase();
          const method: PaymentMethod = (["TRANSFER", "CARD", "CASH", "OTHER"] as string[]).includes(
            methodRaw
          )
            ? (methodRaw as PaymentMethod)
            : "TRANSFER";
          return { unitIdentifier, amount, method };
        })
        .filter((r) => r.unitIdentifier && !isNaN(r.amount) && r.amount > 0);

      if (parsed.length === 0) {
        setMsg(
          "No se encontraron filas válidas. Usa columnas 'Unidad' y 'Monto' (y opcionalmente 'Metodo')."
        );
        return;
      }
      setImportRows(parsed);
      setImportResults(null);
    } catch (e: any) {
      setMsg("Error leyendo el archivo: " + (e.message ?? String(e)));
    }
  };

  const confirmImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      const results = await apiAuth(
        `/billing/boards/${boardId}/payments/bulk-import?orgId=${orgId}`,
        "POST",
        { rows: importRows }
      );
      setImportResults(results);
      const okCount = Array.isArray(results) ? results.filter((r: any) => r.status === "OK").length : 0;
      setMsg(`Importación terminada: ${okCount} de ${importRows.length} pago(s) registrados`);
      if (selectedUnitId) await loadStatement(selectedUnitId);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    } finally {
      setImporting(false);
    }
  };

  const viewReceipt = async (fileId: string) => {
    try {
      const url = `${API_BASE}/files/${fileId}`;
      if (Platform.OS === "web") {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`No se pudo abrir el comprobante (${res.status})`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
      } else {
        // En nativo, la descarga autenticada requiere otro flujo (fuera de alcance de esta versión).
        setMsg("Ver comprobante desde móvil aún no está soportado, ábrelo desde la versión web.");
      }
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const toggleCharge = (id: string) => {
    setSelectedChargeIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const registerPayment = async () => {
    if (!selectedUnitId) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0 || selectedChargeIds.length === 0) {
      setMsg("Selecciona al menos un cargo y escribe un monto válido");
      return;
    }
    try {
      await apiAuth(`/billing/boards/${boardId}/payments?orgId=${orgId}`, "POST", {
        unitId: selectedUnitId,
        chargeIds: selectedChargeIds,
        amount,
        method: payMethod,
        receiptFileId: receiptFileId ?? undefined,
      });
      setMsg("Pago registrado ✅ (pendiente de conciliar)");
      setShowPayForm(false);
      setSelectedChargeIds([]);
      setPayAmount("");
      setReceiptFileId(null);
      setReceiptFileName(null);
      await loadStatement(selectedUnitId);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const reconcile = async (paymentId: string, approve: boolean) => {
    try {
      await apiAuth(`/billing/payments/${paymentId}/reconcile`, "POST", { approve });
      setMsg(approve ? "Pago conciliado ✅" : "Pago rechazado ❌");
      if (selectedUnitId) await loadStatement(selectedUnitId);
    } catch (e: any) {
      setMsg(e.message ?? String(e));
    }
  };

  const chargeStatusTone = (s: ChargeStatus) =>
    s === "PAID" ? "ok" : s === "OVERDUE" || s === "CANCELLED" ? "bad" : "warn";
  const reconTone = (s: ReconciliationStatus) =>
    s === "RECONCILED" ? "ok" : s === "REJECTED" ? "bad" : "warn";

  return (
    <SafeAreaView style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: ui.bg,
        ...(Platform.OS === "web" ? ({ height: "100vh" } as any) : {}),
      }}>
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
          <Text style={{ color: ui.text, fontSize: 16, fontWeight: "800" }}>
            Cuotas y pagos {boardName ? `· ${boardName}` : ""}
          </Text>
        </View>
      </View>

      {!!msg && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: ui.primary, fontSize: 12 }}>{msg}</Text>
        </View>
      )}

      <ScrollView
        style={{
          flex: 1,
          minHeight: 0,
          ...(Platform.OS === "web" ? ({ overflowY: "auto" } as any) : {}),
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      >
        {/* ===== Cuota configurada ===== */}
        <SectionCard title="Cuota de mantenimiento">
          {loadingSchedules ? (
            <ActivityIndicator color={ui.primary} />
          ) : schedules.length === 0 ? (
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>
              Todavía no hay ninguna cuota configurada para esta colonia.
            </Text>
          ) : (
            schedules.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: ui.borderSoft,
                }}
              >
                <View>
                  <Text style={{ color: ui.text, fontSize: 13, fontWeight: "700" }}>{s.name}</Text>
                  <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                    {s.frequency === "MONTHLY" ? "Mensual" : s.frequency} · vence día {s.dueDayOfPeriod}
                  </Text>
                </View>
                <Text style={{ color: ui.primary, fontWeight: "800" }}>
                  {money(s.amount, s.currency)}
                </Text>
              </View>
            ))
          )}

          {canManage && !showCreateSchedule && (
            <PillButton label="+ Configurar cuota" onPress={() => setShowCreateSchedule(true)} />
          )}

          {canManage && showCreateSchedule && (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Input placeholder="Nombre" value={schName} onChangeText={setSchName} />
              <Input
                placeholder="Monto por unidad (ej. 1500)"
                value={schAmount}
                onChangeText={setSchAmount}
                keyboardType="numeric"
              />
              <Input
                placeholder="Día de vencimiento (1-28)"
                value={schDueDay}
                onChangeText={setSchDueDay}
                keyboardType="numeric"
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <PillButton label="Guardar" onPress={createSchedule} />
                <PillButton
                  label="Cancelar"
                  tone="secondary"
                  onPress={() => setShowCreateSchedule(false)}
                />
              </View>
            </View>
          )}
        </SectionCard>

        {/* ===== Generar cargos del mes ===== */}
        {canManage && (
          <SectionCard title="Generar cargos del mes">
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>
              Crea el cargo de este periodo para todas las unidades activas, con base en la(s)
              cuota(s) configurada(s) arriba. Si ya se generó, no duplica.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Input
                placeholder="2026-08"
                value={period}
                onChangeText={setPeriod}
                style={{ width: 120 }}
              />
              <PillButton
                label={generating ? "Generando..." : "Generar cargos"}
                onPress={generateCharges}
                disabled={generating || schedules.length === 0}
              />
            </View>
          </SectionCard>
        )}

        {/* ===== Importar pagos en lote (Excel/CSV) ===== */}
        {canManage && (
          <SectionCard title="Importar pagos en lote (Excel/CSV)">
            <Text style={{ color: ui.textMuted, fontSize: 12 }}>
              El archivo debe tener columnas "Unidad" y "Monto" (opcional "Metodo": TRANSFER,
              CARD, CASH u OTHER). Cada fila cubre automáticamente los cargos pendientes más
              antiguos de esa unidad hasta llegar al monto indicado.
            </Text>
            {!showImport ? (
              <PillButton label="Importar desde archivo" onPress={() => setShowImport(true)} />
            ) : (
              <View style={{ gap: 10 }}>
                <PillButton label="Elegir archivo (.xlsx / .csv)" onPress={pickAndParseImportFile} />

                {importRows.length > 0 && (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: ui.text, fontSize: 12, fontWeight: "700" }}>
                      Vista previa: {importRows.length} fila(s)
                    </Text>
                    {importRows.slice(0, 10).map((r, i) => (
                      <Text key={i} style={{ color: ui.textMuted, fontSize: 11 }}>
                        {r.unitIdentifier} — {money(r.amount)} — {r.method}
                      </Text>
                    ))}
                    {importRows.length > 10 && (
                      <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                        ... y {importRows.length - 10} más
                      </Text>
                    )}
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <PillButton
                        label={importing ? "Importando..." : `Confirmar e importar ${importRows.length}`}
                        onPress={confirmImport}
                        disabled={importing}
                      />
                      <PillButton
                        label="Cancelar"
                        tone="secondary"
                        onPress={() => {
                          setImportRows([]);
                          setImportResults(null);
                          setShowImport(false);
                        }}
                      />
                    </View>
                  </View>
                )}

                {importResults && (
                  <View style={{ gap: 4, marginTop: 6 }}>
                    <Text style={{ color: ui.text, fontSize: 12, fontWeight: "700" }}>
                      Resultado:
                    </Text>
                    {importResults.map((r: any, i: number) => (
                      <View
                        key={i}
                        style={{ flexDirection: "row", justifyContent: "space-between" }}
                      >
                        <Text style={{ color: ui.textMuted, fontSize: 11 }}>{r.reference}</Text>
                        <Text
                          style={{
                            color: r.status === "OK" ? ui.success : ui.danger,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {r.status === "OK" ? "✅ " + r.message : "❌ " + r.message}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </SectionCard>
        )}

        {/* ===== Selección de unidad ===== */}
        <SectionCard title="Estado de cuenta por unidad">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {units.map((u) => (
              <Pressable
                key={u.id}
                onPress={() => setSelectedUnitId(u.id)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selectedUnitId === u.id ? ui.primary : ui.border,
                  backgroundColor: selectedUnitId === u.id ? ui.primarySoft : "transparent",
                }}
              >
                <Text
                  style={{
                    color: selectedUnitId === u.id ? ui.primary : ui.textMuted,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {u.identifier}
                </Text>
              </Pressable>
            ))}
            {units.length === 0 && (
              <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                No hay unidades registradas en esta colonia todavía.
              </Text>
            )}
          </View>

          {selectedUnitId && (
            <View style={{ marginTop: 10 }}>
              {loadingStatement ? (
                <ActivityIndicator color={ui.primary} />
              ) : statement ? (
                <View style={{ gap: 12 }}>
                  {/* Resumen */}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      backgroundColor: ui.bg,
                      borderWidth: 1,
                      borderColor: ui.border,
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <View>
                      <Text style={{ color: ui.textMuted, fontSize: 10 }}>CARGADO</Text>
                      <Text style={{ color: ui.text, fontWeight: "700" }}>
                        {money(statement.totalCharged)}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ color: ui.textMuted, fontSize: 10 }}>PAGADO</Text>
                      <Text style={{ color: ui.success, fontWeight: "700" }}>
                        {money(statement.totalPaid)}
                      </Text>
                    </View>
                    <View>
                      <Text style={{ color: ui.textMuted, fontSize: 10 }}>SALDO</Text>
                      <Text
                        style={{
                          color: statement.balance > 0 ? ui.danger : ui.success,
                          fontWeight: "800",
                        }}
                      >
                        {money(statement.balance)}
                      </Text>
                    </View>
                    {!!statement.creditBalance && statement.creditBalance > 0 && (
                      <View>
                        <Text style={{ color: ui.textMuted, fontSize: 10 }}>A FAVOR</Text>
                        <Text style={{ color: ui.success, fontWeight: "800" }}>
                          {money(statement.creditBalance)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Cargos */}
                  <View>
                    <Text style={{ color: ui.text, fontWeight: "700", fontSize: 12, marginBottom: 6 }}>
                      Cargos
                    </Text>
                    {statement.charges.length === 0 && (
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>Sin cargos todavía.</Text>
                    )}
                    {statement.charges.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => canManage && c.status !== "PAID" && toggleCharge(c.id)}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingVertical: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: ui.borderSoft,
                          backgroundColor: selectedChargeIds.includes(c.id) ? ui.primarySoft : "transparent",
                          paddingHorizontal: 6,
                          borderRadius: 6,
                        }}
                      >
                        <View>
                          <Text style={{ color: ui.text, fontSize: 12 }}>
                            {c.concept} {c.period ? `(${c.period})` : ""}
                          </Text>
                          <Text style={{ color: ui.textMuted, fontSize: 10 }}>
                            {c.type === "EXTRAORDINARY" ? "Extraordinaria" : "Regular"}
                            {c.status === "PARTIALLY_PAID" ? ` · pagado ${money(c.paidAmount)}` : ""}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ color: ui.text, fontSize: 12, fontWeight: "700" }}>
                            {money(c.amount)}
                          </Text>
                          <StatusPill
                            label={c.status}
                            tone={chargeStatusTone(c.status)}
                          />
                        </View>
                      </Pressable>
                    ))}
                  </View>

                  {canManage && (
                    <View>
                      {!showPayForm ? (
                        <PillButton
                          label="Registrar pago"
                          onPress={() => setShowPayForm(true)}
                        />
                      ) : (
                        <View
                          style={{
                            gap: 8,
                            marginTop: 6,
                            padding: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: ui.border,
                          }}
                        >
                          <Text style={{ color: ui.textMuted, fontSize: 11 }}>
                            Cargos seleccionados: {selectedChargeIds.length || "ninguno (toca uno arriba)"}
                          </Text>
                          <Input
                            placeholder="Monto pagado"
                            value={payAmount}
                            onChangeText={setPayAmount}
                            keyboardType="numeric"
                          />

                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <PillButton
                              label={
                                uploadingReceipt
                                  ? "Subiendo..."
                                  : receiptFileId
                                  ? "Cambiar comprobante"
                                  : "Adjuntar comprobante (opcional)"
                              }
                              tone="secondary"
                              onPress={pickAndUploadReceipt}
                              disabled={uploadingReceipt}
                            />
                            {receiptFileName && (
                              <Text style={{ color: ui.success, fontSize: 11 }} numberOfLines={1}>
                                📎 {receiptFileName}
                              </Text>
                            )}
                          </View>

                          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                            {(["TRANSFER", "CARD", "CASH", "OTHER"] as PaymentMethod[]).map((m) => (
                              <Pressable
                                key={m}
                                onPress={() => setPayMethod(m)}
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 6,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: payMethod === m ? ui.primary : ui.border,
                                }}
                              >
                                <Text
                                  style={{
                                    color: payMethod === m ? ui.primary : ui.textMuted,
                                    fontSize: 11,
                                  }}
                                >
                                  {m}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <PillButton label="Confirmar pago" onPress={registerPayment} />
                            <PillButton
                              label="Cancelar"
                              tone="secondary"
                              onPress={() => {
                                setShowPayForm(false);
                                setSelectedChargeIds([]);
                                setReceiptFileId(null);
                                setReceiptFileName(null);
                              }}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Pagos */}
                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ color: ui.text, fontWeight: "700", fontSize: 12 }}>Pagos</Text>
                      {canReconcile &&
                        statement.payments.some((p) => p.reconciliationStatus === "PENDING") && (
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <PillButton
                              label="Seleccionar pendientes"
                              tone="secondary"
                              onPress={selectAllPendingPayments}
                            />
                          </View>
                        )}
                    </View>

                    {selectedPaymentIds.length > 0 && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                          padding: 8,
                          borderRadius: 8,
                          backgroundColor: ui.primarySoft,
                        }}
                      >
                        <Text style={{ color: ui.primary, fontSize: 11, fontWeight: "700" }}>
                          {selectedPaymentIds.length} seleccionado(s)
                        </Text>
                        <PillButton
                          label={bulkReconciling ? "..." : "Conciliar todos"}
                          onPress={() => bulkReconcilePayments(true)}
                          disabled={bulkReconciling}
                        />
                        <PillButton
                          label="Rechazar todos"
                          tone="danger"
                          onPress={() => bulkReconcilePayments(false)}
                          disabled={bulkReconciling}
                        />
                        <PillButton
                          label="Limpiar"
                          tone="secondary"
                          onPress={() => setSelectedPaymentIds([])}
                        />
                      </View>
                    )}

                    {statement.payments.length === 0 && (
                      <Text style={{ color: ui.textMuted, fontSize: 12 }}>Sin pagos registrados.</Text>
                    )}
                    {statement.payments.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() =>
                          canReconcile &&
                          p.reconciliationStatus === "PENDING" &&
                          togglePaymentSelection(p.id)
                        }
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingVertical: 6,
                          paddingHorizontal: 6,
                          borderRadius: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: ui.borderSoft,
                          backgroundColor: selectedPaymentIds.includes(p.id)
                            ? ui.primarySoft
                            : "transparent",
                        }}
                      >
                        <View>
                          <Text style={{ color: ui.text, fontSize: 12 }}>
                            {money(p.amount)} · {p.method}
                          </Text>
                          <Text style={{ color: ui.textMuted, fontSize: 10 }}>
                            cubre {p.chargeIds.length} cargo(s)
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <StatusPill
                            label={p.reconciliationStatus}
                            tone={reconTone(p.reconciliationStatus)}
                          />
                          {p.receiptFileId && (
                            <PillButton
                              label="Ver comprobante"
                              tone="secondary"
                              onPress={() => viewReceipt(p.receiptFileId!)}
                            />
                          )}
                          {canReconcile && p.reconciliationStatus === "PENDING" && (
                            <View style={{ flexDirection: "row", gap: 6 }}>
                              <PillButton
                                label="Conciliar"
                                onPress={() => reconcile(p.id, true)}
                              />
                              <PillButton
                                label="Rechazar"
                                tone="danger"
                                onPress={() => reconcile(p.id, false)}
                              />
                            </View>
                          )}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={{ color: ui.textMuted, fontSize: 12 }}>
                  No se pudo cargar el estado de cuenta.
                </Text>
              )}
            </View>
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
