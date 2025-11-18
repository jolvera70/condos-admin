// components/auth-media-web.tsx
import { useApp } from "@/lib/store";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";

export function useBlobUrlWithAuth(url?: string) {
  const token = useApp.getState().token;
  const [blobUrl, setBlobUrl] = useState<string>();

  useEffect(() => {
    if (Platform.OS !== "web" || !url) return;
    let revoke: string | undefined;
    (async () => {
      try {
        const headers: Record<string, string> = { "ngrok-skip-browser-warning": "true" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(url, { headers, credentials: "omit" });
        console.log("[media] fetch", { url, status: res.status, ct: res.headers.get("content-type") });
        if (!res.ok) throw new Error(`GET ${res.status}`);

        // usa el content-type real; evita que el blob herede "text/html"
        const ct = res.headers.get("content-type") || "application/octet-stream";
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: ct });
        console.log("[media] blob", { type: blob.type, size: blob.size });

        const obj = URL.createObjectURL(blob);
        setBlobUrl(obj);
        revoke = obj;
      } catch (e) {
        console.error("useBlobUrlWithAuth error:", e);
        setBlobUrl(undefined);
      }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [url, token]);

  return blobUrl;
}

export function AuthImgWeb(props: { url: string; width: number; height: number; style?: React.CSSProperties }) {
  const src = useBlobUrlWithAuth(props.url);
  return (
    <img
      src={src}
      alt="adjunto"
      width={props.width}
      height={props.height}
      style={{ objectFit: "cover", borderRadius: 10, cursor: "pointer", ...(props.style || {}) }}
    />
  );
}

export function AuthVideoWeb(props: {
  url: string; width: number; height: number;
  style?: React.CSSProperties; controls?: boolean;
}) {
  const src = useBlobUrlWithAuth(props.url);

  // Detectar si el navegador puede reproducir el MIME
  const [supported, setSupported] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (!src) { setSupported(null); return; }
    // Intento ligero: confiar en extensión/MIME de la URL original
    const guess = props.url.toLowerCase().endsWith(".mp4") ? "video/mp4" :
                  props.url.toLowerCase().endsWith(".mov") ? "video/quicktime" : "";
    const v = document.createElement("video");
    const can = guess ? v.canPlayType(guess) : v.canPlayType("video/mp4");
    setSupported(!!can); // "probably"/"maybe" -> truthy
  }, [src, props.url]);

  if (!src) return null;

  if (supported === false) {
    return (
      <div style={{ ...props.style, width: props.width, height: props.height,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 10, background: "#111", color: "#fff", fontSize: 12 }}>
        Video no soportado en este navegador. Usa “Descargar”.
      </div>
    );
  }

  return (
    <video
      src={src}
      width={props.width}
      height={props.height}
      muted
      playsInline
      controls={props.controls ?? true}
      style={{ borderRadius: 10, objectFit: "cover", ...(props.style || {}) }}
    />
  );
}

export function AuthPdfIframeWeb(props: { url: string; style?: React.CSSProperties }) {
  const src = useBlobUrlWithAuth(props.url);
  return <iframe src={src} style={{ border: "none", borderRadius: 12, ...(props.style || {}) }} title="preview" />;
}

export function useTextWithAuth(url?: string) {
  const token = useApp.getState().token;
  const [text, setText] = useState<string>();

  useEffect(() => {
    if (Platform.OS !== "web" || !url) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`GET ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        // Solo intentamos como texto si parece texto
        if (!/^text\/|csv|json|xml|plain/i.test(ct)) {
          // forzamos igualmente a texto por si el backend manda octet-stream
          const t = await res.text();
          if (!cancelled) setText(t);
          return;
        }
        const t = await res.text();
        if (!cancelled) setText(t);
      } catch (e) {
        console.error("useTextWithAuth error:", e);
        if (!cancelled) setText(undefined);
      }
    })();

    return () => { cancelled = true; };
  }, [url, token]);

  return text;
}