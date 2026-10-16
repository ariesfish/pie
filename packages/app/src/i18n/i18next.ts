// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/i18n/i18next.ts
// (Pie subset: en + zh-CN only.)
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { observeI18nInit } from "./init";
import { en } from "./resources/en";
import { zhCN } from "./resources/zh-CN";

const i18n = createInstance();

/** navigator.language match against the shipped catalogs, else "en". */
function detectLanguage(): string {
	try {
		const nav =
			typeof navigator !== "undefined" ? (navigator.language ?? "") : "";
		if (/^zh/i.test(nav)) return "zh-CN";
	} catch {
		// non-browser runtime (tests): English
	}
	return "en";
}

observeI18nInit(
	i18n.use(initReactI18next).init({
		compatibilityJSON: "v4",
		fallbackLng: "en",
		// Follow the browser/platform language (zh-CN users get zh-CN).
		lng: detectLanguage(),
		resources: {
			en: { translation: en },
			"zh-CN": { translation: zhCN },
		},
		interpolation: {
			escapeValue: false,
		},
	}),
);

export default i18n;
