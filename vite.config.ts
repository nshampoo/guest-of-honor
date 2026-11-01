import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: shampoe.com serves the app under /guest-of-honor/app/ with the prefix stripped.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
