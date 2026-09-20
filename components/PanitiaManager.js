'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import {
  Users,
  Upload,
  Download,
  Printer,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  QrCode,
  Search,
} from 'lucide-react';

export default function PanitiaManager() {
  const [panitiaList, setPanitiaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal States
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ kode: '', nama: '', divisi: '' });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Import Modal States
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState('tambah'); // 'tambah' | 'ganti'
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  // Delete Confirm Modal
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);
  const supabase = createClient();

  // Fetch data panitia
  const fetchPanitia = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('panitia')
        .select('*')
        .order('kode', { ascending: true });

      if (!error && data) {
        setPanitiaList(data);
      }
    } catch (err) {
      console.error('Gagal mengambil data panitia:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchPanitia();
  }, [fetchPanitia]);

  // Cari angka terbesar untuk auto-generate kode PNT-xxx
  const generateNextKode = (existingList = panitiaList) => {
    let maxNumber = 0;
    existingList.forEach((p) => {
      const match = (p.kode || '').match(/PNT-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    });
    const nextNum = maxNumber + 1;
    return `PNT-${String(nextNum).padStart(3, '0')}`;
  };

  // Buka Modal Tambah
  const handleOpenAddModal = () => {
    setEditingItem(null);
    setFormData({
      kode: generateNextKode(),
      nama: '',
      divisi: '',
    });
    setFormError('');
    setFormModalOpen(true);
  };

  // Buka Modal Edit
  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      kode: item.kode,
      nama: item.nama,
      divisi: item.divisi,
    });
    setFormError('');
    setFormModalOpen(true);
  };

  // Simpan Tambah / Edit
  const handleSavePanitia = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanKode = formData.kode.trim().toUpperCase();
    const cleanNama = formData.nama.trim();
    const cleanDivisi = formData.divisi.trim();

    if (!cleanNama) {
      setFormError('Nama panitia wajib diisi.');
      return;
    }
    if (!cleanDivisi) {
      setFormError('Divisi panitia wajib diisi.');
      return;
    }
    if (!cleanKode) {
      setFormError('Kode unik QR wajib diisi.');
      return;
    }

    setFormSubmitting(true);

    try {
      if (editingItem) {
        // Mode Update
        const { error } = await supabase
          .from('panitia')
          .update({
            kode: cleanKode,
            nama: cleanNama,
            divisi: cleanDivisi,
          })
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        // Mode Insert
        const { error } = await supabase.from('panitia').insert([
          {
            kode: cleanKode,
            nama: cleanNama,
            divisi: cleanDivisi,
          },
        ]);

        if (error) {
          if (error.code === '23505') {
            throw new Error(`Kode "${cleanKode}" sudah digunakan panitia lain.`);
          }
          throw error;
        }
      }

      setFormModalOpen(false);
      fetchPanitia();
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan data panitia.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Hapus Panitia
  const handleDeletePanitia = async () => {
    if (!deleteItem) return;
    setDeleting(true);

    try {
      const { error } = await supabase
        .from('panitia')
        .delete()
        .eq('id', deleteItem.id);

      if (error) throw error;
      setDeleteItem(null);
      fetchPanitia();
    } catch (err) {
      alert(`Gagal menghapus data: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Unduh Template Excel Contoh 2 Baris
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Kode: 'PNT-001',
        'Nama Panitia': 'Budi Santoso',
        Divisi: 'Acara',
      },
      {
        Kode: 'PNT-002',
        'Nama Panitia': 'Siti Rahmawati',
        Divisi: 'Konsumsi',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 24 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Panitia');

    XLSX.writeFile(workbook, 'template-import-panitia.xlsx');
  };

  // Tangani Seleksi File Excel untuk Import
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          setImportError('File Excel kosong atau tidak memiliki baris data.');
          setImportPreview([]);
          return;
        }

        // Parsing kolom secara case-insensitive
        const parsedRows = [];
        const seenCodes = new Set();
        let nextIndex = 1;

        // Ambil nomor tertinggi saat ini dari panitia yang ada
        let currentMax = 0;
        panitiaList.forEach((p) => {
          const match = (p.kode || '').match(/PNT-(\d+)/i);
          if (match) {
            const n = parseInt(match[1], 10);
            if (n > currentMax) currentMax = n;
          }
        });

        for (let i = 0; i < rawJson.length; i++) {
          const row = rawJson[i];
          const keys = Object.keys(row);

          // Deteksi kolom nama
          const nameKey = keys.find((k) =>
            /^(nama|nama panitia|name|full name)$/i.test(k.trim())
          );
          // Deteksi kolom divisi
          const divisiKey = keys.find((k) =>
            /^(divisi|division|bagian|seksi)$/i.test(k.trim())
          );
          // Deteksi kolom kode
          const kodeKey = keys.find((k) =>
            /^(kode|id|kode panitia|code)$/i.test(k.trim())
          );

          const namaVal = nameKey ? String(row[nameKey]).trim() : '';
          const divisiVal = divisiKey ? String(row[divisiKey]).trim() : '';
          let kodeVal = kodeKey ? String(row[kodeKey]).trim().toUpperCase() : '';

          // Lewati baris yang benar-benar kosong
          if (!namaVal && !divisiVal && !kodeVal) continue;

          if (!namaVal) {
            setImportError(`Baris ${i + 2}: Kolom Nama Panitia wajib diisi.`);
            setImportPreview([]);
            return;
          }

          // Jika kode kosong, buat otomatis PNT-xxx
          if (!kodeVal) {
            currentMax += 1;
            kodeVal = `PNT-${String(currentMax).padStart(3, '0')}`;
          }

          // Validasi duplikasi kode dalam file yang diimpor
          if (seenCodes.has(kodeVal)) {
            setImportError(
              `Duplikasi Kode "${kodeVal}" ditemukan pada file import. Setiap kode harus unik.`
            );
            setImportPreview([]);
            return;
          }
          seenCodes.add(kodeVal);

          parsedRows.push({
            kode: kodeVal,
            nama: namaVal,
            divisi: divisiVal || 'Umum',
          });
        }

        if (parsedRows.length === 0) {
          setImportError('Tidak ada data valid yang ditemukan pada file.');
        }

        setImportPreview(parsedRows);
      } catch (err) {
        setImportError(
          'Gagal membaca file Excel. Pastikan file berformat .xlsx atau .csv.'
        );
        setImportPreview([]);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Proses Eksekusi Import ke Supabase
  const handleExecuteImport = async () => {
    if (importPreview.length === 0) return;
    setImporting(true);
    setImportError('');

    try {
      if (importMode === 'ganti') {
        // Hapus semua data lama terlebih dahulu
        const { error: deleteError } = await supabase
          .from('panitia')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // hapus semua

        if (deleteError) throw deleteError;

        // Insert semua data baru
        const { error: insertError } = await supabase
          .from('panitia')
          .insert(importPreview);

        if (insertError) throw insertError;
      } else {
        // Mode Tambah: Gunakan Upsert berdasarkan kolom 'kode'
        const { error: upsertError } = await supabase
          .from('panitia')
          .upsert(importPreview, { onConflict: 'kode' });

        if (upsertError) throw upsertError;
      }

      setImportModalOpen(false);
      setImportFile(null);
      setImportPreview([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchPanitia();
      alert(`Berhasil mengimpor ${importPreview.length} data panitia.`);
    } catch (err) {
      setImportError(`Gagal melakukan import: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Cetak QR ID Card dengan window.print()
  const handlePrint = () => {
    window.print();
  };

  // Filter pencarian panitia
  const filteredList = panitiaList.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.nama.toLowerCase().includes(q) ||
      p.divisi.toLowerCase().includes(q) ||
      p.kode.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-pine-800 mx-auto mb-2" />
        <p className="text-sm">Memuat data panitia...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Aksi Utama (Sembunyi saat Print) */}
      <div className="no-print space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Manajemen Panitia & Kartu QR
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola daftar anggota panitia dan cetak QR Code ID Card
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setImportFile(null);
                setImportPreview([]);
                setImportError('');
                setImportModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors touch-target"
            >
              <Upload className="w-4 h-4 text-slate-600" />
              <span>Impor Excel</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={panitiaList.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors touch-target disabled:opacity-40"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Cetak QR</span>
            </button>

            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-pine-800 hover:bg-pine-900 text-white rounded-xl text-xs font-medium shadow-2xs transition-colors touch-target"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Panitia</span>
            </button>
          </div>
        </div>

        {/* Pencarian dan Info Jumlah */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama, divisi, kode QR..."
              className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white"
            />
          </div>
          <span className="text-xs text-slate-500 self-center">
            Total: <strong>{filteredList.length}</strong> panitia
          </span>
        </div>
      </div>

      {/* Grid Kartu QR (Ditampilkan di Layar dan Saat Print) */}
      {filteredList.length === 0 ? (
        <div className="no-print bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-50 text-slate-400" />
          <h3 className="font-semibold text-slate-700 text-sm mb-1">
            {panitiaList.length === 0
              ? 'Belum ada data panitia'
              : 'Tidak ada panitia yang sesuai'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            {panitiaList.length === 0
              ? 'Impor Excel untuk menambahkan daftar panitia secara massal, atau klik Tambah Panitia.'
              : 'Coba ubah kata kunci pencarian Anda.'}
          </p>
          {panitiaList.length === 0 && (
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-pine-800 text-white rounded-xl text-xs font-medium shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Impor Excel Sekarang</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print-grid">
          {filteredList.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-2xs border border-slate-200 p-5 flex flex-col items-center text-center relative group print-card"
            >
              {/* Tombol Edit & Hapus (Sembunyi saat Print) */}
              <div className="no-print absolute top-3 right-3 flex items-center gap-1">
                <button
                  onClick={() => handleOpenEditModal(item)}
                  title="Edit data panitia"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteItem(item)}
                  title="Hapus panitia"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Header Kartu untuk Print & Tampilan */}
              <div className="w-full mb-3 pb-2 border-b border-slate-100 flex items-center justify-between text-left">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-pine-800 uppercase block">
                    PANITIA APSMBI 2026
                  </span>
                  <span className="text-[9px] text-slate-400 block">
                    OFFICIAL CREW ID
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  {item.kode}
                </span>
              </div>

              {/* QR Code SVG */}
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs mb-3.5 flex items-center justify-center">
                <QRCodeSVG
                  value={item.kode}
                  size={135}
                  level="M"
                  includeMargin={false}
                />
              </div>

              {/* Detail Panitia */}
              <div className="w-full">
                <h4 className="text-base font-bold text-slate-900 leading-snug truncate">
                  {item.nama}
                </h4>
                <div className="mt-1">
                  <span className="inline-block px-2.5 py-0.5 bg-pine-50 text-pine-800 text-xs font-semibold rounded-full border border-pine-200">
                    {item.divisi}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: Tambah / Edit Panitia */}
      {formModalOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingItem ? 'Edit Data Panitia' : 'Tambah Panitia Baru'}
              </h3>
              <button
                onClick={() => setFormModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSavePanitia} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kode QR (Unik)
                </label>
                <input
                  type="text"
                  required
                  value={formData.kode}
                  onChange={(e) =>
                    setFormData({ ...formData, kode: e.target.value })
                  }
                  placeholder="Contoh: PNT-001"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm uppercase font-mono focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Isi teks yang akan disematkan ke dalam QR Code ID Card.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Panitia
                </label>
                <input
                  type="text"
                  required
                  value={formData.nama}
                  onChange={(e) =>
                    setFormData({ ...formData, nama: e.target.value })
                  }
                  placeholder="Contoh: Ahmad Fauzan"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Divisi / Seksi
                </label>
                <input
                  type="text"
                  required
                  value={formData.divisi}
                  onChange={(e) =>
                    setFormData({ ...formData, divisi: e.target.value })
                  }
                  placeholder="Contoh: Acara, Perlengkapan, Humas..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pine-800 focus:bg-white"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  disabled={formSubmitting}
                  className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors touch-target"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="flex-1 py-2.5 px-4 bg-pine-800 hover:bg-pine-900 text-white rounded-xl text-xs font-medium shadow-2xs transition-colors touch-target flex items-center justify-center gap-1.5"
                >
                  {formSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Simpan</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Impor Excel */}
      {importModalOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl my-8 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-pine-800" />
                <h3 className="text-base font-bold text-slate-900">
                  Impor Data Panitia dari Excel
                </h3>
              </div>
              <button
                onClick={() => setImportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tombol Unduh Template */}
            <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Format Kolom Excel:</p>
                <p className="text-[11px] text-slate-500">
                  Kode (opsional), Nama Panitia, Divisi
                </p>
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template</span>
              </button>
            </div>

            {/* Input File */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pilih File Excel (.xlsx / .csv)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-pine-50 file:text-pine-800 hover:file:bg-pine-100 border border-slate-300 rounded-xl cursor-pointer bg-slate-50"
              />
            </div>

            {/* Pilihan Mode Import */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Metode Impor
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`p-3 rounded-xl border text-xs cursor-pointer flex flex-col transition-colors ${
                    importMode === 'tambah'
                      ? 'border-pine-800 bg-pine-50/50 text-pine-900 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'tambah'}
                      onChange={() => setImportMode('tambah')}
                      className="text-pine-800"
                    />
                    <span className="font-semibold">Tambahkan Data</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Memperbarui data yang ada dan menambahkan data baru.
                  </span>
                </label>

                <label
                  className={`p-3 rounded-xl border text-xs cursor-pointer flex flex-col transition-colors ${
                    importMode === 'ganti'
                      ? 'border-red-500 bg-red-50/50 text-red-900 font-medium'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'ganti'}
                      onChange={() => setImportMode('ganti')}
                      className="text-red-600"
                    />
                    <span className="font-semibold text-red-700">Ganti Semua Data</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Menghapus seluruh panitia lama dan mengganti dengan file ini.
                  </span>
                </label>
              </div>
            </div>

            {/* Error Message */}
            {importError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{importError}</span>
              </div>
            )}

            {/* Preview Singkat Data */}
            {importPreview.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5 text-xs">
                  <span className="font-semibold text-slate-700">
                    Preview Data ({importPreview.length} Panitia Terbaca)
                  </span>
                  <span className="text-[11px] text-emerald-600 font-medium">
                    Valid
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs bg-slate-50">
                  {importPreview.slice(0, 5).map((p, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-slate-800">
                          {p.nama}
                        </span>{' '}
                        <span className="text-slate-400 text-[10px]">
                          ({p.divisi})
                        </span>
                      </div>
                      <span className="font-mono text-slate-600 text-[11px] font-bold">
                        {p.kode}
                      </span>
                    </div>
                  ))}
                  {importPreview.length > 5 && (
                    <div className="px-3 py-1.5 text-center text-slate-400 text-[11px]">
                      + {importPreview.length - 5} baris lainnya...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                disabled={importing}
                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors touch-target"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={importing || importPreview.length === 0}
                className="flex-1 py-2.5 px-4 bg-pine-800 hover:bg-pine-900 text-white rounded-xl text-xs font-medium shadow-2xs transition-colors touch-target flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Impor Sekarang</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Konfirmasi Hapus Panitia */}
      {deleteItem && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center text-slate-900 mb-1">
              Hapus Data Panitia?
            </h3>
            <p className="text-xs text-slate-500 text-center leading-relaxed mb-5">
              Apakah Anda yakin ingin menghapus data{' '}
              <strong>{deleteItem.nama}</strong> ({deleteItem.kode})? Status kehadiran yang bersangkutan juga akan terhapus.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteItem(null)}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors touch-target"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeletePanitia}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors touch-target flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Hapus</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
