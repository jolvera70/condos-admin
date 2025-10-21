// lib/tenants.ts
export type Tenant = { id: string; name: string };

export async function fetchTenantsByIds(ids: string[], token?: string): Promise<Tenant[]> {
  if (!ids.length) return [];
  // ajusta la ruta a tu tenant-api; si usas Traefik es /condos/api/tenant
  const url = `/condos/api/tenant/tenants?ids=${ids.join(",")}`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(await res.text());
  // normaliza a {id,name}
  const data = await res.json(); // espera [{id:"...", name:"..."}, ...] o adapta según tu API
  return data.map((t: any) => ({ id: t.id ?? t._id, name: t.name ?? t.slug ?? "Sin nombre" }));
}