/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
