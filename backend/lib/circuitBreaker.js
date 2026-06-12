// @ts-check
/**
 * Circuit breaker for service-to-service calls.
 *
 * Prevents cascading failures when a downstream service is unhealthy.
 * States: CLOSED (normal) → OPEN (failing, reject fast) → HALF_OPEN (probe) → CLOSED.
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ name: "stem_service" });
 *   const result = await breaker.call(() => fetch(url));
 */

import { getRedis } from "./redisClient.js";

/** @enum {string} */
const State = /** @type {const} */ ({
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half-open",
});

export class CircuitBreaker {
  /**
   * @param {{
   *   name: string,
   *   failureThreshold?: number,
   *   resetTimeout?: number,
   *   halfOpenMaxAttempts?: number,
   * }} options
   */
  constructor({
    name,
    failureThreshold = 5,
    resetTimeout = 30_000,
    halfOpenMaxAttempts = 1,
  }) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenMaxAttempts = halfOpenMaxAttempts;

    /** @type {typeof State[keyof typeof State]} */
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenAttempts = 0;
    this.redisKey = `cb:${name}:state`;
  }

  /**
   * @private
   * @returns {Promise<void>}
   */
  async _syncWithRedis() {
    const redis = await getRedis();
    if (!redis) return;
    try {
      const data = await redis.get(this.redisKey);
      if (data) {
        const { state, lastFailureTime, failureCount } = JSON.parse(data);
        // Only override if the remote state is more "open" or newer
        if (state === State.OPEN && this.state !== State.OPEN) {
          this.state = State.OPEN;
          this.lastFailureTime = lastFailureTime;
          this.failureCount = failureCount;
        } else if (state === State.CLOSED && this.state === State.OPEN) {
          // If remote is closed but we are open, maybe it reset?
          // For safety, we keep open until local reset or timeout, 
          // but we could also follow the leader.
        }
      }
    } catch { /* ignore */ }
  }

  /**
   * @private
   * @returns {Promise<void>}
   */
  async _saveToRedis() {
    const redis = await getRedis();
    if (!redis) return;
    try {
      await redis.set(this.redisKey, JSON.stringify({
        state: this.state,
        lastFailureTime: this.lastFailureTime,
        failureCount: this.failureCount,
        updatedAt: Date.now(),
      }), { EX: Math.ceil(this.resetTimeout / 1000) * 2 });
    } catch { /* ignore */ }
  }

  /**
   * Execute an async function through the circuit breaker.
   * @template T
   * @param {() => Promise<T>} fn - The async operation to protect.
   * @returns {Promise<T>}
   * @throws {CircuitOpenError} When circuit is open and rejecting requests.
   */
  async call(fn) {
    await this._syncWithRedis();

    if (this.state === State.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this._transitionTo(State.HALF_OPEN);
        await this._saveToRedis();
      } else {
        throw new CircuitOpenError(this.name, this.resetTimeout);
      }
    }
// ...

    if (this.state === State.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        throw new CircuitOpenError(this.name, this.resetTimeout);
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      await this._onSuccess();
      return result;
    } catch (error) {
      await this._onFailure();
      throw error;
    }
  }

  /** @returns {typeof State[keyof typeof State]} */
  getState() {
    // Check if open circuit should transition to half-open
    if (
      this.state === State.OPEN &&
      Date.now() - this.lastFailureTime >= this.resetTimeout
    ) {
      return State.HALF_OPEN;
    }
    return this.state;
  }

  /** Reset the circuit to closed state (e.g., for testing or manual recovery). */
  reset() {
    this._transitionTo(State.CLOSED);
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  /** @private */
  async _onSuccess() {
    if (this.state === State.HALF_OPEN) {
      this._transitionTo(State.CLOSED);
    }
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    await this._saveToRedis();
  }

  /** @private */
  async _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      this._transitionTo(State.OPEN);
      await this._saveToRedis();
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this._transitionTo(State.OPEN);
      await this._saveToRedis();
    }
  }

  /**
   * @private
   * @param {typeof State[keyof typeof State]} newState
   */
  _transitionTo(newState) {
    if (this.state === newState) return;
    const prev = this.state;
    this.state = newState;
    this.halfOpenAttempts = 0;
    console.log(
      `[circuit-breaker] ${this.name}: ${prev} → ${newState} (failures=${this.failureCount})`,
    );
  }
}

/**
 * Error thrown when the circuit is open and rejecting requests.
 */
export class CircuitOpenError extends Error {
  /**
   * @param {string} serviceName
   * @param {number} resetTimeout
   */
  constructor(serviceName, resetTimeout) {
    super(`Circuit breaker open for ${serviceName}`);
    this.name = "CircuitOpenError";
    this.serviceName = serviceName;
    this.retryAfter = Math.ceil(resetTimeout / 1000);
    this.status = 503;
  }
}

export { State as CircuitState };
