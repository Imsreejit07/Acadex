import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingIncludes: {
    "/api/parse-timetable": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.js"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
