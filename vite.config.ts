import { defineConfig, type Plugin } from 'vite';
// Lists the built scripts and styles so the offline worker (public/sw.js) can save every part of the app, not only the parts a visit happened to load.
const precacheList: Plugin = {
 name: 'precache-list',
 generateBundle(_options, bundle) {
  const files = Object.keys(bundle).filter(name => /\.(m?js|css)$/.test(name)).map(name => '/' + name);
  this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ files }) });
 }
};
export default defineConfig({
 plugins: [precacheList],
 server: { port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
 build: { target: 'es2022', rollupOptions: { output: { manualChunks: (id: string) => id.includes('node_modules/maplibre-gl') ? 'map' : id.includes('node_modules/three') ? 'three' : undefined } } }
});
