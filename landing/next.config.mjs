/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export removed so /api/tools/* route handlers can run as serverless functions
  // on Vercel. Existing pages still prerender as static at build time.
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
