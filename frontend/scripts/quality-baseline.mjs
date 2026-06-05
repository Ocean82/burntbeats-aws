import { readFile, stat } from "node:fs/promises"
import path from "node:path"

/** Line-count ceilings enforced when QUALITY_BASELINE_ENFORCE=1 (CI). */
const ENFORCED_LIMITS = {
  "src/App.tsx": 20,
  "src/hooks/app/useEditorSession.ts": 850,
}

const TARGETS = [
  "src/App.tsx",
  "src/hooks/app/useEditorSession.ts",
  "src/hooks/audio/useAudioPlayback.ts",
  "../backend/routes/stems/cleanup.js",
  "../backend/routes/midi/cleanup.js",
  "../backend/server.js",
]

async function getLineCount(filePath) {
  const content = await readFile(filePath, "utf8")
  return content.split("\n").length
}

async function main() {
  const enforce = process.env.QUALITY_BASELINE_ENFORCE === "1"
  const rows = []
  const violations = []

  for (const relativePath of TARGETS) {
    const absolutePath = path.resolve(process.cwd(), relativePath)
    const fileStats = await stat(absolutePath)
    const lineCount = await getLineCount(absolutePath)
    rows.push({
      file: relativePath,
      lines: lineCount,
      bytes: fileStats.size,
    })

    const limit = ENFORCED_LIMITS[relativePath]
    if (enforce && limit != null && lineCount > limit) {
      violations.push(`${relativePath}: ${lineCount} lines exceeds limit ${limit}`)
    }
  }

  console.log("[quality-baseline] Target file metrics")
  for (const row of rows) {
    console.log(`${row.file} | ${row.lines} lines | ${row.bytes} bytes`)
  }

  if (violations.length > 0) {
    console.error("[quality-baseline] Line-count limits exceeded:")
    for (const message of violations) {
      console.error(`  - ${message}`)
    }
    process.exit(1)
  }
}

main().catch((error) => {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Unknown baseline error"
  console.error("[quality-baseline] Failed:", message)
  process.exit(1)
})
