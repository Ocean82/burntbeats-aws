/**
 * AudioWorklet processor — posts step-due messages at audio-rate timing.
 * Synthesis stays on the main thread; this is the clock only.
 */
export const DRUM_SCHEDULER_PROCESSOR_NAME = "drum-scheduler-processor";

export const drumSchedulerProcessorSource = `
class DrumSchedulerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.running = false;
    this.stepIndex = 0;
    this.totalSteps = 16;
    this.nextStepTime = 0;
    this.stepDurations = [];
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "configure") {
        this.totalSteps = msg.totalSteps || 16;
        this.stepDurations = Array.isArray(msg.stepDurations) ? msg.stepDurations : [];
        this.stepIndex = 0;
        this.nextStepTime = currentTime + 0.05;
      }
      if (msg.type === "start") {
        this.running = true;
        this.stepIndex = 0;
        this.nextStepTime = currentTime + 0.05;
      }
      if (msg.type === "stop") {
        this.running = false;
      }
    };
  }

  process() {
    if (!this.running) return true;
    const lookAhead = 0.1;
    while (this.nextStepTime < currentTime + lookAhead) {
      const idx = this.stepIndex % this.totalSteps;
      this.port.postMessage({
        type: "step",
        index: idx,
        time: this.nextStepTime,
      });
      const dur = this.stepDurations[idx] || 0.125;
      this.nextStepTime += dur;
      this.stepIndex = (this.stepIndex + 1) % this.totalSteps;
    }
    return true;
  }
}

registerProcessor("${DRUM_SCHEDULER_PROCESSOR_NAME}", DrumSchedulerProcessor);
`;
