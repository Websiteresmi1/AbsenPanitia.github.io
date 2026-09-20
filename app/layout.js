import './globals.css';

export const metadata = {
  title: 'Sistem Absensi Event Panitia APSMBI 2026',
  description: 'Aplikasi Absensi Real-time Panitia Event berbasis QR Code dan Supabase',
  icons: {
    icon: '/LOGO.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-800 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
