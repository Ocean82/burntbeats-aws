import { useState, useRef, useEffect } from 'react';
import { FaUpload, FaPlay, FaPause, FaDownload, FaUndo, FaVolumeUp, FaMusic, FaSlidersH } from 'react-icons/fa';
import WaveSurfer from 'wavesurfer.js';

// Define types for our application
type StemType = 'vocals' | 'instrumental' | 'bass' | 'drums' | 'other';
type QualitySetting = 'fast' | 'balanced' | 'high';

interface Stem {
  id: StemType;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

const StemSplitterApp = () => {
  // State management
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [quality, setQuality] = useState<QualitySetting>('fast');
  const [stemCount, setStemCount] = useState<number>(2);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stems, setStems] = useState<Stem[]>([
    { id: 'vocals', name: 'Vocals', color: '#FF6B6B', volume: 0, pan: 0, mute: false, solo: false },
    { id: 'instrumental', name: 'Instrumental', color: '#4ECDC4', volume: 0, pan: 0, mute: false, solo: false },
    { id: 'bass', name: 'Bass', color: '#45B7D1', volume: 0, pan: 0, mute: false, solo: false },
    { id: 'drums', name: 'Drums', color: '#96CEB4', volume: 0, pan: 0, mute: false, solo: false },
    { id: 'other', name: 'Other', color: '#FFEAA7', volume: 0, pan: 0, mute: false, solo: false },
  ]);
  
  // Refs for waveform visualization
  const waveformRefs = useRef<{[key: string]: WaveSurfer | null}>({});
  const masterWaveformRef = useRef<WaveSurfer | null>(null);
  
