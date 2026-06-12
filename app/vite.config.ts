import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Dual-target build: on Vercel (VERCEL=1 is set during their build) emit serverless
// functions; everywhere else (local dev, the Dockerised droplet stack) emit a Node
// server (build/index.js). One repo, both deploy paths.
const adapter = process.env.VERCEL
	? adapterVercel({ runtime: 'nodejs22.x', external: ['@node-rs/argon2'] })
	: adapterNode();

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter
		})
	]
});
