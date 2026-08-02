import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const storeDir = path.resolve("dist-store");

fs.rmSync(storeDir, { recursive: true, force: true });
fs.cpSync(distDir, storeDir, { recursive: true });

const manifestPath = path.join(storeDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
delete manifest.key;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
