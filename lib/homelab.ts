import defaultServicesConfig from "@/config/homelab-services.json";

export const HOMELAB_HOST = {
  name: "HP EliteDesk 800 G5 SFF",
  cpu: "i5-8500T",
  ramGb: 16,
  diskGb: 512,
} as const;

export const HOMELAB_ROUTER = {
  name: "ASUS RT-AX53U",
  via: "Home Assistant",
} as const;

export type HomelabServiceStatus = "planned" | "up" | "down";

export type ServiceConfig = {
  id: string;
  name: string;
  role: string;
  matches?: string[];
  href?: string;
  showOnHub?: boolean;
};

export type HomelabService = {
  id: string;
  name: string;
  role: string;
  status: HomelabServiceStatus;
  href?: string;
  showOnHub?: boolean;
};

export type HomelabRouterStatus = {
  name: string;
  via: string;
  status: HomelabServiceStatus;
};

export type HomelabSnapshot = {
  online: boolean;
  lastSeen: string | null;
  uptime: string | null;
  cpuPct: number | null;
  cpuTemp: number | null;
  memPct: number | null;
  memUsedGb: number | null;
  memTotalGb: number | null;
  diskPct: number | null;
  diskUsedGb: number | null;
  diskTotalGb: number | null;
  diskFreeGb: number | null;
  services: HomelabService[];
  router: HomelabRouterStatus;
};

export const CONFIGURED_SERVICES: ServiceConfig[] = defaultServicesConfig;

export const PLANNED_SERVICES: HomelabService[] = CONFIGURED_SERVICES.map((s) => ({
  id: s.id,
  name: s.name,
  role: s.role,
  status: "planned",
  href: s.href,
  showOnHub: s.showOnHub ?? true,
}));

/** Glance dots on the hub card (services where showOnHub !== false). */
export const GLANCE_SERVICE_IDS = PLANNED_SERVICES.filter(
  (s) => s.showOnHub !== false
).map((s) => s.id);

export const PLANNED_ROUTER: HomelabRouterStatus = {
  name: HOMELAB_ROUTER.name,
  via: HOMELAB_ROUTER.via,
  status: "planned",
};

/** Live snapshot fetched via the Next.js API route. */
export async function getHomelabSnapshot(): Promise<HomelabSnapshot | null> {
  try {
    const res = await fetch("/api/homelab/snapshot");
    if (!res.ok) return null;
    return (await res.json()) as HomelabSnapshot;
  } catch {
    return null;
  }
}

/** Services highlighted on the Hub card (only showOnHub = true). */
export function glanceServices(
  snapshot: HomelabSnapshot | null
): HomelabService[] {
  const live = snapshot?.services ?? [];
  return PLANNED_SERVICES.filter((s) => s.showOnHub !== false).map((planned) => {
    const hit = live.find((s) => s.id === planned.id);
    return hit ?? planned;
  });
}

/** All configured services for the main Homelab page. */
export function allServices(
  snapshot: HomelabSnapshot | null
): HomelabService[] {
  const live = snapshot?.services ?? [];
  return PLANNED_SERVICES.map((planned) => {
    const hit = live.find((s) => s.id === planned.id);
    return hit ?? planned;
  });
}
