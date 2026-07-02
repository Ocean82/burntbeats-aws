import {
  DRUM_SCHEDULER_PROCESSOR_NAME,
  drumSchedulerProcessorSource,
} from "./drumSchedulerProcessor";

const loadedContexts = new WeakSet<AudioContext>();

export interface DrumSchedulerStepMessage {
  type: "step";
  index: number;
  time: number;
}

export async function ensureDrumSchedulerWorklet(
  ctx: AudioContext,
): Promise<boolean> {
  if (loadedContexts.has(ctx)) return true;
  if (typeof ctx.audioWorklet?.addModule !== "function") return false;
  try {
    const blob = new Blob([drumSchedulerProcessorSource], {
      type: "application/javascript",
    });
    const url = URL.createObjectURL(blob);
    try {
      await ctx.audioWorklet.addModule(url);
      loadedContexts.add(ctx);
      return true;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return false;
  }
}

export function createDrumSchedulerNode(
  ctx: AudioContext,
  onStep: (message: DrumSchedulerStepMessage) => void,
): AudioWorkletNode | null {
  try {
    const node = new AudioWorkletNode(ctx, DRUM_SCHEDULER_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = (event: MessageEvent<DrumSchedulerStepMessage>) => {
      if (event.data?.type === "step") onStep(event.data);
    };
    const silent = ctx.createGain();
    silent.gain.value = 0;
    node.connect(silent);
    silent.connect(ctx.destination);
    return node;
  } catch {
    return null;
  }
}
