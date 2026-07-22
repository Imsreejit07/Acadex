/**
 * Resolves the base URL for authentication redirects across environments:
 * 1. Client-side browser window origin (highest priority during signup flow in browser)
 * 2. NEXT_PUBLIC_SITE_URL (custom production domain)
 * 3. NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL (Vercel automatic production URL)
 * 4. NEXT_PUBLIC_VERCEL_URL (Vercel preview URL)
 * 5. Fallback to http://localhost:3000
 */
export const getURL = (path: string = ''): string => {
  let url =
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : null) ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    'http://localhost:3000';

  // Ensure url starts with protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  // Remove trailing slashes
  url = url.replace(/\/+$/, '');

  // Format path
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';

  return `${url}${cleanPath}`;
};
