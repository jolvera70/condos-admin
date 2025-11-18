// app/(auth)/login.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiAuth, login } from "../../lib/api";
import { AuthStorage } from "../../lib/auth";
import { useApp } from "../../lib/store";

export default function Login() {
  const router = useRouter();
  const { setMe, setToken } = useApp();

  // demo defaults; quítalo en prod si quieres
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase()) && password.length >= 1,
    [email, password]
  );

  const entrar = useCallback(async () => {
    if (!canSubmit || busy) return;
    try {
      setBusy(true);
      setMsg("Entrando…");
      Keyboard.dismiss();
const pass = password; // copia local
setPassword("");       // limpia el estado inmediatamente
      const res = await login(email.trim().toLowerCase(), pass);
      if (!res?.token) throw new Error("Respuesta sin token.");

      if (remember) {
        await AuthStorage.set(res.token);
      } else {
        await AuthStorage.clear();
      }
      setToken(res.token);

      const me = await apiAuth("/auth/me", "GET");
      setMe(me);

      setMsg("");
      router.replace("/(app)/home");
    } catch (e: any) {
      const status = e?.status;
      if (status === 401) setMsg("Credenciales inválidas.");
      else if (status === 403) setMsg("Sin permisos.");
      else setMsg(e?.message ?? "Error al iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }, [email, password, remember, busy, canSubmit, router, setMe, setToken]);

  const card: any = {
    width: 380,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 16,
    padding: 18,
    backgroundColor: "#fff",
    ...(Platform.OS === "web"
      ? {
          boxShadow:
            "0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)",
        }
      : {}),
  };

  const input = {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
  } as const;

  const label = { fontSize: 13, color: "#667085", marginBottom: 6, fontWeight: "600" } as const;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FAFAFB",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Header/branding */}
      <View style={{ alignItems: "center", marginBottom: 18 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.2 }}>condos</Text>
        <Text style={{ color: "#667085", marginTop: 4 }}>Panel de administración</Text>
      </View>

      {/* Card */}
      <View style={card}>
        {/* título */}
        <View style={{ marginBottom: 12, gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: "800" }}>Iniciar sesión</Text>
          <Text style={{ color: "#667085" }}>Usa tu correo y contraseña</Text>
        </View>

        {/* email */}
        <View style={{ marginBottom: 12 }}>
          <Text style={label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tú@empresa.com"
            returnKeyType="next"
            style={input}
            onSubmitEditing={() => {}}
          />
        </View>

        {/* password + toggle */}
        <View style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={label}>Contraseña</Text>
            <Pressable onPress={() => setShowPwd((v) => !v)}>
              <Text style={{ color: "#2563EB", fontWeight: "700" }}>
                {showPwd ? "Ocultar" : "Ver"}
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            placeholder="••••••••"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={entrar}
            style={input}
          />
        </View>

        {/* remember me + forgot */}
        <View
          style={{
            marginTop: 6,
            marginBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Pressable
            onPress={() => setRemember((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: "#CBD5E1",
                backgroundColor: remember ? "#2563EB" : "#fff",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {remember ? <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text> : null}
            </View>
            <Text style={{ color: "#475569" }}>Recordarme</Text>
          </Pressable>

          <Pressable onPress={() => setMsg("Pide al admin restablecer tu contraseña.")}>
            <Text style={{ color: "#2563EB", fontWeight: "700" }}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
        </View>

        {/* botón */}
        <Pressable
          onPress={entrar}
          disabled={!canSubmit || busy}
          style={{
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
            backgroundColor: !canSubmit || busy ? "#93C5FD" : "#2563EB",
          }}
        >
          {busy ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "800" }}>Entrando…</Text>
            </View>
          ) : (
            <Text style={{ color: "#fff", fontWeight: "800" }}>Entrar</Text>
          )}
        </Pressable>

        {/* mensaje */}
        {!!msg && (
          <View
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              backgroundColor:
                msg.toLowerCase().includes("error") ||
                msg.toLowerCase().includes("inválida") ||
                msg.toLowerCase().includes("sin permisos")
                  ? "#FEF2F2"
                  : "#F1F5FF",
            }}
          >
            <Text
              style={{
                color:
                  msg.toLowerCase().includes("error") ||
                  msg.toLowerCase().includes("inválida") ||
                  msg.toLowerCase().includes("sin permisos")
                    ? "#B91C1C"
                    : "#1E40AF",
              }}
            >
              {msg}
            </Text>
          </View>
        )}

        {/* pie */}
        <View style={{ marginTop: 16, alignItems: "center", gap: 6 }}>
          <Text style={{ color: "#94A3B8", fontSize: 12 }}>
            Al continuar aceptas los términos y la política de privacidad.
          </Text>
        </View>
      </View>

      {/* footer minimal */}
      <Text style={{ color: "#94A3B8", marginTop: 18, fontSize: 12 }}>© {new Date().getFullYear()} Condos</Text>
    </View>
  );
}