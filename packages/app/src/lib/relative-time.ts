// Relative-time formatting: the store returns data (`relativeTimeValue`), the
// view resolves the label through i18n. Keeping the copy in resources is the
// C7 rule — no user-visible English (or Chinese) may live in store code.
import type { TFunction } from "i18next";

import { relativeTimeValue } from "@/stores/session-list-store";

export function relativeTimeLabel(t: TFunction, iso: string): string {
	const value = relativeTimeValue(iso);
	if (!value) return "";
	if (value.unit === "now") return t("agentList.time.now");
	const key = {
		minute: "agentList.time.minutes",
		hour: "agentList.time.hours",
		day: "agentList.time.days",
		month: "agentList.time.months",
	}[value.unit];
	return t(key, { count: value.count });
}
