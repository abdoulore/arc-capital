import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const frontendDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(frontendDir),
  },
};

export default nextConfig;
