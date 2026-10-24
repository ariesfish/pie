/**
 * Validate a candidate models.json through Pi's public runtime composition.
 *
 * Pi's schema is intentionally not duplicated here: the SDK owns the accepted
 * shape, defaults and provider/model composition rules. A temporary file keeps
 * the user's live config untouched, and an in-memory model store prevents a
 * validation pass from creating catalog cache files.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";

const NOOP_MODEL_STORE = {
	read: async () => undefined,
	write: async () => undefined,
	delete: async () => undefined,
};

function withoutTempPath(error: string): string {
	return error.replace(/\n\nFile: [^\n]*$/u, "").trim();
}

export async function validateModelsConfig(
	data: Record<string, unknown>,
): Promise<string | undefined> {
	const dir = await mkdtemp(join(tmpdir(), "pie-models-validate-"));
	try {
		const modelsPath = join(dir, "models.json");
		await writeFile(modelsPath, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
		const runtime = await ModelRuntime.create({
			modelsPath,
			authPath: join(dir, "auth.json"),
			modelsStore: NOOP_MODEL_STORE,
			refreshOnCreate: false,
			allowModelNetwork: false,
		});
		const error = runtime.getError();
		return error ? withoutTempPath(error) : undefined;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return withoutTempPath(message);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
