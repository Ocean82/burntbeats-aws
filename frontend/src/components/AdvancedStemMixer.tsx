/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 🔥 BurntBeats Advanced Stem Mixer Component
 * Professional-grade stem mixing interface
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    Volume2,
    VolumeX,
    Mic,
    Music,
    Drum,
    Guitar,
    Piano,
    Settings,
    Save,
    Download,
    Upload,
    Play,
    Pause,
    RotateCcw,
    Plus,
    Trash2,
    Sliders,
    // Waveform, // Icon not available in lucide-react
    Headphones,
    Zap,
    Target,
    Activity,
    Palette,
    Sparkles,
    Eye,
    Heart,
    Star,
    Award,
    Target as TargetIcon,
    BarChart3,
    TrendingUp,
    Lightbulb
} from 'lucide-react';

interface StemTrack {
    id: string;
    name: string;
    type: 'vocals' | 'drums' | 'bass' | 'melody' | 'effects' | 'synth' | 'guitar' | 'piano' | 'strings' | 'brass' | 'percussion' | 'ambient';
    volume: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    effects: any[];
    eq: any;
    compressor: any;
    reverb: any;
    delay: any;
    distortion: any;
    filter: any;
}

interface MixerSession {
    id: string;
    name: string;
    tracks: StemTrack[];
    masterVolume: number;
    masterEffects: any[];
    bpm: number;
    key: string;
    timeSignature: string;
    totalDuration: number;
    createdAt: string;
    updatedAt: string;
}

interface MixerPreset {
    id: string;
    name: string;
    description: string;
    category: 'rock' | 'pop' | 'hiphop' | 'electronic' | 'jazz' | 'classical' | 'custom';
    tracks: any[];
    masterEffects: any[];
    bpm: number;
    key: string;
}

