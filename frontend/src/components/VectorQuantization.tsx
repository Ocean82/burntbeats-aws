/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 🔥 BurntBeats Vector Quantization Component
 * Professional audio compression and encoding interface
 */

import React, { useState, useRef } from 'react';
import {
    // Compress, // Icon not available in lucide-react
    Download,
    Upload,
    Settings,
    BarChart3,
    Play,
    Pause,
    Volume2,
    VolumeX,
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
    FileAudio,
    HardDrive,
    Wifi,
    Smartphone,
    Monitor,
    Database
} from 'lucide-react';

interface QuantizationConfig {
    dimension: number;
    n_quantizers: number;
    bins: number;
    decay: number;
    kmeans_init: boolean;
    kmeans_iters: number;
    threshold_ema_dead_code: number;
    sample_rate: number;
    target_bandwidth?: number;
    compression_level: 'low' | 'medium' | 'high' | 'ultra';
    preserve_quality: boolean;
}

interface QuantizedResult {
    quantized_audio: ArrayBuffer;
    codes: number[][];
    bandwidth: number;
    compression_ratio: number;
    quality_metrics: {
        snr: number;
        perceptual_score: number;
        spectral_distance: number;
    };
    metadata: {
        original_size: number;
        compressed_size: number;
        encoding_time: number;
        decoding_time: number;
    };
}

interface CompressionProfile {
    name: string;
    description: string;
    config: QuantizationConfig;
    use_cases: string[];
}

interface VectorQuantizationProps {
    audioFile?: File;
    onQuantizationComplete?: (result: QuantizedResult) => void;
    onDecompressionComplete?: (decompressedAudio: ArrayBuffer) => void;
}

