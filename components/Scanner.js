'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { createClient } from '@/lib/supabase/client';
import Notification from './Notification';
import { formatTime } from '@/lib/format';
import {
  Camera,
  CameraOff,
  Keyboard,
  Clock,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Calendar,
  CalendarCheck,
} from 'lucide-react';

// Helper format tanggal lokal YYYY-MM-DD
const getLocalDateString = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Helper format tanggal lokal bahasa Indonesia
const formatLocalDateIndo = (dateStr) => {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(dateObj);
  } catch (e) {
    return dateStr;
  }
};

export default function Scanner() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [notification, setNotification] = useState(null);
  const [latestAttendances, setLatestAttendances] = useState([]);
  const [isHttps, setIsHttps] = useState(true);

  // Tanggal Hari Ini & Tanggal Terpilih untuk Pencatatan Scan
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString(new Date()));
  const [availableDates, setAvailableDates] = useState([]);

  // Ref untuk selectedDate agar closure Html5Qrcode selalu membaca nilai tanggal terbaru tanpa restart kamera
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const scannerRef = useRef(null);
  const lastScannedRef = useRef({ code: '', date: '', time: 0 });
  const supabase = createClient();

  // Fetch daftar tanggal yang pernah tercatat kehadiran di database
  const fetchAvailableDates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('kehadiran')
        .select('tanggal_acara');

      if (!error && data) {
        const datesSet = new Set();
        datesSet.add(todayStr);
        data.forEach((k) => {
          if (k.tanggal_acara) datesSet.add(k.tanggal_acara);
        });
        setAvailableDates(Array.from(datesSet).sort((a, b) => b.localeCompare(a)));
      }
    } catch (err) {
      console.error('Gagal mengambil daftar tanggal acara:', err);
    }
  }, [supabase, todayStr]);

  // Fetch 5 data kehadiran panitia terbaru
  const fetchLatestAttendances = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('kehadiran')
        .select('id, waktu_scan, discan_oleh, tanggal_acara, panitia:panitia_id(id, kode, nama, divisi)')
        .order('waktu_scan', { ascending: false })
        .limit(5);

      if (!error && data) {
        setLatestAttendances(
          data.map((k) => ({
            id: k.id,
            kode: k.panitia?.kode,
            nama: k.panitia?.nama,
            divisi: k.panitia?.divisi,
            waktu_scan: k.waktu_scan,
            tanggal_acara: k.tanggal_acara,
            discan_oleh: k.discan_oleh,
          }))
        );
      }
    } catch (err) {
      console.error('Gagal mengambil kehadiran terbaru:', err);
    }
  }, [supabase]);

  // Fungsi pemrosesan kode QR atau kode manual
  const processAttendanceCode = useCallback(
    async (codeToProcess) => {
      const cleanCode = (codeToProcess || '').trim();
      if (!cleanCode) return;

      const targetDate = selectedDateRef.current || getLocalDateString(new Date());

      try {
        // 1. Coba panggil RPC catat_kehadiran dengan p_kode dan p_tanggal
        let rpcData = null;
        let rpcError = null;

        try {
          const res = await supabase.rpc('catat_kehadiran', {
            p_kode: cleanCode,
            p_tanggal: targetDate,
          });
          rpcData = res.data;
          rpcError = res.error;
        } catch (e) {
          rpcError = e;
        }

        // 2. Jika fungsi RPC belum di-update di schema cache Supabase, lakukan pemrosesan langsung
        const isFunctionMissing =
          rpcError &&
          (rpcError.message?.includes('schema cache') ||
            rpcError.message?.includes('catat_kehadiran') ||
            rpcError.code === 'PGRST202' ||
            rpcError.code === '42883');

        if (isFunctionMissing) {
          console.warn('RPC catat_kehadiran tidak ditemukan di schema cache. Menggunakan pemrosesan langsung...', rpcError.message);

          // a. Cari data panitia berdasarkan kode
          const { data: panitiaList, error: pErr } = await supabase
            .from('panitia')
            .select('id, kode, nama, divisi');

          if (pErr) throw pErr;

          const panitia = (panitiaList || []).find(
            (p) => (p.kode || '').trim().toUpperCase() === cleanCode.toUpperCase()
          );

          if (!panitia) {
            setNotification({
              type: 'tidak_dikenal',
              data: {
                status: 'tidak_dikenal',
                kode: cleanCode,
                pesan: 'QR Code tidak terdaftar dalam database panitia',
              },
              raw: cleanCode,
            });
            return;
          }

          // b. Cek apakah sudah tercatat hadir pada tanggal target
          const { data: existingKehadiran, error: kErr } = await supabase
            .from('kehadiran')
            .select('id, waktu_scan, discan_oleh')
            .eq('panitia_id', panitia.id)
            .eq('tanggal_acara', targetDate)
            .maybeSingle();

          if (kErr && kErr.code !== 'PGRST116') throw kErr;

          if (existingKehadiran) {
            setNotification({
              type: 'sudah_hadir',
              data: {
                status: 'sudah_hadir',
                id: panitia.id,
                kode: panitia.kode,
                nama: panitia.nama,
                divisi: panitia.divisi,
                waktu_scan: existingKehadiran.waktu_scan,
                tanggal_acara: targetDate,
                discan_oleh: existingKehadiran.discan_oleh,
                pesan: `Panitia sudah tercatat hadir pada tanggal ${formatLocalDateIndo(targetDate)}`,
              },
              raw: cleanCode,
            });
            return;
          }

          // c. Catat kehadiran baru ke tabel kehadiran
          const { data: sessionData } = await supabase.auth.getSession();
          const adminEmail = sessionData?.session?.user?.email || 'admin';
          const nowIso = new Date().toISOString();

          const { error: insErr } = await supabase
            .from('kehadiran')
            .insert({
              panitia_id: panitia.id,
              tanggal_acara: targetDate,
              waktu_scan: nowIso,
              discan_oleh: adminEmail,
            });

          if (insErr) {
            if (insErr.code === '23505') {
              setNotification({
                type: 'sudah_hadir',
                data: {
                  status: 'sudah_hadir',
                  id: panitia.id,
                  kode: panitia.kode,
                  nama: panitia.nama,
                  divisi: panitia.divisi,
                  waktu_scan: nowIso,
                  tanggal_acara: targetDate,
                  discan_oleh: adminEmail,
                  pesan: `Panitia sudah tercatat hadir pada tanggal ${formatLocalDateIndo(targetDate)}`,
                },
                raw: cleanCode,
              });
              return;
            }
            throw insErr;
          }

          // Update juga tabel panitia agar kompatibel dengan sistem lama
          await supabase
            .from('panitia')
            .update({
              waktu_scan: nowIso,
              discan_oleh: adminEmail,
            })
            .eq('id', panitia.id);

          setNotification({
            type: 'berhasil',
            data: {
              status: 'berhasil',
              id: panitia.id,
              kode: panitia.kode,
              nama: panitia.nama,
              divisi: panitia.divisi,
              waktu_scan: nowIso,
              tanggal_acara: targetDate,
              discan_oleh: adminEmail,
              pesan: 'Kehadiran berhasil dicatat',
            },
            raw: cleanCode,
          });
          fetchLatestAttendances();
          fetchAvailableDates();
          return;
        }

        if (rpcError) {
          setNotification({
            type: 'error',
            message: `Gagal memproses data: ${rpcError.message}`,
            raw: cleanCode,
          });
          return;
        }

        if (rpcData) {
          if (rpcData.status === 'berhasil') {
            setNotification({
              type: 'berhasil',
              data: { ...rpcData, tanggal_acara: targetDate },
              raw: cleanCode,
            });
            fetchLatestAttendances();
            fetchAvailableDates();
          } else if (rpcData.status === 'sudah_hadir') {
            setNotification({
              type: 'sudah_hadir',
              data: { ...rpcData, tanggal_acara: targetDate },
              raw: cleanCode,
            });
          } else if (rpcData.status === 'tidak_dikenal') {
            setNotification({
              type: 'tidak_dikenal',
              data: rpcData,
              raw: cleanCode,
            });
          }
        }
      } catch (err) {
        setNotification({
          type: 'error',
          message: `Gagal memproses data: ${err.message || 'Terjadi kesalahan sistem.'}`,
          raw: cleanCode,
        });
      }
    },
    [supabase, fetchLatestAttendances, fetchAvailableDates]
  );

  // Inisialisasi Scanner Kamera dan Supabase Realtime
  useEffect(() => {
    // 1. Validasi protokol HTTPS (wajib di HP kecuali localhost)
    if (typeof window !== 'undefined') {
      const isSecure =
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      setIsHttps(isSecure);
    }

    // 2. Ambil data awal
    fetchLatestAttendances();
    fetchAvailableDates();

    // 3. Supabase Realtime untuk memperbarui list kehadiran terbaru
    const channel = supabase
      .channel('scanner-latest-attendances')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kehadiran' },
        () => {
          fetchLatestAttendances();
          fetchAvailableDates();
        }
      )
      .subscribe();

    // 4. Konfigurasi dan Mulai Kamera Html5Qrcode
    let scannerInstance = null;
    const scannerElementId = 'qr-reader';

    const startScanner = async () => {
      try {
        setCameraError(null);
        scannerInstance = new Html5Qrcode(scannerElementId);
        scannerRef.current = scannerInstance;

        const config = {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        };

        // Buka kamera belakang HP (facingMode: environment)
        await scannerInstance.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            const now = Date.now();
            const currentSelectedDate = selectedDateRef.current;
            // Debounce 3 detik untuk QR Code dan tanggal yang sama agar tidak terkirim ganda
            if (
              decodedText === lastScannedRef.current.code &&
              currentSelectedDate === lastScannedRef.current.date &&
              now - lastScannedRef.current.time < 3000
            ) {
              return;
            }
            lastScannedRef.current = {
              code: decodedText,
              date: currentSelectedDate,
              time: now,
            };
            processAttendanceCode(decodedText);
          },
          () => {
            // Abaikan frame kosong saat kamera mencari QR
          }
        );

        setCameraActive(true);
      } catch (err) {
        console.warn('Gagal membuka kamera:', err);
        setCameraActive(false);
        const errString = String(err);
        if (
          errString.includes('NotAllowedError') ||
          errString.includes('Permission')
        ) {
          setCameraError(
            'Izin akses kamera ditolak. Berikan izin kamera pada pengaturan browser HP Anda.'
          );
        } else if (
          errString.includes('NotFoundError') ||
          errString.includes('DevicesNotFoundError')
        ) {
          setCameraError('Kamera tidak ditemukan pada perangkat ini.');
        } else {
          setCameraError(
            'Kamera tidak dapat dimulai. Pastikan tidak ada aplikasi lain yang sedang menggunakan kamera.'
          );
        }
      }
    };

    startScanner();

    // 5. Cleanup Kamera saat komponen unmount atau pindah halaman
    return () => {
      channel.unsubscribe();
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current
            .stop()
            .catch((e) => console.log('Error stopping scanner:', e))
            .finally(() => {
              try {
                scannerRef.current.clear();
              } catch (e) {}
            });
        }
      }
    };
  }, [fetchLatestAttendances, fetchAvailableDates, processAttendanceCode, supabase]);

  // Handle submit manual form
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    setSubmittingManual(true);
    await processAttendanceCode(manualCode);
    setManualCode('');
    setSubmittingManual(false);
  };

  // Coba sambungkan ulang kamera
  const restartCamera = async () => {
    setCameraError(null);
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (e) {}
    }

    try {
      const instance = new Html5Qrcode('qr-reader');
      scannerRef.current = instance;
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        (decodedText) => {
          const now = Date.now();
          const currentSelectedDate = selectedDateRef.current;
          if (
            decodedText === lastScannedRef.current.code &&
            currentSelectedDate === lastScannedRef.current.date &&
            now - lastScannedRef.current.time < 3000
          ) {
            return;
          }
          lastScannedRef.current = {
            code: decodedText,
            date: currentSelectedDate,
            time: now,
          };
          processAttendanceCode(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err) {
      setCameraError('Gagal membuka kamera kembali. Muat ulang halaman.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifikasi Hasil Scan Mengambang */}
      <Notification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {/* Peringatan HTTPS jika dibuka di HP tanpa enkripsi */}
      {!isHttps && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-semibold">Peringatan Protokol HTTP</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Browser HP memerlukan koneksi aman <strong>HTTPS</strong> untuk mengizinkan akses kamera. Jika di-deploy di Vercel, HTTPS akan otomatis aktif.
            </p>
          </div>
        </div>
      )}

      {/* PILIHAN TANGGAL PELAKSANAAN SCAN (Seperti Rekap Kehadiran) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pine-50 border border-pine-100 flex items-center justify-center text-pine-800">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Tanggal Pelaksanaan Scan
              </h2>
              <p className="text-xs text-slate-500">
                Pilih hari pelaksanaan untuk mencatat kehadiran scan
              </p>
            </div>
          </div>

          {/* Badge Tanggal Aktif */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-pine-800 text-white rounded-xl text-xs font-semibold shadow-2xs self-start sm:self-auto">
            <span className="opacity-80 font-normal">Target Scan:</span>
            <span className="font-bold">
              {formatLocalDateIndo(selectedDate)}
            </span>
            {selectedDate === todayStr && (
              <span className="px-1.5 py-0.5 bg-white/20 text-white text-[10px] font-bold rounded">
                Hari Ini
              </span>
            )}
          </div>
        </div>

        {/* Pilihan Tombol Cepat Tanggal & Date Picker Bebas */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-xs font-medium text-slate-500 mr-1">
            Pilihan:
          </span>

          {/* Tombol Hari Ini */}
          <button
            id="scan-date-today"
            type="button"
            onClick={() => setSelectedDate(todayStr)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              selectedDate === todayStr
                ? 'bg-pine-800 text-white shadow-xs scale-105'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Hari Ini ({formatLocalDateIndo(todayStr)})
          </button>

          {/* Tanggal-tanggal lain yang sudah pernah tercatat */}
          {availableDates
            .filter((d) => d !== todayStr)
            .map((dStr) => (
              <button
                key={dStr}
                type="button"
                onClick={() => setSelectedDate(dStr)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selectedDate === dStr
                    ? 'bg-pine-800 text-white shadow-xs scale-105'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {formatLocalDateIndo(dStr)}
              </button>
            ))}

          {/* Input Tanggal Manual Bebas */}
          <div className="relative inline-flex items-center ml-auto">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <input
              id="scan-date-custom-input"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-pine-800 cursor-pointer transition-colors"
              title="Pilih tanggal khusus pelaksanaan acara"
            />
          </div>
        </div>
      </div>

      {/* Kotak Preview Kamera Scanner */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-pine-800" />
            <h2 className="text-base font-bold text-slate-900">
              Pindai QR Code ID Card
            </h2>
          </div>
          {cameraActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Kamera Aktif
            </span>
          )}
        </div>

        <div className="p-4">
          <div className="relative bg-slate-900 rounded-xl overflow-hidden min-h-[280px] sm:min-h-[320px] flex items-center justify-center">
            {/* Target Div untuk Html5Qrcode */}
            <div id="qr-reader" className="w-full" />

            {/* State jika kamera error atau izin ditolak */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center text-white z-10">
                <CameraOff className="w-12 h-12 text-rose-400 mb-3" />
                <h3 className="font-semibold text-base mb-1">Akses Kamera Terkendala</h3>
                <p className="text-xs text-slate-300 max-w-xs mb-4 leading-relaxed">
                  {cameraError}
                </p>
                <button
                  onClick={restartCamera}
                  className="px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors touch-target"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Coba Lagi</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <p>
              Arahkan kamera ke QR Code pada ID Card panitia.
            </p>
            <span className="text-[11px] font-semibold text-pine-800 bg-pine-50 px-2 py-0.5 rounded-md">
              Tanggal: {selectedDate}
            </span>
          </div>
        </div>
      </div>

      {/* Input Kode Manual (Cadangan jika kamera atau QR rusak) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-pine-800" />
            <h3 className="text-sm font-bold text-slate-900">
              Input Kode Manual (Cadangan)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            Mencatat untuk: <strong className="text-slate-700">{formatLocalDateIndo(selectedDate)}</strong>
          </span>
        </div>

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            id="manual-code-input"
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Contoh: PNT-001"
            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white uppercase font-mono transition-colors"
          />
          <button
            id="submit-manual-btn"
            type="submit"
            disabled={submittingManual || !manualCode.trim()}
            className="px-5 py-2.5 bg-pine-800 hover:bg-pine-900 text-white text-sm font-medium rounded-xl shadow-xs transition-colors flex items-center gap-1.5 touch-target disabled:opacity-50"
          >
            {submittingManual ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span>Catat</span>
            )}
          </button>
        </form>
      </div>

      {/* 5 Kehadiran Terbaru (Real-time update) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-pine-800" />
            <h3 className="text-sm font-bold text-slate-900">
              5 Kehadiran Terakhir
            </h3>
          </div>
          <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Real-time
          </span>
        </div>

        {latestAttendances.length === 0 ? (
          <div className="py-6 text-center text-slate-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-1 opacity-50" />
            <p className="text-xs">Belum ada panitia yang hadir.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {latestAttendances.map((item) => (
              <div
                key={item.id}
                className="py-2.5 flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 truncate text-sm">
                      {item.nama}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {item.divisi} &bull; <span className="font-mono">{item.kode}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                  <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {formatTime(item.waktu_scan)}
                  </span>
                  {item.tanggal_acara && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      {formatLocalDateIndo(item.tanggal_acara)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
