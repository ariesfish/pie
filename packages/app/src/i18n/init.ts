// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/i18n/init.ts
type InitReporter = (message: string, error: unknown) => void;

export function observeI18nInit(
	initPromise: Promise<unknown>,
	report: InitReporter = console.error,
): void {
	initPromise.catch((error: unknown) => {
		report("[i18n] Failed to initialize", error);
	});
}
