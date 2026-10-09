import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Proxmox VM (see deploy/README.md).
  output: "standalone",
};

export default nextConfig;
