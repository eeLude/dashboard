"use client";

import type { ComponentType } from "react";
import { HubBooksCard } from "@/components/hub/HubBooksCard";
import { HubElectricityCard } from "@/components/hub/HubElectricityCard";
import { HubFlagDayCard } from "@/components/hub/HubFlagDayCard";
import { HubGymCard } from "@/components/hub/HubGymCard";
import { HubHomelabCard } from "@/components/hub/HubHomelabCard";
import { HubSpotifyCard } from "@/components/hub/HubSpotifyCard";
import { HubWeatherCard } from "@/components/hub/HubWeatherCard";

export type HubModule = {
  id: string;
  Card: ComponentType;
};

/** Add a new domain: create HubXCard and append it here. HubMasonry packs by height. */
export const HUB_MODULES: HubModule[] = [
  { id: "weather", Card: HubWeatherCard },
  { id: "electricity", Card: HubElectricityCard },
  { id: "gym", Card: HubGymCard },
  { id: "homelab", Card: HubHomelabCard },
  { id: "flag-day", Card: HubFlagDayCard },
  { id: "books", Card: HubBooksCard },
  { id: "spotify", Card: HubSpotifyCard },
];
