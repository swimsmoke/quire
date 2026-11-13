import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@quire/shared"],
  poweredByHeader: false,
  devIndicators: false, // its corner badge sits over the menu's theme switch
  turbopack: {},
};

export default config;
