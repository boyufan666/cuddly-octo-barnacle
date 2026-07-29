import type { NextConfig } from "next";
import { getProductionSecurityHeaders } from "./src/lib/production-security-headers";

const nextConfig: NextConfig = {
  async headers() {
    const headers = getProductionSecurityHeaders();
    if (headers.length === 0) {
      return [];
    }
    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
};

export default nextConfig;
