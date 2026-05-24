// @ts-check
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker, CircuitOpenError, CircuitState } from "./circuitBreaker.js";

describe("CircuitBreaker", () => {
  /** @type {CircuitBreaker} */
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: "test_service",
      failureThreshold: 3,
      resetTimeout: 100, // 100ms for fast tests
    });
  });

  it("starts in closed state", () => {
    assert.equal(breaker.getState(), CircuitState.CLOSED);
  });

  it("passes through successful calls in closed state", async () => {
    const result = await breaker.call(async () => "ok");
    assert.equal(result, "ok");
    assert.equal(breaker.getState(), CircuitState.CLOSED);
  });

  it("opens after reaching failure threshold", async () => {
    const fail = () => breaker.call(async () => { throw new Error("fail"); });

    await assert.rejects(fail);
    await assert.rejects(fail);
    assert.equal(breaker.getState(), CircuitState.CLOSED);

    await assert.rejects(fail);
    assert.equal(breaker.getState(), CircuitState.OPEN);
  });

  it("rejects immediately when open", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await assert.rejects(
      () => breaker.call(async () => "should not run"),
      (err) => {
        assert(err instanceof CircuitOpenError);
        assert.equal(err.serviceName, "test_service");
        assert.equal(err.status, 503);
        return true;
      },
    );
  });

  it("transitions to half-open after reset timeout", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    }
    assert.equal(breaker.getState(), CircuitState.OPEN);

    // Wait for reset timeout
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(breaker.getState(), CircuitState.HALF_OPEN);
  });

  it("closes on successful probe in half-open state", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 150));

    const result = await breaker.call(async () => "recovered");
    assert.equal(result, "recovered");
    assert.equal(breaker.getState(), CircuitState.CLOSED);
  });

  it("re-opens on failed probe in half-open state", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    await new Promise((r) => setTimeout(r, 150));

    await assert.rejects(
      () => breaker.call(async () => { throw new Error("still failing"); }),
    );
    assert.equal(breaker.getState(), CircuitState.OPEN);
  });

  it("resets failure count on success", async () => {
    await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    // 2 failures, then success
    await breaker.call(async () => "ok");
    // Should be back to 0 failures
    await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    // Still closed (only 2 consecutive failures)
    assert.equal(breaker.getState(), CircuitState.CLOSED);
  });

  it("reset() forces closed state", async () => {
    for (let i = 0; i < 3; i++) {
      await breaker.call(async () => { throw new Error("fail"); }).catch(() => {});
    }
    assert.equal(breaker.getState(), CircuitState.OPEN);

    breaker.reset();
    assert.equal(breaker.getState(), CircuitState.CLOSED);
  });
});
