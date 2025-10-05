// Minimal analytics helper that supports Google Analytics (gtag) if a measurement ID
// is provided via Vite env (VITE_GA_MEASUREMENT_ID). Falls back to console logging.
export function initAnalytics(measurementId?: string) {
  if (!measurementId) {
    console.log('Analytics disabled (no measurement ID)');
    return;
  }
  // Inject gtag script if not already present
  if (!(window as any).gtag) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(){(window as any).dataLayer.push(arguments);} // eslint-disable-line @typescript-eslint/no-explicit-any
    (window as any).gtag = gtag;
    (window as any).gtag('js', new Date());
    (window as any).gtag('config', measurementId);
    console.log('Google Analytics initialized');
  }
}

export function trackPage(path: string) {
  if ((window as any).gtag) {
    (window as any).gtag('event', 'page_view', { page_path: path });
  } else {
    console.log('trackPage', path);
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if ((window as any).gtag) {
    (window as any).gtag('event', name, params || {});
  } else {
    console.log('trackEvent', name, params);
  }
}

export function setUserId(userUuid?: string) {
  if (!userUuid) {
    if ((window as any).gtag) {
      (window as any).gtag('config', undefined, { user_id: undefined });
    }
    console.log('Cleared analytics user id');
    return;
  }
  if ((window as any).gtag) {
    (window as any).gtag('config', undefined, { user_id: userUuid });
  } else {
    console.log('setUserId', userUuid);
  }
}