export const VectorQuantization: React.FC<VectorQuantizationProps> = ({
    audioFile,
    onQuantizationComplete,
    onDecompressionComplete
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const originalAudioRef = useRef<HTMLAudioElement>(null);
    const quantizedAudioRef = useRef<HTMLAudioElement>(null);

    const [isQuantizing, setIsQuantizing] = useState(false);
    const [isDecompressing, setIsDecompressing] = useState(false);
    const [currentFile, setCurrentFile] = useState<File | null>(audioFile || null);
    const [quantizedResult, setQuantizedResult] = useState<QuantizedResult | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<string>('streaming');
    const [customConfig, setCustomConfig] = useState<Partial<QuantizationConfig>>({});
    const [activeTab, setActiveTab] = useState('compress');
    const [compressionProfiles, setCompressionProfiles] = useState<CompressionProfile[]>([
        {
            name: 'Studio Quality',
            description: 'Maximum quality preservation for professional audio',
            config: {
                dimension: 256,
                n_quantizers: 12,
                bins: 2048,
                decay: 0.99,
                kmeans_init: true,
                kmeans_iters: 100,
                threshold_ema_dead_code: 1,
                sample_rate: 44100,
                compression_level: 'low',
                preserve_quality: true
            },
            use_cases: ['Professional recording', 'Master tracks', 'High-fidelity audio']
        },
        {
            name: 'Streaming Optimized',
            description: 'Balanced compression for online streaming',
            config: {
                dimension: 256,
                n_quantizers: 8,
                bins: 1024,
                decay: 0.99,
                kmeans_init: true,
                kmeans_iters: 50,
                threshold_ema_dead_code: 2,
                sample_rate: 44100,
                target_bandwidth: 320,
                compression_level: 'medium',
                preserve_quality: true
            },
            use_cases: ['Music streaming', 'Podcasts', 'Online distribution']
        },
        {
            name: 'Mobile Optimized',
            description: 'High compression for mobile devices',
            config: {
                dimension: 128,
                n_quantizers: 6,
                bins: 512,
                decay: 0.98,
                kmeans_init: true,
                kmeans_iters: 30,
                threshold_ema_dead_code: 3,
                sample_rate: 44100,
                target_bandwidth: 128,
                compression_level: 'high',
                preserve_quality: false
            },
            use_cases: ['Mobile apps', 'Low bandwidth', 'Storage optimization']
        },
        {
            name: 'Archive Compression',
            description: 'Maximum compression for long-term storage',
            config: {
                dimension: 64,
                n_quantizers: 4,
                bins: 256,
                decay: 0.95,
                kmeans_init: true,
                kmeans_iters: 20,
                threshold_ema_dead_code: 5,
                sample_rate: 44100,
                target_bandwidth: 64,
                compression_level: 'ultra',
                preserve_quality: false
            },
            use_cases: ['Long-term storage', 'Backup archives', 'Minimal bandwidth']
        }
    ]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setCurrentFile(file);
            setQuantizedResult(null);
        }
    };

    const quantizeAudio = async () => {
        if (!currentFile) return;

        setIsQuantizing(true);
        try {
            const formData = new FormData();
            formData.append('audio', currentFile);
            formData.append('profile', selectedProfile);
            if (Object.keys(customConfig).length > 0) {
                formData.append('customConfig', JSON.stringify(customConfig));
            }

            const response = await fetch('/api/vector-quantization/quantize', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Convert base64 to ArrayBuffer
                const quantizedAudio = Uint8Array.from(atob(result.quantized_audio), c => c.charCodeAt(0)).buffer;

                const quantizedResult: QuantizedResult = {
                    quantized_audio: quantizedAudio,
                    codes: result.codes,
                    bandwidth: result.bandwidth,
                    compression_ratio: result.compression_ratio,
                    quality_metrics: result.quality_metrics,
                    metadata: result.metadata
                };

                setQuantizedResult(quantizedResult);
                onQuantizationComplete?.(quantizedResult);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Quantization error:', error);
            alert('Quantization failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsQuantizing(false);
        }
    };

    const decompressAudio = async () => {
        if (!quantizedResult) return;

        setIsDecompressing(true);
        try {
            const formData = new FormData();
            formData.append('quantizedAudio', new Blob([quantizedResult.quantized_audio]));
            formData.append('codes', JSON.stringify(quantizedResult.codes));
            formData.append('config', JSON.stringify(compressionProfiles.find(p => p.name === selectedProfile)?.config));

            const response = await fetch('/api/vector-quantization/decompress', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // Convert base64 to ArrayBuffer
                const decompressedAudio = Uint8Array.from(atob(result.decompressedAudio), c => c.charCodeAt(0)).buffer;
                onDecompressionComplete?.(decompressedAudio);

                // Create download link
                const blob = new Blob([decompressedAudio], { type: 'audio/wav' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `decompressed_${currentFile?.name}`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Decompression error:', error);
            alert('Decompression failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsDecompressing(false);
        }
    };

    const getQualityColor = (score: number) => {
        if (score >= 90) return 'text-green-400';
        if (score >= 80) return 'text-yellow-400';
        if (score >= 70) return 'text-orange-400';
        return 'text-red-400';
    };

    const getQualityBgColor = (score: number) => {
        if (score >= 90) return 'bg-green-500/20';
        if (score >= 80) return 'bg-yellow-500/20';
        if (score >= 70) return 'bg-orange-500/20';
        return 'bg-red-500/20';
    };

    const MetricCard = ({ title, value, score, icon: Icon }: {
        title: string;
        value: string | number;
        score?: number;
        icon: any;
    }) => (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-[#FF5B00]" />
                    <h3 className="text-white font-semibold">{title}</h3>
                </div>
                {score !== undefined && (
                    <div className={`px-2 py-1 rounded text-xs font-medium ${getQualityBgColor(score)} ${getQualityColor(score)}`}>
                        {Math.round(score)}%
                    </div>
                )}
            </div>
            <p className="text-gray-300 text-lg font-mono">{value}</p>
        </div>
    );

    const ProfileCard = ({ profile, isSelected, onClick }: {
        profile: CompressionProfile;
        isSelected: boolean;
        onClick: () => void;
    }) => (
        <div
            onClick={onClick}
            className={`cursor-pointer transition-all duration-300 ${isSelected
                    ? 'bg-gradient-to-r from-[#FF5B00] to-[#A726C1] border-[#FF5B00]'
                    : 'bg-gray-800/50 border-gray-700 hover:border-[#FF5B00]/50'
                } rounded-lg p-4 border backdrop-blur-sm`}
        >
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-semibold">{profile.name}</h3>
                {isSelected && <Star className="w-5 h-5 text-white" />}
            </div>
            <p className="text-gray-300 text-sm mb-3">{profile.description}</p>
            <div className="space-y-1">
                <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Compression:</span>
                    <span className="text-white capitalize">{profile.config.compression_level}</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Bandwidth:</span>
                    <span className="text-white">{profile.config.target_bandwidth || 'Auto'} kbps</span>
                </div>
                <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Quality:</span>
                    <span className="text-white">{profile.config.preserve_quality ? 'High' : 'Optimized'}</span>
                </div>
            </div>
            <div className="mt-3">
                <p className="text-gray-400 text-xs mb-1">Use Cases:</p>
                <div className="flex flex-wrap gap-1">
                    {profile.use_cases.slice(0, 2).map((useCase, index) => (
                        <span key={index} className="px-2 py-1 bg-gray-700/50 text-gray-300 text-xs rounded">
                            {useCase}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );

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
                        🧠 Vector Quantization
                    </h1>
                    <p className="text-gray-400 text-lg">
                        Professional audio compression and encoding system
                    </p>
                </div>

                <div className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800">
                    {/* Navigation Tabs */}
                    <div className="flex justify-center mb-8">
                        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-1 border border-gray-700">
                            <button
                                onClick={() => setActiveTab('compress')}
                                className={`px-6 py-3 rounded-lg font-semibold transition-all ${activeTab === 'compress'
                                        ? 'bg-gradient-to-r from-[#FF5B00] to-[#A726C1] text-white'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                🗜️ Compress
                            </button>
                            <button
                                onClick={() => setActiveTab('profiles')}
                                className={`px-6 py-3 rounded-lg font-semibold transition-all ${activeTab === 'profiles'
                                        ? 'bg-gradient-to-r from-[#FF5B00] to-[#A726C1] text-white'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                ⚙️ Profiles
                            </button>
                            <button
                                onClick={() => setActiveTab('results')}
                                className={`px-6 py-3 rounded-lg font-semibold transition-all ${activeTab === 'results'
                                        ? 'bg-gradient-to-r from-[#FF5B00] to-[#A726C1] text-white'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                📊 Results
                            </button>
                        </div>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'compress' && (
                        <div className="space-y-6">
                            {/* File Upload */}
                            <div className="mb-8">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Compress className="w-6 h-6 text-[#FF5B00]" />
                                        <h3 className="text-xl font-semibold text-white">Audio Compression</h3>
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
                                            Upload Audio
                                        </button>
                                        {currentFile && (
                                            <button
                                                onClick={quantizeAudio}
                                                disabled={isQuantizing}
                                                className="bg-gradient-to-r from-[#FF5B00] to-[#A726C1] hover:from-[#FF5B00]/90 hover:to-[#A726C1]/90 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                            >
                                                {isQuantizing ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                        Compressing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles className="w-4 h-4" />
                                                        Compress
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {currentFile && (
                                    <div className="p-4 bg-gray-800/50 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <FileAudio className="w-5 h-5 text-[#FF5B00]" />
                                                <div>
                                                    <p className="text-white font-medium">{currentFile.name}</p>
                                                    <p className="text-gray-400 text-sm">
                                                        {(currentFile.size / 1024 / 1024).toFixed(2)} MB
                                                    </p>
                                                </div>
                                            </div>
                                            <audio
                                                ref={originalAudioRef}
                                                src={URL.createObjectURL(currentFile)}
                                                controls
                                                className="w-64"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Compression Profiles */}
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-[#FF5B00]" />
                                    Select Compression Profile
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {compressionProfiles.map((profile) => (
                                        <ProfileCard
                                            key={profile.name}
                                            profile={profile}
                                            isSelected={selectedProfile === profile.name}
                                            onClick={() => setSelectedProfile(profile.name)}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Decompression */}
                            {quantizedResult && (
                                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <Download className="w-5 h-5 text-[#FF5B00]" />
                                        Decompression
                                    </h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <audio
                                                ref={quantizedAudioRef}
                                                src={URL.createObjectURL(new Blob([quantizedResult.quantized_audio]))}
                                                controls
                                                className="w-64"
                                            />
                                            <div>
                                                <p className="text-white font-medium">Compressed Audio</p>
                                                <p className="text-gray-400 text-sm">
                                                    {(quantizedResult.metadata.compressed_size / 1024 / 1024).toFixed(2)} MB
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={decompressAudio}
                                            disabled={isDecompressing}
                                            className="bg-gradient-to-r from-[#A726C1] to-[#3D9EFF] hover:from-[#A726C1]/90 hover:to-[#3D9EFF]/90 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {isDecompressing ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                    Decompressing...
                                                </>
                                            ) : (
                                                <>
                                                    <Download className="w-4 h-4" />
                                                    Decompress
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'profiles' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {compressionProfiles.map((profile) => (
                                    <div key={profile.name} className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                                        <div className="flex items-center gap-3 mb-4">
                                            {profile.config.compression_level === 'low' && <Monitor className="w-6 h-6 text-green-400" />}
                                            {profile.config.compression_level === 'medium' && <Wifi className="w-6 h-6 text-blue-400" />}
                                            {profile.config.compression_level === 'high' && <Smartphone className="w-6 h-6 text-yellow-400" />}
                                            {profile.config.compression_level === 'ultra' && <Database className="w-6 h-6 text-red-400" />}
                                            <h3 className="text-xl font-semibold text-white">{profile.name}</h3>
                                        </div>

                                        <p className="text-gray-300 mb-4">{profile.description}</p>

                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-gray-400 text-sm">Dimension</p>
                                                <p className="text-white font-mono">{profile.config.dimension}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-sm">Quantizers</p>
                                                <p className="text-white font-mono">{profile.config.n_quantizers}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-sm">Codebook Size</p>
                                                <p className="text-white font-mono">{profile.config.bins}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-sm">Bandwidth</p>
                                                <p className="text-white font-mono">{profile.config.target_bandwidth || 'Auto'} kbps</p>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-gray-400 text-sm mb-2">Use Cases:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {profile.use_cases.map((useCase, index) => (
                                                    <span key={index} className="px-2 py-1 bg-[#FF5B00]/20 text-[#FF5B00] text-xs rounded">
                                                        {useCase}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'results' && quantizedResult && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <MetricCard
                                    title="Compression Ratio"
                                    value={`${quantizedResult.compression_ratio.toFixed(1)}x`}
                                    icon={Compress}
                                />
                                <MetricCard
                                    title="Bandwidth Usage"
                                    value={`${quantizedResult.bandwidth.toFixed(0)} kbps`}
                                    icon={Wifi}
                                />
                                <MetricCard
                                    title="Size Reduction"
                                    value={`${((1 - quantizedResult.metadata.compressed_size / quantizedResult.metadata.original_size) * 100).toFixed(1)}%`}
                                    icon={HardDrive}
                                />
                                <MetricCard
                                    title="Encoding Time"
                                    value={`${quantizedResult.metadata.encoding_time}ms`}
                                    icon={Activity}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <Target className="w-5 h-5 text-[#FF5B00]" />
                                        Quality Metrics
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Signal-to-Noise Ratio</span>
                                            <span className={`font-medium ${getQualityColor(quantizedResult.quality_metrics.snr)}`}>
                                                {quantizedResult.quality_metrics.snr.toFixed(1)} dB
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Perceptual Score</span>
                                            <span className={`font-medium ${getQualityColor(quantizedResult.quality_metrics.perceptual_score)}`}>
                                                {Math.round(quantizedResult.quality_metrics.perceptual_score)}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Spectral Distance</span>
                                            <span className="text-white">
                                                {quantizedResult.quality_metrics.spectral_distance.toFixed(3)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-[#FF5B00]" />
                                        File Information
                                    </h3>
                                    <div className="space-y-3">
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Original Size</span>
                                            <span className="text-white">{(quantizedResult.metadata.original_size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Compressed Size</span>
                                            <span className="text-white">{(quantizedResult.metadata.compressed_size / 1024 / 1024).toFixed(2)} MB</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Space Saved</span>
                                            <span className="text-green-400">
                                                {((quantizedResult.metadata.original_size - quantizedResult.metadata.compressed_size) / 1024 / 1024).toFixed(2)} MB
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-300">Processing Time</span>
                                            <span className="text-white">{quantizedResult.metadata.encoding_time}ms</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* No File State */}
                    {!currentFile && activeTab === 'compress' && (
                        <div className="text-center py-12">
                            <Compress className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-400 mb-2">Ready for Compression</h3>
                            <p className="text-gray-500">
                                Upload an audio file and select a compression profile to get started with vector quantization.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
