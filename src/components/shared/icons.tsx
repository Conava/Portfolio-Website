import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

/** One 16px grid, 1.5 stroke, round joins. Asymmetric glyphs are centered on (8,8) by their bounding box. */
function icon(children: ReactNode, defaultSize = 16) {
  return function Icon({ size = defaultSize, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        {children}
      </svg>
    );
  };
}

export const DesignIcon = icon(
  <>
    <rect x="2.5" y="5" width="8" height="8" rx="1" />
    <path d="M5.5 5V3h8v8h-3" />
  </>,
);

export const ModeIcon = icon(
  <>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
  </>,
);

export const DownloadIcon = icon(
  <path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10" />,
);

/** Drawn for 10px use. */
export const ExternalIcon = icon(<path d="M5 11l6-6M6 5h5v5" />, 10);

/** Drawn for 12px use. */
export const ChevronIcon = icon(<path d="M4 6l4 4 4-4" />, 12);

export const ArrowLeftIcon = icon(<path d="M13 8H3M7 4L3 8l4 4" />);
export const ArrowRightIcon = icon(<path d="M3 8h10M9 4l4 4-4 4" />);

/** PR icons are drawn for 14px. */
export const PrOpenIcon = icon(<circle cx="8" cy="8" r="5.5" />, 14);

export const PrMergedIcon = icon(
  <>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="9" r="1.5" />
    <path d="M4.5 5v6M4.5 5c0 3 7 1 7 2.5" />
  </>,
  14,
);

export const PrClosedIcon = icon(
  <>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M4.1 11.9l7.8-7.8" />
  </>,
  14,
);

export const CopyIcon = icon(
  <>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </>,
);

export const MenuIcon = icon(<path d="M2 4.5h12M2 8h12M2 11.5h12" />);
export const CloseIcon = icon(<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />);

export const ReplayIcon = icon(
  <path d="M13 8a5 5 0 1 1-1.46-3.54M12 2.5V5H9.5" />,
);
export const ZoomInIcon = icon(<path d="M3 8h10M8 3v10" />);
export const ZoomOutIcon = icon(<path d="M3 8h10" />);
/** Four corner brackets: fit the diagram to the view. */
export const FitIcon = icon(<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />);

/**
 * GitHub's Invertocat mark (primer/octicons `mark-github-16`, MIT), unaltered and monochrome:
 * it takes the text color. Always next to a visible label, never as the site's own logo.
 */
export function GithubMark({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}

export function LinkedinMark({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.064 2.064 0 1 1 0-4.128 2.064 2.064 0 0 1 0 4.128zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