  // Handle file upload
  const handleFileUpload = (uploadedFile: File) => {
    if (uploadedFile && (uploadedFile.type.startsWith('audio/') || 
        uploadedFile.name.endsWith('.mp3') || 
        uploadedFile.name.endsWith('.wav') || 
        uploadedFile.name.endsWith('.flac'))) {
      setFile(uploadedFile);
    } else {
      alert('Please upload a valid audio file (MP3, WAV, FLAC)');
    }
  };
  
  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };
  
  // Simulate stem splitting process
  const splitStems = () => {
    if (!file) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    // Simulate processing with realistic progress
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + Math.random() * 10;
        if (newProgress >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          return 100;
        }
        return newProgress;
      });
    }, 300);
  };
  
  // Toggle play/pause
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
    // In a real app, this would control the actual playback
  };
  
  // Reset to default state
  const resetApp = () => {
    setFile(null);
    setProgress(0);
    setIsProcessing(false);
    setIsPlaying(false);
    setStems(stems.map(stem => ({
      ...stem,
      volume: 0,
      pan: 0,
      mute: false,
      solo: false
    })));
  };
  
  // Update stem parameters
  const updateStem = (id: StemType, property: keyof Stem, value: any) => {
    setStems(stems.map(stem => 
      stem.id === id ? { ...stem, [property]: value } : stem
    ));
  };
  
  // Apply changes to all stems
  const applyToAll = (property: keyof Stem, value: any) => {
    setStems(stems.map(stem => ({ ...stem, [property]: value })));
  };
  
  // Initialize waveform visualizations
  useEffect(() => {
    // In a real app, we would initialize WaveSurfer instances here
    // For this demo, we're just setting up the structure
    
    return () => {
      // Clean up waveform instances
      Object.values(waveformRefs.current).forEach(waveform => {
        if (waveform) waveform.destroy();
      });
      if (masterWaveformRef.current) masterWaveformRef.current.destroy();
    };
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 mb-2">
            StemSplitter Pro
          </h1>
          <p className="text-gray-400">Professional Audio Stem Splitter & Mixer</p>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Upload & Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* File Upload Card */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FaUpload className="text-purple-400" />
                Upload Audio File
              </h2>
              
              {!file ? (
                <div 
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300 ${
                    isDragging 
                      ? 'border-purple-500 bg-purple-900/20' 
                      : 'border-gray-600 hover:border-purple-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('fileInput')?.click()}
                >
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-purple-900/30 flex items-center justify-center">
                      <FaMusic className="text-2xl text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium">Drag & drop your audio file here</p>
                      <p className="text-gray-400 text-sm mt-1">Supports MP3, WAV, FLAC</p>
                    </div>
                    <button className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors">
                      Browse Files
                    </button>
                  </div>
                  <input 
                    id="fileInput"
                    type="file" 
                    className="hidden" 
                    accept="audio/*,.mp3,.wav,.flac"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="bg-gray-700/50 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-purple-900/30 flex items-center justify-center">
                      <FaMusic className="text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium truncate max-w-[160px]">{file.name}</p>
                      <p className="text-gray-400 text-sm">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setFile(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            
            {/* Processing Settings */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-xl">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <FaSlidersH className="text-blue-400" />
                Processing Settings
              </h2>
              
              <div className="space-y-5">
                {/* Quality Selection */}
                <div>
                  <label className="block text-gray-300 mb-2">Quality vs Speed</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['fast', 'balanced', 'high'] as QualitySetting[]).map((q) => (
                      <button
                        key={q}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          quality === q
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                        onClick={() => setQuality(q)}
                      >
                        {q.charAt(0).toUpperCase() + q.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Stem Count */}
                <div>
                  <label className="block text-gray-300 mb-2">
                    Number of Stems: {stemCount}
                  </label>
                  <input 
                    type="range" 
                    min="2" 
                    max="5" 
                    value={stemCount} 
                    onChange={(e) => setStemCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                  </div>
                </div>
                
                {/* Split Button */}
                <button
                  onClick={splitStems}
                  disabled={!file || isProcessing}
                  className={`w-full py-3 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                    !file || isProcessing
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : (
                    'Split Stems'
                  )}
                </button>
              </div>
            </div>
            
            {/* Progress Bar */}
            {isProcessing && (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-xl">
                <h2 className="text-xl font-semibold mb-4">Processing Audio</h2>
                <div className="space-y-3">
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Middle Panel - Mixer */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-xl h-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Mixer Console</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={resetApp}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <FaUndo /> Reset
                  </button>
                  <button 
                    onClick={togglePlayback}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    {isPlaying ? <><FaPause /> Pause</> : <><FaPlay /> Play</>}
                  </button>
                  <button 
                    disabled={!file}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    <FaDownload /> Export
                  </button>
                </div>
              </div>
              
              {/* Master Waveform */}
              <div className="mb-8 p-4 bg-gray-900/50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Master Output</h3>
                  <div className="flex items-center gap-2">
                    <FaVolumeUp className="text-gray-400" />
                    <div className="w-24 h-2 bg-gray-700 rounded-full">
                      <div className="bg-blue-500 h-2 rounded-full w-3/4"></div>
                    </div>
                  </div>
                </div>
                <div 
                  id="master-waveform" 
                  className="w-full h-24 bg-gray-900 rounded-lg flex items-center justify-center"
                >
                  <div className="text-gray-500">Master waveform visualization</div>
                </div>
              </div>
              
              {/* Stems Mixer */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-300">Audio Stems</h3>
                
                {stems.slice(0, stemCount).map((stem) => (
                  <div 
                    key={stem.id} 
                    className="p-4 bg-gray-900/50 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: stem.color }}
                        ></div>
                        <span className="font-medium">{stem.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => updateStem(stem.id, 'mute', !stem.mute)}
                          className={`px-3 py-1 rounded text-sm ${
                            stem.mute 
                              ? 'bg-red-600 text-white' 
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Mute
                        </button>
                        <button 
                          onClick={() => updateStem(stem.id, 'solo', !stem.solo)}
                          className={`px-3 py-1 rounded text-sm ${
                            stem.solo 
                              ? 'bg-yellow-600 text-white' 
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Solo
                        </button>
                      </div>
                    </div>
                    
                    {/* Waveform Visualization */}
                    <div 
                      id={`waveform-${stem.id}`} 
                      className="w-full h-20 bg-gray-800 rounded mb-3"
                    >
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-gray-600 text-sm">
                          {stem.name} waveform visualization
                        </div>
                      </div>
                    </div>
                    
                    {/* Controls */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">Volume</label>
                        <div className="flex items-center gap-2">
                          <FaVolumeUp className="text-gray-500" />
                          <input 
                            type="range" 
                            min="-20" 
                            max="20" 
                            value={stem.volume}
                            onChange={(e) => updateStem(stem.id, 'volume', parseInt(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">Pan</label>
                        <input 
                          type="range" 
                          min="-100" 
                          max="100" 
                          value={stem.pan}
                          onChange={(e) => updateStem(stem.id, 'pan', parseInt(e.target.value))}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">EQ</label>
                        <div className="flex gap-1">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex-1">
                              <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                defaultValue="50"
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 transform rotate-90 origin-center"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-gray-400 text-sm mb-1">Effects</label>
                        <div className="flex gap-1">
                          <button className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded">
                            Reverb
                          </button>
                          <button className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded">
                            Delay
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Apply to All Controls */}
                <div className="pt-4 border-t border-gray-700">
                  <h3 className="font-medium text-gray-300 mb-3">Apply to All Stems</h3>
                  <div className="flex flex-wrap gap-3">
                    <button 
                      onClick={() => applyToAll('volume', 0)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      Reset Volume
                    </button>
                    <button 
                      onClick={() => applyToAll('pan', 0)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      Center Pan
                    </button>
                    <button 
                      onClick={() => applyToAll('mute', false)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      Unmute All
                    </button>
                    <button 
                      onClick={() => applyToAll('solo', false)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      Clear Solo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Completion Notification */}
        {progress === 100 && (
          <div className="fixed bottom-6 right-6 animate-pulse">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
              <div className="w-3 h-3 bg-white rounded-full animate-ping"></div>
              <span className="font-medium">Stems Ready! Click to Mix</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export function App() {
  return <StemSplitterApp />;
}