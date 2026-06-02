import { beforeEach, describe, expect, it } from "vitest"
import { useWorkflowStore } from "./workflowStore"
import { defaultStemState } from "../stem-editor-state"

function createStemState(volumeDb: number) {
  const base = defaultStemState()
  return { ...base, mixer: { ...base.mixer, gain: volumeDb } }
}

function resetStore() {
  useWorkflowStore.setState({
    stemStates: {},
    canUndo: false,
    canRedo: false,
    past: [],
    future: [],
  })
}

describe("workflowStore history", () => {
  beforeEach(() => {
    resetStore()
  })

  it("tracks undo/redo transitions", () => {
    useWorkflowStore
      .getState()
      .setStemStates({ vocals: createStemState(-3) })
    useWorkflowStore
      .getState()
      .setStemStates({ vocals: createStemState(-6) })

    expect(useWorkflowStore.getState().canUndo).toBe(true)
    expect(useWorkflowStore.getState().canRedo).toBe(false)
    expect(useWorkflowStore.getState().stemStates.vocals.mixer.gain).toBe(-6)

    useWorkflowStore.getState().undo()
    expect(useWorkflowStore.getState().stemStates.vocals.mixer.gain).toBe(-3)
    expect(useWorkflowStore.getState().canRedo).toBe(true)

    useWorkflowStore.getState().redo()
    expect(useWorkflowStore.getState().stemStates.vocals.mixer.gain).toBe(-6)
  })

  it("clears redo history after a new change", () => {
    useWorkflowStore
      .getState()
      .setStemStates({ drums: createStemState(-2) })
    useWorkflowStore
      .getState()
      .setStemStates({ drums: createStemState(-4) })

    useWorkflowStore.getState().undo()
    expect(useWorkflowStore.getState().canRedo).toBe(true)

    useWorkflowStore
      .getState()
      .setStemStates({ drums: createStemState(-8) })
    expect(useWorkflowStore.getState().canRedo).toBe(false)
  })

  it("is safe at undo/redo boundaries", () => {
    useWorkflowStore.getState().undo()
    useWorkflowStore.getState().redo()

    expect(useWorkflowStore.getState().canUndo).toBe(false)
    expect(useWorkflowStore.getState().canRedo).toBe(false)
    expect(useWorkflowStore.getState().stemStates).toEqual({})
  })
})
