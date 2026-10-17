"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookOpen, Home, Server } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useQuery } from "@tanstack/react-query";
import { getActiveWorkoutSession } from "@/lib/queries";

const navItems: {
  href: string;
  labelKey: MessageKey;
  icon: typeof Home;
  match?: string[];
}[] = [
  { href: "/", labelKey: "nav.home", icon: Home },
  {
    href: "/gym",
    labelKey: "nav.gym",
    icon: Activity,
    match: ["/gym", "/workout"],
  },
  { href: "/books", labelKey: "nav.books", icon: BookOpen },
  { href: "/homelab", labelKey: "nav.homelab", icon: Server },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  const { data: activeSession } = useQuery({
    queryKey: ["active-workout-session"],
    queryFn: getActiveWorkoutSession,
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {navItems.map(({ href, labelKey, icon: Icon, match }) => {
          const prefixes = match ?? [href];
          const active =
            href === "/"
              ? pathname === "/"
              : prefixes.some((p) =>
                  p === "/" ? pathname === "/" : pathname.startsWith(p)
                );

          const isGymTab = href === "/gym";
          const hasActiveWorkout = isGymTab && !!activeSession;

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active ? "text-brand" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <div className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                {hasActiveWorkout && !active && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand animate-pulse" />
                )}
              </div>
              {t(labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
