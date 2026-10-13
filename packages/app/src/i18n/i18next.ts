// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/i18n/i18next.ts
// (Pie subset: en + zh-CN only.)
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { observeI18nInit } from "./init";
import { en } from "./resources/en";
import { zhCN } from "./resources/zh-CN";

const i18n = createInstance();

observeI18nInit(
	i18n.use(initReactI18next).init({
		compatibilityJSON: "v4",
		fallbackLng: "en",
		lng: "en",
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
