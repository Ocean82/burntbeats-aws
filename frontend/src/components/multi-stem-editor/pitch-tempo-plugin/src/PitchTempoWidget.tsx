/**
 * PitchTempoWidget — Drop-in embeddable component for pitch/tempo control.
 *
 * Usage in a parent stem-splitting app:
 *
 * ```tsx
 * import { PitchTempoWidget } from 'pitch-plugin';
 *
 * <PitchTempoWidget
 *   stems={[
 *     { id: 'vocals', label: 'Vocals', color: '#8b5cf6', buffer: vocalsBuffer },
 *     { id: 'drums',  label: 'Drums',  color: '#ef4444', buffer: drumsBuffer },
 *   ]}
 *   audioContext={sharedAudioContext}  // optional
 *   onPlaybackEnd={() => console.log('done')}
 *   compact={false}
 * />
 * ```
 */

import React from 'react';
import { useAudioEngine } from './hooks/useAudioEngine';
import { KnobControl } from './components/KnobControl';
import { StemTrack } from './components/StemTrack';
import { SpectrumAnalyzer } from './components/SpectrumAnalyzer';
import {
  pitchToSemitonesStr,
  tempoToPercent,
  PARAM_META,
  semitonesToRatio,
} from './dsp/PitchTempoPlugin';
import type { PitchTempoPluginProps, PitchTempoEngineState, StemMode } from './types';

