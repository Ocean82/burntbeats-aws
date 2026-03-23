/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 🔥 BurntBeats Enhanced Waveform Editor
 * Professional audio editing with advanced features
 */

import React, { useRef, useEffect, useState } from 'react';
import {
    Play,
    Pause,
    Copy,
    Scissors,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Save,
    Music,
    Volume2,
    VolumeX,
    Settings,
    Download,
    Upload,
    Trash2,
    Undo,
    Redo,
    // Waveform, // Icon not available in lucide-react
    Mic,
    Headphones
} from 'lucide-react';

type WaveformEditorProps = {
    audioFile?: File;
    onSave?: (audioData: ArrayBuffer) => void;
    onExport?: (audioData: ArrayBuffer, format: string) => void;
};

export const EnhancedWaveformEditor: React.FC<WaveformEditorProps> = ({
    audioFile,
    onSave,
    onExport
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [selectionStart, setSelectionStart] = useState<number>(0);
    const [selectionEnd, setSelectionEnd] = useState<number>(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<number>(0);
    const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
    const [editHistory, setEditHistory] = useState<ArrayBuffer[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Enhanced features
    const [showSpectrum, setShowSpectrum] = useState(false);
    const [showWaveform, setShowWaveform] = useState(true);
    const [showGrid, setShowGrid] = useState(true);
    const [snapToGrid, setSnapToGrid] = useState(false);
    const [gridSize, setGridSize] = useState(0.1); // seconds

    useEffect(() => {
        const initAudioContext = () => {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            setAudioContext(ctx);
        };

        initAudioContext();
    }, []);

    useEffect(() => {
        if (audioBuffer) {
            drawWaveform();
        }
    }, [audioBuffer, currentTime, selectionStart, selectionEnd, zoom, showGrid, showSpectrum]);

    useEffect(() => {
        if (audioFile) {
            loadAudioFile(audioFile);
        }
    }, [audioFile]);

    const loadAudioFile = async (file: File) => {
        if (!audioContext) return;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const buffer = await audioContext.decodeAudioData(arrayBuffer);

            setAudioBuffer(buffer);
            setDuration(buffer.duration);
            setWaveformData(buffer.getChannelData(0));

            // Add to history
            addToHistory(arrayBuffer);

            // Reset selection
            setSelectionStart(0);
            setSelectionEnd(buffer.duration);
        } catch (error) {
            console.error('Error loading audio file:', error);
        }
    };

    const addToHistory = (audioData: ArrayBuffer) => {
        const newHistory = editHistory.slice(0, historyIndex + 1);
        newHistory.push(audioData);
        setEditHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const drawWaveform = () => {
        const canvas = canvasRef.current;
        if (!canvas || !audioBuffer) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / (width * zoom));
        const amp = height / 2;

        // Clear canvas
        ctx.fillStyle = '#0D0D0D';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        if (showGrid) {
            drawGrid(ctx, width, height);
        }

        // Draw selection
        if (selectionStart !== selectionEnd) {
            const startX = (selectionStart / duration) * width;
            const endX = (selectionEnd / duration) * width;
            ctx.fillStyle = 'rgba(255, 91, 0, 0.3)';
            ctx.fillRect(startX, 0, endX - startX, height);
        }

        // Draw waveform
        if (showWaveform) {
            ctx.beginPath();
            ctx.strokeStyle = '#FF5B00';
            ctx.lineWidth = 2;

            for (let i = 0; i < width; i++) {
                let min = 1.0;
                let max = -1.0;

                for (let j = 0; j < step; j++) {
                    const dataIndex = Math.floor((i * step) + j);
                    if (dataIndex < data.length) {
                        const datum = data[dataIndex];
                        if (datum < min) min = datum;
                        if (datum > max) max = datum;
                    }
                }

                const x = i;
                const y1 = (1 + min) * amp;
                const y2 = (1 + max) * amp;

                if (i === 0) {
                    ctx.moveTo(x, y1);
                } else {
                    ctx.lineTo(x, y1);
                }
                ctx.lineTo(x, y2);
            }

            ctx.stroke();
        }

        // Draw spectrum if enabled
        if (showSpectrum) {
            drawSpectrum(ctx, width, height);
        }

        // Draw playhead
        const playheadX = (currentTime / duration) * width;
        ctx.strokeStyle = '#A726C1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();

        // Draw playhead glow
        ctx.shadowColor = '#A726C1';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
    };

    const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Vertical lines (time grid)
        const timeStep = gridSize;
        const pixelsPerSecond = width / duration;

        for (let time = 0; time <= duration; time += timeStep) {
            const x = (time / duration) * width;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Horizontal lines (amplitude grid)
        const amplitudeSteps = 10;
        for (let i = 0; i <= amplitudeSteps; i++) {
            const y = (i / amplitudeSteps) * height;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    };

    const drawSpectrum = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
        if (!waveformData) return;

        // Simple FFT visualization
        const fftSize = 256;
        const frequencyData = new Float32Array(fftSize);

        // Calculate frequency data (simplified)
        for (let i = 0; i < fftSize; i++) {
            const index = Math.floor((currentTime / duration) * waveformData.length) + i;
            if (index < waveformData.length) {
                frequencyData[i] = Math.abs(waveformData[index]);
            }
        }

        const barWidth = width / fftSize;
        ctx.fillStyle = 'rgba(61, 158, 255, 0.6)';

        for (let i = 0; i < fftSize; i++) {
            const barHeight = (frequencyData[i] * height) / 2;
            const x = i * barWidth;
            const y = height / 2 - barHeight;

            ctx.fillRect(x, y, barWidth - 1, barHeight * 2);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            await loadAudioFile(file);
        }
    };

    const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !audioBuffer) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const time = (x / canvas.width) * duration;

        if (snapToGrid) {
            const snappedTime = Math.round(time / gridSize) * gridSize;
            setCurrentTime(snappedTime);
        } else {
            setCurrentTime(time);
        }

        if (event.shiftKey) {
            setSelectionEnd(time);
        } else {
            setSelectionStart(time);
            setSelectionEnd(time);
        }
    };

    const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDragging(true);
        setDragStart(event.clientX);
    };

    const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging || !audioBuffer) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const time = (x / canvas.width) * duration;

        if (snapToGrid) {
            const snappedTime = Math.round(time / gridSize) * gridSize;
            setCurrentTime(snappedTime);
        } else {
            setCurrentTime(time);
        }
    };

    const handleCanvasMouseUp = () => {
        setIsDragging(false);
    };

    const handlePlay = async () => {
        if (!audioContext || !audioBuffer) return;

        if (isPlaying) {
            setIsPlaying(false);
            return;
        }

        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();

        source.buffer = audioBuffer;
        gainNode.gain.value = isMuted ? 0 : volume;

        source.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const startTime = selectionStart || 0;
        const playDuration = selectionEnd > selectionStart ? selectionEnd - selectionStart : undefined;

        source.start(0, startTime, playDuration);
        setIsPlaying(true);

        source.onended = () => {
            setIsPlaying(false);
        };
    };

    const handleCut = () => {
        if (!audioBuffer || selectionStart === selectionEnd) return;

        // TODO: Implement audio cutting logic
        console.log('Cut selection:', selectionStart, 'to', selectionEnd);
    };

    const handleCopy = () => {
        if (!audioBuffer || selectionStart === selectionEnd) return;

        // TODO: Implement audio copying logic
        console.log('Copy selection:', selectionStart, 'to', selectionEnd);
    };

    const handleSave = async () => {
        if (!audioBuffer) return;

        try {
            // Convert AudioBuffer to ArrayBuffer
            const length = audioBuffer.length;
            const arrayBuffer = new ArrayBuffer(length * 4);
            const view = new Float32Array(arrayBuffer);
            view.set(audioBuffer.getChannelData(0));

            onSave?.(arrayBuffer);
        } catch (error) {
            console.error('Error saving audio:', error);
        }
    };

    const handleExport = async (format: string) => {
        if (!audioBuffer) return;

        try {
            // TODO: Implement proper audio export
            const length = audioBuffer.length;
            const arrayBuffer = new ArrayBuffer(length * 4);
            const view = new Float32Array(arrayBuffer);
            view.set(audioBuffer.getChannelData(0));

            onExport?.(arrayBuffer, format);
        } catch (error) {
            console.error('Error exporting audio:', error);
        }
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            // TODO: Restore audio buffer from history
        }
    };

    const handleRedo = () => {
        if (historyIndex < editHistory.length - 1) {
            setHistoryIndex(historyIndex + 1);
            // TODO: Restore audio buffer from history
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="min-h-screen bg-[#0D0D0D] relative overflow-hidden">
            {/* Neon Edge Effects */}
            <div className="pointer-events-none absolute inset-0 z-0">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#FF5B00] via-[#A726C1] to-[#3D9EFF] blur-lg opacity-80"></div>
                <div className="absolute bottom-0 left-0 w-full h-2 bg-gradient-to-r from-[#3D9EFF] via-[#A726C1] to-[#FF5B00] blur-lg opacity-80"></div>
            </div>

            {/* Subtle Orange Glow */}
            <div className="absolute inset-0 bg-[#FF5B00]/10 opacity-30"></div>

            <div className="relative z-10 container mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        🎵 BurntBeats Waveform Editor
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Professional audio editing with advanced features
                    </p>
                </div>

                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Waveform className="w-6 h-6 text-[#FF5B00]" />
                            <h3 className="text-xl font-semibold text-white">Audio Editor</h3>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="audio/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-[#3D9EFF] hover:bg-[#3D9EFF]/90 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                            >
                                <Upload className="w-4 h-4" />
                                Load Audio
                            </button>
                        </div>
                    </div>

                    {/* Audio Controls */}
                    {audioBuffer && (
                        <div className="flex items-center justify-between mb-6 p-4 bg-gray-800/50 rounded-lg">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handlePlay}
                                    className="bg-gradient-to-r from-[#FF5B00] to-[#A726C1] hover:from-[#FF5B00]/90 hover:to-[#A726C1]/90 text-white px-6 py-3 rounded-lg flex items-center gap-2"
                                >
                                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                    {isPlaying ? 'Stop' : 'Play'}
                                </button>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCut}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                        disabled={selectionStart === selectionEnd}
                                    >
                                        <Scissors className="w-4 h-4" />
                                        Cut
                                    </button>
                                    <button
                                        onClick={handleCopy}
                                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                        disabled={selectionStart === selectionEnd}
                                    >
                                        <Copy className="w-4 h-4" />
                                        Copy
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleUndo}
                                        disabled={historyIndex <= 0}
                                        className="bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                    >
                                        <Undo className="w-4 h-4" />
                                        Undo
                                    </button>
                                    <button
                                        onClick={handleRedo}
                                        disabled={historyIndex >= editHistory.length - 1}
                                        className="bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                    >
                                        <Redo className="w-4 h-4" />
                                        Redo
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setIsMuted(!isMuted)}
                                        className="text-white hover:text-[#FF5B00]"
                                    >
                                        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                                    </button>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={volume}
                                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                                        className="w-20"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleZoomOut}
                                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg"
                                    >
                                        <ZoomOut className="w-4 h-4" />
                                    </button>
                                    <span className="text-white text-sm min-w-[40px] text-center">
                                        {zoom.toFixed(1)}x
                                    </span>
                                    <button
                                        onClick={handleZoomIn}
                                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg"
                                    >
                                        <ZoomIn className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={handleZoomReset}
                                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audio Info */}
                    {audioBuffer && (
                        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Duration:</span> {formatTime(duration)}
                                </div>
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Sample Rate:</span> {audioBuffer.sampleRate}Hz
                                </div>
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Channels:</span> {audioBuffer.numberOfChannels}
                                </div>
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Current:</span> {formatTime(currentTime)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Waveform Canvas */}
                    {audioBuffer ? (
                        <div className="space-y-4">
                            <canvas
                                ref={canvasRef}
                                width={1200}
                                height={300}
                                onClick={handleCanvasClick}
                                onMouseDown={handleCanvasMouseDown}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseUp={handleCanvasMouseUp}
                                className="w-full border border-gray-700 rounded-lg cursor-crosshair bg-[#0D0D0D]"
                            />

                            {/* Selection Info */}
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Selection Start:</span> {formatTime(selectionStart)}
                                </div>
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Selection End:</span> {formatTime(selectionEnd)}
                                </div>
                                <div className="text-gray-300">
                                    <span className="text-gray-400">Selection Duration:</span> {formatTime(selectionEnd - selectionStart)}
                                </div>
                            </div>

                            {/* Export Options */}
                            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={showWaveform}
                                            onChange={(e) => setShowWaveform(e.target.checked)}
                                            className="text-[#FF5B00]"
                                        />
                                        Waveform
                                    </label>
                                    <label className="flex items-center gap-2 text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={showSpectrum}
                                            onChange={(e) => setShowSpectrum(e.target.checked)}
                                            className="text-[#FF5B00]"
                                        />
                                        Spectrum
                                    </label>
                                    <label className="flex items-center gap-2 text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={showGrid}
                                            onChange={(e) => setShowGrid(e.target.checked)}
                                            className="text-[#FF5B00]"
                                        />
                                        Grid
                                    </label>
                                    <label className="flex items-center gap-2 text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={snapToGrid}
                                            onChange={(e) => setSnapToGrid(e.target.checked)}
                                            className="text-[#FF5B00]"
                                        />
                                        Snap to Grid
                                    </label>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSave}
                                        className="bg-[#FF5B00] hover:bg-[#FF5B00]/90 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                    >
                                        <Save className="w-4 h-4" />
                                        Save
                                    </button>
                                    <button
                                        onClick={() => handleExport('wav')}
                                        className="bg-[#A726C1] hover:bg-[#A726C1]/90 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export WAV
                                    </button>
                                    <button
                                        onClick={() => handleExport('mp3')}
                                        className="bg-[#3D9EFF] hover:bg-[#3D9EFF]/90 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export MP3
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-400 text-lg mb-2">No audio file loaded</p>
                            <p className="text-gray-500">Upload an audio file to start editing</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
