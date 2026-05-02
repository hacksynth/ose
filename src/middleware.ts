import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

const protectedRoutes = [
  '/dashboard',
  '/practice',
  '/wrong-notes',
  '/profile',
  '/exam',
  '/plan',
  '/knowledge',
  '/analysis',
  '/tasks',
];
const authRoutes = ['/login', '/register', '/reset-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req: request, secret });
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isProtected && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/practice/:path*',
    '/wrong-notes/:path*',
    '/profile/:path*',
    '/exam/:path*',
    '/plan/:path*',
    '/knowledge/:path*',
    '/analysis/:path*',
    '/tasks/:path*',
    '/login',
    '/register',
    '/reset-password/:path*',
  ],
};
