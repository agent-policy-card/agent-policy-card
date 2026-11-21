import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the static build works under any sub-path (GitHub Pages serves it at /<repo>/).
export default defineConfig({ base: "./", plugins: [react()] });
