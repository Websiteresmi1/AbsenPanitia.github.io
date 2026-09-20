# 📱 Sistem Absensi Event Panitia APSMBI 2026

Aplikasi web presensi/absensi panitia event berbasis **QR Code** yang dioperasikan oleh multi-admin secara bersamaan dari smartphone masing-masing. Semua data kehadiran tersinkronisasi secara **real-time** di seluruh perangkat tanpa perlu refresh.

Dibangun menggunakan **Next.js 14 (App Router, JavaScript)**, **Tailwind CSS v3**, dan **Supabase (Auth + Postgres + Realtime)**.

---

## 🔍 Cara Kerja Sistem: Bagaimana Nama & Divisi Dikenali?

QR Code yang dicetak pada ID Card **HANYA berisi string `kode` unik** (contoh: `PNT-001`), **bukan** nama atau divisi.
1. Saat admin memindai QR Code dari HP menggunakan scanner, aplikasi mengirimkan `kode` tersebut ke database via fungsi SQL atomik: `catat_kehadiran(p_kode)`.
2. Database mencocokkan `kode` dengan data panitia di tabel `panitia`:
   - Jika ditemukan & belum hadir: database meng-update `waktu_scan = now()` dan `discan_oleh = email_admin`, lalu mengembalikan data lengkap (**Nama, Divisi, Jam Hadir**).
   - Jika sudah pernah hadir sebelumnya: database mengembalikan status `sudah_hadir` beserta jam dan admin yang mencatat.
   - Jika kode tidak ada: mengembalikan status `tidak_dikenal`.
3. Notifikasi visual besar muncul seketika di layar HP, dan Supabase Realtime menyiarkan pembaruan tersebut ke seluruh HP admin lainnya secara otomatis.

---

## 🚀 Panduan Setup Langkah Demi Langkah (Untuk Pemula)

