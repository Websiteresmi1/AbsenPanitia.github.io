/**
 * Utilitas pemformatan tanggal dan waktu dalam Bahasa Indonesia
 * Disesuaikan dengan zona waktu lokal perangkat pengguna
 */

/**
 * Format jam menit detik (HH:mm:ss)
 * @param {string | Date | null} dateString
 * @returns {string}
 */
export function formatTime(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch (error) {
    return '-';
  }
}

/**
 * Format tanggal dan jam lengkap Indonesia (DD MMMM YYYY, HH:mm:ss)
 * Contoh: 19 September 2026, 14:30:00 WIB
 * @param {string | Date | null} dateString
 * @returns {string}
 */
export function formatDateTime(dateString) {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    const tgl = date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const jam = date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${tgl} ${jam}`;
  } catch (error) {
    return '-';
  }
}

/**
 * Format tanggal YYYY-MM-DD untuk penamaan file Excel
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function formatDateForFilename(date = new Date()) {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return 'rekap';
  }
}
