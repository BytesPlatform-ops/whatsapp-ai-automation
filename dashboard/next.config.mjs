/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing the shared single-source-of-truth data file
  // (../landing/lib/pixieServices.ts) that lives outside this app's root,
  // so the standalone dashboard never duplicates the marketing site's service data.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
