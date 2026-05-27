import React, { useState } from 'react';
import { runAllTests, TestResult } from '../dsp/pluginTests';

export const TestPanel: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setDone(false);
    setResults([]);

    await runAllTests((result) => {
      setResults(prev => [...prev, result]);
    });

    setRunning(false);
    setDone(true);
  };

  const passed = results.filter(r => r.passed).length;
  const total  = results.length;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧪</span>
          <h3 className="font-bold text-slate-200">Unit & Integration Tests</h3>
          {done && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
              passed === total ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {passed}/{total} PASSED
            </span>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
            running
              ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
              : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/30'
          }`}
        >
          {running ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
              Running…
            </span>
          ) : 'Run Tests'}
        </button>
      </div>

      {/* Results */}
      <div className="divide-y divide-slate-800/60">
        {results.length === 0 && !running && (
          <div className="px-4 py-6 text-center text-slate-500 text-sm">
            Click "Run Tests" to execute the test suite
          </div>
        )}

        {results.map((r, i) => (
          <div key={i} className={`px-4 py-3 ${r.passed ? 'bg-green-500/5' : 'bg-red-500/5'}`}>
            <div className="flex items-start gap-3">
              <span className="text-base mt-0.5 shrink-0">{r.passed ? '✅' : '❌'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-slate-200">{r.name}</div>
                <div className="grid grid-cols-2 gap-x-4 mt-1 text-xs">
                  <div>
                    <span className="text-slate-500">Expected: </span>
                    <span className="text-slate-300 font-mono">{r.expected}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Actual: </span>
                    <span className={`font-mono ${r.passed ? 'text-green-400' : 'text-red-400'}`}>{r.actual}</span>
                  </div>
                  {r.tolerance && (
                    <div>
                      <span className="text-slate-500">Tolerance: </span>
                      <span className="text-slate-300 font-mono">{r.tolerance}</span>
                    </div>
                  )}
                  {r.duration !== undefined && (
                    <div>
                      <span className="text-slate-500">Time: </span>
                      <span className="text-slate-300 font-mono">{r.duration.toFixed(1)}ms</span>
                    </div>
                  )}
                </div>
                {r.notes && (
                  <div className="mt-1 text-xs text-slate-500 italic">{r.notes}</div>
                )}
              </div>
            </div>
          </div>
        ))}

        {running && results.length < 10 && (
          <div className="px-4 py-3 text-slate-500 text-sm flex items-center gap-2">
            <span className="animate-pulse">⏳</span> Running test {results.length + 1} of 10…
          </div>
        )}
      </div>
    </div>
  );
};
