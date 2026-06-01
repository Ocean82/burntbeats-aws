const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function findWav(startDir) {
  const exts = ['.wav','.WAV'];
  const stack = [startDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      if (e.isFile() && exts.includes(path.extname(e.name))) return full;
    }
  }
  return null;
}

function makeSilentWav(outPath, secs = 3, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = secs * sampleRate;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28); buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  // PCM zeros already
  fs.writeFileSync(outPath, buffer);
}

(async () => {
  const baseUrl = process.argv[2] || 'http://localhost:5173';
  const artifactsDir = process.argv[3] || path.join(process.cwd(),'session-artifacts');
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

  const repoRoot = path.resolve(__dirname, '..', '..');
  let wav = await findWav(repoRoot) || await findWav(path.join(repoRoot,'tmp')) || null;
  if (!wav) {
    wav = path.join(artifactsDir, 'silent.wav');
    makeSilentWav(wav, 5);
    console.log('No wav found; synthesized', wav);
  } else {
    console.log('Using wav:', wav);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => { logs.push({type: msg.type(), text: msg.text()}); });
  page.on('pageerror', err => { logs.push({type: 'pageerror', text: String(err)}); });

  console.log('Navigating to', baseUrl);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(artifactsDir, 'landing.png') });

  // Scenario A: Quality 4-stem separation
  const fileInput = await page.locator('input[type=file]').first();
  if (!fileInput) { console.error('No file input found'); }
  await fileInput.setInputFiles(wav);
  console.log('Uploaded file for separation');

  // Try clicking candidate split buttons
  const btnSelectors = ['button:has-text("Separate")','button:has-text("Split")','button:has-text("Start")','button:has-text("Process")','button:has-text("Upload")'];
  let clicked = false;
  for (const s of btnSelectors) {
    const btn = page.locator(s).first();
    if (await btn.count() > 0) {
      try { await btn.click(); clicked = true; console.log('Clicked', s); break; } catch (e) { }
    }
  }

  if (!clicked) console.log('No obvious split button clicked; waiting for stems passively');

  // Wait for up to 2 mins for 4 audio elements or stem indicators
  try {
    await page.waitForFunction(() => {
      const aud = document.querySelectorAll('audio');
      if (aud.length >= 4) return true;
      const stems = document.querySelectorAll('[data-testid="stem-item"], .stem, .stem-item');
      return stems.length >= 4;
    }, null, { timeout: 120000 });
    console.log('Detected 4+ stems');
  } catch (e) { console.log('Timed out waiting for stems'); }
  await page.screenshot({ path: path.join(artifactsDir, 'after-separation.png'), fullPage: true });

  // Scenario B: Bulk load 20 stems
  const tmpDir = path.join(artifactsDir, 'bulk');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  const sample = wav;
  const files = [];
  for (let i=1;i<=20;i++) {
    const dest = path.join(tmpDir, `test-stem-${String(i).padStart(2,'0')}.wav`);
    fs.copyFileSync(sample, dest);
    files.push(dest);
  }
  // Reuse the same input (assumes it accepts multiple)
  await fileInput.setInputFiles(files.map(f=>({name:path.basename(f), mimeType:'audio/wav', buffer: fs.readFileSync(f)})));
  console.log('Uploaded 20 stems');
  try {
    await page.waitForFunction(() => {
      const aud = document.querySelectorAll('audio');
      return aud.length >= 20;
    }, null, { timeout: 120000 });
    console.log('Detected 20+ audio elements');
  } catch (e) { console.log('Timed out waiting for 20 stems'); }
  await page.screenshot({ path: path.join(artifactsDir, 'after-bulk-load.png'), fullPage: true });

  // Exports: attempt to click export/download buttons and capture downloads
  const downloadSelectors = ['button:has-text("Export")','button:has-text("Download")','button:has-text("Export MP3")','button:has-text("Export ZIP")'];
  for (const s of downloadSelectors) {
    const btn = page.locator(s).first();
    if (await btn.count() > 0) {
      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60000 }).catch(()=>null),
          btn.click().catch(()=>{}),
        ]);
        if (download) {
          const savePath = path.join(artifactsDir, await download.suggestedFilename());
          await download.saveAs(savePath);
          console.log('Saved download to', savePath);
        } else {
          console.log('No download triggered by', s);
        }
      } catch (e) { console.log('Error during download attempt', e); }
    }
  }

  // Stop tracing
  const tracePath = path.join(artifactsDir, 'trace-full.zip');
  await context.tracing.stop({ path: tracePath });
  fs.writeFileSync(path.join(artifactsDir,'console-log.json'), JSON.stringify(logs, null, 2));
  await page.screenshot({ path: path.join(artifactsDir, 'final.png'), fullPage: true });
  await browser.close();
  console.log('Completed; artifacts at', artifactsDir);
});
