import { HostSessionError } from "../../core/host-session.js";

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
	const v = args[key];
	return typeof v === "string" ? v : undefined;
}

export function optString(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function requiredString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new HostSessionError(`Missing required string argument: ${key}`, "invalid_args");
	}
	return value;
}

export function requiredStringArray(args: Record<string, unknown>, key: string): string[] {
	const value = args[key];
	if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0)) {
		throw new HostSessionError(`Missing required string array argument: ${key}`, "invalid_args");
	}
	return value as string[];
}

const PERMISSION_DECISIONS = new Set(["allow", "allowSession", "deny"]);

export function permissionDecision(args: Record<string, unknown>): "allow" | "allowSession" | "deny" {
	const decision = requiredString(args, "decision");
	if (!PERMISSION_DECISIONS.has(decision)) {
		throw new HostSessionError(`Invalid permission decision: ${decision}`, "invalid_args");
	}
	return decision as "allow" | "allowSession" | "deny";
}
