import RekapTable from '@/components/RekapTable';

export const metadata = {
  title: 'Rekap Kehadiran Real-time | Absensi Panitia Event',
  description: 'Rekapitulasi kehadiran panitia event secara real-time dan ekspor Excel',
};

export default function RekapPage() {
  return <RekapTable />;
}
