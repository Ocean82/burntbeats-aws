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

  // Simulate receiving stems from a stem splitter
  // In a real app, this would come from props or an API call
  useEffect(() => {
    const ctx = new AudioContext({ sampleRate: 44100 });
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

    return () => { ctx.close().catch(() => {}); };
  }, []);

  // Memoize to avoid re-init on every render
  const memoizedStems = useMemo(() => stemInputs, [stemInputs]);

  return (
    <div className="min-h-screen text-white" style={{
      background: 'linear-gradient(160deg, #050510 0%, #0c0c28 45%, #050510 100%)',
    }}>
      {/* Grid overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-30" style={{
        backgroundImage: `
          linear-gradient(rgba(139,92,246,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139,92,246,0.06) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      <div className="relative max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
              style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
                boxShadow: '0 4px 20px rgba(139,92,246,0.5)',
              }}>
              🎛️
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight"
                style={{ background: 'linear-gradient(90deg, #a78bfa, #60a5fa, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Pitch-Plug-in
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                Integration Demo · Post-split pitch & tempo control
              </p>
            </div>
          </div>

          {/* Integration state indicator */}
          {lastState && (
            <div className="text-xs font-mono text-slate-500 text-right">
              <div>Engine: {lastState.engineReady ? '✓ ready' : '… loading'}</div>
              <div>Stems: {lastState.stems.length} loaded</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 p-1.5 rounded-xl bg-slate-900/70 border border-slate-800/60 backdrop-blur-sm">
          {([
            { id: 'player', icon: '🎚️', label: 'Player' },
            { id: 'tests', icon: '🧪', label: 'Tests' },
            { id: 'docs', icon: '📚', label: 'Docs' },
          ] as { id: ActiveTab; icon: string; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'text-white shadow-lg'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
              }`}
              style={tab === t.id ? {
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                boxShadow: '0 2px 12px rgba(139,92,246,0.35)',
              } : {}}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'player' && (
          loading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full mb-3" />
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
