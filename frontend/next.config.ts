import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
