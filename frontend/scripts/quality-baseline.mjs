import { readFile, stat } from "node:fs/promises"
import path from "node:path"

const TARGETS = [
  "src/App.tsx",
  "src/components/MultiStemEditor.tsx",
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
  const rows = []
  for (const relativePath of TARGETS) {
    const absolutePath = path.resolve(process.cwd(), relativePath)
    const fileStats = await stat(absolutePath)
    const lineCount = await getLineCount(absolutePath)
    rows.push({
      file: relativePath,
      lines: lineCount,
      bytes: fileStats.size,
    })
  }

  console.log("[quality-baseline] Target file metrics")
  for (const row of rows) {
    console.log(`${row.file} | ${row.lines} lines | ${row.bytes} bytes`)
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
