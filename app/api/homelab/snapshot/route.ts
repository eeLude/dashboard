import { NextResponse } from "next/server";
import {
  PLANNED_ROUTER,
  PLANNED_SERVICES,
  type HomelabService,
  type HomelabServiceStatus,
  type HomelabSnapshot,
} from "@/lib/homelab";

export const dynamic = "force-dynamic";

const GLANCES_URL = process.env.GLANCES_URL || "http://homelab:61208";

interface GlancesContainer {
  name: string;
  status?: string;
  Status?: string;
  state?: string;
}

interface GlancesFsMount {
  mnt_point: string;
  percent: number;
}

/** Map container name substrings to our HomelabService ids */
const MATCH_RULES: Array<{ serviceId: string; matches: string[] }> = [
  { serviceId: "immich", matches: ["immich_server", "immich-server", "immich"] },
  { serviceId: "nextcloud", matches: ["nextcloud-app", "nextcloud"] },
  { serviceId: "paperless", matches: ["paperless-web", "paperless"] },
  { serviceId: "joplin", matches: ["joplin_server", "joplin-server", "joplin"] },
  { serviceId: "syncthing", matches: ["syncthing"] },
];

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    // Glances v4 API endpoints
    const [cpuRes, memRes, fsRes, containersRes] = await Promise.allSettled([
      fetch(`${GLANCES_URL}/api/4/cpu`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${GLANCES_URL}/api/4/mem`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${GLANCES_URL}/api/4/fs`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${GLANCES_URL}/api/4/containers`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    clearTimeout(timeout);

    const cpuData = cpuRes.status === "fulfilled" ? cpuRes.value : null;
    const memData = memRes.status === "fulfilled" ? memRes.value : null;
    const fsData = fsRes.status === "fulfilled" ? fsRes.value : null;
    const containersData = containersRes.status === "fulfilled" ? containersRes.value : null;

    if (!cpuData && !memData && !containersData) {
      return NextResponse.json<HomelabSnapshot>({
        online: false,
        lastSeen: null,
        cpuPct: null,
        memPct: null,
        diskPct: null,
        services: PLANNED_SERVICES.map((s) => ({ ...s, status: "down" as const })),
        router: { ...PLANNED_ROUTER, status: "down" as const },
      });
    }

    const cpuPct = typeof cpuData?.total === "number" ? Math.round(cpuData.total) : null;
    const memPct = typeof memData?.percent === "number" ? Math.round(memData.percent) : null;

    let diskPct: number | null = null;
    if (Array.isArray(fsData)) {
      const rootMount = (fsData as GlancesFsMount[]).find(
        (m) => m.mnt_point === "/rootfs" || m.mnt_point === "/"
      );
      if (rootMount && typeof rootMount.percent === "number") {
        diskPct = Math.round(rootMount.percent);
      }
    }

    // Inspect running containers
    const runningContainerNames: string[] = [];
    if (Array.isArray(containersData)) {
      for (const c of containersData as GlancesContainer[]) {
        const rawStatus = (c.status || c.Status || c.state || "").toLowerCase();
        const isUp =
          rawStatus.includes("up") ||
          rawStatus.includes("running") ||
          rawStatus.includes("healthy");
        if (isUp && c.name) {
          runningContainerNames.push(c.name.toLowerCase());
        }
      }
    }

    const services: HomelabService[] = PLANNED_SERVICES.map((service) => {
      const rule = MATCH_RULES.find((r) => r.serviceId === service.id);
      let isUp = false;

      if (rule) {
        isUp = runningContainerNames.some((cName) =>
          rule.matches.some((m) => cName.includes(m))
        );
      }

      const status: HomelabServiceStatus = Array.isArray(containersData)
        ? isUp
          ? "up"
          : "down"
        : "planned";

      return {
        ...service,
        status,
      };
    });

    const snapshot: HomelabSnapshot = {
      online: true,
      lastSeen: new Date().toISOString(),
      cpuPct,
      memPct,
      diskPct,
      services,
      router: {
        ...PLANNED_ROUTER,
        status: "up",
      },
    };

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json<HomelabSnapshot>({
      online: false,
      lastSeen: null,
      cpuPct: null,
      memPct: null,
      diskPct: null,
      services: PLANNED_SERVICES.map((s) => ({ ...s, status: "down" as const })),
      router: { ...PLANNED_ROUTER, status: "down" as const },
    });
  }
}
