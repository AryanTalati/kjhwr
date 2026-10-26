import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the API runs separately; BACKEND_URL lets docker-compose point at the backend service.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 },
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": process.env.BACKEND_URL ?? "http://localhost:8000" },
  },
});
