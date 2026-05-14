import React, { useState } from 'react';

interface Section {
  title: string;
  icon: string;
  content: React.ReactNode;
}

export const DocumentationPanel: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);

  const sections: Section[] = [
    {
      title: 'Integration Guide',
      icon: '🔌',
      content: (
        <div className="space-y-3 text-sm text-slate-300">
          <p className="text-slate-400">Drop the plugin into any WebAudio graph in 3 steps:</p>
          <pre className="bg-black/50 rounded-lg p-3 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre">{`// 1. Import and create plugin
import { PitchTempoPlugin } from './PitchTempoPlugin';

const ctx    = new AudioContext();
const plugin = new PitchTempoPlugin({ audioContext: ctx });
await plugin.ready();

// 2. Wire audio graph
//   source → plugin input → plugin output → destination
source.connect(plugin.inputNode);
plugin.outputNode.connect(ctx.destination);

// 3. Control pitch & tempo independently
plugin.setPitchSemitones(+2);   // ↑ pitch 2 semitones
plugin.setTempoRatio(1.05);      // ↑ tempo 5%
plugin.bypass(false);            // enable processing`}</pre>
          <p className="font-semibold text-violet-300">Multi-stem (global mode):</p>
          <pre className="bg-black/50 rounded-lg p-3 text-xs font-mono text-blue-300 overflow-x-auto whitespace-pre">{`import { StemPluginManager } from './PitchTempoPlugin';

const stems = [
  { id: 'vocals', label: 'Vocals', color: '#8b5cf6' },
  { id: 'drums',  label: 'Drums',  color: '#ef4444' },
];
const mgr = new StemPluginManager(ctx, stems, 'global');

// One call → all stems updated simultaneously
mgr.setGlobalPitch(+1);     // all stems: +1 semitone
mgr.setGlobalTempo(0.95);   // all stems: -5% tempo`}</pre>
        </div>
      ),
    },
    {
      title: 'DSP Architecture',
      icon: '⚙️',
      content: (
        <div className="space-y-3 text-sm text-slate-300">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/30 rounded-lg p-3">
              <div className="font-semibold text-violet-300 mb-2">Phase Vocoder</div>
              <ul className="space-y-1 text-xs text-slate-400">
                <li>• FFT size: 2048 samples</li>
                <li>• Hop size: 512 (75% overlap)</li>
                <li>• Window: Hann (sum-of-squares normalized)</li>
                <li>• Analysis: STFT magnitude + phase</li>
                <li>• Phase accumulation with true-frequency estimation</li>
                <li>• OLA (Overlap-Add) synthesis</li>
              </ul>
            </div>
            <div className="bg-black/30 rounded-lg p-3">
              <div className="font-semibold text-blue-300 mb-2">Signal Flow</div>
              <div className="text-xs font-mono text-slate-400 space-y-1">
                <div>Input (128 frames)</div>
                <div className="pl-2">↓ Ring buffer feed</div>
                <div className="pl-2">↓ FFT analysis (2048)</div>
                <div className="pl-2">↓ Phase vocoder</div>
                <div className="pl-2">↓ IFFT synthesis</div>
                <div className="pl-2">↓ OLA + normalize</div>
                <div className="pl-2">↓ Resample (tempo)</div>
                <div>Output (128 frames)</div>
              </div>
            </div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="font-semibold text-green-300 mb-2">Math: Independent Pitch & Tempo</div>
            <div className="text-xs font-mono text-slate-400 space-y-1">
              <div>pitchRatio  = 2^(semitones/12)</div>
              <div>stretchFactor = 1 / pitchRatio  <span className="text-slate-600">// OLA stretch ratio</span></div>
              <div>synthHop = analysisHop × stretchFactor</div>
              <div>outputCount = frameLen / tempoRatio  <span className="text-slate-600">// resampling</span></div>
              <div className="mt-2 text-slate-500">Pitch-only: tempoRatio = 1.0 → no resampling</div>
              <div>Tempo-only: pitchSemitones = 0 → stretchFactor = 1.0</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Realtime Constraints',
      icon: '⚡',
      content: (
        <div className="space-y-3 text-sm text-slate-300">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Thread', value: 'AudioWorklet (audio thread)', ok: true },
              { label: 'Allocations', value: 'Pre-allocated ring buffers', ok: true },
              { label: 'File I/O', value: 'None in render loop', ok: true },
              { label: 'Blocking calls', value: 'Zero — lock-free ring buffers', ok: true },
              { label: 'Quantum size', value: '128 frames (standard)', ok: true },
              { label: 'Stem drift', value: 'Identical parameters → sample-accurate', ok: true },
            ].map(item => (
              <div key={item.label} className="bg-black/30 rounded p-2 flex items-start gap-2">
                <span className="text-xs mt-0.5">{item.ok ? '✅' : '❌'}</span>
                <div>
                  <div className="text-xs font-semibold text-slate-300">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.value}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
            <strong>Latency note:</strong> Phase vocoder introduces ~46ms latency at 44.1kHz
            (FFT_SIZE/sampleRate = 2048/44100). This is the fundamental STFT analysis window.
            For lower latency, reduce FFT_SIZE to 1024 at the cost of frequency resolution.
          </div>
        </div>
      ),
    },
    {
      title: 'Licensing',
      icon: '📄',
      content: (
        <div className="space-y-3 text-sm text-slate-300">
          <div className="space-y-2">
            {[
              {
                name: 'This implementation (Phase Vocoder)',
                license: 'MIT',
                note: 'Custom STFT phase vocoder — no external DSP library',
                badge: 'bg-green-500/20 text-green-400',
              },
              {
                name: 'Rubber Band Library (rubberband-web)',
                license: 'GPL-2.0 / Commercial',
                note: 'Preferred WASM implementation. GPL for OSS; commercial license available from breakfastquay.com',
                badge: 'bg-yellow-500/20 text-yellow-400',
              },
              {
                name: 'SoundTouch (@soundtouchjs/audio-worklet)',
                license: 'LGPL-2.1',
                note: 'Fallback LGPL option. Good for OSS projects; commercial use needs review.',
                badge: 'bg-blue-500/20 text-blue-400',
              },
            ].map(item => (
              <div key={item.name} className="bg-black/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-200 text-xs">{item.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${item.badge}`}>{item.license}</span>
                </div>
                <p className="text-xs text-slate-400">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Known Limitations',
      icon: '⚠️',
      content: (
        <div className="space-y-2 text-sm text-slate-300">
          {[
            {
              title: 'Range intentionally limited',
              detail: '[-3, +3] semitones / [85%, 115%] tempo — larger ranges degrade quality with phase vocoder. Use Rubber Band WASM for ±24st.',
            },
            {
              title: 'Phase vocoder artifacts',
              detail: 'Polyphonic transients may exhibit slight smearing. Percussive content benefits from transient detection (Rubber Band implements this).',
            },
            {
              title: 'Fixed FFT size',
              detail: 'Current: 2048. High-quality mode could use 4096 for better low-frequency resolution at cost of more latency.',
            },
            {
              title: 'WASM loading',
              detail: 'Rubber Band WASM requires serving the .wasm file from the same origin or with proper CORS headers.',
            },
            {
              title: 'No per-note pitch (polyphonic)',
              detail: 'Global pitch shift only. For per-note correction (auto-tune), a different algorithm (e.g., pitch-synchronous PSOLA) is needed.',
            },
          ].map((item, i) => (
            <div key={i} className="bg-black/30 rounded-lg p-3">
              <div className="font-semibold text-amber-300 text-xs mb-1">⚠ {item.title}</div>
              <p className="text-xs text-slate-400">{item.detail}</p>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/50 flex items-center gap-2">
        <span className="text-lg">📚</span>
        <h3 className="font-bold text-slate-200">Documentation</h3>
      </div>
      <div className="divide-y divide-slate-800/50">
        {sections.map((section, i) => (
          <div key={i}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-800/30 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span>{section.icon}</span>
                <span className="font-semibold text-slate-200 text-sm">{section.title}</span>
              </div>
              <span className={`text-slate-500 transition-transform ${open === i ? 'rotate-180' : ''}`}>▼</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
