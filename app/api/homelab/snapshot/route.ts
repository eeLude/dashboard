import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import defaultServicesConfig from "@/config/homelab-services.json";
import {
  PLANNED_ROUTER,
  type HomelabService,
  type HomelabServiceStatus,
  type HomelabSnapshot,
  type ServiceConfig,
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
  size?: number;
  used?: number;
  free?: number;
  percent: number;
}

interface GlancesSensor {
  key?: string;
  label?: string;
  type?: string;
  unit?: string;
  value?: number;
}

function loadConfiguredServices(): ServiceConfig[] {
  try {
    const configPath = path.join(process.cwd(), "config", "homelab-services.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as ServiceConfig[];
      }
    }
  } catch {
    // fallback
  }
  return defaultServicesConfig as ServiceConfig[];
}

function formatUptime(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const clean = raw.trim();
    // Glances might return "2 days, 14:10:05" or "1:46:07"
    const dayMatch = clean.match(/(\d+)\s*days?,\s*(\d+):(\d+)/i);
    if (dayMatch) {
      return `${dayMatch[1]} pv ${dayMatch[2]} h`;
    }
    const hourMatch = clean.match(/^(\d+):(\d+)(?::\d+)?$/);
    if (hourMatch) {
      return `${parseInt(hourMatch[1], 10)} h ${parseInt(hourMatch[2], 10)} min`;
    }
    return clean;
  }
  if (typeof raw === "number") {
    const totalSec = Math.round(raw);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (days > 0) return `${days} pv ${hours} h`;
    if (hours > 0) return `${hours} h ${mins} min`;
    return `${mins} min`;
  }
  if (typeof raw === "object" && raw !== null && "uptime" in (raw as Record<string, unknown>)) {
    return formatUptime((raw as Record<string, unknown>).uptime);
  }
  return null;
}

function extractCpuTemp(raw: unknown): number | null {
  if (!Array.isArray(raw)) return null;
  const sensors = raw as GlancesSensor[];

  // 1. Prioritize Intel package temperature (Package id 0 on Intel i5-8500T)
  const pkg = sensors.find(
    (s) =>
      typeof s.value === "number" &&
      s.label &&
      /package\s*id\s*0/i.test(s.label)
  );
  if (pkg && typeof pkg.value === "number") {
    return Math.round(pkg.value);
  }

  // 2. CPU / Core temp
  const coreTemps = sensors.filter(
    (s) =>
      typeof s.value === "number" &&
      s.value > 0 &&
      s.value < 125 &&
      ((s.type && /temperature_core|temperature_cpu/i.test(s.type)) ||
        (s.label && /cpu|core\s*0/i.test(s.label)))
  );
  if (coreTemps.length > 0) {
    const maxVal = Math.max(...coreTemps.map((s) => s.value!));
    return Math.round(maxVal);
  }

  // 3. Any sensor reporting Celsius
  const anyTemp = sensors.filter(
    (s) =>
      typeof s.value === "number" &&
      s.value > 10 &&
      s.value < 120 &&
      (s.unit === "C" || (s.type && s.type.includes("temp")))
  );
  if (anyTemp.length > 0) {
    return Math.round(anyTemp[0].value!);
  }

  return null;
}

