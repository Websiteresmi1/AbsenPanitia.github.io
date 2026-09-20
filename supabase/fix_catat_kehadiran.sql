-- ==============================================================================
-- FIX: FUNGSI catat_kehadiran (MULTI-HARI)
-- Jalankan script ini di Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================================

-- 1. Hapus SEMUA versi lama dari fungsi catat_kehadiran agar tidak terjadi konflik parameter
DROP FUNCTION IF EXISTS public.catat_kehadiran(TEXT);
DROP FUNCTION IF EXISTS public.catat_kehadiran(TEXT, DATE);

-- 2. Pastikan tabel kehadiran dan constraint unik sudah siap
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

-- Pastikan RLS aktif dan diizinkan
ALTER TABLE public.kehadiran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read kehadiran"      ON public.kehadiran;
DROP POLICY IF EXISTS "Auth full access kehadiran" ON public.kehadiran;

CREATE POLICY "Public read kehadiran"
    ON public.kehadiran FOR SELECT TO anon USING (true);

CREATE POLICY "Auth full access kehadiran"
    ON public.kehadiran FOR ALL TO authenticated
    USING (true) WITH CHECK (true);

-- Tambahkan ke realtime publication jika belum ada
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

-- 3. Buat fungsi baru catat_kehadiran dengan p_kode dan p_tanggal
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
    -- 1. Bersihkan kode
    v_clean_kode := UPPER(TRIM(p_kode));

    IF v_clean_kode IS NULL OR v_clean_kode = '' THEN
        RETURN jsonb_build_object(
            'status', 'tidak_dikenal',
            'pesan', 'Kode QR kosong atau tidak valid'
        );
    END IF;

    -- 2. Ambil email admin
    v_admin_email := COALESCE(auth.jwt() ->> 'email', 'admin');

    -- 3. Cari data panitia
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

    -- 4. Cek apakah sudah hadir di tanggal ini
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

    -- 5. Masukkan catatan kehadiran baru
    INSERT INTO public.kehadiran (panitia_id, tanggal_acara, waktu_scan, discan_oleh)
    VALUES (v_panitia.id, p_tanggal, now(), v_admin_email)
    ON CONFLICT (panitia_id, tanggal_acara) DO NOTHING
    RETURNING id, waktu_scan, discan_oleh INTO v_kehadiran;

    -- Update kolom panitia untuk kompatibilitas riwayat
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

-- 4. Berikan izin eksekusi ke anon, authenticated, dan service_role
REVOKE ALL ON FUNCTION public.catat_kehadiran(TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catat_kehadiran(TEXT, DATE) TO anon, authenticated, service_role;

-- 5. Muat ulang cache schema PostgREST Supabase agar fungsi langsung terdeteksi
NOTIFY pgrst, 'reload schema';
