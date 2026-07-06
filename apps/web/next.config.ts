import type { NextConfig } from "next";

const internalApiBaseUrl =
  process.env.NEXT_INTERNAL_API_BASE_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
