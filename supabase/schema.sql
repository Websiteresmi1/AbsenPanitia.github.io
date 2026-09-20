-- ==============================================================================
-- SCHEMA SISTEM ABSENSI EVENT PANITIA
-- Jalankan skrip ini langsung di SQL Editor pada dashboard Supabase
-- ==============================================================================

-- 1. Buat Tabel `panitia`
CREATE TABLE IF NOT EXISTS public.panitia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode TEXT UNIQUE NOT NULL,             -- Kode unik QR Card (contoh: PNT-001)
    nama TEXT NOT NULL,                    -- Nama lengkap panitia
    divisi TEXT NOT NULL,                  -- Divisi kepanitiaan
    waktu_scan TIMESTAMPTZ NULL,           -- NULL = Belum Hadir, terisi = Hadir
    discan_oleh TEXT NULL,                 -- Email admin pencatat scan
    created_at TIMESTAMPTZ DEFAULT now()   -- Waktu penambahan data
);

-- Indeks untuk mempercepat pencarian kode case-insensitive & trimmed
CREATE INDEX IF NOT EXISTS idx_panitia_kode_upper ON public.panitia (UPPER(TRIM(kode)));
CREATE INDEX IF NOT EXISTS idx_panitia_divisi ON public.panitia (divisi);
CREATE INDEX IF NOT EXISTS idx_panitia_waktu_scan ON public.panitia (waktu_scan);

-- 2. Aktifkan Row Level Security (RLS)
ALTER TABLE public.panitia ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada untuk mencegah konflik saat re-run
DROP POLICY IF EXISTS "Authenticated users full access" ON public.panitia;
DROP POLICY IF EXISTS "Anon no access" ON public.panitia;

-- Policy 1: Pengguna umum (anon / publik) hanya boleh membaca data (SELECT) untuk monitoring realtime
DROP POLICY IF EXISTS "Public read access for panitia" ON public.panitia;
CREATE POLICY "Public read access for panitia"
ON public.panitia
FOR SELECT
TO anon
USING (true);