export const PitchTempoWidget: React.FC<PitchTempoPluginProps> = ({
  stems: inputStems,
  audioContext,
  onStateChange,
  onPlaybackEnd,
  compact = false,
  hideSections = [],
  className = '',
}) => {
  const engine = useAudioEngine({
    stems: inputStems,
    audioContext,
    onPlaybackEnd,
  });

  // Notify parent of state changes (excluding currentTime to avoid 60fps callbacks)
  const stateRef = React.useRef<PitchTempoEngineState | null>(null);
  React.useEffect(() => {
    const state: PitchTempoEngineState = {
      engineReady: engine.engineReady,
      engineStatus: engine.engineStatus,
      isPlaying: engine.isPlaying,
      currentTime: engine.currentTime,
      duration: engine.duration,
      stemMode: engine.stemMode,
      globalPitch: engine.globalPitch,
      globalTempo: engine.globalTempo,
      globalBypass: engine.globalBypass,
      linked: engine.linked,
      stems: engine.stems,
    };
    // Only notify when something other than currentTime changes
    const prev = stateRef.current;
    if (!prev ||
        prev.engineReady !== state.engineReady ||
        prev.engineStatus !== state.engineStatus ||
        prev.isPlaying !== state.isPlaying ||
        prev.duration !== state.duration ||
        prev.stemMode !== state.stemMode ||
        prev.globalPitch !== state.globalPitch ||
        prev.globalTempo !== state.globalTempo ||
        prev.globalBypass !== state.globalBypass ||
        prev.linked !== state.linked ||
        prev.stems !== state.stems) {
      stateRef.current = state;
      onStateChange?.(state);
    }
  }, [
    engine.engineReady, engine.engineStatus, engine.isPlaying,
    engine.duration, engine.stemMode,
    engine.globalPitch, engine.globalTempo, engine.globalBypass,
    engine.linked, engine.stems, onStateChange,
  ]);

  const {
    engineReady, engineStatus, isPlaying, currentTime, duration,
    stemMode, globalPitch, globalTempo, globalBypass, linked, stems,
    play, pause, stop, setGlobalPitch, setGlobalTempo, setGlobalBypass,
    setLinked, reset, setStemMode, setStemPitch, setStemTempo,
    toggleMute, toggleSolo, toggleBypass, getAnalyserNode,
  } = engine;

  // Linked pitch change
  const handleLinkedPitchChange = (semitones: number) => {
    setGlobalPitch(semitones);
    if (linked) {
      const newTempo = 1.0 + (semitones / 3) * 0.15;
      setGlobalTempo(Math.max(PARAM_META.tempoRatio.min, Math.min(PARAM_META.tempoRatio.max, newTempo)));
    }
  };

  const fmt = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  const adjustedDuration = duration / globalTempo;
  const pitchRatio = semitonesToRatio(globalPitch);

  const showSection = (s: string) => !hideSections.includes(s as any);

  return (
    <div className={`text-white space-y-3 ${className}`}>

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${engineReady ? 'bg-emerald-400' : 'bg-yellow-400 animate-pulse'}`} />
          <span className="text-xs font-mono text-slate-400">{engineStatus}</span>
        </div>
      </div>

      {/* ── Spectrum ── */}
      {showSection('spectrum') && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/70 p-3">
          <SpectrumAnalyzer
            analyserNode={getAnalyserNode()}
            isPlaying={isPlaying}
            color="#8b5cf6"
            height={compact ? 48 : 72}
          />
        </div>
      )}

      {/* ── Global controls ── */}
      <div className="rounded-xl border border-violet-500/20 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-slate-200">Pitch & Tempo</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setGlobalBypass(!globalBypass)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border ${
                globalBypass
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}>
              {globalBypass ? '⚡ BYPASS' : 'BYPASS'}
            </button>
            <button onClick={reset}
              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all">
              ↺ Reset
            </button>
          </div>
        </div>

        <div className="flex items-start justify-center gap-6 flex-wrap">
          {/* Pitch */}
          <div className="flex flex-col items-center gap-2">
            <KnobControl
              label="Pitch"
              value={globalPitch}
              min={PARAM_META.pitchSemitones.min}
              max={PARAM_META.pitchSemitones.max}
              step={PARAM_META.pitchSemitones.step}
              defaultValue={0}
              formatValue={pitchToSemitonesStr}
              onChange={handleLinkedPitchChange}
              color="#a78bfa"
              size={compact ? 72 : 100}
              disabled={globalBypass}
            />
            <div className="text-xs font-mono text-violet-300">
              ×{pitchRatio.toFixed(4)}
            </div>
          </div>

          {/* Link */}
          <div className="flex flex-col items-center justify-center gap-1 pt-4">
            <button
              onClick={() => setLinked(!linked)}
              className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg transition-all ${
                linked
                  ? 'border-violet-500 bg-violet-500/20'
                  : 'border-slate-700 bg-slate-800/80 text-slate-500 hover:border-slate-600'
              }`}
              title={linked ? 'Unlink' : 'Link pitch & tempo'}
            >
              {linked ? '🔗' : '⛓️'}
            </button>
            <span className="text-xs text-slate-600">{linked ? 'Linked' : 'Free'}</span>
          </div>

          {/* Tempo */}
          <div className="flex flex-col items-center gap-2">
            <KnobControl
              label="Tempo"
              value={globalTempo}
              min={PARAM_META.tempoRatio.min}
              max={PARAM_META.tempoRatio.max}
              step={PARAM_META.tempoRatio.step}
              defaultValue={1.0}
              formatValue={tempoToPercent}
              onChange={setGlobalTempo}
              color="#60a5fa"
              size={compact ? 72 : 100}
              disabled={globalBypass}
            />
            <div className="text-xs font-mono text-blue-300">
              ×{globalTempo.toFixed(3)}
            </div>
          </div>
        </div>

        {/* Metadata bar */}
        {showSection('metadata') && !compact && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg p-2 bg-violet-500/10 border border-violet-500/20">
              <div className="flex justify-between">
                <span className="text-slate-500">Pitch</span>
                <span className="font-mono text-violet-300">{pitchToSemitonesStr(globalPitch)}</span>
              </div>
              <div className="text-slate-600 font-mono mt-0.5">
                440Hz → {(440 * pitchRatio).toFixed(1)}Hz
              </div>
            </div>
            <div className="rounded-lg p-2 bg-blue-500/10 border border-blue-500/20">
              <div className="flex justify-between">
                <span className="text-slate-500">Tempo</span>
                <span className="font-mono text-blue-300">{tempoToPercent(globalTempo)}</span>
              </div>
              <div className="text-slate-600 font-mono mt-0.5">
                {duration.toFixed(1)}s → {adjustedDuration.toFixed(2)}s
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Transport ── */}
      {showSection('transport') && (
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={isPlaying ? pause : play}
              disabled={!engineReady}
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white transition-all disabled:opacity-40"
              style={engineReady ? {
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              } : { background: '#1e293b' }}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <button onClick={stop} disabled={!engineReady}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all disabled:opacity-40">
              ⏹
            </button>

            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-mono text-slate-500 w-8">{fmt(currentTime)}</span>
              <div className="flex-1 relative bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-none"
                  style={{
                    background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
                    width: `${(currentTime / Math.max(duration, 1)) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs font-mono text-slate-500 w-8 text-right">
                {globalTempo !== 1.0
                  ? <span className="text-blue-400">{fmt(adjustedDuration)}</span>
                  : fmt(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/50">
              {(['global', 'per-stem'] as StemMode[]).map(m => (
                <button key={m} onClick={() => setStemMode(m)}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                    stemMode === m
                      ? 'text-white bg-violet-600'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}>
                  {m === 'global' ? '🌐' : '🎛'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Stem tracks ── */}
      {showSection('stems') && (
        <div className="space-y-2">
          {stems.map(s => (
            <StemTrack
              key={s.id}
              id={s.id}
              label={s.label}
              emoji={s.emoji}
              color={s.color}
              buffer={s.buffer}
              pitchSemitones={s.pitchSemitones}
              tempoRatio={s.tempoRatio}
              muted={s.muted}
              solo={s.solo}
              bypass={s.bypass}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              perStemMode={stemMode === 'per-stem'}
              onPitchChange={(v) => setStemPitch(s.id, v)}
              onTempoChange={(v) => setStemTempo(s.id, v)}
              onMute={() => toggleMute(s.id)}
              onSolo={() => toggleSolo(s.id)}
              onBypass={() => toggleBypass(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
