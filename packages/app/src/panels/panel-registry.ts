// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/panels/panel-registry.ts
// (Pie adaptation: definePanel/registerPanel keep the paseo shape — manifest
// + component + presentation — minus the descriptor hooks (per-tab state
// badges arrive with the workspace-tabs row port).)
import type { ComponentType } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getPanelManifest, type PanelManifest } from "@/panels/panel-manifest";
export type { PaneHost } from "@/panels/panel-manifest";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

/** Props every registered panel component receives. */
export interface PanelProps<K extends WorkspaceTabTarget["kind"] = WorkspaceTabTarget["kind"]> {
	target: Extract<WorkspaceTabTarget, { kind: K }>;
}

export interface PanelIconProps {
	size: number;
	color: string;
	strokeWidth?: number;
}

export interface PanelPresentation {
	label: (t: TFunction) => string;
	icon: ComponentType<PanelIconProps>;
}

export interface PanelRegistration<
	K extends WorkspaceTabTarget["kind"] = WorkspaceTabTarget["kind"],
> extends PanelManifest<K> {
	component: ComponentType<PanelProps<K>>;
	presentation: PanelPresentation;
}

export function definePanel<K extends WorkspaceTabTarget["kind"]>(
	kind: K,
	implementation: {
		component: ComponentType<PanelProps<K>>;
		presentation: PanelPresentation;
	},
): PanelRegistration<K> {
	return {
		...getPanelManifest(kind),
		component: implementation.component,
		presentation: implementation.presentation,
	};
}

const panelRegistry = new Map<WorkspaceTabTarget["kind"], PanelRegistration>();

export function registerPanel<K extends WorkspaceTabTarget["kind"]>(
	registration: PanelRegistration<K>,
): void {
	panelRegistry.set(registration.kind, registration as unknown as PanelRegistration);
}

export function getPanelRegistration(
	kind: WorkspaceTabTarget["kind"],
): PanelRegistration | undefined {
	return panelRegistry.get(kind);
}

/** Presentation label with i18n applied (static panels). */
export function usePanelLabel(kind: WorkspaceTabTarget["kind"]): string | null {
	const { t } = useTranslation();
	return getPanelRegistration(kind)?.presentation.label(t) ?? null;
}
