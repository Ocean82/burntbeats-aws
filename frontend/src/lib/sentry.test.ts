import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/react", () => ({
  getActiveSpan: vi.fn(),
  spanToTraceHeader: vi.fn(),
  spanToBaggageHeader: vi.fn(),
}));

import * as Sentry from "@sentry/react";
import { traceHeaders } from "./sentry";

describe("traceHeaders", () => {
  beforeEach(() => {
    vi.mocked(Sentry.getActiveSpan).mockReset();
    vi.mocked(Sentry.spanToTraceHeader).mockReset();
    vi.mocked(Sentry.spanToBaggageHeader).mockReset();
  });

  it("returns empty object when no active span", () => {
    vi.mocked(Sentry.getActiveSpan).mockReturnValue(undefined);

    expect(traceHeaders()).toEqual({});
  });

  it("merges sentry-trace and baggage from active span", () => {
    const span = { spanId: "abc" } as unknown as ReturnType<typeof Sentry.getActiveSpan>;
    vi.mocked(Sentry.getActiveSpan).mockReturnValue(span);
    vi.mocked(Sentry.spanToTraceHeader).mockReturnValue("trace-id-span-id-1");
    vi.mocked(Sentry.spanToBaggageHeader).mockReturnValue(
      "sentry-environment=test,sentry-trace_id=trace-id",
    );

    expect(traceHeaders()).toEqual({
      "sentry-trace": "trace-id-span-id-1",
      baggage: "sentry-environment=test,sentry-trace_id=trace-id",
    });
  });

  it("omits headers when span helpers return empty values", () => {
    const span = { spanId: "abc" } as unknown as ReturnType<typeof Sentry.getActiveSpan>;
    vi.mocked(Sentry.getActiveSpan).mockReturnValue(span);
    vi.mocked(Sentry.spanToTraceHeader).mockReturnValue("");
    vi.mocked(Sentry.spanToBaggageHeader).mockReturnValue("");

    expect(traceHeaders()).toEqual({});
  });
});
