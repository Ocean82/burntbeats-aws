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
  }

  /**
   * Execute an async function through the circuit breaker.
   * @template T
   * @param {() => Promise<T>} fn - The async operation to protect.
   * @returns {Promise<T>}
   * @throws {CircuitOpenError} When circuit is open and rejecting requests.
   */
  async call(fn) {
    if (this.state === State.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this._transitionTo(State.HALF_OPEN);
      } else {
        throw new CircuitOpenError(this.name, this.resetTimeout);
      }
    }

    if (this.state === State.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
        throw new CircuitOpenError(this.name, this.resetTimeout);
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
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
  _onSuccess() {
    if (this.state === State.HALF_OPEN) {
      this._transitionTo(State.CLOSED);
    }
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  /** @private */
  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      this._transitionTo(State.OPEN);
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this._transitionTo(State.OPEN);
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
