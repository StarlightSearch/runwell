import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  base: "/",
  build: { outDir: fileURLToPath(new URL("../plugin/dist/web", import.meta.url)), emptyOutDir: true, sourcemap: false },
  server: { port: 5179, proxy: { "/api": "http://127.0.0.1:4790", "/o": "http://127.0.0.1:4790", "/auth": "http://127.0.0.1:4790" } },
});
