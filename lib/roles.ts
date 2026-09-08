// lib/roles.ts
export type OrgRole = { orgId: string; role: "SUPERADMIN"|"ADMINISTRADOR"|"SUPERVISOR"|"OPERATIVO"|"CONDOMINO" };
export type Me = { id: string; email: string; roles?: string[]; orgs?: OrgRole[] };

export const ROLE_ORDER = ["SUPERADMIN","ADMINISTRADOR","SUPERVISOR","OPERATIVO","CONDOMINO"] as const;

export function extractRoles(me?: Me): string[] {
  if (!me) return [];
  if (Array.isArray(me.roles) && me.roles.length) return me.roles as string[];
  if (Array.isArray(me.orgs)) return [...new Set(me.orgs.map(o => o.role))];
  return [];
}

export function hasAny(me: Me|undefined, roles: string[]): boolean {
  const all = extractRoles(me);
  return roles.some(r => all.includes(r));
}

export function highestRole(me?: Me): string | undefined {
  const all = extractRoles(me);
  return ROLE_ORDER.find(r => all.includes(r));
}

/**
 * A dónde aterriza cada rol al iniciar sesión (o al restaurar el token).
 * Única fuente de verdad: úsala tanto en login como en (app)/_layout, para
 * que nunca vuelvan a desincronizarse entre sí.
 */
export function landingRouteFor(me?: any): string {
  const role = highestRole(me);
  if (role === "ADMINISTRADOR" || role === "SUPERVISOR") return "/(company)";
  if (role === "CONDOMINO") return "/(condomino)";
  if (role === "OPERATIVO") return "/(operator)";
  return "/home";
}