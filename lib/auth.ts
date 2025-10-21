export const AuthStorage = {
  async get(): Promise<string | null> {
    try {
      return localStorage.getItem("jwt");
    } catch {
      return null;
    }
  },
  async set(token: string) {
    try {
      localStorage.setItem("jwt", token);
    } catch {}
  },
  async clear() {
    try {
      localStorage.removeItem("jwt");
    } catch {}
  },
};