// app/(app)/admin/index.tsx
//
// Varios grupos de rutas ((admin), (company), (condomino), (operator),
// (tabs)) tienen un index.tsx que compite por la URL "/" — expo-router
// resuelve esa ambigüedad casi siempre a favor de este archivo (por orden
// alfabético del grupo). Por eso, en vez de redirigir a un destino fijo,
// esta pantalla debe mandar a cada quien a SU landing real según su rol —
// usa la misma lógica que login.tsx y los _layout raíz, para no volver a
// desincronizarse.
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { landingRouteFor } from "../../lib/roles";
import { useApp } from "../../lib/store";

export default function AdminIndex() {
  const router = useRouter();
  const { me } = useApp();

  useEffect(() => {
    router.replace(landingRouteFor(me) as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, me]);

  return null; // opcional: podrías poner un spinner
}