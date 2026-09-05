import { defineConfig } from 'vite';
export default defineConfig({
 server: { port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
 build: { target: 'es2022', rollupOptions: { output: { manualChunks: (id: string) => id.includes('node_modules/maplibre-gl') ? 'map' : id.includes('node_modules/three') ? 'three' : undefined } } }
});
