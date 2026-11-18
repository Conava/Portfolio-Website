"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DesignIcon } from "@/components/shared/icons";
import { trackEvent } from "@/lib/analytics";
import { DESIGNS, DESIGN_LABELS, nextDesign, type Design } from "@/lib/design-values";
import { installNavContinuity, markNavigation } from "./nav-continuity";
import "./controls.css";

/**
 * Links to other designs: `?design=<id>` makes the proxy set the cookie and
 * 307 back without the param, so there is no flash and no JS is needed.
 * The icon steps to the next design; the text switch lists all of them.
 */
export function DesignToggle({
  current,
  variant,
  via,
}: {
  current: Design;
  variant: "icon" | "text";
  via: "header" | "footer" | "menu";
}) {
  const t = useTranslations("controls");
  const search = useSearchParams();
  useEffect(installNavContinuity, []);

  const link = (to: Design) => {
    const q = new URLSearchParams(search);
    q.set("design", to);
    return {
      href: `?${q}`,
      onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
        trackEvent("design_toggle", { from: current, to, via });
        markNavigation(e, true, false);
      },
    };
  };

  if (variant === "icon") {
    const other = nextDesign(current);
    const label = t("toDesign", { name: DESIGN_LABELS[other] });
    return (
      <a {...link(other)} className="icon-btn ctl-design-icon" aria-label={label} data-tip={label}>
        <DesignIcon />
      </a>
    );
  }

  return (
    <span role="group" aria-label={t("designLabel")} className="ctl-switch ctl-design">
      <span aria-hidden="true">{t("designLabel")}</span>
      {DESIGNS.map((d) =>
        d === current ? (
          <span key={d} className="ctl-item" aria-current="true">
            {DESIGN_LABELS[d]}
          </span>
        ) : (
          <a key={d} {...link(d)} className="ctl-item">
            {DESIGN_LABELS[d]}
          </a>
        ),
      )}
    </span>
  );
}
