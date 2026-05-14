import React from 'react';
import { WaveformDisplay } from './WaveformDisplay';
import { KnobControl } from './KnobControl';
import { pitchToSemitonesStr, tempoToPercent } from '../dsp/PitchTempoPlugin';

interface StemTrackProps {
  id: string;
  label: string;
  emoji: string;
  color: string;
  buffer: AudioBuffer | null;
  pitchSemitones: number;
  tempoRatio: number;
  muted: boolean;
  solo: boolean;
  bypass: boolean;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  perStemMode: boolean;
  onPitchChange: (semitones: number) => void;
  onTempoChange: (ratio: number) => void;
  onMute: () => void;
  onSolo: () => void;
  onBypass: () => void;
}

export const StemTrack: React.FC<StemTrackProps> = ({
  label,
  emoji,
  color,
  buffer,
  pitchSemitones,
  tempoRatio,
  muted,
  solo,
  bypass,
  currentTime,
  duration,
  isPlaying,
  perStemMode,
  onPitchChange,
  onTempoChange,
  onMute,
  onSolo,
  onBypass,
}) => {
  return (
    <div
      className={`rounded-xl p-3 border transition-all duration-200 ${
        muted ? 'opacity-40' : 'opacity-100'
      } ${solo ? 'ring-2' : ''}`}
      style={{
        background: 'rgba(15,15,30,0.8)',
        borderColor: `${color}33`,
        boxShadow: solo ? `0 0 12px ${color}44` : 'none',
        outline: solo ? `2px solid ${color}` : 'none',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Stem label */}
        <div className="flex flex-col items-center gap-1 w-16 shrink-0">
          <div className="text-2xl">{emoji}</div>
          <div className="text-xs font-bold text-slate-300">{label}</div>
          {/* Color indicator */}
          <div className="w-8 h-1 rounded-full" style={{ background: color }} />
        </div>

        {/* Waveform */}
        <div className="flex-1 min-w-0">
          <WaveformDisplay
            buffer={buffer}
            color={color}
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Per-stem pitch/tempo knobs */}
          {perStemMode && (
            <div className="flex items-center gap-3 px-3 py-1 rounded-lg bg-black/30">
              <KnobControl
                label="Pitch"
                value={pitchSemitones}
                min={-3}
                max={3}
                step={0.1}
                defaultValue={0}
                unit="st"
                size={52}
                color={color}
                formatValue={pitchToSemitonesStr}
                onChange={onPitchChange}
                disabled={bypass}
              />
              <KnobControl
                label="Tempo"
                value={tempoRatio}
                min={0.85}
                max={1.15}
                step={0.01}
                defaultValue={1.0}
                unit=""
                size={52}
                color={color}
                formatValue={tempoToPercent}
                onChange={onTempoChange}
                disabled={bypass}
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col gap-1">
            <button
              onClick={onMute}
              className={`px-2 py-1 rounded text-xs font-bold transition-all w-12 ${
                muted
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {muted ? 'MUTED' : 'MUTE'}
            </button>
            <button
              onClick={onSolo}
              className={`px-2 py-1 rounded text-xs font-bold transition-all w-12 ${
                solo
                  ? 'text-white shadow-lg'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
              style={solo ? { background: color } : {}}
            >
              SOLO
            </button>
            <button
              onClick={onBypass}
              className={`px-2 py-1 rounded text-xs font-bold transition-all w-12 ${
                bypass
                  ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {bypass ? 'BYP' : 'BYP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
