import { spawn } from "node:child_process";
import { join } from "node:path";
import nextEnv from "@next/env";

// Both the Next server and the worker inherit the same local configuration.
nextEnv.loadEnvConfig(process.cwd(), true);

const root = process.cwd();
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const tsxBin = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const children = [
  spawn(process.execPath, [nextBin, "dev"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [tsxBin, "scripts/cv-worker.ts"], { cwd: root, stdio: "inherit" }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exit(code);
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!closing && code && code !== 0) close(code);
  });
}
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
