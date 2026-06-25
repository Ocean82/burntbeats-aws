import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LeadCaptureForm } from "./LeadCaptureForm";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("LeadCaptureForm", () => {
  it("renders email input and subscribe button", () => {
    render(<LeadCaptureForm />);
    expect(screen.getByPlaceholderText("you@email.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Subscribe/ })).toBeInTheDocument();
  });

  it("does not submit when email is empty", () => {
    const fetchMock = vi.mocked(fetch);
    render(<LeadCaptureForm />);
    fireEvent.click(screen.getByRole("button", { name: /Subscribe/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not submit when email lacks @", () => {
    const fetchMock = vi.mocked(fetch);
    render(<LeadCaptureForm />);
    fireEvent.change(screen.getByPlaceholderText("you@email.com"), { target: { value: "notanemail" } });
    fireEvent.click(screen.getByRole("button", { name: /Subscribe/ }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls API and shows success state", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    render(<LeadCaptureForm />);
    fireEvent.change(screen.getByPlaceholderText("you@email.com"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Subscribe/ }));
    await waitFor(() => {
      expect(screen.getByText(/You're in/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/newsletter/subscribe"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "test@example.com" }),
      }),
    );
  });

  it("shows error message when API call fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    render(<LeadCaptureForm />);
    fireEvent.change(screen.getByPlaceholderText("you@email.com"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Subscribe/ }));
    await waitFor(() => {
      expect(screen.getByText(/Could not subscribe/)).toBeInTheDocument();
    });
  });
});
