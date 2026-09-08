import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { apiAuth, login } from "../../lib/api";
import { AuthStorage } from "../../lib/auth";
import { landingRouteFor } from "../../lib/roles";
import { useApp } from "../../lib/store";

/* ============ Paleta según el diseño de Figma (TOKKO CONDO) ============ */
const ui = {
  bgOuter: "#7B70E8", // periwinkle de fondo
  circleDeco: "rgba(255,255,255,0.22)", // círculos decorativos de las esquinas
  card: "#FBF1E1", // beige/crema de la tarjeta
  cardBorder: "#15131F", // contorno oscuro grueso de la tarjeta
  logoCircle: "#6C5DEC",
  purple: "#5B4CE0", // "CONDO", links, checkbox, texto de Regístrate
  yellow: "#F1E94A", // botón Entrar + acento del logo
  yellowText: "#1F2430",
  textGray: "#8A8A94",
  textDark: "#2B2B33",
  inputBg: "#FFFFFF",
  inputPlaceholder: "#9CA3AF",
  error: "#D64545",
  errorBg: "rgba(214,69,69,0.08)",
  info: "#4C5FD6",
  infoBg: "rgba(76,95,214,0.08)",
};

/** Ícono "G" de Google a 4 colores, dibujado en SVG (no depende de ningún asset externo). */
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.5 0-14 4.2-17.7 10.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2 1.5-4.6 2.4-7.7 2.4-5.3 0-9.7-3.1-11.3-7.4l-6.5 5C9.9 39.7 16.4 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.4 36 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </Svg>
  );
}

/** Badge circular del logo: "tokko" en blanco + acento amarillo, dentro de un círculo morado. */
function TokkoBadge() {
  return (
    <View
      style={{
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: ui.logoCircle,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 3,
        borderColor: ui.cardBorder,
      }}
    >
      <Svg width={20} height={14} viewBox="0 0 20 14" style={{ marginBottom: 2 }}>
        <Path
          d="M2 12 L10 2 L18 12"
          stroke={ui.yellow}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 20, letterSpacing: 0.5 }}>
        tokko
      </Text>
      <View style={{ width: 34, height: 2, backgroundColor: ui.yellow, marginTop: 3, borderRadius: 1 }} />
    </View>
  );
}

