/**
 * Protocol version. Bump on breaking changes only (per ADR-0001).
 * - major: incompatible changes (remove/rename a command or event, change a payload shape)
 * - additions go through capability negotiation, not a version bump.
 */
export const PROTOCOL_VERSION = 1 as const;
