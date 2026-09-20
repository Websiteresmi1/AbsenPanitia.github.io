'use client';

import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, AlertOctagon, X } from 'lucide-react';
import { formatTime } from '@/lib/format';

/**
 * Komponen Notifikasi Mengambang Besar di Bagian Atas Layar
 * Menampilkan status hasil scan QR atau input kode manual:
 * - HIJAU: Kehadiran tercatat
 * - KUNING: Sudah tercatat hadir
 * - MERAH: QR tidak dikenali / Error server
 */
export default function Notification({ notification, onClose }) {
  useEffect(() => {
    if (!notification) return;

    // Getaran perangkat (Vibration API) jika didukung oleh browser/HP
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (notification.type === 'berhasil') {
          navigator.vibrate(200); // Getar singkat untuk sukses
        } else {
          navigator.vibrate([100, 50, 100]); // Getar 2 kali untuk peringatan/error
        }
      } catch (e) {
        // Abaikan jika browser memblokir vibration tanpa user gesture langsung
      }
    }

    // Auto-dismiss setelah sekitar 3,5 detik
    const timer = setTimeout(() => {
      onClose();
    }, 3500);

    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const { type, data, raw, message } = notification;

  // Konfigurasi visual berdasarkan tipe status
  let bgClass = 'bg-emerald-700 text-white border-emerald-600';
  let Icon = CheckCircle2;
  let title = 'Kehadiran Tercatat!';

  if (type === 'sudah_hadir') {
    bgClass = 'bg-amber-600 text-white border-amber-500';
    Icon = AlertTriangle;
    title = 'Sudah Tercatat Hadir';
  } else if (type === 'tidak_dikenal') {
    bgClass = 'bg-rose-700 text-white border-rose-600';
    Icon = AlertOctagon;
    title = 'QR Tidak Dikenali';
  } else if (type === 'error') {
    bgClass = 'bg-red-800 text-white border-red-700';
    Icon = XCircle;
    title = 'Koneksi Bermasalah';
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto no-print animate-in fade-in slide-in-from-top-4 duration-200">
      <div
        className={`p-4 rounded-2xl shadow-xl border ${bgClass} flex items-start justify-between gap-3`}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-1 rounded-full bg-white/20 flex-shrink-0 mt-0.5">
            <Icon className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold tracking-tight">{title}</h3>

            {/* Jika Berhasil */}
            {type === 'berhasil' && data && (
              <div className="mt-1 space-y-0.5 text-sm text-emerald-50">
                <p className="font-semibold text-white truncate text-base">
                  {data.nama}
                </p>
                <p className="text-xs opacity-90">
                  Divisi: <span className="font-medium text-white">{data.divisi}</span>
                </p>
                {data.tanggal_acara && (
                  <p className="text-xs opacity-90">
                    Tanggal: <span className="font-medium text-white">{data.tanggal_acara}</span>
                  </p>
                )}
                <p className="text-xs opacity-90">
                  Jam Hadir: <span className="font-medium text-white">{formatTime(data.waktu_scan)}</span>
                </p>
              </div>
            )}

            {/* Jika Sudah Hadir Sebelumnya */}
            {type === 'sudah_hadir' && data && (
              <div className="mt-1 space-y-0.5 text-sm text-amber-50">
                <p className="font-semibold text-white truncate text-base">
                  {data.nama}
                </p>
                <p className="text-xs opacity-90">
                  Divisi: <span className="font-medium text-white">{data.divisi}</span>
                </p>
                {data.tanggal_acara && (
                  <p className="text-xs opacity-90">
                    Tanggal: <span className="font-medium text-white">{data.tanggal_acara}</span>
                  </p>
                )}
                <p className="text-xs opacity-90">
                  Hadir pada: <span className="font-medium text-white">{formatTime(data.waktu_scan)}</span>
                </p>
                {data.discan_oleh && (
                  <p className="text-xs opacity-80 truncate">
                    Dicatat oleh: {data.discan_oleh}
                  </p>
                )}
              </div>
            )}

            {/* Jika Tidak Dikenal */}
            {type === 'tidak_dikenal' && (
              <div className="mt-1 text-xs text-rose-100">
                <p>Kode tidak terdaftar dalam panitia event:</p>
                <p className="font-mono font-bold text-white bg-black/20 px-2 py-1 rounded mt-1 break-all">
                  {raw || data?.kode || '-'}
                </p>
              </div>
            )}

            {/* Jika Error Jaringan/Server */}
            {type === 'error' && (
              <p className="mt-1 text-xs text-red-100 leading-relaxed">
                {message || 'Terjadi gangguan komunikasi dengan server Supabase.'}
              </p>
            )}
          </div>
        </div>

        {/* Tombol Tutup Manual */}
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors touch-target -mr-1 -mt-1"
          aria-label="Tutup notifikasi"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
