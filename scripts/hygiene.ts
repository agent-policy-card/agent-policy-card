// Data hygiene check: fails when a tracked file contains a 20-byte address that is
// not allow-listed, or a banned personal string listed in the untracked .hygiene-local.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Leak = { path: string; match: string };
export type ScanOptions = { allowedAddresses: string[]; bannedStrings: string[] };

const ADDRESS_RE = /(?<![0-9a-fA-Fx])0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

export function scanForLeaks(files: { path: string; content: string }[], opts: ScanOptions): Leak[] {
  const allowed = new Set(opts.allowedAddresses.map((a) => a.toLowerCase()));
  const banned = opts.bannedStrings.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0);
  const leaks: Leak[] = [];
  for (const f of files) {
    for (const m of f.content.matchAll(ADDRESS_RE)) {
      if (!allowed.has(m[0].toLowerCase())) leaks.push({ path: f.path, match: m[0] });
    }
    const lower = f.content.toLowerCase();
    for (const b of banned) {
      if (lower.includes(b)) leaks.push({ path: f.path, match: b });
    }
  }
  return leaks;
}

const MAX_BYTES = 1_000_000;

function main(): void {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const allow = JSON.parse(readFileSync(`${root}/hygiene.allow.json`, "utf8")) as { allowedAddresses: string[] };
  const localPath = `${root}/.hygiene-local`;
  const bannedStrings = existsSync(localPath) ? readFileSync(localPath, "utf8").split("\n") : [];
  const paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((p) => p.length > 0 && p !== "hygiene.allow.json" && !p.startsWith("contracts/lib/"));
  const files = paths
    .map((p) => `${root}/${p}`)
    .filter((abs) => existsSync(abs) && statSync(abs).isFile() && statSync(abs).size <= MAX_BYTES)
    .map((abs) => ({ path: abs.slice(root.length + 1), content: readFileSync(abs, "utf8") }));
  const leaks = scanForLeaks(files, { allowedAddresses: allow.allowedAddresses, bannedStrings });
  if (!existsSync(localPath)) console.warn("hygiene: .hygiene-local not found, only addresses were checked");
  if (leaks.length > 0) {
    for (const l of leaks) console.error(`hygiene: ${l.path}: ${l.match}`);
    process.exit(1);
  }
  console.log(`hygiene: ${files.length} files clean`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
