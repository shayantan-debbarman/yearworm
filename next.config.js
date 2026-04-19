/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/yearworm',
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
