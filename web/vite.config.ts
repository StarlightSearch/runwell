import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  base: "/",
  // Fonts and every other asset are files: the server's Content-Security-Policy refuses data: URLs.
  build: { outDir: fileURLToPath(new URL("../plugin/dist/web", import.meta.url)), emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0 },
  server: { port: 5179, proxy: { "/api": "http://127.0.0.1:4790", "/o": "http://127.0.0.1:4790", "/auth": "http://127.0.0.1:4790" } },
});
