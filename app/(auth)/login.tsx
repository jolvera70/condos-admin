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

/* ============ Theme minimal para login ============ */
const ui = {
  colors: {
    background: "#020617", // casi negro (slate-950)
    card: "#020617",
    cardBorder: "#1E293B",
    inputBg: "#020617",
    inputBorder: "#1F2937",
    inputBorderFocus: "#EAB308",
    primary: "#EAB308", // gold mate
    primarySoft: "rgba(234,179,8,0.12)",
    text: "#E5E7EB",
    textMuted: "#9CA3AF",
    textSubtle: "#64748B",
    errorBg: "rgba(248,113,113,0.10)",
    errorText: "#FCA5A5",
    infoBg: "rgba(56,189,248,0.12)",
    infoText: "#7DD3FC",
  },
  radius: {
    lg: 22,
    md: 14,
    sm: 10,
  },
};

export default function Login() {
  const router = useRouter();
  const { setMe, setToken } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(
    () =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase()) &&
      password.length >= 1,
    [email, password]
  );

  const entrar = useCallback(async () => {
    if (!canSubmit || busy) return;
    try {
      setBusy(true);
      setMsg("Entrando…");
      Keyboard.dismiss();
      const pass = password; // copia local
      setPassword(""); // limpia el estado inmediatamente
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
    width: 420,
    maxWidth: "100%",
    borderWidth: 1,
    borderColor: ui.colors.cardBorder,
    borderRadius: ui.radius.lg,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: ui.colors.card,
    ...(Platform.OS === "web"
      ? {
          boxShadow:
            "0 24px 60px rgba(15,23,42,0.85), 0 0 0 1px rgba(15,23,42,1)",
        }
      : {}),
  };

  const inputBase = {
    borderWidth: 1,
    borderColor: ui.colors.inputBorder,
    borderRadius: ui.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    backgroundColor: ui.colors.inputBg,
    color: ui.colors.text,
  } as const;

  const label = {
    fontSize: 13,
    color: ui.colors.textSubtle,
    marginBottom: 6,
    fontWeight: "600",
  } as const;

  const headerTitle = {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase" as const,
    color: ui.colors.text,
  };

  const headerBadge = {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ui.colors.primarySoft,
    backgroundColor: "rgba(15,23,42,0.9)",
  };

  const gradientCircle: any =
    Platform.OS === "web"
      ? {
          position: "absolute",
          width: 380,
          height: 380,
          borderRadius: 999,
          background:
            "radial-gradient(circle at 0% 0%, rgba(234,179,8,0.16), transparent 60%)",
          top: -80,
          left: -40,
          pointerEvents: "none",
        }
      : {};

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: ui.colors.background,
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Glow de fondo */}
      {Platform.OS === "web" && <View style={gradientCircle} />}

      {/* Branding arriba */}
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <Text style={headerTitle}>CONDOS</Text>
        <Text
          style={{
            color: ui.colors.textMuted,
            marginTop: 4,
            fontSize: 13,
          }}
        >
          Admin panel · Lokaly style
        </Text>
      </View>

      {/* Tarjeta login */}
      <View style={card}>
        {/* Sub-header dentro de la tarjeta */}
        <View style={{ marginBottom: 18, gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: ui.colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: ui.colors.primary, fontSize: 14 }}>CA</Text>
            </View>
            <Text
              style={{
                fontSize: 13,
                color: ui.colors.textMuted,
                textTransform: "uppercase",
                letterSpacing: 1.1,
              }}
            >
              Condos Admin
            </Text>
          </View>

          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: ui.colors.text,
            }}
          >
            Iniciar sesión
          </Text>
          <Text style={{ color: ui.colors.textMuted, fontSize: 13 }}>
            Accede al panel para gestionar tareas, colonias y proveedores.
          </Text>
        </View>

        {/* email */}
        <View style={{ marginBottom: 14 }}>
          <Text style={label}>Correo electrónico</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tú@empresa.com"
            placeholderTextColor={ui.colors.textMuted}
            returnKeyType="next"
            style={inputBase}
            onSubmitEditing={() => {}}
          />
        </View>

        {/* password + toggle */}
        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 6,
              alignItems: "center",
            }}
          >
            <Text style={label}>Contraseña</Text>
            <Pressable onPress={() => setShowPwd((v) => !v)}>
              <Text
                style={{
                  color: ui.colors.primary,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {showPwd ? "Ocultar" : "Ver"}
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPwd}
            placeholder="••••••••"
            placeholderTextColor={ui.colors.textMuted}
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={entrar}
            style={inputBase}
          />
        </View>

        {/* remember me + forgot */}
        <View
          style={{
            marginTop: 6,
            marginBottom: 14,
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
                borderRadius: 5,
                borderWidth: 1,
                borderColor: remember ? ui.colors.primary : ui.colors.inputBorder,
                backgroundColor: remember ? ui.colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {remember ? (
                <Text
                  style={{
                    color: "#000",
                    fontWeight: "800",
                    fontSize: 11,
                  }}
                >
                  ✓
                </Text>
              ) : null}
            </View>
            <Text style={{ color: ui.colors.textSubtle, fontSize: 13 }}>
              Recordarme en este dispositivo
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMsg("Pide al administrador restablecer tu contraseña.")}
          >
            <Text
              style={{
                color: ui.colors.textMuted,
                fontWeight: "600",
                fontSize: 12,
                textDecorationLine: "underline",
              }}
            >
              ¿Olvidaste tu contraseña?
            </Text>
          </Pressable>
        </View>

        {/* botón */}
        <Pressable
          onPress={entrar}
          disabled={!canSubmit || busy}
          style={{
            borderRadius: ui.radius.md,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              !canSubmit || busy
                ? "rgba(234,179,8,0.35)"
                : ui.colors.primary,
          }}
        >
          {busy ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <ActivityIndicator color="#000" />
              <Text
                style={{
                  color: "#000",
                  fontWeight: "800",
                  fontSize: 14,
                }}
              >
                Entrando…
              </Text>
            </View>
          ) : (
            <Text
              style={{
                color: "#000",
                fontWeight: "800",
                fontSize: 14,
              }}
            >
              Entrar
            </Text>
          )}
        </Pressable>

        {/* mensaje */}
        {!!msg && (
          <View
            style={{
              marginTop: 14,
              padding: 10,
              borderRadius: ui.radius.sm,
              backgroundColor: /error|inválida|sin permisos|inválid/i.test(
                msg
              )
                ? ui.colors.errorBg
                : ui.colors.infoBg,
              borderWidth: 1,
              borderColor: /error|inválida|sin permisos|inválid/i.test(msg)
                ? "rgba(248,113,113,0.45)"
                : "rgba(56,189,248,0.45)",
            }}
          >
            <Text
              style={{
                color: /error|inválida|sin permisos|inválid/i.test(msg)
                  ? ui.colors.errorText
                  : ui.colors.infoText,
                fontSize: 12,
              }}
            >
              {msg}
            </Text>
          </View>
        )}

        {/* pie */}
        <View
          style={{
            marginTop: 18,
            alignItems: "flex-start",
            gap: 6,
          }}
        >
          <View style={headerBadge}>
            <Text
              style={{
                fontSize: 11,
                color: ui.colors.primary,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Acceso restringido
            </Text>
          </View>
          <Text
            style={{
              color: ui.colors.textSubtle,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            Al continuar aceptas los términos de uso y la política de
            privacidad del sistema Condos.
          </Text>
        </View>
      </View>

      {/* footer minimal */}
      <Text
        style={{
          color: ui.colors.textMuted,
          marginTop: 18,
          fontSize: 11,
        }}
      >
        © {new Date().getFullYear()} Condos · Lokaly powered
      </Text>
    </View>
  );
}