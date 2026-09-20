import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * Memperbarui sesi cookie Supabase dan melakukan redirect otorisasi
 * - Redirect ke /login jika belum ada sesi dan mencoba mengakses halaman terproteksi
 * - Redirect ke /scan jika sudah ada sesi dan mencoba mengakses /login
 */
export async function updateSession(request) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Ambil user yang sedang aktif
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === '/login';
  const isPublicPage = pathname === '/';

  // 1. Jika belum login dan mengakses halaman terproteksi (bukan /login dan bukan /), redirect ke /login
  if (!user && !isLoginPage && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2. Jika sudah login dan membuka /login, redirect ke /scan
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/scan';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
