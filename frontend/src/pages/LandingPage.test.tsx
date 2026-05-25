import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "./LandingPage";

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: false }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
}));

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

describe("LandingPage", () => {
  it("positions Burnt Beats as a browser workstation for producers and DJs", () => {
    render(<LandingPage />);

    expect(
      screen.getAllByText(/browser workstation for producers and djs/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/reopen past stem jobs/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/stem-to-midi workflow built in/i).length,
    ).toBeGreaterThan(0);
  });

  it("reinforces differentiators near pricing instead of generic FAQ language", () => {
    render(<LandingPage />);

    expect(
      screen.getByText(/why producers pay for more than the split/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/what happens after the split/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/can i turn stems into midi/i),
    ).toBeInTheDocument();
  });
});
