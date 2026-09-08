// app/(operator)/_layout.tsx
import { usePathname } from "expo-router";
import React from "react";
import { NavItem, SidebarShell } from "../../components/SidebarShell";
import { useApp } from "../../lib/store";

const NAV_ITEMS: NavItem[] = [
  { label: "Inicio", route: "/(operator)", icon: "home" },
  { label: "Incidencias", route: "/(operator)/incidencias", icon: "alert-circle-outline" },
  { label: "Pagos", route: "/(operator)/pagos", icon: "card-outline" },
  { label: "Egresos", route: "/(operator)/egresos", icon: "wallet-outline" },
  { label: "Comunicados", route: "/(operator)/comunicados", icon: "megaphone-outline" },
  { label: "Reservas", route: "/(operator)/reservas", icon: "calendar-outline" },
  { label: "Configuración", route: "/(operator)/configuracion", icon: "settings-outline" },
];

export default function OperatorLayout() {
  const pathname = usePathname();
  const { me, logout } = useApp();

  const displayName = (me as any)?.name ?? (me?.email ?? "").split("@")[0] ?? "";

  const isActive = (route: string) => {
    const path = route.replace("/(operator)", "").replace("/(ops)", "") || "/";
    if (path === "/") {
      return pathname === "/(operator)" || pathname === "/" || pathname === "";
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <SidebarShell
      navItems={NAV_ITEMS}
      isActive={isActive}
      roleLabel="Operador"
      displayName={displayName}
      logout={logout}
    />
  );
}