### Langkah 1: Buat Proyek di Supabase
1. Buka [https://supabase.com](https://supabase.com) dan masuk ke akun Anda (atau daftar gratis).
2. Klik **New project**.
3. Beri nama proyek (misalnya `absensi-panitia-2026`), buat password database yang kuat, dan pilih Region terdekat (contoh: *Singapore*).
4. Tunggu sekitar 1–2 menit hingga project selesai disiapkan.

---

### Langkah 2: Jalankan Schema Database di SQL Editor
1. Di dashboard Supabase, buka menu **SQL Editor** pada navigasi sisi kiri (ikon terminal `>_`).
2. Klik **New query**.
3. Buka file [`supabase/schema.sql`](supabase/schema.sql) dari proyek ini, salin seluruh kodenya, lalu tempelkan ke dalam SQL Editor Supabase.
4. Klik tombol **Run** (atau tekan `Ctrl+Enter` / `Cmd+Enter`).
5. Periksa pesan output: Anda akan melihat tabel `panitia` dibuat lengkap dengan Row Level Security (RLS), fungsi RPC `catat_kehadiran`, publikasi Supabase Realtime, serta 8 data contoh panitia awal.

---

### Langkah 3: Buat Akun Admin & Matikan Registrasi Publik
Aplikasi ini hanya boleh diakses oleh panitia/admin resmi dan tidak menyediakan form pendaftaran publik.

1. **Membuat Akun Admin:**
   - Di dashboard Supabase, buka menu **Authentication** > **Users**.
   - Klik tombol **Add user** > **Create user**.
   - Masukkan **Email** (contoh: `admin1@panitia.com`) dan buat **Password**.
   - Pastikan opsi **Auto Confirm User?** dicentang (aktif) agar akun bisa langsung dipakai login tanpa verifikasi email.
   - Klik **Create user**. Ulangi untuk admin panitia lainnya yang bertugas melakukan scan.

2. **Mematikan Registrasi Publik (Wajib untuk Keamanan):**
   - Buka menu **Authentication** > **Providers** > klik **Email**.
   - Matikan (nonaktifkan) tombol switch **"Allow new users to sign up"**.
   - Klik **Save**. Dengan langkah ini, orang luar tidak bisa mendaftar akun baru ke sistem Anda.

---

### Langkah 4: Hubungkan Aplikasi ke Supabase
1. Di dashboard Supabase, buka **Project Settings** (ikon gerigi di kiri bawah) > pilih **API**.
2. Salin nilai berikut:
   - **Project URL** (contoh: `https://xyzcompany.supabase.co`)
   - **Project API keys** bagian `anon` / `public` (string panjang diawali `eyJhbGciOi...`)
3. Di folder proyek lokal, buat file baru bernama `.env.local` (atau duplikasi dari `.env.example`):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://proyek-anda.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...
   ```

---

### Langkah 5: Jalankan di Komputer Lokal
Buka terminal di folder proyek ini:

```bash
# 1. Install seluruh dependensi paket
npm install

# 2. Jalankan server lokal Next.js
npm run dev
```

Buka browser di laptop Anda pada alamat: `http://localhost:3000`. Anda akan langsung diarahkan ke halaman login (`/login`).

---

### Langkah 6: Deploy ke Vercel (Wajib HTTPS untuk Akses Kamera HP)
Akses kamera smartphone **hanya diizinkan oleh browser pada koneksi aman HTTPS**. Oleh karena itu, deploy ke Vercel adalah solusi terbaik dan termudah:

1. Push kode proyek Anda ke GitHub / GitLab.
2. Buka [https://vercel.com](https://vercel.com) dan hubungkan akun GitHub Anda.
3. Klik **Add New...** > **Project**, lalu impor repository ini.
4. Pada bagian **Environment Variables**, tambahkan dua variabel yang sama persis dengan `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Klik tombol **Deploy**.
6. Selesai! Vercel akan memberikan domain HTTPS gratis (contoh: `https://absensi-panitia.vercel.app`) yang langsung bisa dibuka di semua HP admin panitia.

---

## 🎯 Alur Operasional Hari H Acara

1. **Persiapan Data Panitia (`/panitia`):**
   - Buka menu **Panitia**.
   - Klik **Unduh Template** untuk mendapatkan format Excel.
   - Masukkan daftar panitia (Kolom: `Kode`, `Nama Panitia`, `Divisi`). Jika `Kode` dikosongkan, sistem otomatis membuat `PNT-001`, `PNT-002`, dst.
   - Klik **Impor Excel** dan pilih file Anda.
2. **Cetak QR ID Card (`/panitia`):**
   - Klik tombol **Cetak QR**. Tampilan print otomatis memformat kartu ID menjadi grid rapi tanpa tombol atau navigasi web.
   - Potong kartu QR dan sematkan pada name tag/ID Card masing-masing panitia.
3. **Pelaksanaan Absensi (`/scan`):**
   - Setiap admin panitia login di HP masing-masing menggunakan akun yang dibuat di Langkah 3.
   - Buka menu **Scan**, izinkan browser mengakses kamera belakang HP.
   - Arahkan kamera ke QR Code ID Card. Sistem akan mencatat kehadiran secara instan.
   - Terdapat kolom input kode manual di bawah kamera jika QR Code terlipat atau kamera HP bermasalah.
4. **Monitoring & Rekap Data (`/rekap`):**
   - Pantau statistik kehadiran total dan rekap per divisi secara real-time.
   - Admin dapat melakukan koreksi manual ("Hadirkan" / "Batalkan") jika diperlukan.
   - Setelah acara selesai, klik **Download Excel** untuk mengekspor rekapitulasi kehadiran resmi (`.xlsx`).

---

## 💡 Tips Pengujian Multi-Perangkat (Multi-Admin)

Untuk melihat kehebatan fitur Real-time Supabase:
1. Buka aplikasi di **HP 1** (pada halaman `/scan`).
2. Buka aplikasi di **HP 2** (pada halaman `/rekap`).
3. Lakukan scan QR di **HP 1**.
4. Perhatikan layar **HP 2**: tanpa perlu menekan tombol refresh, baris panitia tersebut langsung berubah status menjadi **Hadir** (hijau) lengkap dengan jam dan nama admin pencatat!

---

## 🛠️ Pemecahan Masalah (Troubleshooting)

### 1. Kamera HP Tidak Terbuka / Izin Ditolak
- **Penyebab 1: Protokol bukan HTTPS.** Kamera HP hanya bisa aktif jika diakses lewat `https://...` atau `localhost`. Pastikan Anda sudah mendeploy ke Vercel atau menggunakan ngrok/tunneling jika testing lokal dari HP.
- **Penyebab 2: Izin browser ditolak.** Buka pengaturan browser di HP (Chrome/Safari), pilih *Site Settings* > *Camera*, dan pilih **Allow (Izinkan)** untuk web absensi ini.

### 2. Data di HP Lain Tidak Otomatis Berubah (Realtime Tidak Jalan)
- Pastikan publikasi `supabase_realtime` sudah mencakup tabel `panitia`.
- Buka dashboard Supabase > **Database** > **Replication**. Pastikan toggle di samping tabel `panitia` berstatus aktif (**Enabled**).
- Jika belum aktif, jalankan baris berikut di SQL Editor Supabase:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE public.panitia;
  ```

### 3. Error saat Login "Invalid login credentials"
- Pastikan email dan password yang dimasukkan sesuai dengan yang didaftarkan di Supabase Auth.
- Pastikan akun sudah berstatus **Confirmed** di menu Authentication > Users.

---

## 📦 Teknologi yang Digunakan
- **Frontend**: Next.js 14 (App Router), Tailwind CSS v3, Lucide React
- **Backend & Database**: Supabase (PostgreSQL, GoTrue Auth, Realtime WebSocket)
- **Scanner**: `html5-qrcode`
- **Spreadsheet**: SheetJS (`xlsx`)
- **QR Generator**: `qrcode.react`
