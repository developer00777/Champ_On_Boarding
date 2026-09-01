// Runs a project TypeScript module (one that imports `$lib/...` / `$env/...`)
// through the app's own Vite + SvelteKit config, so scripts can reuse the real
// server modules without a separate `vite-node` dependency.
//
// Run:  node scripts/run-vite-node.mjs scripts/<script>.ts
import { createServer } from 'vite';

const target = process.argv[2];
if (!target) {
	console.error('usage: node scripts/run-vite-node.mjs <script.ts>');
	process.exit(1);
}

const server = await createServer({
	server: { middlewareMode: true, hmr: false, watch: null },
	appType: 'custom',
	logLevel: 'warn'
});

try {
	await server.ssrLoadModule(target.startsWith('/') ? target : `/${target}`);
} finally {
	await server.close();
}

// SvelteKit's dev plugin keeps handles open; the script itself is done.
process.exit(0);
