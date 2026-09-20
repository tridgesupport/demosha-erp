import sql from '../db/client';
import type { Scope } from '../db/agentClient';

const roles = (v: string | undefined, d: string) => (v ?? d).split(',').map((s) => s.trim()).filter(Boolean);

// Costlier / wider options are limited to roles you trust with them. Override with env, comma-separated.
const DEEP_ROLES = roles(process.env.AGENT_DEEP_ROLES, 'admin,manager');
const WEB_ROLES = roles(process.env.AGENT_WEB_ROLES, 'admin,manager,accountant');

export async function scopesForRole(role: string): Promise<Scope[]> {
  const rows = await sql`SELECT scope FROM agent_role_scopes WHERE role = ${role}`;
  return rows.map((r: any) => r.scope as Scope);
}

export interface AgentAccess {
  enabled: boolean;
  deep: boolean;
  web: boolean;
}

// Sent to the web app at login so it can show or hide the "Ask" tab. The server
// re-checks scopes on every chat call: this is a convenience, not the gate.
export async function agentAccess(role: string): Promise<AgentAccess> {
  try {
    const enabled = (await scopesForRole(role)).length > 0;
    return { enabled, deep: enabled && DEEP_ROLES.includes(role), web: enabled && WEB_ROLES.includes(role) };
  } catch {
    return { enabled: false, deep: false, web: false }; // e.g. migration 028 not applied in this environment
  }
}
