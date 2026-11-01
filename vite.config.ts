import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { roomsPlugin } from "./dev/rooms-plugin";

// Relative base: shampoe.com serves the app under /guest-of-honor/app/ with the prefix stripped.
// host: true serves on the local network so phones on the same wifi can join.
export default defineConfig({
  base: "./",
  plugins: [react(), roomsPlugin()],
  server: { host: true },
});
