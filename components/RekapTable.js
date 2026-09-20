'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDateTime, formatDateForFilename } from '@/lib/format';
import * as XLSX from 'xlsx';
import {
  Users,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Download,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  Radio,
  Loader2,
  Calendar,
} from 'lucide-react';

export default function RekapTable() {
  const [panitiaList, setPanitiaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting'); // connecting, connected, error
  const [searchQuery, setSearchQuery] = useState('');
  const [divisiFilter, setDivisiFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, HADIR, BELUM_HADIR
  const [selectedDate, setSelectedDate] = useState('ALL'); // 'ALL' atau format 'YYYY-MM-DD'
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

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

  const [kehadiranList, setKehadiranList] = useState([]); // semua baris tabel kehadiran

  const supabase = createClient();

  // Ambil user email saat ini
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setCurrentUserEmail(data.user.email);
      }
    });
  }, [supabase]);

  // Fetch seluruh data panitia
  const fetchPanitia = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('panitia')
        .select('*')
        .order('nama', { ascending: true });

      if (!error && data) {
        setPanitiaList(data);
      }
    } catch (err) {
      console.error('Gagal mengambil data rekap:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Fetch seluruh data kehadiran
  const fetchKehadiran = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('kehadiran')
        .select('id, panitia_id, tanggal_acara, waktu_scan, discan_oleh');

      if (!error && data) {
        setKehadiranList(data);
      }
    } catch (err) {
      console.error('Gagal mengambil data kehadiran:', err);
    }
  }, [supabase]);

  // Inisialisasi data dan Supabase Realtime Subscription
  useEffect(() => {
    fetchPanitia();
    fetchKehadiran();

    // Realtime: panitia (INSERT/UPDATE/DELETE)
    const channelPanitia = supabase
      .channel('rekap-panitia-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'panitia' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPanitiaList((prev) => {
              const exists = prev.some((p) => p.id === payload.new.id);
              if (exists) return prev;
              return [...prev, payload.new].sort((a, b) => a.nama.localeCompare(b.nama));
            });
          } else if (payload.eventType === 'UPDATE') {
            setPanitiaList((prev) =>
              prev.map((item) => item.id === payload.new.id ? { ...item, ...payload.new } : item)
            );
          } else if (payload.eventType === 'DELETE') {
            setPanitiaList((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('error');
      });

    // Realtime: kehadiran (INSERT/DELETE)
    const channelKehadiran = supabase
      .channel('rekap-kehadiran-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kehadiran' },
        () => { fetchKehadiran(); }
      )
      .subscribe();

    return () => {
      channelPanitia.unsubscribe();
      channelKehadiran.unsubscribe();
    };
  }, [fetchPanitia, fetchKehadiran, supabase]);

  // Daftar divisi unik untuk dropdown filter
  const divisiOptions = useMemo(() => {
    const list = Array.from(new Set(panitiaList.map((p) => p.divisi))).filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b));
  }, [panitiaList]);

  // Daftar tanggal unik dari tabel kehadiran (urut terbaru ke terlama)
  const availableDates = useMemo(() => {
    const datesSet = new Set();
    kehadiranList.forEach((k) => {
      if (k.tanggal_acara) datesSet.add(k.tanggal_acara);
    });
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a));
  }, [kehadiranList]);

  // Helper: cari record kehadiran untuk panitia tertentu pada tanggal tertentu
  const getKehadiranRecord = useCallback(
    (panitiaId, dateFilterVal = selectedDate) => {
      if (dateFilterVal === 'ALL') {
        // Ambil yang terbaru
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

  // Helper verifikasi apakah panitia hadir pada tanggal yang dipilih
  const checkIsHadir = useCallback(
    (item, dateFilterVal = selectedDate) => {
      return getKehadiranRecord(item.id, dateFilterVal) !== null;
    },
    [selectedDate, getKehadiranRecord]
  );

  // Perhitungan statistik ringkasan (menyesuaikan dengan tanggal yang dipilih)
  const stats = useMemo(() => {
    const total = panitiaList.length;
    const hadir = panitiaList.filter((p) => checkIsHadir(p, selectedDate)).length;
    const belumHadir = total - hadir;
    const persen = total > 0 ? Math.round((hadir / total) * 100) : 0;

    // Hitung per divisi sesuai tanggal yang dipilih
    const perDivisi = {};
    panitiaList.forEach((p) => {
      if (!perDivisi[p.divisi]) {
        perDivisi[p.divisi] = { total: 0, hadir: 0 };
      }
      perDivisi[p.divisi].total += 1;
      if (checkIsHadir(p, selectedDate)) {
        perDivisi[p.divisi].hadir += 1;
      }
    });

    return { total, hadir, belumHadir, persen, perDivisi };
  }, [panitiaList, selectedDate, checkIsHadir]);

  // Data yang difilter dan dicari
  const filteredPanitia = useMemo(() => {
    return panitiaList.filter((p) => {
      // Filter Pencarian
      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        p.nama.toLowerCase().includes(query) ||
        p.divisi.toLowerCase().includes(query) ||
        p.kode.toLowerCase().includes(query);

      // Filter Divisi
      const matchDivisi = divisiFilter === 'ALL' || p.divisi === divisiFilter;

      // Filter Status sesuai tanggal yang dipilih
      const isHadir = checkIsHadir(p, selectedDate);
      let matchStatus = true;
      if (statusFilter === 'HADIR') matchStatus = isHadir;
      if (statusFilter === 'BELUM_HADIR') matchStatus = !isHadir;

      return matchSearch && matchDivisi && matchStatus;
    });
  }, [panitiaList, searchQuery, divisiFilter, statusFilter, selectedDate, checkIsHadir]);

  // Ekspor Data ke Excel (.xlsx) dengan SheetJS
  const handleExportExcel = () => {
    if (filteredPanitia.length === 0) {
      alert('Tidak ada data yang dapat diekspor.');
      return;
    }

    const rows = filteredPanitia.map((item, idx) => {
      const rec = getKehadiranRecord(item.id, selectedDate);
      const isHadir = rec !== null;
      return {
        No: idx + 1,
        'Kode QR': item.kode,
        'Nama Panitia': item.nama,
        Divisi: item.divisi,
        'Tanggal Rekap': selectedDate === 'ALL' ? 'Semua Tanggal' : selectedDate,
        'Waktu Scan': isHadir && rec?.waktu_scan ? formatDateTime(rec.waktu_scan) : '-',
        'Discan Oleh': isHadir && rec?.discan_oleh ? rec.discan_oleh : '-',
        Status: isHadir ? 'Hadir' : 'Belum Hadir',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Atur lebar kolom agar rapi
    worksheet['!cols'] = [
      { wch: 6 },  // No
      { wch: 12 }, // Kode QR
      { wch: 28 }, // Nama Panitia
      { wch: 25 }, // Divisi
      { wch: 16 }, // Tanggal Rekap
      { wch: 25 }, // Waktu Scan
      { wch: 25 }, // Discan Oleh
      { wch: 14 }, // Status
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi');

    const dateSuffix = selectedDate === 'ALL' ? 'semua-tanggal' : selectedDate;
    const fileName = `rekap-absensi-${dateSuffix}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Toggle Hadirkan / Batalkan Manual per Baris
  const handleToggleKehadiran = async (item) => {
    const isCurrentlyHadir = checkIsHadir(item, selectedDate);
    const targetDate = selectedDate !== 'ALL' ? selectedDate : getLocalDateString(new Date());
    const [y, m, d] = targetDate.split('-').map(Number);
    const now = new Date();
    const scanTimestamp = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();

    try {
      if (isCurrentlyHadir) {
        // Batalkan kehadiran — hapus baris di tabel kehadiran
        const { error } = await supabase
          .from('kehadiran')
          .delete()
          .eq('panitia_id', item.id)
          .eq('tanggal_acara', targetDate);

        if (error) throw error;
      } else {
        // Hadirkan manual — INSERT ke tabel kehadiran
        const { error } = await supabase
          .from('kehadiran')
          .insert({
            panitia_id: item.id,
            tanggal_acara: targetDate,
            waktu_scan: scanTimestamp,
            discan_oleh: currentUserEmail || 'admin-manual',
          });

        if (error) throw error;
      }
      // Refresh data kehadiran
      fetchKehadiran();
    } catch (err) {
      alert(`Gagal mengubah status: ${err.message}`);
    }
  };

  // Kosongkan Seluruh Kehadiran
  const handleResetAll = async () => {
    setResetting(true);
    try {
      if (selectedDate !== 'ALL') {
        const { error: errKehadiran } = await supabase
          .from('kehadiran')
          .delete()
          .eq('tanggal_acara', selectedDate);

        if (errKehadiran) throw errKehadiran;
      } else {
        const { error: errKehadiran } = await supabase
          .from('kehadiran')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (errKehadiran) throw errKehadiran;

        await supabase
          .from('panitia')
          .update({
            waktu_scan: null,
            discan_oleh: null,
          })
          .not('waktu_scan', 'is', null);
      }

      fetchKehadiran();
      fetchPanitia();
      setConfirmResetOpen(false);
    } catch (err) {
      alert(`Gagal mengosongkan kehadiran: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-pine-800 mx-auto mb-2" />
        <p className="text-sm">Memuat data rekap...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Status Realtime */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Rekap Kehadiran Panitia
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Data tersinkronisasi otomatis antar semua perangkat admin
          </p>
        </div>

        {/* Indikator Real-time */}
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium shadow-2xs">
          <Radio
            className={`w-3.5 h-3.5 ${
              realtimeStatus === 'connected'
                ? 'text-emerald-500 animate-pulse'
                : 'text-amber-500'
            }`}
          />
          <span className="text-slate-600">
            {realtimeStatus === 'connected' ? 'Terhubung' : 'Menghubungkan...'}
          </span>
        </div>
      </div>

      {/* Kartu Ringkasan Utama (Progress Bar & Statistik) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Total Panitia</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">
              {stats.total}
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
            <p className="text-xs font-medium text-emerald-800">Sudah Hadir</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">
              {stats.hadir}{' '}
              <span className="text-xs font-normal text-emerald-600">
                ({stats.persen}%)
              </span>
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-100 col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-amber-800">Belum Hadir</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">
              {stats.belumHadir}
            </p>
          </div>
        </div>

        {/* Progress Bar Kehadiran */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-600 font-medium">
            <span>Tingkat Kehadiran Keseluruhan</span>
            <span>{stats.persen}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-pine-800 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${stats.persen}%` }}
            />
          </div>
        </div>

        {/* Breakdown Hadir per Divisi */}
        {Object.keys(stats.perDivisi).length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-700 mb-2.5 uppercase tracking-wider">
              Rekap Hadir per Divisi
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(stats.perDivisi).map(([divisi, data]) => {
                const divPersen =
                  data.total > 0 ? Math.round((data.hadir / data.total) * 100) : 0;
                return (
                  <div
                    key={divisi}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                  >
                    <p className="font-semibold text-slate-800 truncate" title={divisi}>
                      {divisi}
                    </p>
                    <div className="flex items-center justify-between mt-1 text-slate-500">
                      <span>
                        {data.hadir}/{data.total}
                      </span>
                      <span className="font-medium text-pine-800">
                        {divPersen}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Kontrol: Pencarian, Filter & Aksi */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
        {/* Pintasan Tanggal Cepat */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <Calendar className="w-4 h-4 text-pine-800 shrink-0" />
            <span>
              Rekap Tanggal:{' '}
              <strong className="text-slate-900 font-semibold">
                {selectedDate === 'ALL'
                  ? 'Semua Tanggal (Akumulatif)'
                  : formatLocalDateIndo(selectedDate)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              id="quick-date-all"
              type="button"
              onClick={() => setSelectedDate('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedDate === 'ALL'
                  ? 'bg-pine-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua Tanggal
            </button>

            <button
              id="quick-date-today"
              type="button"
              onClick={() => setSelectedDate(getLocalDateString(new Date()))}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedDate === getLocalDateString(new Date())
                  ? 'bg-pine-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Hari Ini
            </button>

            {availableDates
              .filter((d) => d !== getLocalDateString(new Date()))
              .slice(0, 4)
              .map((dStr) => (
                <button
                  key={dStr}
                  type="button"
                  onClick={() => setSelectedDate(dStr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    selectedDate === dStr
                      ? 'bg-pine-800 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {formatLocalDateIndo(dStr)}
                </button>
              ))}
          </div>
        </div>

        {/* Grid 4 Kolom: Cari, Pilih Tanggal, Divisi, Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Kolom Pencarian */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="search-panitia-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, divisi, kode..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white transition-colors"
            />
          </div>

          {/* Kolom Pilih Tanggal Tertentu */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Calendar className="w-4 h-4" />
            </div>
            <input
              id="filter-date-input"
              type="date"
              value={selectedDate === 'ALL' ? '' : selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || 'ALL')}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white text-slate-800 transition-colors"
              title="Pilih tanggal khusus pelaksanaan acara"
            />
          </div>

          {/* Filter Divisi */}
          <div className="relative">
            <select
              id="filter-divisi-select"
              value={divisiFilter}
              onChange={(e) => setDivisiFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white text-slate-800 transition-colors"
            >
              <option value="ALL">Semua Divisi</option>
              {divisiOptions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status */}
          <div className="relative">
            <select
              id="filter-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white text-slate-800 transition-colors"
            >
              <option value="ALL">Semua Status</option>
              <option value="HADIR">Hadir ({stats.hadir})</option>
              <option value="BELUM_HADIR">Belum Hadir ({stats.belumHadir})</option>
            </select>
          </div>
        </div>

        {/* Tombol Aksi: Download Excel & Kosongkan */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">
            Menampilkan <strong>{filteredPanitia.length}</strong> dari{' '}
            <strong>{stats.total}</strong> panitia
          </span>

          <div className="flex items-center gap-2">
            <button
              id="download-excel-btn"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-pine-800 hover:bg-pine-900 text-white rounded-xl text-xs font-medium shadow-2xs transition-colors touch-target"
            >
              <Download className="w-4 h-4" />
              <span>Download Excel</span>
            </button>

            <button
              id="reset-all-btn"
              onClick={() => setConfirmResetOpen(true)}
              disabled={stats.hadir === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 rounded-xl text-xs font-medium transition-colors touch-target disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Kosongkan Semua</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabel Data Rekap (Bisa digeser horizontal di HP) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-xs text-slate-600 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Nama Panitia</th>
                <th className="py-3 px-4">Divisi</th>
                <th className="py-3 px-4">Waktu Scan</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredPanitia.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {panitiaList.length === 0
                        ? 'Belum ada data panitia. Buka menu Panitia untuk mengimpor data.'
                        : 'Tidak ada data panitia yang cocok dengan filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPanitia.map((item, index) => {
                  const isHadir = checkIsHadir(item, selectedDate);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="py-3.5 px-4 text-center text-xs text-slate-400 font-mono">
                        {index + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 leading-tight">
                          {item.nama}
                        </p>
                        <p className="text-xs font-mono text-slate-400 mt-0.5">
                          {item.kode}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="inline-block px-2.5 py-1 rounded-md bg-slate-100 text-xs font-medium text-slate-700">
                          {item.divisi}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {isHadir ? (
                          <div>
                            <p className="font-semibold text-slate-800">
                              {formatDateTime(item.waktu_scan)}
                            </p>
                            {item.discan_oleh && (
                              <p className="text-[11px] text-slate-400 truncate max-w-[150px]">
                                oleh: {item.discan_oleh}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isHadir ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3" />
                            <span>Hadir</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            Belum Hadir
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleKehadiran(item)}
                          title={
                            isHadir
                              ? 'Batalkan status hadir'
                              : 'Tandai hadir secara manual'
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors touch-target ${
                            isHadir
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'bg-pine-50 text-pine-800 hover:bg-pine-100'
                          }`}
                        >
                          {isHadir ? 'Batalkan' : 'Hadirkan'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Konfirmasi Kosongkan Semua Kehadiran */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-900 mb-2">
              Kosongkan Semua Kehadiran?
            </h3>
            <p className="text-xs text-slate-500 text-center leading-relaxed mb-6">
              Tindakan ini akan mengosongkan status kehadiran{' '}
              <strong>{stats.hadir} panitia</strong> yang sudah hadir menjadi Belum Hadir. Riwayat jam scan akan dihapus.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                disabled={resetting}
                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors touch-target"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetAll}
                disabled={resetting}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors touch-target flex items-center justify-center gap-1.5"
              >
                {resetting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Ya, Kosongkan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
