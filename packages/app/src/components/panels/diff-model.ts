// Diff model (P2b-3): parse a unified patch body into structured rows —
// hunk headers, paired add/del runs with intra-line (word-level) LCS
// segments, and collapsed context regions. Pure functions; unit-tested.
export type InSeg = { text: string; changed: boolean };

export type DiffRow =
	| { type: "hunk"; header: string }
	| { type: "context"; text: string; oldN: number; newN: number }
	| { type: "add"; text: string; newN: number; segs: InSeg[] }
	| { type: "del"; text: string; oldN: number; segs: InSeg[] };

export interface DiffModel {
	rows: DiffRow[];
	/** [start, end) index pairs into `rows` marking collapsible context gaps. */
	collapseRanges: Array<{ start: number; end: number; hidden: number }>;
	addedLines: number;
	deletedLines: number;
}

const CONTEXT_KEEP = 3;
const COLLAPSE_MIN_HIDDEN = 5;

export function buildDiffModel(patch: string): DiffModel {
	const rows: DiffRow[] = [];
	let oldN = 0;
	let newN = 0;
	let added = 0;
	let deleted = 0;

	// Buffer one hunk's del-run / add-run to pair them for intra-line LCS.
	let delRun: Array<{ text: string; n: number }> = [];
	let addRun: Array<{ text: string; n: number }> = [];

	const flush = () => {
		const pairs = Math.min(delRun.length, addRun.length);
		for (let i = 0; i < pairs; i++) {
			const d = delRun[i]!;
			const a = addRun[i]!;
			const [dSegs, aSegs] = intraLine(d.text, a.text);
			rows.push({ type: "del", text: d.text, oldN: d.n, segs: dSegs });
			rows.push({ type: "add", text: a.text, newN: a.n, segs: aSegs });
		}
		for (let i = pairs; i < delRun.length; i++) {
			const d = delRun[i]!;
			rows.push({ type: "del", text: d.text, oldN: d.n, segs: [{ text: d.text, changed: false }] });
		}
		for (let i = pairs; i < addRun.length; i++) {
			const a = addRun[i]!;
			rows.push({ type: "add", text: a.text, newN: a.n, segs: [{ text: a.text, changed: false }] });
		}
		delRun = [];
		addRun = [];
	};

	const lines = patch.replace(/\n$/, "").split("\n");
	for (const line of lines) {
		if (line.startsWith("@@")) {
			flush();
			const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
			if (m) {
				oldN = Number.parseInt(m[1]!, 10);
				newN = Number.parseInt(m[2]!, 10);
			}
			rows.push({ type: "hunk", header: line });
			continue;
		}
		if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("diff ") || line.startsWith("index ")) {
			// file headers between hunks (patch bodies we produce include them)
			rows.push({ type: "hunk", header: line });
			continue;
		}
		if (line.startsWith("+")) {
			addRun.push({ text: line.slice(1), n: newN++ });
			added++;
			continue;
		}
		if (line.startsWith("-")) {
			delRun.push({ text: line.slice(1), n: oldN++ });
			deleted++;
			continue;
		}
		if (line.startsWith(" ") || line === "") {
			flush();
			const text = line === "" ? "" : line.slice(1);
			rows.push({ type: "context", text, oldN: oldN++, newN: newN++ });
			continue;
		}
	}
	flush();

	return {
		rows,
		collapseRanges: computeCollapseRanges(rows),
		addedLines: added,
		deletedLines: deleted,
	};
}

/** Context gaps longer than KEEP*2 + MIN_HIDDEN collapse with an ellipsis row. */
function computeCollapseRanges(
	rows: DiffRow[],
): Array<{ start: number; end: number; hidden: number }> {
	const out: Array<{ start: number; end: number; hidden: number }> = [];
	let runStart = -1;
	let runLen = 0;
	for (let i = 0; i <= rows.length; i++) {
		const row = rows[i];
		if (row && row.type === "context") {
			if (runStart === -1) runStart = i;
			runLen++;
		} else {
			if (runStart !== -1 && runLen > CONTEXT_KEEP * 2 + COLLAPSE_MIN_HIDDEN) {
				out.push({
					start: runStart + CONTEXT_KEEP,
					end: runStart + runLen - CONTEXT_KEEP,
					hidden: runLen - CONTEXT_KEEP * 2,
				});
			}
			runStart = -1;
			runLen = 0;
		}
	}
	return out;
}

/** Word-level (LCS) pairing of one removed/added line pair. */
export function intraLine(
	oldLine: string,
	newLine: string,
): [InSeg[], InSeg[]] {
	const a = tokenize(oldLine);
	const b = tokenize(newLine);
	const ops = lcsOps(a, b);
	const oldSegs: InSeg[] = [];
	const newSegs: InSeg[] = [];
	let oi = 0;
	let ni = 0;
	for (const op of ops) {
		if (op === "same") {
			oldSegs.push({ text: a[oi]!, changed: false });
			newSegs.push({ text: b[ni]!, changed: false });
			oi++;
			ni++;
		} else if (op === "del") {
			oldSegs.push({ text: a[oi]!, changed: true });
			oi++;
		} else {
			newSegs.push({ text: b[ni]!, changed: true });
			ni++;
		}
	}
	return [merge(oldSegs), merge(newSegs)];
}

function tokenize(line: string): string[] {
	return line.match(/(\s+|[\w']+|[^\s\w]+)/g) ?? (line === "" ? [] : [line]);
}

/** LCS diff ops between two token arrays ("same" | "del" | "add"). */
export function lcsOps(a: string[], b: string[]): Array<"same" | "del" | "add"> {
	const n = a.length;
	const m = b.length;
	// Guard: pathological long lines fall back to whole-line changed.
	if (n * m > 200 * 200) {
		return [
			...a.map(() => "del" as const),
			...b.map(() => "add" as const),
		];
	}
	// dp[i][j] = LCS length of a[i:], b[j:]
	const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
		}
	}
	const ops: Array<"same" | "del" | "add"> = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			ops.push("same");
			i++;
			j++;
		} else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
			ops.push("del");
			i++;
		} else {
			ops.push("add");
			j++;
		}
	}
	while (i < n) {
		ops.push("del");
		i++;
	}
	while (j < m) {
		ops.push("add");
		j++;
	}
	return ops;
}

function merge(segs: InSeg[]): InSeg[] {
	const out: InSeg[] = [];
	for (const s of segs) {
		const last = out[out.length - 1];
		if (last && last.changed === s.changed) last.text += s.text;
		else out.push({ ...s });
	}
	return out;
}
