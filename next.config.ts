import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker build sets NEXT_OUTPUT=standalone to emit a self-contained
  // server.js. Left off otherwise, because `next start` warns under standalone.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
