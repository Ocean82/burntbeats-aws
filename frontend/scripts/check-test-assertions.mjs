import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const ROOT_DIR = path.resolve(process.cwd(), "src")
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$/
const TEST_BLOCK_PATTERN = /\b(?:it|test)\s*\(/g
const ASSERTION_PATTERN =
  /\b(?:expect\s*\(|assert(?:\.|Strict\.)|expectTypeOf\s*\()/g

/**
 * @param {string} dirPath
 * @returns {Promise<string[]>}
 */
async function walkFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) return walkFiles(fullPath)
      return [fullPath]
    }),
  )
  return files.flat()
}

/**
 * @param {string} content
 * @returns {boolean}
 */
function hasTestWithoutAssertion(content) {
  const testBlocks = content.match(TEST_BLOCK_PATTERN)?.length ?? 0
  if (testBlocks === 0) return false
  const assertionCalls = content.match(ASSERTION_PATTERN)?.length ?? 0
  return assertionCalls === 0
}

async function main() {
  const sourceStats = await stat(ROOT_DIR).catch(() => null)
  if (!sourceStats?.isDirectory()) {
    console.error(`[assertion-check] Missing source directory: ${ROOT_DIR}`)
    process.exit(1)
  }

  const allFiles = await walkFiles(ROOT_DIR)
  const testFiles = allFiles.filter((filePath) =>
    TEST_FILE_PATTERN.test(filePath),
  )

  const offenders = []
  for (const filePath of testFiles) {
    const content = await readFile(filePath, "utf8")
    if (hasTestWithoutAssertion(content)) offenders.push(filePath)
  }

  if (offenders.length === 0) {
    console.log(
      `[assertion-check] OK: scanned ${testFiles.length} test files with assertion presence`,
    )
    return
  }

  console.error(
    "[assertion-check] Found test files with test/it blocks but no assertions:",
  )
  for (const filePath of offenders) {
    console.error(` - ${path.relative(process.cwd(), filePath)}`)
  }
  process.exit(1)
}

main().catch((error) => {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Unknown assertion check error"
  console.error("[assertion-check] Failed:", message)
  process.exit(1)
})
