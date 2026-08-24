import { processDueCvJobs } from "../lib/cv/worker";

const pollMs = Math.max(1000, Number(process.env.CV_WORKER_POLL_MS || 5000));
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.info(`[cv-worker] started; polling every ${pollMs}ms`);
  while (!stopping) {
    const result = await processDueCvJobs(5);
    if (result.found) console.info(`[cv-worker] processed ${result.found} queued job(s)`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  console.info("[cv-worker] stopped");
}

main().catch((error) => {
  console.error("[cv-worker] fatal", error);
  process.exitCode = 1;
});
