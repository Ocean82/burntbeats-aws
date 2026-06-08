import { inspectCatalogHealth } from "../services/midi-catalog/index.js";

async function main() {
  const health = await inspectCatalogHealth();
  console.log(JSON.stringify(health, null, 2));
  if (health.status !== "ok") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Failed to inspect MIDI catalog health:", error);
  process.exitCode = 1;
});
