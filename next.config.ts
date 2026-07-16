import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/parse-timetable": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.js"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
  headers: async () => [
    {
      source: "/manifest.json",
      headers: [
        {
          key: "Content-Type",
          value: "application/manifest+json",
        },
      ],
    },
  ],
};

export default nextConfig;
