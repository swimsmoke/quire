import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@quire/shared"],
  poweredByHeader: false,
  turbopack: {},
};

export default config;
