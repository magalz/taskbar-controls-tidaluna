import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const distDir = join(repoRoot, "plugins", "toolbar-controls", "dist");
const outDir = join(repoRoot, "pages");

const storePkg = JSON.parse(await readFile(join(repoRoot, "plugins", "toolbar-controls", "package.json"), "utf8"));

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of ["magalz.toolbar-controls.mjs", "magalz.toolbar-controls.json"]) {
	await writeFile(join(outDir, file), await readFile(join(distDir, file)));
}

// Luna store manifest: LunaStore fetches `${storeUrl}/store.json`, renders
// the store card from name/author/description/homepage, then resolves each
// plugin entry relative to the store root via fromStorage({ url }).
const store = {
	name: "magalz/taskbar-controls",
	description: "Taskbar Controls for TidaLuna — floating playback toolbar + Windows taskbar thumbnail controls.",
	author: { name: "Magalz", url: "https://github.com/magalz" },
	homepage: "https://github.com/magalz/taskbar-controls-tidaluna",
	repository: { type: "git", url: "https://github.com/magalz/taskbar-controls-tidaluna.git" },
	type: "module",
	version: storePkg.version,
	plugins: ["magalz.toolbar-controls"],
};
await writeFile(join(outDir, "store.json"), JSON.stringify(store));

console.log(`Pages root written to ${outDir}:`, ["magalz.toolbar-controls.mjs", "magalz.toolbar-controls.json", "store.json"].join(", "));
