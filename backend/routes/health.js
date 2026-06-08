// @ts-check
/**
 * Health check route.
 * Reports backend status, database connectivity, downstream service reachability,
 * and circuit breaker states.
 */
import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { healthCheck as dbHealthCheck } from "../db.js";
import {
  stemServiceClient,
  speechServiceClient,
  midiServiceClient,
  getCircuitStates,
} from "../lib/serviceClients.js";
import { getMidiSharedStorageHealth, probeMidiStorage } from "./midi/shared.js";
import { inspectCatalogHealth } from "../services/midi-catalog/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"),
);
const startTime = Date.now();

export const healthRouter = Router();

healthRouter.get("/", async (req, res) => {
  const db = await dbHealthCheck();
  const [backendMidiStorage, midiCatalogHealth] = await Promise.all([
    probeMidiStorage(),
    inspectCatalogHealth(),
  ]);

  // Check downstream services (non-blocking, with short timeout)
  const [stemHealth, speechHealth, midiHealth] = await Promise.allSettled([
    stemServiceClient.fetchJson(req, "/health", { timeoutMs: 3000 }),
    speechServiceClient.fetchJson(req, "/health", { timeoutMs: 3000 }),
    midiServiceClient.fetchJson(req, "/health", { timeoutMs: 3000 }),
  ]);

  const serviceStatus = (/** @type {PromiseSettledResult<any>} */ result) => {
    if (result.status === "fulfilled") {
      return {
        reachable: true,
        latencyMs: undefined,
        status: result.value?.data?.status || "ok",
      };
    }
    return { reachable: false, error: result.reason?.message || "unreachable" };
  };

  const circuits = getCircuitStates();
  const allServicesOk =
    stemHealth.status === "fulfilled" &&
    speechHealth.status === "fulfilled" &&
    midiHealth.status === "fulfilled";
  const midiServiceHealth =
    midiHealth.status === "fulfilled" ? midiHealth.value?.data : null;
  const midiSharedStorage = await getMidiSharedStorageHealth(
    backendMidiStorage,
    midiServiceHealth,
  );
  const midiStorageOk = backendMidiStorage.ok && midiSharedStorage.aligned;

  const payload = {
    status:
      db.ok &&
      allServicesOk &&
      midiStorageOk &&
      midiCatalogHealth.status === "ok"
        ? "ok"
        : "degraded",
    version: pkg.version,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    database: {
      connected: db.ok,
      latencyMs: db.latencyMs,
      ...(db.error ? { error: db.error } : {}),
    },
    services: {
      stem: serviceStatus(stemHealth),
      speech: serviceStatus(speechHealth),
      midi: serviceStatus(midiHealth),
    },
    storage: {
      midi_backend: backendMidiStorage,
      midi_service: midiServiceHealth?.storage || null,
      midi_shared: midiSharedStorage,
    },
    catalogs: {
      midi: midiCatalogHealth,
    },
    circuits,
  };
  res.status(200).json(payload);
});
