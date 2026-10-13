// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/contexts/horizontal-scroll-context.tsx
// (Pie subset of W1: the optional context the mobile-panels gestures consult
// so edge swipes do not fight horizontally scrolled content. Registration
// hosts — markdown code blocks, diff views — arrive with the W2/W3 ports;
// until then the context is simply unprovided and gestures are unimpeded.)
import { createContext, useContext, type ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";

export interface HorizontalScrollInfo {
	/** True when some registered scroller is scrolled away from its left edge. */
	isAnyScrolledRight: Readonly<SharedValue<boolean>>;
	/** True when the gesture that is now active began on scrolled content. */
	activeGestureStartedScrolled: Readonly<SharedValue<boolean>>;
}

const HorizontalScrollContext = createContext<HorizontalScrollInfo | null>(null);

export function HorizontalScrollProvider({
	info,
	children,
}: {
	info: HorizontalScrollInfo;
	children: ReactNode;
}) {
	return (
		<HorizontalScrollContext.Provider value={info}>{children}</HorizontalScrollContext.Provider>
	);
}

export function useHorizontalScrollOptional(): HorizontalScrollInfo | null {
	return useContext(HorizontalScrollContext);
}
