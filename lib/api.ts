// lib/api.ts
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useApp } from "./store";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type ApiError = Error & { status?: number };

/**
 * Prioridad para resolver BASE:
 * 1) EXPO_PUBLIC_API (p. ej. https://xyz.ngrok-free.app/condos/api)
 * 2) EXPO_PUBLIC_NGROK_URL (sin path) -> se le agrega /condos/api
 * 3) Web: http(s)://{window.location.hostname}:8088/condos/api
 * 4) Expo Go (LAN): http://{LAN_IP}:8088/condos/api  (IP del Metro host)
 * 5) Fallback: http://localhost:8088/condos/api
 */
function resolveBase(): string {
  // 1) Variable completa (recomendada en prod/dev con ngrok)
  const envFull = process.env.EXPO_PUBLIC_API?.trim();
  if (envFull) return envFull.replace(/\/+$/, "");

  // 2) URL de ngrok sin path (opcional)
  const ngrok = process.env.EXPO_PUBLIC_NGROK_URL?.trim();
  if (ngrok) return `${ngrok.replace(/\/+$/, "")}/condos/api`;

  // 3) Web: usa el hostname actual pero puerto 8088
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "https" : "http";
    const host = window.location.hostname;
    return `${proto}://${host}:8088/condos/api`;
  }

  // 4) Expo Go / dispositivo físico: toma IP del host (Metro)
  const anyC: any = Constants;
  const hostUri: string | undefined =
    Constants?.expoConfig?.hostUri ||
    anyC?.manifest?.debuggerHost ||
    anyC?.manifest2?.extra?.expoClient?.hostUri;

  if (hostUri) {
    // ejemplos: "192.168.1.25:19000" / "192.168.1.25:8081"
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return `http://${ip}:8088/condos/api`;
    }
  }

  // 5) Fallback
  return "http://localhost:8088/condos/api";
}

export const BASE = resolveBase();

export async function api(
  path: string,
  method: Method,
  body?: unknown,
  token?: string,
  onAuthError?: () => void,
) {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Solo Content-Type si hay body (JSON)
  if (body != null) headers["Content-Type"] = "application/json";

    if (BASE.includes(".ngrok-free.app")) {
    headers["ngrok-skip-browser-warning"] = "true";
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 || res.status === 403) onAuthError?.();
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err: ApiError = new Error(txt || res.statusText || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }

  if (res.status === 204) return null;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Unexpected response (status ${res.status}): ${ct}\n${txt?.slice(0,300)}`);
  }
  return res.json();
}

/** apiAuth: usa el token del store y hace logout auto en 401/403 */
export async function apiAuth(path: string, method: Method, body?: unknown) {
  const { token, setToken } = useApp.getState();
  try {
    return await api(path, method, body, token ?? undefined, () => setToken(null));
  } catch (e: any) {
    if (e?.status === 401 || e?.status === 403) setToken(null);
    throw e;
  }
}

/** login helper: guarda token en store */
export async function login(email: string, password: string, orgId?: string) {
  const { setToken } = useApp.getState();
  const data = await api("/auth/login", "POST", { email, password, ...(orgId ? { orgId } : {}) });
  if ((data as any)?.token) setToken((data as any).token as string);
  return data;
}