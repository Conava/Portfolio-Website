"use client";

import { createContext, useContext } from "react";
import { DESIGNS, type Design } from "@/lib/design-values";

/** The runtime switches the client controls need (`DESIGNS`, `GERMAN`); the env is server-only, so SiteShell hands them down. */
export type SiteSwitches = { designs: readonly Design[]; german: boolean };

const Ctx = createContext<SiteSwitches>({ designs: DESIGNS, german: true });

export function SiteSwitchesProvider({ value, children }: { value: SiteSwitches; children: React.ReactNode }) {
  return <Ctx value={value}>{children}</Ctx>;
}

export const useSiteSwitches = () => useContext(Ctx);
