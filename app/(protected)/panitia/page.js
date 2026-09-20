import PanitiaManager from '@/components/PanitiaManager';

export const metadata = {
  title: 'Data Panitia & Cetak QR | Absensi Panitia Event',
  description: 'Manajemen data panitia, import Excel, dan cetak QR Code ID Card',
};

export default function PanitiaPage() {
  return <PanitiaManager />;
}
