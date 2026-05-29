/**
 * Demo App — Shows how a parent stem-splitting app would integrate PitchTempoWidget.
 *
 * This simulates receiving stems from a splitter and passing them to the plugin.
 */

import { useEffect, useMemo, useState } from 'react';
import { PitchTempoWidget } from './PitchTempoWidget';
import { TestPanel } from './components/TestPanel';
import { DocumentationPanel } from './components/DocumentationPanel';
import { generateStemBuffers } from './dsp/syntheticAudio';
import type { StemInput, PitchTempoEngineState } from './types';

type ActiveTab = 'player' | 'tests' | 'docs';

export default function App() {
  const [tab, setTab] = useState<ActiveTab>('player');
  const [stemInputs, setStemInputs] = useState<StemInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastState, setLastState] = useState<PitchTempoEngineState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext({ sampleRate: 44100 });

    void Promise.resolve().then(() => {
      if (cancelled) return;
      const stemData = generateStemBuffers(ctx);

      const inputs: StemInput[] = stemData.map(s => ({
        id: s.id,
        label: s.label,
        emoji: s.emoji,
        color: s.color,
        buffer: s.buffer,
      }));

      setStemInputs(inputs);
      setLoading(false);
    });

    return () => { cancelled = true; ctx.close().catch(() => {}); };
  }, []);

  const memoizedStems = useMemo(() => stemInputs, [stemInputs]);

  return (
    <div className="ppt-demo-app min-h-screen text-white">
      <div className="ppt-demo-grid fixed inset-0 pointer-events-none opacity-30" />

      <div className="relative max-w-5xl mx-auto px-4 py-6 space-y-4">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="ppt-demo-logo flex h-12 w-12 items-center justify-center rounded-2xl text-2xl">
              🎛️
            </div>
            <div>
              <h1 className="ppt-demo-title text-3xl font-black tracking-tight">
                Pitch-Plug-in
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                Integration Demo · Post-split pitch & tempo control
              </p>
            </div>
          </div>

          {lastState && (
            <div className="text-xs font-mono text-slate-500 text-right">
              <div>Engine: {lastState.engineReady ? '✓ ready' : '… loading'}</div>
              <div>Stems: {lastState.stems.length} loaded</div>
            </div>
          )}
        </div>

        <div className="flex gap-1.5 p-1.5 rounded-xl bg-slate-900/70 border border-slate-800/60 backdrop-blur-sm">
          {([
            { id: 'player', icon: '🎚️', label: 'Player' },
            { id: 'tests', icon: '🧪', label: 'Tests' },
            { id: 'docs', icon: '📚', label: 'Docs' },
          ] as { id: ActiveTab; icon: string; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'ppt-demo-tab--active text-white shadow-lg'
                  : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {tab === 'player' && (
          loading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-sky-500/30 border-t-sky-400 rounded-full mb-3" />
              <div className="text-sm">Waiting for stems from splitter…</div>
            </div>
          ) : (
            <PitchTempoWidget
              stems={memoizedStems}
              onStateChange={setLastState}
              onPlaybackEnd={() => console.log('[Demo] Playback ended')}
            />
          )
        )}

        {tab === 'tests' && <TestPanel />}
        {tab === 'docs' && <DocumentationPanel />}
      </div>
    </div>
  );
}
