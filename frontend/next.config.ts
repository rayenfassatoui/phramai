import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    resolveAlias: {
      canvas: "./lib/empty-module.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/metrics/:path*",
        destination: `${
          process.env.FASTAPI_URL || "http://localhost:8000"
        }/api/metrics/:path*`,
      },
    ];
  },
};

export default nextConfig;
