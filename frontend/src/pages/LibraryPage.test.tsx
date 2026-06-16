import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";
import type { UseSubscriptionResult } from "../hooks/useSubscription";

const subscription: UseSubscriptionResult = {
  status: "active",
  plan: "basic",
  entitlementSource: "subscription",
  capabilities: {
    canSplitFourStems: false,
    canExpandToFourStems: false,
    canUsePremiumStemQualities: false,
    canUseBatchQueue: false,
    canDownloadFullPreview: true,
    canShareCleanPreview: false,
  },
  billingStatus: "none",
  billingError: null,
  startCheckout: vi.fn(),
  openPortal: vi.fn(),
  refetch: vi.fn(),
};

let audioContextConstructCount = 0;

function installAudioContextSpy() {
  audioContextConstructCount = 0;

  class TestAudioContext {
    state: AudioContextState = "running";
    currentTime = 0;
    destination = { connect: vi.fn() };

    createGain() {
      return {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }

    createDynamicsCompressor() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }

    resume() {
      return Promise.resolve();
    }

    close() {
      return Promise.resolve();
    }
  }

  vi.stubGlobal(
    "AudioContext",
    vi.fn(function MockAudioContext(this: TestAudioContext) {
      audioContextConstructCount += 1;
      return new TestAudioContext();
    }),
  );
}

describe("LibraryPage drum machine QA", () => {
  beforeEach(() => {
    installAudioContextSpy();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not mount drum workspace on catalog tab", () => {
    render(
      <LibraryPage
        reduceMotion
        subscription={subscription}
        checkoutNotice={null}
      />,
    );

    expect(screen.getByRole("searchbox", { name: /search catalog/i })).toBeInTheDocument();
    expect(screen.queryByText(/edits your sequencer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start playback/i })).not.toBeInTheDocument();
  });

  it("does not construct AudioContext while catalog tab is active", () => {
    render(
      <LibraryPage
        reduceMotion
        subscription={subscription}
        checkoutNotice={null}
      />,
    );

    expect(audioContextConstructCount).toBe(0);
  });

  it("does not construct AudioContext after opening drum tab until play", () => {
    render(
      <LibraryPage
        reduceMotion
        subscription={subscription}
        checkoutNotice={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /drum machine/i }));
    expect(audioContextConstructCount).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /start playback/i }));
    expect(audioContextConstructCount).toBe(1);
  });

  it("shows labeled grid and overlay panels on drum tab", () => {
    render(
      <LibraryPage
        reduceMotion
        subscription={subscription}
        checkoutNotice={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /drum machine/i }));

    expect(screen.getByText(/edits your sequencer/i)).toBeInTheDocument();
    expect(screen.getByText(/plays in sync with your grid/i)).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: /overlay pattern variation controls/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /kick volume/i })).toBeInTheDocument();
    const overlayList = screen.getByRole("listbox", { name: /available rhythm patterns/i });
    expect(overlayList).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /half-time rock/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /lo-fi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /half-time rock/i })).toBeInTheDocument();
  });

  it("disables overlay variations until a pattern is selected", () => {
    render(
      <LibraryPage
        reduceMotion
        subscription={subscription}
        checkoutNotice={null}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /drum machine/i }));

    const overlayToolbar = screen.getByRole("toolbar", {
      name: /overlay pattern variation controls/i,
    });
    const overlayButtons = overlayToolbar.querySelectorAll("button");
    overlayButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("renders developer drawer when devTools are provided", () => {
    render(
      <LibraryPage
        reduceMotion
        subscription={subscription}
        checkoutNotice={null}
        devTools={{
          latencyStats: {},
          onResetLatencyStats: vi.fn(),
        }}
      />,
    );

    expect(screen.getByTestId("library-dev-drawer")).toBeInTheDocument();
  });
});
