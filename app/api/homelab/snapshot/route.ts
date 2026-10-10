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

interface GlancesDockerContainer {
  name: string;
  Status?: string;
  status?: string;
  state?: string;
}

interface GlancesFsMount {
  mnt_point: string;
  percent: number;
}

/** Match known container names to HomelabService ids */
const CONTAINER_TO_SERVICE_ID: Record<string, string> = {
  immich: "immich",
  "immich-server": "immich",
  immich_server: "immich",
  nextcloud: "nextcloud",
  "nextcloud-app": "nextcloud",
  paperless: "paperless",
  "paperless-web": "paperless",
  joplin: "joplin",
  joplin_server: "joplin",
  syncthing: "syncthing",
};

export async function GET() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const [cpuRes, memRes, fsRes, dockerRes] = await Promise.allSettled([
      fetch(`${GLANCES_URL}/api/3/cpu`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${GLANCES_URL}/api/3/mem`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${GLANCES_URL}/api/3/fs`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${GLANCES_URL}/api/3/docker`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    clearTimeout(timeout);

    const cpuData = cpuRes.status === "fulfilled" ? cpuRes.value : null;
    const memData = memRes.status === "fulfilled" ? memRes.value : null;
    const fsData = fsRes.status === "fulfilled" ? fsRes.value : null;
    const dockerData = dockerRes.status === "fulfilled" ? dockerRes.value : null;

    // If Glances is completely unreachable, report offline
    if (!cpuData && !memData && !dockerData) {
      const offlineSnapshot: HomelabSnapshot = {
        online: false,
        lastSeen: null,
        cpuPct: null,
        memPct: null,
        diskPct: null,
        services: PLANNED_SERVICES.map((s) => ({ ...s, status: "down" as const })),
        router: { ...PLANNED_ROUTER, status: "down" as const },
      };
      return NextResponse.json(offlineSnapshot);
    }

    const cpuPct = typeof cpuData?.total === "number" ? Math.round(cpuData.total) : null;
    const memPct = typeof memData?.percent === "number" ? Math.round(memData.percent) : null;

    let diskPct: number | null = null;
    if (Array.isArray(fsData)) {
      const rootMount = (fsData as GlancesFsMount[]).find(
        (m) => m.mnt_point === "/" || m.mnt_point === "/host"
      );
      if (rootMount && typeof rootMount.percent === "number") {
        diskPct = Math.round(rootMount.percent);
      }
    }

    // Determine status for services from docker container list
    const runningContainers = new Set<string>();
    if (Array.isArray(dockerData)) {
      for (const c of dockerData as GlancesDockerContainer[]) {
        const rawStatus = (c.Status || c.status || c.state || "").toLowerCase();
        const isUp = rawStatus.includes("up") || rawStatus.includes("running");
        if (isUp && c.name) {
          const cleanName = c.name.replace(/^\//, "").toLowerCase();
          runningContainers.add(cleanName);
        }
      }
    }

    const services: HomelabService[] = PLANNED_SERVICES.map((service) => {
      let isUp = false;
      for (const [containerPattern, serviceId] of Object.entries(CONTAINER_TO_SERVICE_ID)) {
        if (serviceId === service.id && runningContainers.has(containerPattern)) {
          isUp = true;
          break;
        }
      }

      // If docker data was available, mark either up or down. If not, keep planned.
      const status: HomelabServiceStatus = Array.isArray(dockerData)
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
  } catch (error) {
    return NextResponse.json(
      {
        online: false,
        lastSeen: null,
        cpuPct: null,
        memPct: null,
        diskPct: null,
        services: PLANNED_SERVICES.map((s) => ({ ...s, status: "down" as const })),
        router: { ...PLANNED_ROUTER, status: "down" as const },
      } satisfies HomelabSnapshot,
      { status: 200 }
    );
  }
}
