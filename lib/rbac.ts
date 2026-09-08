// lib/rbac.ts
export type Role = "SUPERADMIN" | "ADMINISTRADOR" | "SUPERVISOR" | "OPERATIVO" | "CONDOMINO";

export const RANK: Record<Role, number> = {
  SUPERADMIN: 4,
  ADMINISTRADOR: 3,
  SUPERVISOR: 2,
  OPERATIVO: 1,
  CONDOMINO: 0,
};

/** Rol más alto del usuario en la org seleccionada; considera SUPERADMIN global. */
export function highestRoleInOrg(me: any, orgId: string): Role {
  if (!me) return "OPERATIVO";

  // SUPERADMIN global
  if (Array.isArray(me.roles) && me.roles.includes("SUPERADMIN")) {
    return "SUPERADMIN";
  }

  // Rol por org
  const inOrg = me?.orgs?.find?.((o: any) => o?.orgId === orgId);
  const r = (inOrg?.role ?? "") as string;

  if (r === "ADMINISTRADOR" || r === "SUPERVISOR" || r === "OPERATIVO" || r === "CONDOMINO") {
    return r as Role;
  }
  return "OPERATIVO";
}

/** ¿Puedo gestionar (editar/archivar/cambiar rol) a alguien con ese rol en esta org? */
export function canManage(me: any, orgId: string, targetRole: Role): boolean {
  const mine = highestRoleInOrg(me, orgId);
  if (mine === "SUPERADMIN") return true;            // puede todo
  return RANK[mine] > RANK[targetRole];              // sólo mayor jerarquía
}

/** Opciones de rol que PUEDO asignar en esta org. */
export function allowedRoleOptionsFor(me: any, orgId: string): Role[] {
  const mine = highestRoleInOrg(me, orgId);
  if (mine === "SUPERADMIN") return ["ADMINISTRADOR", "SUPERVISOR", "OPERATIVO", "CONDOMINO"];
  if (mine === "ADMINISTRADOR") return ["SUPERVISOR", "OPERATIVO", "CONDOMINO"];
  if (mine === "SUPERVISOR") return ["OPERATIVO", "CONDOMINO"];
  return [];
}

/** Rol de un usuario objetivo en una org (útil para UI). */
export function userRoleInOrg(user: { roles?: string[]; orgs?: Array<{ orgId: string; role: string }> }, orgId: string): Role {
  // Si tu backend alguna vez devuelve roles globales en `roles`, toma el primero válido
  const global = (user?.roles ?? []).find(r => r === "SUPERADMIN" || r === "ADMINISTRADOR" || r === "SUPERVISOR" || r === "OPERATIVO" || r === "CONDOMINO");
  if (global) return global as Role;

  const inOrg = user?.orgs?.find?.(o => o.orgId === orgId)?.role as string | undefined;
  if (inOrg === "SUPERADMIN" || inOrg === "ADMINISTRADOR" || inOrg === "SUPERVISOR" || inOrg === "OPERATIVO" || inOrg === "CONDOMINO") {
    return inOrg as Role;
  }
  return "OPERATIVO";
}

/** (Opcional) evita auto-editarse o auto-archivarse */
export function isSelf(me: any, userId?: string | null): boolean {
  if (!me || !userId) return false;
  // adapta según cómo guardes el id en `me`
  return me?.id === userId || me?.sub === userId;
}