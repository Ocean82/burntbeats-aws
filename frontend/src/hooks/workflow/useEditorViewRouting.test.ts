import { renderHook, act } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { locationToView, useEditorViewRouting } from "./useEditorViewRouting"

const mockNavigate = vi.fn()

vi.mock("wouter", () => ({
  useLocation: () => ["/", mockNavigate] as const,
}))

describe("locationToView", () => {
  it("maps /library to my-stems view", () => {
    expect(locationToView("/library")).toBe("my-stems")
  })

  it("maps /beats to beats view", () => {
    expect(locationToView("/beats")).toBe("beats")
  })

  it("keeps /my-stems mapped to my-stems view", () => {
    expect(locationToView("/my-stems")).toBe("my-stems")
  })
})

describe("useEditorViewRouting", () => {
  it("navigates my-stems view to canonical /library route", () => {
    const { result } = renderHook(() => useEditorViewRouting())

    act(() => {
      result.current.setActiveView("my-stems")
    })

    expect(mockNavigate).toHaveBeenCalledWith("/library")
  })
})
