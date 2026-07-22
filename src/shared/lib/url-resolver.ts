/**
 * Resolves the base URL for authentication redirects across environments.
 *
 * CRITICAL FOR MOBILE EMAIL VERIFICATION:
 * Verification emails are opened on mobile devices (Gmail, Apple Mail, etc.).
 * Mobile phones CANNOT reach 'http://localhost:3000'.
 * Therefore, if NEXT_PUBLIC_SITE_URL is defined (e.g. 'https://acadex.vercel.app'),
 * we MUST use it over localhost, even when signing up from a local dev server.
 */
export const getURL = (path: string = ''): string => {
  // 1. Primary site URL from environment (e.g. https://acadex.vercel.app)
  let siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : null);

  // 2. Client-side browser origin check:
  // If running in browser and origin is NOT localhost, browser origin is ground truth
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');

    if (!isLocalhost) {
      siteUrl = origin;
    } else if (!siteUrl) {
      siteUrl = origin;
    }
  }

  // 3. Fallback default production domain if no env var is found
  if (!siteUrl) {
    siteUrl = 'https://acadex.vercel.app';
  }

  // Ensure protocol
  if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
    siteUrl = `https://${siteUrl}`;
  }

  // Remove trailing slashes
  siteUrl = siteUrl.replace(/\/+$/, '');

  // Format path
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

  return `${siteUrl}${cleanPath}`;
};
