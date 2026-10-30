import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // YENİ: Uygulamayı kendi sunucunda çalıştırmak için gerekli olan "standalone" modu
  output: "standalone", 
  
  experimental: {
    agentFeedback: false,
  },
  
  // Transformers paketini sunucu tarafında paketleme
  serverExternalPackages: ["@huggingface/transformers"],
  
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Whisper (WASM) yapay zekasının çalışması için gerekli güvenlik başlıkları
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // Ek Güvenlik Başlıkları (Clickjacking, Referrer ve Mikrofon İzin Politikası)
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "Permissions-Policy", value: "microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;