import { defineConfig } from "vite";

// strictPort: fail instead of moving to another port, so a stale server is never mistaken for the latest.
export default defineConfig({
	server: { host: true, port: 5173, strictPort: true },
	preview: { host: true, port: 4173, strictPort: true },
});
