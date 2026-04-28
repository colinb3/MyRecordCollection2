/**
 * @author Colin Brown
 * @description Minimal analytics helper that supports Google Analytics (gtag) if a measurement ID is provided via Vite env. Falls back to console logging.
 * @fileformat TypeScript
 */

// Minimal analytics helper that supports Google Analytics (gtag) if a measurement ID
// is provided via Vite env (VITE_GA_MEASUREMENT_ID). Falls back to console logging.

interface WindowWithGtag extends Window {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}

declare const window: WindowWithGtag;

export function initAnalytics(measurementId?: string) {
  if (!measurementId) {
    console.log('Analytics disabled (no measurement ID)');
    return;
  }
  // Inject gtag script if not already present
  if (!window.gtag) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(...args: unknown[]): void {
      window.dataLayer?.push(args);
    }
    window.gtag = gtag;
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    console.log('Google Analytics initialized');
  }
}

export function trackPage(path: string) {
  if (window.gtag) {
    window.gtag('event', 'page_view', { page_path: path });
  } else {
    console.log('trackPage', path);
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (window.gtag) {
    window.gtag('event', name, params || {});
  } else {
    console.log('trackEvent', name, params);
  }
}

export function setUserId(userUuid?: string) {
  if (!userUuid) {
    if (window.gtag) {
      window.gtag('config', undefined, { user_id: undefined });
    }
    console.log('Cleared analytics user id');
    return;
  }
  if (window.gtag) {
    window.gtag('config', undefined, { user_id: userUuid });
  } else {
    console.log('setUserId', userUuid);
  }
}