export const AdvancedStemMixer: React.FC = () => {
    const [sessions, setSessions] = useState<MixerSession[]>([]);
    const [currentSession, setCurrentSession] = useState<MixerSession | null>(null);
    const [presets, setPresets] = useState<MixerPreset[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeTab, setActiveTab] = useState<'sessions' | 'mixing' | 'presets' | 'effects'>('sessions');
    const [showNewSessionModal, setShowNewSessionModal] = useState(false);
    const [showPresetModal, setShowPresetModal] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    const [newSessionBpm, setNewSessionBpm] = useState(120);
    const [newSessionKey, setNewSessionKey] = useState('C');
    const [selectedPreset, setSelectedPreset] = useState<MixerPreset | null>(null);
    const [processingProgress, setProcessingProgress] = useState(0);
    const [mixedAudio, setMixedAudio] = useState<string | null>(null);
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        loadSessions();
        loadPresets();
        initializeAudioContext();
    }, []);

    const initializeAudioContext = () => {
        if (typeof window !== 'undefined' && window.AudioContext) {
            setAudioContext(new AudioContext());
        }
    };

    const loadSessions = async () => {
        try {
            const response = await fetch('/api/advanced-stem-mixer/sessions');
            const data = await response.json();
            if (data.success) {
                setSessions(data.sessions);
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    };

    const loadPresets = async () => {
        try {
            const response = await fetch('/api/advanced-stem-mixer/presets');
            const data = await response.json();
            if (data.success) {
                setPresets(data.presets);
            }
        } catch (error) {
            console.error('Error loading presets:', error);
        }
    };

    const createNewSession = async () => {
        if (!newSessionName.trim()) return;

        try {
            const response = await fetch('/api/advanced-stem-mixer/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newSessionName,
                    bpm: newSessionBpm,
                    key: newSessionKey
                })
            });

            const data = await response.json();
            if (data.success) {
                setSessions([...sessions, data.session]);
                setCurrentSession(data.session);
                setShowNewSessionModal(false);
                setNewSessionName('');
                setActiveTab('mixing');
            }
        } catch (error) {
            console.error('Error creating session:', error);
        }
    };

    const addTrackToSession = async (file: File, name: string, type: StemTrack['type']) => {
        if (!currentSession) return;

        const formData = new FormData();
        formData.append('audio', file);
        formData.append('name', name);
        formData.append('type', type);

        try {
            const response = await fetch(`/api/advanced-stem-mixer/sessions/${currentSession.id}/tracks`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                const updatedSession = {
                    ...currentSession,
                    tracks: [...currentSession.tracks, data.track]
                };
                setCurrentSession(updatedSession);
                setSessions(sessions.map(s => s.id === currentSession.id ? updatedSession : s));
            }
        } catch (error) {
            console.error('Error adding track:', error);
        }
    };

    const updateTrack = async (trackId: string, updates: Partial<StemTrack>) => {
        if (!currentSession) return;

        try {
            const response = await fetch(`/api/advanced-stem-mixer/sessions/${currentSession.id}/tracks/${trackId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });

            const data = await response.json();
            if (data.success) {
                const updatedSession = {
                    ...currentSession,
                    tracks: currentSession.tracks.map(track =>
                        track.id === trackId ? { ...track, ...updates } : track
                    )
                };
                setCurrentSession(updatedSession);
                setSessions(sessions.map(s => s.id === currentSession.id ? updatedSession : s));
            }
        } catch (error) {
            console.error('Error updating track:', error);
        }
    };

    const processMix = async () => {
        if (!currentSession || currentSession.tracks.length === 0) return;

        setIsProcessing(true);
        setProcessingProgress(0);

        try {
            const response = await fetch(`/api/advanced-stem-mixer/sessions/${currentSession.id}/mix`, {
                method: 'POST'
            });

            const data = await response.json();
            if (data.success) {
                setMixedAudio(`data:audio/wav;base64,${data.mixed_audio}`);
                setDuration(data.duration);
                setProcessingProgress(100);
            }
        } catch (error) {
            console.error('Error processing mix:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const applyPreset = async (presetId: string) => {
        if (!currentSession) return;

        try {
            const response = await fetch(`/api/advanced-stem-mixer/sessions/${currentSession.id}/apply-preset/${presetId}`, {
                method: 'POST'
            });

            const data = await response.json();
            if (data.success) {
                setCurrentSession(data.session);
                setSessions(sessions.map(s => s.id === currentSession.id ? data.session : s));
            }
        } catch (error) {
            console.error('Error applying preset:', error);
        }
    };

    const savePreset = async () => {
        if (!currentSession || !selectedPreset) return;

        try {
            const response = await fetch('/api/advanced-stem-mixer/presets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSession.id,
                    name: selectedPreset.name,
                    description: selectedPreset.description,
                    category: selectedPreset.category
                })
            });

            const data = await response.json();
            if (data.success) {
                setPresets([...presets, data.preset]);
                setShowPresetModal(false);
                setSelectedPreset(null);
            }
        } catch (error) {
            console.error('Error saving preset:', error);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && currentSession) {
            const name = file.name.replace(/\.[^/.]+$/, '');
            const type = 'vocals' as StemTrack['type']; // Default type, could be made configurable
            addTrackToSession(file, name, type);
        }
    };

    const getTrackIcon = (type: StemTrack['type']) => {
        switch (type) {
            case 'vocals': return <Mic className="w-4 h-4" />;
            case 'drums': return <Drum className="w-4 h-4" />;
            case 'guitar': return <Guitar className="w-4 h-4" />;
            case 'piano': return <Piano className="w-4 h-4" />;
            default: return <Music className="w-4 h-4" />;
        }
    };

    const getTrackColor = (type: StemTrack['type']) => {
        switch (type) {
            case 'vocals': return 'text-red-400';
            case 'drums': return 'text-yellow-400';
            case 'bass': return 'text-blue-400';
            case 'guitar': return 'text-green-400';
            case 'piano': return 'text-purple-400';
            case 'synth': return 'text-pink-400';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="min-h-screen bg-[#0D0D0D] text-white">
            {/* Header */}
            <div className="bg-gray-900/50 border-b border-[#FF5B00]/20 p-4">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#FF5B00] to-[#A726C1] rounded-lg flex items-center justify-center">
                            <Sliders className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#FF5B00] to-[#A726C1] bg-clip-text text-transparent">
                                Advanced Stem Mixer
                            </h1>
                            <p className="text-gray-400 text-sm">Professional-grade audio mixing</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowNewSessionModal(true)}
                            className="bg-gradient-to-r from-[#FF5B00] to-[#A726C1] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            New Session
                        </button>

                        {currentSession && (
                            <button
                                onClick={processMix}
                                disabled={isProcessing || currentSession.tracks.length === 0}
                                className="bg-gradient-to-r from-[#3D9EFF] to-[#A726C1] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                <Zap className="w-4 h-4" />
                                {isProcessing ? 'Processing...' : 'Process Mix'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-gray-900/30 border-b border-gray-800">
                <div className="container mx-auto">
                    <div className="flex space-x-8">
                        {[
                            { id: 'sessions', label: 'Sessions', icon: <Music className="w-4 h-4" /> },
                            { id: 'mixing', label: 'Mixing', icon: <Sliders className="w-4 h-4" /> },
                            { id: 'presets', label: 'Presets', icon: <Save className="w-4 h-4" /> },
                            { id: 'effects', label: 'Effects', icon: <Sparkles className="w-4 h-4" /> }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all ${activeTab === tab.id
                                        ? 'border-[#FF5B00] text-[#FF5B00]'
                                        : 'border-transparent text-gray-400 hover:text-white'
                                    }`}
                            >
                                {tab.icon}
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto p-6">
                {/* Sessions Tab */}
                {activeTab === 'sessions' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {sessions.map(session => (
                                <div
                                    key={session.id}
                                    onClick={() => setCurrentSession(session)}
                                    className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-[#FF5B00]/50 transition-all cursor-pointer"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-white">{session.name}</h3>
                                        <span className="text-xs text-gray-400">{session.tracks.length} tracks</span>
                                    </div>
                                    <div className="space-y-2 text-sm text-gray-400">
                                        <div>BPM: {session.bpm}</div>
                                        <div>Key: {session.key}</div>
                                        <div>Created: {new Date(session.createdAt).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Mixing Tab */}
                {activeTab === 'mixing' && currentSession && (
                    <div className="space-y-6">
                        {/* Session Info */}
                        <div className="bg-gray-800/30 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-white">{currentSession.name}</h2>
                                    <p className="text-gray-400">BPM: {currentSession.bpm} | Key: {currentSession.key}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">Master:</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={currentSession.masterVolume}
                                            onChange={(e) => {
                                                const updatedSession = { ...currentSession, masterVolume: parseInt(e.target.value) };
                                                setCurrentSession(updatedSession);
                                                setSessions(sessions.map(s => s.id === currentSession.id ? updatedSession : s));
                                            }}
                                            className="w-20"
                                        />
                                        <span className="text-sm text-white w-8">{currentSession.masterVolume}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tracks */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white">Tracks</h3>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-[#FF5B00] text-white px-3 py-1 rounded-lg hover:opacity-90 transition-all flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" />
                                    Add Track
                                </button>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="audio/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />

                            {currentSession.tracks.map(track => (
                                <div key={track.id} className="bg-gray-800/30 rounded-lg p-4 border border-gray-700">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`${getTrackColor(track.type)}`}>
                                                {getTrackIcon(track.type)}
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-white">{track.name}</h4>
                                                <p className="text-sm text-gray-400 capitalize">{track.type}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => updateTrack(track.id, { muted: !track.muted })}
                                                className={`p-1 rounded ${track.muted ? 'bg-red-500/20 text-red-400' : 'bg-gray-600/20 text-gray-400'}`}
                                            >
                                                <VolumeX className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => updateTrack(track.id, { solo: !track.solo })}
                                                className={`p-1 rounded ${track.solo ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-600/20 text-gray-400'}`}
                                            >
                                                <Headphones className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm text-gray-400">Volume</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    value={track.volume}
                                                    onChange={(e) => updateTrack(track.id, { volume: parseInt(e.target.value) })}
                                                    className="flex-1"
                                                />
                                                <span className="text-sm text-white w-8">{track.volume}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-sm text-gray-400">Pan</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range"
                                                    min="-100"
                                                    max="100"
                                                    value={track.pan}
                                                    onChange={(e) => updateTrack(track.id, { pan: parseInt(e.target.value) })}
                                                    className="flex-1"
                                                />
                                                <span className="text-sm text-white w-8">{track.pan}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Processing Progress */}
                        {isProcessing && (
                            <div className="bg-gray-800/30 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-white font-semibold">Processing Mix...</span>
                                    <span className="text-[#FF5B00]">{processingProgress}%</span>
                                </div>
                                <div className="w-full bg-gray-700 rounded-full h-2">
                                    <div
                                        className="bg-gradient-to-r from-[#FF5B00] to-[#A726C1] h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${processingProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Mixed Audio Player */}
                        {mixedAudio && (
                            <div className="bg-gray-800/30 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-white mb-3">Mixed Audio</h3>
                                <audio
                                    ref={audioRef}
                                    controls
                                    className="w-full"
                                    src={mixedAudio}
                                    onLoadedMetadata={() => {
                                        if (audioRef.current) {
                                            setDuration(audioRef.current.duration);
                                        }
                                    }}
                                    onTimeUpdate={() => {
                                        if (audioRef.current) {
                                            setCurrentTime(audioRef.current.currentTime);
                                        }
                                    }}
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                />
                                <div className="flex items-center gap-4 mt-3">
                                    <button
                                        onClick={() => {
                                            const link = document.createElement('a');
                                            link.href = mixedAudio;
                                            link.download = `${currentSession.name}_mixed.wav`;
                                            link.click();
                                        }}
                                        className="bg-[#3D9EFF] text-white px-3 py-1 rounded-lg hover:opacity-90 transition-all flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Presets Tab */}
                {activeTab === 'presets' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {presets.map(preset => (
                                <div
                                    key={preset.id}
                                    className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-[#FF5B00]/50 transition-all"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-white">{preset.name}</h3>
                                        <span className="text-xs bg-[#FF5B00]/20 text-[#FF5B00] px-2 py-1 rounded">
                                            {preset.category}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400 mb-3">{preset.description}</p>
                                    <div className="space-y-1 text-sm text-gray-400">
                                        <div>BPM: {preset.bpm}</div>
                                        <div>Key: {preset.key}</div>
                                        <div>Tracks: {preset.tracks.length}</div>
                                    </div>
                                    {currentSession && (
                                        <button
                                            onClick={() => applyPreset(preset.id)}
                                            className="w-full mt-3 bg-[#FF5B00] text-white py-2 rounded-lg hover:opacity-90 transition-all"
                                        >
                                            Apply to Current Session
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Effects Tab */}
                {activeTab === 'effects' && (
                    <div className="space-y-6">
                        <div className="bg-gray-800/30 rounded-lg p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Master Effects</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[
                                    { name: 'EQ', icon: <BarChart3 className="w-5 h-5" />, color: 'text-blue-400' },
                                    { name: 'Compressor', icon: <TrendingUp className="w-5 h-5" />, color: 'text-green-400' },
                                    { name: 'Reverb', icon: <Waveform className="w-5 h-5" />, color: 'text-purple-400' },
                                    { name: 'Delay', icon: <Activity className="w-5 h-5" />, color: 'text-yellow-400' },
                                    { name: 'Distortion', icon: <Zap className="w-5 h-5" />, color: 'text-red-400' },
                                    { name: 'Filter', icon: <Target className="w-5 h-5" />, color: 'text-pink-400' }
                                ].map(effect => (
                                    <div
                                        key={effect.name}
                                        className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-[#FF5B00]/50 transition-all cursor-pointer"
                                    >
                                        <div className={`${effect.color} mb-2`}>
                                            {effect.icon}
                                        </div>
                                        <h4 className="font-semibold text-white">{effect.name}</h4>
                                        <p className="text-sm text-gray-400">Professional audio processing</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* New Session Modal */}
            {showNewSessionModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-white mb-4">Create New Session</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm text-gray-400">Session Name</label>
                                <input
                                    type="text"
                                    value={newSessionName}
                                    onChange={(e) => setNewSessionName(e.target.value)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    placeholder="Enter session name"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm text-gray-400">BPM</label>
                                    <input
                                        type="number"
                                        value={newSessionBpm}
                                        onChange={(e) => setNewSessionBpm(parseInt(e.target.value))}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                        min="60"
                                        max="200"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-gray-400">Key</label>
                                    <select
                                        value={newSessionKey}
                                        onChange={(e) => setNewSessionKey(e.target.value)}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                                    >
                                        {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(key => (
                                            <option key={key} value={key}>{key}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setShowNewSessionModal(false)}
                                className="flex-1 bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-500 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createNewSession}
                                disabled={!newSessionName.trim()}
                                className="flex-1 bg-[#FF5B00] text-white py-2 rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
