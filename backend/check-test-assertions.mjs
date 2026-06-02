import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const ROOT_DIR = process.cwd()
const TEST_FILE_PATTERN = /\.(test|spec)\.(js|cjs|mjs)$/
const TEST_BLOCK_PATTERN = /\b(?:it|test)\s*\(/g
const ASSERTION_PATTERN =
  /\b(?:expect\s*\(|assert(?:\.|Strict\.)|deepStrictEqual\s*\(|strictEqual\s*\()/g
const IGNORE_DIRS = new Set(["node_modules", ".git", "coverage"])

/**
 * @param {string} dirPath
 * @returns {Promise<string[]>}
 */
async function walkFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (IGNORE_DIRS.has(entry.name)) return []
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) return walkFiles(fullPath)
      return [fullPath]
    }),
  )
  return files.flat()
}

/**
 * @param {string} content
 */
function hasTestWithoutAssertion(content) {
  const testBlocks = content.match(TEST_BLOCK_PATTERN)?.length ?? 0
  if (testBlocks === 0) return false
  const assertionCalls = content.match(ASSERTION_PATTERN)?.length ?? 0
  return assertionCalls === 0
}

async function main() {
  const files = await walkFiles(ROOT_DIR)
  const testFiles = files.filter((filePath) => TEST_FILE_PATTERN.test(filePath))
  const offenders = []

  for (const filePath of testFiles) {
    const content = await readFile(filePath, "utf8")
    if (hasTestWithoutAssertion(content)) offenders.push(filePath)
  }

  if (offenders.length === 0) {
    console.log(
      `[assertion-check] OK: scanned ${testFiles.length} backend test files with assertion presence`,
    )
    return
  }

  console.error(
    "[assertion-check] Found backend test files with test/it blocks but no assertions:",
  )
  for (const filePath of offenders) {
    console.error(` - ${path.relative(ROOT_DIR, filePath)}`)
  }
  process.exit(1)
}

main().catch((error) => {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Unknown backend assertion check error"
  console.error("[assertion-check] Failed:", message)
  process.exit(1)
})