export async function GET() {
  const configuredServices = loadConfiguredServices();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    // Query Glances v4 API endpoints in parallel
    const [cpuRes, memRes, fsRes, containersRes, uptimeRes, sensorsRes] =
      await Promise.allSettled([
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
        fetch(`${GLANCES_URL}/api/4/uptime`, {
          signal: controller.signal,
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),
        fetch(`${GLANCES_URL}/api/4/sensors`, {
          signal: controller.signal,
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),
      ]);

    clearTimeout(timeout);

    const cpuData = cpuRes.status === "fulfilled" ? cpuRes.value : null;
    const memData = memRes.status === "fulfilled" ? memRes.value : null;
    const fsData = fsRes.status === "fulfilled" ? fsRes.value : null;
    const containersData = containersRes.status === "fulfilled" ? containersRes.value : null;
    const uptimeData = uptimeRes.status === "fulfilled" ? uptimeRes.value : null;
    const sensorsData = sensorsRes.status === "fulfilled" ? sensorsRes.value : null;

    if (!cpuData && !memData && !containersData && !uptimeData) {
      return NextResponse.json<HomelabSnapshot>({
        online: false,
        lastSeen: null,
        uptime: null,
        cpuPct: null,
        cpuTemp: null,
        memPct: null,
        memUsedGb: null,
        memTotalGb: null,
        diskPct: null,
        diskUsedGb: null,
        diskTotalGb: null,
        diskFreeGb: null,
        services: configuredServices.map((s) => ({
          id: s.id,
          name: s.name,
          role: s.role,
          href: s.href,
          showOnHub: s.showOnHub,
          status: "down" as const,
        })),
        router: { ...PLANNED_ROUTER, status: "down" as const },
      });
    }

    const cpuPct = typeof cpuData?.total === "number" ? Math.round(cpuData.total) : null;
    const cpuTemp = extractCpuTemp(sensorsData);
    const uptime = formatUptime(uptimeData);

    const memPct = typeof memData?.percent === "number" ? Math.round(memData.percent) : null;
    const memTotalGb =
      typeof memData?.total === "number"
        ? Math.round((memData.total / (1024 * 1024 * 1024)) * 10) / 10
        : null;
    const memUsedGb =
      typeof memData?.used === "number"
        ? Math.round((memData.used / (1024 * 1024 * 1024)) * 10) / 10
        : null;

    let diskPct: number | null = null;
    let diskTotalGb: number | null = null;
    let diskUsedGb: number | null = null;
    let diskFreeGb: number | null = null;

    if (Array.isArray(fsData)) {
      const rootMount = (fsData as GlancesFsMount[]).find(
        (m) => m.mnt_point === "/rootfs" || m.mnt_point === "/"
      );
      if (rootMount) {
        if (typeof rootMount.percent === "number") {
          diskPct = Math.round(rootMount.percent);
        }
        if (typeof rootMount.size === "number") {
          diskTotalGb = Math.round(rootMount.size / (1024 * 1024 * 1024));
        }
        if (typeof rootMount.used === "number") {
          diskUsedGb = Math.round(rootMount.used / (1024 * 1024 * 1024));
        }
        if (typeof rootMount.free === "number") {
          diskFreeGb = Math.round(rootMount.free / (1024 * 1024 * 1024));
        }
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

    const services: HomelabService[] = configuredServices.map((service) => {
      const matches = service.matches && service.matches.length > 0
        ? service.matches
        : [service.id];

      const isUp = runningContainerNames.some((cName) =>
        matches.some((m) => cName.includes(m.toLowerCase()))
      );

      const status: HomelabServiceStatus = Array.isArray(containersData)
        ? isUp
          ? "up"
          : "down"
        : "planned";

      return {
        id: service.id,
        name: service.name,
        role: service.role,
        href: service.href,
        showOnHub: service.showOnHub,
        status,
      };
    });

    const snapshot: HomelabSnapshot = {
      online: true,
      lastSeen: new Date().toISOString(),
      uptime,
      cpuPct,
      cpuTemp,
      memPct,
      memUsedGb,
      memTotalGb,
      diskPct,
      diskUsedGb,
      diskTotalGb,
      diskFreeGb,
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
      uptime: null,
      cpuPct: null,
      cpuTemp: null,
      memPct: null,
      memUsedGb: null,
      memTotalGb: null,
      diskPct: null,
      diskUsedGb: null,
      diskTotalGb: null,
      diskFreeGb: null,
      services: configuredServices.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        href: s.href,
        showOnHub: s.showOnHub,
        status: "down" as const,
      })),
      router: { ...PLANNED_ROUTER, status: "down" as const },
    });
  }
}
