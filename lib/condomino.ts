// lib/condomino.ts
import { useCallback, useEffect, useState } from "react";
import { apiAuth } from "./api";

export type MyUnit = {
  id: string;
  boardId: string;
  orgId: string;
  identifier: string;
  ownerName?: string;
  committeeMember: boolean;
  status: "ACTIVE" | "INACTIVE";
};

/**
 * Unidades del condómino autenticado (puede tener más de una, en distintas
 * colonias). Es "parte del comité de vigilancia" si CUALQUIERA de sus
 * unidades lo marca así — esa condición habilita Aprobaciones/Actas en el
 * menú, pero el resto del dashboard es igual para todos los condóminos.
 */
export function useMyUnits() {
  const [units, setUnits] = useState<MyUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await apiAuth("/board/units/mine", "GET");
      const list: MyUnit[] = (Array.isArray(raw) ? raw : []).map((u: any) => ({
        id: String(u.id),
        boardId: String(u.boardId),
        orgId: String(u.orgId),
        identifier: String(u.identifier),
        ownerName: u.ownerName ?? undefined,
        committeeMember: !!u.committeeMember,
        status: u.status,
      }));
      setUnits(list);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isCommitteeMember = units.some((u) => u.committeeMember);

  return { units, loading, error, isCommitteeMember, reload: load };
}
