// app/(condomino)/_layout.tsx
import { usePathname } from "expo-router";
import React from "react";
import { NavItem, SidebarShell } from "../../components/SidebarShell";
import { useMyUnits } from "../../lib/condomino";
import { useApp } from "../../lib/store";

const BASE_NAV_ITEMS: NavItem[] = [
  { label: "Inicio", route: "/(condomino)", icon: "home" },
  { label: "Mis pagos", route: "/(condomino)/mis-pagos", icon: "card-outline" },
  { label: "Reservas", route: "/(condomino)/reservas", icon: "calendar-outline" },
  { label: "Incidencias", route: "/(condomino)/incidencias", icon: "alert-circle-outline" },
  { label: "Comunicados", route: "/(condomino)/comunicados", icon: "megaphone-outline" },
  { label: "Finanzas del condominio", route: "/(condomino)/finanzas", icon: "wallet-outline" },
];

// Exclusivos del comité de vigilancia: siempre las últimas dos opciones.
const COMMITTEE_NAV_ITEMS: NavItem[] = [
  { label: "Aprobaciones", route: "/(condomino)/aprobaciones", icon: "checkmark-done-outline" },
  { label: "Actas", route: "/(condomino)/actas", icon: "document-text-outline" },
];

export default function CondominoLayout() {
  const pathname = usePathname();
  const { me, logout } = useApp();
  const { isCommitteeMember } = useMyUnits();

  const navItems = isCommitteeMember ? [...BASE_NAV_ITEMS, ...COMMITTEE_NAV_ITEMS] : BASE_NAV_ITEMS;
  const roleLabel = isCommitteeMember ? "Comité de vigilancia" : "Condómino";
  const displayName = (me as any)?.name ?? (me?.email ?? "").split("@")[0] ?? "";

  const isActive = (route: string) => {
    const path = route.replace("/(condomino)", "") || "/";
    if (path === "/") {
      return pathname === "/(condomino)" || pathname === "/" || pathname === "";
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <SidebarShell
      navItems={navItems}
      isActive={isActive}
      roleLabel={roleLabel}
      displayName={displayName}
      logout={logout}
    />
  );
}
