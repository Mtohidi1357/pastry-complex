import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [
    '192.168.1.109',
    '192.168.1.101',
    '192.168.100.10'
  ],
};

export default nextConfig;
