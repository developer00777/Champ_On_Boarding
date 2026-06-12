import { db, t } from './db';

interface AuditEntry {
	candidateId?: string | null;
	actor: string; // admin email, 'candidate', or 'system'
	action: string;
	field?: string;
	oldValue?: string | null;
	newValue?: string | null;
	ip?: string;
}

// PRD §9: never log raw identifiers — mask anything that looks like Aadhaar or an account number.
function maskPii(value: string | null | undefined): string | null {
	if (!value) return value ?? null;
	return value.replace(/\d{8,}/g, (m) => `${'X'.repeat(m.length - 4)}${m.slice(-4)}`);
}

export async function audit(entry: AuditEntry) {
	await db.insert(t.auditLog).values({
		candidateId: entry.candidateId ?? null,
		actor: entry.actor,
		action: entry.action,
		field: entry.field,
		oldValue: maskPii(entry.oldValue),
		newValue: maskPii(entry.newValue),
		ip: entry.ip
	});
}
