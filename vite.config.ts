import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

const isVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  server: {
    allowedHosts: [".serveousercontent.com", ".serveo.net", ".loca.lt", ".ngrok-free.app", ".ngrok.io", ".trycloudflare.com", ".lhr.life"],
  },
  plugins: [
    isVercel ? nitro() : cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
