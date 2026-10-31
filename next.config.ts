import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true, // ⬅️ Garante o mapeamento correto de subpastas/rotas no WebView do celular
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