export default function Login() {
  const router = useRouter();
  const { setMe, setToken } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const pass = password;
      setPassword("");
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
      router.replace(landingRouteFor(me) as any);
    } catch (e: any) {
      const status = e?.status;
      if (status === 401) setMsg("Credenciales inválidas.");
      else if (status === 403) setMsg("Sin permisos.");
      else setMsg(e?.message ?? "Error al iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }, [email, password, remember, busy, canSubmit, router, setMe, setToken]);

  const isError = /error|inválida|sin permisos|inválid/i.test(msg);

  const input = {
    backgroundColor: ui.inputBg,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === "web" ? 14 : 15,
    fontSize: 16,
    color: ui.textDark,
    borderWidth: 1,
    borderColor: "rgba(21,19,31,0.08)",
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: ui.bgOuter }}>
      {/* círculos decorativos de fondo, igual que el diseño */}
      <View style={{ position: "absolute", top: 60, left: 40, width: 64, height: 64, borderRadius: 32, backgroundColor: ui.circleDeco }} />
      <View style={{ position: "absolute", top: 70, right: 50, width: 44, height: 44, borderRadius: 22, backgroundColor: ui.circleDeco }} />
      <View style={{ position: "absolute", bottom: 70, right: 60, width: 56, height: 56, borderRadius: 28, backgroundColor: ui.circleDeco }} />

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            width: 400,
            maxWidth: "100%",
            backgroundColor: ui.card,
            borderRadius: 32,
            borderWidth: 3,
            borderColor: ui.cardBorder,
            paddingHorizontal: 26,
            paddingVertical: 30,
            alignItems: "center",
            ...(Platform.OS === "web"
              ? { boxShadow: "0 24px 50px rgba(21,19,31,0.35)" }
              : {}),
          }}
        >
          <TokkoBadge />

          <Text
            style={{
              marginTop: 16,
              fontSize: 26,
              fontWeight: "800",
              color: ui.purple,
              letterSpacing: 1,
            }}
          >
            CONDO
          </Text>
          <Text style={{ marginTop: 2, fontSize: 15, color: ui.textGray }}>
            Tu comunidad te espera
          </Text>

          {/* Continuar con Google (visual, sin integración de backend todavía) */}
          <Pressable
            onPress={() => setMsg("El login con Google todavía no está conectado en el backend.")}
            style={{
              marginTop: 22,
              width: "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              paddingVertical: 14,
              borderWidth: 1,
              borderColor: "rgba(21,19,31,0.10)",
            }}
          >
            <GoogleIcon size={20} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: ui.textDark }}>
              Continuar con Google
            </Text>
          </Pressable>

          {/* Divisor */}
          <View style={{ flexDirection: "row", alignItems: "center", width: "100%", marginTop: 20, marginBottom: 14 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: "rgba(21,19,31,0.18)" }} />
            <Text style={{ marginHorizontal: 10, fontSize: 12, color: ui.textGray }}>o con tu correo</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "rgba(21,19,31,0.18)" }} />
          </View>

          {/* Email */}
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="Correo electrónico"
            placeholderTextColor={ui.inputPlaceholder}
            returnKeyType="next"
            style={[input, { width: "100%" }]}
          />

          {/* Password */}
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Contraseña"
            placeholderTextColor={ui.inputPlaceholder}
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={entrar}
            style={[input, { width: "100%", marginTop: 12 }]}
          />

          {/* Recordarme + olvidaste tu contraseña */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              marginTop: 14,
            }}
          >
            <Pressable
              onPress={() => setRemember((v) => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: remember ? ui.purple : "rgba(21,19,31,0.3)",
                  backgroundColor: remember ? ui.purple : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {remember && (
                  <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 12 }}>✓</Text>
                )}
              </View>
              <Text style={{ color: ui.textGray, fontSize: 14 }}>Recordarme</Text>
            </Pressable>

            <Pressable
              onPress={() => setMsg("Pide al administrador restablecer tu contraseña.")}
            >
              <Text
                style={{
                  color: ui.purple,
                  fontSize: 13,
                  fontWeight: "700",
                  textDecorationLine: "underline",
                }}
              >
                ¡Se te olvidó?
              </Text>
            </Pressable>
          </View>

          {/* Entrar */}
          <Pressable
            onPress={entrar}
            disabled={!canSubmit || busy}
            style={{
              width: "100%",
              marginTop: 18,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: !canSubmit || busy ? "rgba(241,233,74,0.5)" : ui.yellow,
            }}
          >
            {busy ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color={ui.yellowText} />
                <Text style={{ color: ui.yellowText, fontWeight: "800", fontSize: 16 }}>
                  Entrando…
                </Text>
              </View>
            ) : (
              <Text style={{ color: ui.yellowText, fontWeight: "800", fontSize: 16 }}>
                Entrar
              </Text>
            )}
          </Pressable>

          {/* Regístrate */}
          <Pressable
            onPress={() => setMsg("El registro de nuevas cuentas todavía no está disponible.")}
            style={{
              width: "100%",
              marginTop: 12,
              borderRadius: 14,
              paddingVertical: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: "rgba(21,19,31,0.10)",
            }}
          >
            <Text style={{ color: ui.purple, fontWeight: "800", fontSize: 16 }}>
              Regístrate
            </Text>
          </Pressable>

          {/* mensaje de estado/error */}
          {!!msg && msg !== "Entrando…" && (
            <View
              style={{
                marginTop: 14,
                width: "100%",
                padding: 10,
                borderRadius: 10,
                backgroundColor: isError ? ui.errorBg : ui.infoBg,
              }}
            >
              <Text style={{ color: isError ? ui.error : ui.info, fontSize: 12, textAlign: "center" }}>
                {msg}
              </Text>
            </View>
          )}

          {/* Legal */}
          <Text
            style={{
              marginTop: 16,
              fontSize: 11,
              color: ui.textGray,
              textAlign: "center",
              lineHeight: 16,
            }}
          >
            Al continuar aceptas los términos de uso y el aviso{"\n"}de privacidad
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
