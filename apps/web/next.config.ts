import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@quire/shared"],
  poweredByHeader: false,
  devIndicators: false,
  turbopack: {},
  experimental: {
    // Pages you've just seen open instantly on back and forward.
    staleTimes: { dynamic: 30, static: 300 },
  },
  async redirects() {
    return [{ source: "/results", destination: "/verdicts", permanent: false }];
  },
};

export default config;