-- Policy 2: User yang login (authenticated / admin) memiliki akses penuh (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Authenticated users full access"
ON public.panitia
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Aktifkan Supabase Realtime untuk tabel panitia
-- Memastikan publikasi supabase_realtime memuat tabel panitia
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'panitia'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.panitia;
    END IF;
END $$;

-- 4. Tabel Kehadiran Multi-Hari (Relasi 1-to-many dari panitia)
CREATE TABLE IF NOT EXISTS public.kehadiran (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    panitia_id    UUID        NOT NULL REFERENCES public.panitia(id) ON DELETE CASCADE,
    tanggal_acara DATE        NOT NULL,
    waktu_scan    TIMESTAMPTZ NOT NULL DEFAULT now(),
    discan_oleh   TEXT        NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kehadiran
    DROP CONSTRAINT IF EXISTS uq_kehadiran_panitia_tanggal;
ALTER TABLE public.kehadiran
    ADD CONSTRAINT uq_kehadiran_panitia_tanggal
    UNIQUE (panitia_id, tanggal_acara);

CREATE INDEX IF NOT EXISTS idx_kehadiran_panitia_id     ON public.kehadiran (panitia_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_tanggal_acara  ON public.kehadiran (tanggal_acara);
CREATE INDEX IF NOT EXISTS idx_kehadiran_waktu_scan     ON public.kehadiran (waktu_scan);

ALTER TABLE public.kehadiran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read kehadiran"      ON public.kehadiran;
DROP POLICY IF EXISTS "Auth full access kehadiran" ON public.kehadiran;

CREATE POLICY "Public read kehadiran"
    ON public.kehadiran FOR SELECT TO anon USING (true);

CREATE POLICY "Auth full access kehadiran"
    ON public.kehadiran FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'kehadiran'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.kehadiran;
    END IF;
END $$;

-- 5. Fungsi SQL (RPC) Atomik: catat_kehadiran(p_kode text, p_tanggal date)
DROP FUNCTION IF EXISTS public.catat_kehadiran(TEXT);
DROP FUNCTION IF EXISTS public.catat_kehadiran(TEXT, DATE);

CREATE OR REPLACE FUNCTION public.catat_kehadiran(
    p_kode     TEXT,
    p_tanggal  DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_kode  TEXT;
    v_panitia     RECORD;
    v_admin_email TEXT;
    v_kehadiran   RECORD;
BEGIN
    v_clean_kode := UPPER(TRIM(p_kode));

    IF v_clean_kode IS NULL OR v_clean_kode = '' THEN
        RETURN jsonb_build_object(
            'status', 'tidak_dikenal',
            'pesan', 'Kode QR kosong atau tidak valid'
        );
    END IF;

    v_admin_email := COALESCE(auth.jwt() ->> 'email', 'admin');

    SELECT id, kode, nama, divisi INTO v_panitia
    FROM public.panitia
    WHERE UPPER(TRIM(kode)) = v_clean_kode
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'tidak_dikenal',
            'kode', v_clean_kode,
            'pesan', 'QR Code tidak terdaftar dalam database panitia'
        );
    END IF;

    SELECT id, waktu_scan, discan_oleh INTO v_kehadiran
    FROM public.kehadiran
    WHERE panitia_id = v_panitia.id AND tanggal_acara = p_tanggal
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'sudah_hadir',
            'id', v_panitia.id,
            'kode', v_panitia.kode,
            'nama', v_panitia.nama,
            'divisi', v_panitia.divisi,
            'waktu_scan', v_kehadiran.waktu_scan,
            'tanggal_acara', p_tanggal,
            'discan_oleh', v_kehadiran.discan_oleh,
            'pesan', 'Panitia sudah tercatat hadir pada hari ini'
        );
    END IF;

    INSERT INTO public.kehadiran (panitia_id, tanggal_acara, waktu_scan, discan_oleh)
    VALUES (v_panitia.id, p_tanggal, now(), v_admin_email)
    ON CONFLICT (panitia_id, tanggal_acara) DO NOTHING
    RETURNING id, waktu_scan, discan_oleh INTO v_kehadiran;

    UPDATE public.panitia
    SET waktu_scan = now(), discan_oleh = v_admin_email
    WHERE id = v_panitia.id;

    RETURN jsonb_build_object(
        'status', 'berhasil',
        'id', v_panitia.id,
        'kode', v_panitia.kode,
        'nama', v_panitia.nama,
        'divisi', v_panitia.divisi,
        'waktu_scan', COALESCE(v_kehadiran.waktu_scan, now()),
        'tanggal_acara', p_tanggal,
        'discan_oleh', v_admin_email,
        'pesan', 'Kehadiran berhasil dicatat'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.catat_kehadiran(TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catat_kehadiran(TEXT, DATE) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- 5. Data Contoh Panitia (8 Panitia dengan Berbagai Divisi)
-- Opsional: Hapus atau sesuaikan sesuai kebutuhan
-- ==============================================================================
INSERT INTO public.panitia (kode, nama, divisi)
VALUES
    ('PNT-001', 'Ahmad Fauzan', 'Acara'),
    ('PNT-002', 'Siti Nurhaliza', 'Kesekretariatan'),
    ('PNT-003', 'Budi Pratama', 'Perlengkapan'),
    ('PNT-004', 'Dewi Lestari', 'Konsumsi'),
    ('PNT-005', 'Reza Kurniawan', 'Humas & Hubungan Luar'),
    ('PNT-006', 'Putri Indah', 'Publikasi & Dokumentasi'),
    ('PNT-007', 'Hendro Wicaksono', 'Transportasi & Logistik'),
    ('PNT-008', 'Dian Anggraini', 'Keamanan & Ketertiban')
ON CONFLICT (kode) DO NOTHING;

-- ==============================================================================
-- 6. (OPSIONAL) Buat Akun Admin Otomatis lewat SQL
-- Email: admin@apsmbi.com
-- Password: AdminAPSMBI2026!
-- ==============================================================================
DO $$
DECLARE
    v_user_id UUID := gen_random_uuid();
    v_email TEXT := 'admin@apsmbi.com';
    v_password TEXT := 'AdminAPSMBI2026!';
BEGIN
    -- Cek jika user belum ada di auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
        -- Insert ke auth.users
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"name":"Admin APSMBI"}',
            now(),
            now(),
            '',
            ''
        );

        -- Insert ke auth.identities (wajib untuk Supabase GoTrue Auth)
        INSERT INTO auth.identities (
            id,
            provider_id,
            user_id,
            identity_data,
            provider,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            v_user_id::text,
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', v_email),
            'email',
            now(),
            now(),
            now()
        );
    END IF;
END $$;

