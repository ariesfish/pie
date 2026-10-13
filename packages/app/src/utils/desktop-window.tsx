// Desktop window chrome utilities (paseo has a full implementation wired to
// the Electron custom titlebar; the Pie shell does not have window chrome
// regions yet — this pass-through shim lands with the mobile-panels port so
// the ported presentation compiles unmodified. Replaced when W2 brings the
// window-chrome system.)
import type { ReactNode } from "react";

export function WindowChromeRootRegion({
	children,
}: {
	corners?: "leading" | "trailing" | "both";
	children: ReactNode;
}) {
	return children;
}
