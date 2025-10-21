// components/RoleGate.tsx
import { hasAny } from "@/lib/roles";
import { useApp } from "@/lib/store";
import React from "react";
import { View } from "react-native";

export default function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { me } = useApp();
  if (hasAny(me, allow)) return <>{children}</>;
  return <View>{fallback}</View>;
}