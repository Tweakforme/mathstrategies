/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from tapology and ufcstats
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.tapology.com" },
      { protocol: "http", hostname: "ufcstats.com" },
    ],
  },
};

export default nextConfig;
