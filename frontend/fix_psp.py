#!/usr/bin/env python3
import re

path = '/mnt/d/burntbeats-aws/frontend/src/components/ProcessingSettingsPanel.tsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ── Fix 1: Remove useCallback from import (unused) ──────────────────────────
src = src.replace(
    'import { useEffect, useMemo, useState, useCallback } from "react";',
    'import { useEffect, useMemo, useState } from "react";'
)

# ── Fix 2: Close the progressive-disclosure wrapper after the flex row ───────
# The flex row closes at </div> after the expand button.
# We need:  </div>  (closes flex row)  then close motion.div and AnimatePresence
# Then leave the finish notice + usage row INSIDE the wrapper too.
# Strategy: replace the old single </div> that closed the toolbar row
# plus the finish-notice block + usage row block, wrapping them all, then close.

OLD_TOOLBAR_CLOSE = '''      </div>

      {sourceMode === "split" && splitResultStemsLength > 0 && (
        <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs leading-relaxed text-white/65">'''

NEW_TOOLBAR_CLOSE = '''            </div>{/* end flex row */}

            {sourceMode === "split" && splitResultStemsLength > 0 && (
              <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-xs leading-relaxed text-white/65">'''

src = src.replace(OLD_TOOLBAR_CLOSE, NEW_TOOLBAR_CLOSE)

# Fix the closing </p> and the usage row to stay inside the wrapper
OLD_FINISH_END = '''        </p>
      )}

      {showUsageRow && sourceMode === "split" && ('''

NEW_FINISH_END = '''              </p>
            )}

            {showUsageRow && sourceMode === "split" && ('''

src = src.replace(OLD_FINISH_END, NEW_FINISH_END)

# Fix the usage row closing and then close motion.div + AnimatePresence
OLD_USAGE_END = '''        </div>
      )}

      {/* Loaded stems list (collapsible) */}'''

NEW_USAGE_END = '''            </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loaded stems list (collapsible) */}'''

src = src.replace(OLD_USAGE_END, NEW_USAGE_END)

# ── Fix 3: Upgrade the Split button / Try-for-free to pill style ─────────────
OLD_SPLIT_SECTION = '''        {/* Split / action button */}
        {sourceMode === "split" && (
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => onSplit(requestedStemMode, isSample)}
              disabled={
                !uploadedFile || isSplitting || splitResultStemsLength > 0
              }
              title={
                splitResultStemsLength > 0
                  ? "Upload a new file to run separation again. Each upload is a new job."
                  : undefined
              }
              className="fire-button min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSplitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Splitting
                  {typeof splitProgress === "number" && splitProgress > 0
                    ? `\u2026 ${Math.round(splitProgress)}%`
                    : "\u2026"}
                </>
              ) : splitResultStemsLength > 0 ? (
                "New file to split again"
              ) : requestedStemMode === 4 ? (
                "Split \u2192 4 stems"
              ) : (
                "Split stems"
              )}
            </button>
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer hover:text-white transition">
              <input
                type="checkbox"
                checked={isSample}
                onChange={(e) => setIsSample(e.target.checked)}
                disabled={isSplitting || splitResultStemsLength > 0}
                className="rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500 focus:ring-offset-black disabled:opacity-50"
              />
              Try for free (60s sample)
            </label>
          </div>
        )}'''

NEW_SPLIT_SECTION = '''        {/* Split / action button + Try for free pill */}
        {sourceMode === "split" && (
          <div className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSplit(requestedStemMode, isSample)}
                disabled={
                  !uploadedFile || isSplitting || splitResultStemsLength > 0
                }
                title={
                  splitResultStemsLength > 0
                    ? "Upload a new file to run separation again. Each upload is a new job."
                    : undefined
                }
                className="fire-button min-h-[44px] shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSplitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Splitting
                    {typeof splitProgress === "number" && splitProgress > 0
                      ? `\u2026 ${Math.round(splitProgress)}%`
                      : "\u2026"}
                  </>
                ) : splitResultStemsLength > 0 ? (
                  "New file to split again"
                ) : requestedStemMode === 4 ? (
                  "Split \u2192 4 stems"
                ) : (
                  "Split stems"
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsSample((v) => !v)}
                disabled={isSplitting || splitResultStemsLength > 0}
                aria-pressed={isSample}
                title="Process only the first 60 seconds \u2014 free, no tokens used"
                className={cn(
                  "min-h-[44px] inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                  isSample
                    ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.25)]"
                    : "border-white/15 bg-white/5 text-white/65 hover:border-white/30 hover:text-white",
                )}
              >
                <Sparkles className={cn("h-3.5 w-3.5", isSample ? "text-emerald-300" : "text-white/40")} />
                {isSample ? "Free sample \u2713" : "Try for free"}
              </button>
            </div>
            {isSample && (
              <p className="text-[11px] text-emerald-400/80">
                60-second sample \u00b7 no tokens consumed
              </p>
            )}
          </div>
        )}'''

src = src.replace(OLD_SPLIT_SECTION, NEW_SPLIT_SECTION)

# ── Fix 4: Fix indentation of queue/expand/load-mode blocks inside wrapper ───
# These are still indented with 8 spaces (inside old toolbar div).
# They're now inside the wrapper div, need to keep consistent indentation.
# The existing indentation is fine for function -- skip deep indent fix for now.

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print('Done. Lines:', src.count('\n'))
