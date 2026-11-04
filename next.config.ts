import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [
    '192.168.1.109',
    '192.168.1.101',
    '192.168.100.10',
    '127.0.0.1',
    '192.168.1.102',
    '192.168.1.103',
    '192.168.1.107',
    '192.168.1.105',
    '192.168.1.108',
    '192.168.1.100',

  ],
};

export default nextConfig;
