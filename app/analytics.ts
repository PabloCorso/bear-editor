export const analyticsWebsiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
export const analyticsScriptUrl =
  import.meta.env.VITE_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";
export const analyticsDomains = "beareditor.com,www.beareditor.com";
export const analyticsEnabled =
  import.meta.env.PROD && Boolean(analyticsWebsiteId);

type AnalyticsEvent = "first_edit" | "playtest_started" | "level_saved";

declare global {
  interface Window {
    umami?: { track: (event: AnalyticsEvent) => Promise<unknown> | void };
  }
}

let hasTrackedFirstEdit = false;

export function trackEvent(event: AnalyticsEvent): boolean {
  if (
    !analyticsEnabled ||
    typeof window === "undefined" ||
    !analyticsDomains.split(",").includes(window.location.hostname) ||
    !window.umami
  ) {
    return false;
  }

  try {
    // Analytics must never interrupt editing, even if a request fails.
    void Promise.resolve(window.umami.track(event)).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function trackFirstEdit() {
  if (!hasTrackedFirstEdit) {
    hasTrackedFirstEdit = trackEvent("first_edit");
  }
}
