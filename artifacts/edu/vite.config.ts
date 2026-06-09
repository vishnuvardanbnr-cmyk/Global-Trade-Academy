import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", networkTimeoutSeconds: 10 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React runtime — always cached after first visit
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "vendor-react";
          }
          // Data-fetching layer
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
          // Radix UI primitives (bulk of UI lib)
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          // Router
          if (id.includes("node_modules/wouter/")) {
            return "vendor-router";
          }
          // Form handling
          if (id.includes("node_modules/react-hook-form/") || id.includes("node_modules/zod/") || id.includes("node_modules/@hookform/")) {
            return "vendor-forms";
          }
          // LiveKit
          if (id.includes("node_modules/@livekit/") || id.includes("node_modules/livekit-client/")) {
            return "vendor-livekit";
          }
          // Icons (large)
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          // All other node_modules go to vendor-misc
          if (id.includes("node_modules/")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
        ws: true,
      },
      "/livekit": {
        target: "http://localhost:7880",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/livekit/, "") || "/",
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
