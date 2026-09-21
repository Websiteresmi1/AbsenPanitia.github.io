'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  RefreshCw,
  Maximize2,
  Minimize2,
  ShieldCheck,
  Layers,
  Sparkles,
  ArrowRight,
  Radio,
  Calendar,
} from 'lucide-react';

export default function PublicLiveDashboard() {
  const [panitiaList, setPanitiaList] = useState([]);
  const [kehadiranList, setKehadiranList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('ALL');
  const [isMounted, setIsMounted] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Helper konversi tanggal ke string YYYY-MM-DD lokal
  const getLocalDateString = useCallback((dateInput) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Format tanggal Indonesia ramah
  const formatLocalDateIndo = useCallback((dateStr) => {
    if (!dateStr || dateStr === 'ALL') return 'Semua Tanggal';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      if (year && month && day) {
        const d = new Date(year, month - 1, day);
        return d.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }, []);

  // Mark mounted (client-only) & mulai jam digital
  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // String hari ini — dari state, bukan new Date() inline (cegah hydration mismatch)
  const todayStr = useMemo(() => getLocalDateString(currentTime), [currentTime, getLocalDateString]);

  // Ambil data panitia dari Supabase
  const fetchStats = useCallback(
    async (showRefreshAnim = false) => {
      if (showRefreshAnim) setIsRefreshing(true);
      try {
        const { data, error } = await supabase
          .from('panitia')
          .select('id, kode, nama, divisi');

        if (!error && data) {
          setPanitiaList(data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Gagal mengambil data panitia:', err);
      } finally {
        setLoading(false);
        if (showRefreshAnim) setTimeout(() => setIsRefreshing(false), 500);
      }
    },
    [supabase]
  );

  // Ambil semua data kehadiran
  const fetchKehadiran = useCallback(
    async () => {
      try {
        const { data, error } = await supabase
          .from('kehadiran')
          .select('id, panitia_id, tanggal_acara, waktu_scan, discan_oleh');

        if (!error && data) {
          setKehadiranList(data);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Gagal mengambil data kehadiran:', err);
      }
    },
    [supabase]
  );

  // Inisialisasi awal dan Supabase Realtime Listener
  useEffect(() => {
    fetchStats();
    fetchKehadiran();

    // Realtime: panitia (penambahan/hapus anggota)
    const channelPanitia = supabase
      .channel('public-panitia-stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'panitia' }, () => {
        fetchStats();
      })
      .subscribe();

    // Realtime: kehadiran (setiap scan baru)
    const channelKehadiran = supabase
      .channel('public-kehadiran-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kehadiran' }, () => {
        fetchKehadiran();
      })
      .subscribe();

    // Fallback polling setiap 15 detik
    const pollInterval = setInterval(() => {
      fetchKehadiran();
    }, 15000);

    return () => {
      supabase.removeChannel(channelPanitia);
      supabase.removeChannel(channelKehadiran);
      clearInterval(pollInterval);
    };
  }, [fetchStats, fetchKehadiran, supabase]);

  // Daftar tanggal unik dari tabel kehadiran (urut terbaru ke terlama)
  const availableDates = useMemo(() => {
    const datesSet = new Set();
    kehadiranList.forEach((k) => {
      if (k.tanggal_acara) datesSet.add(k.tanggal_acara);
    });
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [kehadiranList]);

  // Helper: cari record kehadiran untuk panitia tertentu
  const getKehadiranRecord = useCallback(
    (panitiaId, dateFilterVal = selectedDate) => {
      if (dateFilterVal === 'ALL') {
        return kehadiranList
          .filter((k) => k.panitia_id === panitiaId)
          .sort((a, b) => new Date(b.waktu_scan) - new Date(a.waktu_scan))[0] || null;
      }
      return kehadiranList.find(
        (k) => k.panitia_id === panitiaId && k.tanggal_acara === dateFilterVal
      ) || null;
    },
    [kehadiranList, selectedDate]
  );

  // Helper cek apakah panitia hadir pada tanggal yang dipilih
  const checkIsHadir = useCallback(
    (item, dateFilterVal = selectedDate) => {
      return getKehadiranRecord(item.id, dateFilterVal) !== null;
    },
    [selectedDate, getKehadiranRecord]
  );

  // Kalkulasi agregat data (sinkron dengan tanggal yang dipilih)
  const stats = useMemo(() => {
    const total = panitiaList.length;
    const hadir = panitiaList.filter((p) => checkIsHadir(p, selectedDate)).length;
    const belumHadir = total - hadir;
    const persentase = total > 0 ? Math.round((hadir / total) * 100) : 0;

    // Kelompokkan berdasarkan Divisi sesuai tanggal yang dipilih
    const divisiMap = {};
    panitiaList.forEach((p) => {
      const divName = (p.divisi || 'Lainnya').trim();
      if (!divisiMap[divName]) {
        divisiMap[divName] = { total: 0, hadir: 0 };
      }
      divisiMap[divName].total += 1;
      if (checkIsHadir(p, selectedDate)) {
        divisiMap[divName].hadir += 1;
      }
    });

    // Urutkan divisi secara alfabet
    const divisiStats = Object.keys(divisiMap)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const d = divisiMap[name];
        const pct = d.total > 0 ? Math.round((d.hadir / d.total) * 100) : 0;
        return {
          nama: name,
          total: d.total,
          hadir: d.hadir,
          belumHadir: d.total - d.hadir,
          persentase: pct,
        };
      });

    return { total, hadir, belumHadir, persentase, divisiStats };
  }, [panitiaList, selectedDate, checkIsHadir]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const formatWaktu = (date) => {
    if (!date) return '--:--:--';
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatTanggal = (date) => {
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-pine-950 to-slate-950 text-slate-100 flex flex-col selection:bg-pine-500 selection:text-white">
      {/* Top Ambient Glow Effects */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-pine-500/10 rounded-full blur-3xl pointer-events-none -z-0" />
      <div className="fixed top-20 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-0" />

      {/* Header Bar (Sticky saat scroll) */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/95 backdrop-blur-md shadow-lg shadow-black/30 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          {/* Logo & Judul Event */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <img
              src="/AbsenPanitia.github.io/LOGO.png"
              alt="Logo"
              className="h-9 sm:h-11 w-auto max-w-[120px] sm:max-w-[160px] object-contain shrink-0 drop-shadow-sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-xl font-bold tracking-tight text-white truncate">
                  APSMBI 2026
                </h1>
                <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <Radio className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-pulse text-emerald-400" />
                  LIVE
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate hidden sm:block">
                Papan Pantau Kehadiran Panitia Real-time
              </p>
            </div>
          </div>

          {/* Jam & Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Tanggal & Waktu Real-time */}
            <div className="hidden lg:flex flex-col text-right pr-2 border-r border-white/10" suppressHydrationWarning>
              <span className="text-sm font-semibold tracking-wide text-white font-mono" suppressHydrationWarning>
                {isMounted ? formatWaktu(currentTime) : '--:--:--'} WIB
              </span>
              <span className="text-[11px] text-slate-400" suppressHydrationWarning>
                {isMounted ? formatTanggal(currentTime) : ''}
              </span>
            </div>

            {/* Tombol Segarkan */}
            <button
              onClick={() => fetchStats(true)}
              disabled={isRefreshing}
              title="Segarkan data terbaru"
              className="p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all flex items-center gap-1.5 active:scale-95 touch-target sm:touch-auto"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`}
              />
              <span className="hidden md:inline">Refresh</span>
            </button>

            {/* Tombol Fullscreen Display */}
            <button
              onClick={toggleFullscreen}
              title="Mode Layar Penuh (TV / Proyektor)"
              className="p-2 sm:px-3 sm:py-2 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all flex items-center gap-1.5 active:scale-95 touch-target sm:touch-auto"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
              <span className="hidden md:inline">Layar Penuh</span>
            </button>

            {/* Tombol Masuk Admin */}
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-emerald-900/30 transition-all active:scale-95 ring-1 ring-white/20 touch-target sm:touch-auto"
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Portal Admin</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-6 sm:gap-8">
        {/* Banner Status Real-time */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-medium text-emerald-400">Sinkronisasi Aktif</span>
            <span className="text-slate-500">•</span>
            <span>Data diperbarui otomatis saat scan QR berlangsung</span>
          </div>
          <div className="text-slate-400" suppressHydrationWarning>
            Terakhir cek: {isMounted ? formatWaktu(lastUpdated) : '--:--:--'} WIB
          </div>
        </div>

        {/* ── Filter Tanggal ── */}
        <section className="rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md overflow-hidden">
          {/* Baris atas: label aktif + input kalender bebas */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Filter Tanggal:{' '}
                <span className="text-emerald-400 font-bold">
                  {selectedDate === 'ALL' ? 'Semua Tanggal' : formatLocalDateIndo(selectedDate)}
                </span>
              </span>
            </div>

            {/* Input kalender — pilih tanggal bebas */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <input
                type="date"
                value={selectedDate === 'ALL' ? '' : selectedDate}
                onChange={(e) => setSelectedDate(e.target.value || 'ALL')}
                title="Pilih tanggal acara secara bebas"
                className="pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500/50 focus:bg-white/10 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Baris bawah: tombol pintasan cepat */}
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3">
            {/* Semua Tanggal */}
            <button
              type="button"
              onClick={() => setSelectedDate('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                selectedDate === 'ALL'
                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-900/40'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              Semua Tanggal
            </button>

            {/* Hari Ini */}
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                selectedDate === todayStr
                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-900/40'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              Hari Ini
            </button>

            {/* Tombol per tanggal unik dari database (kecuali hari ini agar tidak duplikat) */}
            {availableDates
              .filter((d) => d !== todayStr)
              .map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                    selectedDate === d
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-md shadow-emerald-900/40'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {formatLocalDateIndo(d)}
                </button>
              ))}

            {availableDates.length === 0 && !loading && (
              <span className="text-xs text-slate-500 italic">
                Belum ada data scan tersedia
              </span>
            )}
          </div>
        </section>

        {/* 4 Kartu Metrik Utama */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5">
          {/* Card 1: Total Panitia */}
          <div className="relative overflow-hidden rounded-2xl bg-white/[0.04] border border-white/10 p-4 sm:p-6 backdrop-blur-md hover:border-white/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-medium text-slate-400">
                Total Panitia
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                {loading ? '...' : stats.total}
              </span>
              <span className="text-xs text-slate-400">orang</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Panitia terdaftar dalam sistem
            </p>
          </div>

          {/* Card 2: Sudah Hadir */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/30 p-4 sm:p-6 backdrop-blur-md shadow-lg shadow-emerald-950/20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-medium text-emerald-400">
                Sudah Hadir
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-emerald-300">
                {loading ? '...' : stats.hadir}
              </span>
              <span className="text-xs text-emerald-400">orang</span>
            </div>
            <p className="text-[11px] text-emerald-400/80 mt-2">
              Tercatat hadir melalui scan QR
            </p>
          </div>

          {/* Card 3: Belum Hadir */}
          <div className="relative overflow-hidden rounded-2xl bg-white/[0.04] border border-white/10 p-4 sm:p-6 backdrop-blur-md hover:border-white/20 transition-all">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-medium text-slate-400">
                Belum Hadir
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight text-amber-300">
                {loading ? '...' : stats.belumHadir}
              </span>
              <span className="text-xs text-slate-400">orang</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Belum melakukan presensi
            </p>
          </div>

          {/* Card 4: Persentase Kehadiran */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pine-500/15 to-transparent border border-pine-500/30 p-4 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs sm:text-sm font-medium text-pine-300">
                Tingkat Kehadiran
              </span>
              <div className="w-9 h-9 rounded-xl bg-pine-500/20 text-pine-300 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                {loading ? '...' : `${stats.persentase}%`}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 mt-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-pine-400 to-emerald-400 h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${stats.persentase}%` }}
              />
            </div>
          </div>
        </section>

        {/* Mega Progress Bar Banner */}
        <section className="rounded-2xl bg-gradient-to-r from-pine-900/60 via-slate-900/80 to-emerald-950/60 border border-white/10 p-5 sm:p-7 backdrop-blur-md shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Progress Keseluruhan Kehadiran
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {stats.hadir} dari {stats.total} panitia telah hadir
                {selectedDate !== 'ALL' && (
                  <span className="text-emerald-400 font-medium"> · {formatLocalDateIndo(selectedDate)}</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                {stats.persentase}%
              </span>
            </div>
          </div>

          <div className="relative w-full h-4 sm:h-5 bg-slate-950/70 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-pine-500 via-emerald-500 to-teal-400 rounded-full transition-all duration-1000 ease-out shadow-lg shadow-emerald-500/50"
              style={{ width: `${stats.persentase}%` }}
            />
          </div>
        </section>

        {/* Rekap Statistik per Divisi */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Statistik Kehadiran per Divisi
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {stats.divisiStats.length} Divisi Terdata
            </span>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-emerald-400" />
              <p className="text-sm">Memuat statistik divisi...</p>
            </div>
          ) : stats.divisiStats.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-8 text-center text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Belum ada data panitia</p>
              <p className="text-xs text-slate-500 mt-1">
                Admin dapat menambahkan panitia di Portal Admin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.divisiStats.map((div) => {
                const isComplete = div.persentase === 100 && div.total > 0;
                const isGood = div.persentase >= 75;

                return (
                  <div
                    key={div.nama}
                    className={`rounded-2xl p-4 sm:p-5 border transition-all duration-200 backdrop-blur-md ${
                      isComplete
                        ? 'bg-emerald-950/30 border-emerald-500/40 shadow-sm shadow-emerald-950/40'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold text-white">
                          {div.nama}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {div.hadir} dari {div.total} hadir
                        </p>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                          isComplete
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : isGood
                            ? 'bg-pine-500/20 text-pine-300 border-pine-500/40'
                            : 'bg-white/10 text-slate-300 border-white/10'
                        }`}
                      >
                        {div.persentase}%
                      </span>
                    </div>

                    {/* Divisi Progress Bar */}
                    <div className="w-full bg-slate-950/60 rounded-full h-2 overflow-hidden border border-white/5">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          isComplete
                            ? 'bg-emerald-400'
                            : isGood
                            ? 'bg-pine-400'
                            : 'bg-amber-400'
                        }`}
                        style={{ width: `${div.persentase}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center mt-3 text-[11px] text-slate-400">
                      <span>Belum hadir: {div.belumHadir}</span>
                      {isComplete && (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Lengkap
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* CTA Admin Footer Banner */}
        <section className="mt-4 rounded-2xl bg-white/[0.02] border border-white/10 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-pine-800 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">
                Apakah Anda Admin / Petugas Presensi?
              </h4>
              <p className="text-xs text-slate-400">
                Masuk ke Portal Admin untuk memindai QR Code, mengelola data panitia, dan unduh laporan Excel.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-medium border border-white/15 transition-all active:scale-95"
          >
            <span>Buka Scanner Admin</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-5 text-center text-xs text-slate-500">
        <p>
          Sistem Absensi Event Panitia APSMBI 2026 • Real-time Sync didukung oleh Supabase
        </p>
      </footer>
    </div>
  );
}
