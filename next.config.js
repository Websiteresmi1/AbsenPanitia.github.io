/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: '/AbsenPanitia.github.io',
  assetPrefix: '/AbsenPanitia.github.io/',
  trailingSlash: true,
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
