// lib/auth.ts
import { Platform } from "react-native";

// Carga perezosa para no romper web/SSR
let SecureStore: typeof import("expo-secure-store") | undefined;
let AsyncStorage: typeof import("@react-native-async-storage/async-storage") | undefined;
if (Platform.OS !== "web") {
  try { SecureStore = require("expo-secure-store"); } catch {}
  try { AsyncStorage = require("@react-native-async-storage/async-storage"); } catch {}
}

const KEY = "jwt"; // usa el MISMO key en todo el app

// Fallback in-memory para SSR o ambientes sin storage
let memToken: string | null = null;

export const AuthStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") {
      try { return window?.localStorage?.getItem(KEY) ?? null; } catch { return null; }
    }
    // nativo: primero SecureStore (encriptado), si no hay, AsyncStorage
    try {
      if (SecureStore?.getItemAsync) {
        const v = await SecureStore.getItemAsync(KEY);
        if (v != null) { memToken = v; return v; }
      }
      if (AsyncStorage?.getItem) {
        const v = await AsyncStorage.getItem(KEY);
        if (v != null) { memToken = v; return v; }
      }
    } catch {}
    return memToken;
  },

  async set(token: string) {
    if (Platform.OS === "web") {
      try { window?.localStorage?.setItem(KEY, token); } catch {}
      memToken = token;
      return;
    }
    try {
      if (SecureStore?.setItemAsync) await SecureStore.setItemAsync(KEY, token);
      else if (AsyncStorage?.setItem) await AsyncStorage.setItem(KEY, token);
      memToken = token;
    } catch { memToken = token; }
  },

  async clear() {
    if (Platform.OS === "web") {
      try { window?.localStorage?.removeItem(KEY); } catch {}
      memToken = null; 
      return;
    }
    try {
      if (SecureStore?.deleteItemAsync) await SecureStore.deleteItemAsync(KEY);
      if (AsyncStorage?.removeItem) await AsyncStorage.removeItem(KEY);
    } catch {}
    memToken = null;
  },
};