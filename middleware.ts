import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/privacy',
  '/terms',
  '/api/(.*)',
]);

const shouldSkipProtect = (req: Request & { nextUrl: URL }) => {
  // RSC payloads / prefetches cannot be redirected (Clerk/protect() would emit
  // a 404 that surfaces as a noisy console error in the signed-out PWA flow).
  // The *document* request for these routes still gets redirected to /sign-in
  // by protect() below, and the client-side auth guard covers the rest.
  if (req.headers.get('rsc') === '1') return true;
  if (req.headers.get('next-router-prefetch') === '1') return true;
  if (req.nextUrl.searchParams.has('_rsc')) return true;
  return false;
};

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req) && !shouldSkipProtect(req as Request & { nextUrl: URL })) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!.*\\..*|_next).*)',
    '/',
    '/(api|trpc)(.*)',
  ],
};
