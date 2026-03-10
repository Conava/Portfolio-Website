declare global {
  interface Window {
    umami?: {
      track(name: string, data?: Record<string, string | number>): void;
    };
  }
}

export function trackEvent(
  name: string,
  data?: Record<string, string | number>
): void {
  if (typeof window !== "undefined") {
    window.umami?.track(name, data);
  }
}
