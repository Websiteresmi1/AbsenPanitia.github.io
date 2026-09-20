'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { QrCode, BarChart3, Users, LogOut, Loader2, ExternalLink } from 'lucide-react';

export default function ProtectedLayout({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function checkUser() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
      }
      setLoading(false);
    }

    checkUser();

    // Dengarkan perubahan auth state (misal token kadaluarsa atau sign out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-pine-800 mb-2" />
        <p className="text-sm">Memuat sistem absensi...</p>
      </div>
    );
  }

  const navItems = [
    { name: 'Scan', href: '/scan', icon: QrCode },
    { name: 'Rekap', href: '/rekap', icon: BarChart3 },
    { name: 'Panitia', href: '/panitia', icon: Users },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header Utama (Sembunyi saat Cetak/Print) */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs no-print">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/AbsenPanitia.github.io/LOGO.png"
              alt="Logo"
              className="h-8 sm:h-9 w-auto max-w-[110px] sm:max-w-[140px] object-contain shrink-0"
            />
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">
                Absensi Panitia
              </h1>
              <p className="text-xs text-slate-500 truncate max-w-[170px] sm:max-w-xs">
                {user?.email || 'Admin'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              title="Buka Layar Publik (Panitia) di tab baru"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-pine-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors touch-target"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Layar Publik</span>
            </Link>

            <button
              id="logout-btn"
              onClick={handleLogout}
              title="Keluar dari sesi admin"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors touch-target"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Konten Halaman */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-24 sm:pb-8">
        {children}
      </main>

      {/* Bottom Tab Navigation (Tetap di bawah layar HP, sembunyi saat print) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg no-print bottom-nav">
        <div className="max-w-md mx-auto px-6 flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-2 px-3 touch-target transition-colors relative ${
                  isActive
                    ? 'text-pine-800 font-semibold'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <div
                  className={`p-1 rounded-xl transition-colors ${
                    isActive ? 'bg-pine-50' : 'bg-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] mt-0.5">{item.name}</span>
                {isActive && (
                  <span className="absolute bottom-0.5 w-6 h-0.5 bg-pine-800 rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
