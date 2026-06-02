// @ts-check
/**
 * Limits concurrent server-export Python subprocesses (CPU/RAM protection).
 */

const MAX_CONCURRENT =
  Number(process.env.SERVER_EXPORT_MAX_CONCURRENT) || 2;

let active = 0;
/** @type {Array<() => void>} */
const waitQueue = [];

/**
 * @returns {Promise<{ release: () => void }>}
 */
export function acquireExportSlot() {
  return new Promise((resolve) => {
    const grant = () => {
      active++;
      if (active > MAX_CONCURRENT) {
        console.warn(
          "[server-export] active exports %d exceeds max %d",
          active,
          MAX_CONCURRENT,
        );
      }
      resolve({
        release: () => {
          active = Math.max(0, active - 1);
          while (waitQueue.length > 0 && active < MAX_CONCURRENT) {
            const next = waitQueue.shift();
            if (next) next();
          }
        },
      });
    };
    if (active < MAX_CONCURRENT) grant();
    else waitQueue.push(grant);
  });
}

/** @returns {number} */
export function getActiveExportCount() {
  return active;
}
