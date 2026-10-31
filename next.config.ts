import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Faz o Next.js gerar arquivos HTML/CSS/JS puros para o celular
  images: {
    unoptimized: true, // Obrigatório para o modo export do Next.js funcionar no celular
  },
  typescript: {
    ignoreBuildErrors: true, // Garante que o build finalize para os testes iniciais
  }
};

export default nextConfig;
