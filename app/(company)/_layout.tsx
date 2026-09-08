// app/(company)/_layout.tsx
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { NavItem, SidebarShell } from "../../components/SidebarShell";
import { Role, highestRoleInOrg } from "../../lib/rbac";
import { useApp } from "../../lib/store";

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", route: "/(company)", icon: "home" },
  { label: "Condominios", route: "/(company)/boards", icon: "business-outline" },
  { label: "Mis tareas", route: "/(ops)/tasks", icon: "checkbox-outline" },
  { label: "Operadores", route: "/(company)/users", icon: "people-outline" },
  { label: "Reportes", route: "/(company)/reports", icon: "bar-chart-outline" },
];

export default function CompanyLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { me, logout } = useApp();

  // orgId activo: por ahora se toma la primera org del usuario (igual que el resto de pantallas company).
  const orgId = me?.orgs?.[0]?.orgId ?? "";
  const myRole: Role = highestRoleInOrg(me, orgId);
  const roleLabel =
    myRole === "SUPERVISOR"
      ? "Supervisor de empresa"
      : myRole === "ADMINISTRADOR"
      ? "Administrador de empresa"
      : myRole === "SUPERADMIN"
      ? "Superadmin"
      : "Operador";

  const displayName = (me as any)?.name ?? (me?.email ?? "").split("@")[0] ?? "";

  const isActive = (route: string) => {
    const path = route.replace("/(company)", "").replace("/(ops)", "") || "/";
    if (path === "/") {
      return pathname === "/(company)" || pathname === "/" || pathname === "";
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <SidebarShell
      navItems={NAV_ITEMS}
      isActive={isActive}
      roleLabel={roleLabel}
      displayName={displayName}
      logout={logout}
      onPressProfile={() => router.push("/(company)/users" as any)}
    />
  );
}
