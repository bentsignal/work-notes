import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.PORT ?? 4747);

// In dev, Vite serves the UI and forwards API calls to the Node server.
export default defineConfig({
  plugins: [react()],
  // Served from localhost, so bundle size doesn't matter much.
  build: { chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
