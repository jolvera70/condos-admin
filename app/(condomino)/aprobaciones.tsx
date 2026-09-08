// app/(condomino)/aprobaciones.tsx
import React from "react";
import { ActivityIndicator, View } from "react-native";
import ComingSoon from "../../components/ComingSoon";
import { useMyUnits } from "../../lib/condomino";

export default function Aprobaciones() {
  const { loading, isCommitteeMember } = useMyUnits();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FBF1E1" }}>
        <ActivityIndicator color="#5B4CE0" />
      </View>
    );
  }

  if (!isCommitteeMember) {
    return (
      <ComingSoon
        icon="🔒"
        title="Solo para el comité de vigilancia"
        description="Esta sección es exclusiva para los condóminos designados como parte del comité de vigilancia de su colonia."
      />
    );
  }

  return (
    <ComingSoon
      icon="✅"
      title="Aprobaciones"
      description="Aquí el comité de vigilancia podrá revisar y aprobar o rechazar cotizaciones y presupuestos de la colonia."
    />
  );
}
