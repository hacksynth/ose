/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.TAURI_BUILD || process.env.DOCKER_BUILD ? "standalone" : undefined,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
