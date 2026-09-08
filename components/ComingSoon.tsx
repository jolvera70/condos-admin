// app/(condomino)/components/ComingSoon.tsx
import React from "react";
import { Platform, ScrollView, Text, View } from "react-native";

const ui = {
  bg: "#FBF1E1",
  surface: "#FFFFFF",
  border: "rgba(21,19,31,0.10)",
  primary: "#5B4CE0",
  primarySoft: "rgba(91,76,224,0.10)",
  text: "#2B2B33",
  textMuted: "#8A8A94",
};

export default function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: ui.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 20,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 420,
          borderWidth: 1,
          borderColor: ui.border,
          borderRadius: 16,
          padding: 24,
          backgroundColor: ui.surface,
          alignItems: "center",
          gap: 10,
          ...(Platform.OS === "web" ? ({ boxShadow: "0 8px 24px rgba(21,19,31,0.08)" } as any) : {}),
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: ui.primarySoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 26 }}>{icon}</Text>
        </View>
        <Text style={{ fontSize: 17, fontWeight: "800", color: ui.text, textAlign: "center" }}>
          {title}
        </Text>
        <Text style={{ fontSize: 13, color: ui.textMuted, textAlign: "center" }}>
          {description}
        </Text>
        <View
          style={{
            marginTop: 4,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: ui.primarySoft,
          }}
        >
          <Text style={{ color: ui.primary, fontSize: 12, fontWeight: "700" }}>
            Próximamente
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
