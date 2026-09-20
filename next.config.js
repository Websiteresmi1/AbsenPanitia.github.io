/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Wajib false agar html5-qrcode tidak me-mount kamera ganda saat dev
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
