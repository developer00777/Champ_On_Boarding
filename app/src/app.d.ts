// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			admin: { id: string; email: string; role: 'hr_admin' | 'super_admin' } | null;
		}
	}
}

export {};
