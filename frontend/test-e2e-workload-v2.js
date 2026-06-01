import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RESULTS = {
  timestamp: new Date().toISOString(),
  scenarios: {},
  artifacts: [],
  errors: [],
};

const ARTIFACT_DIR = 'D:\\burntbeats-aws\\session-artifacts';
const SAMPLE_WAV = 'D:\\burntbeats-aws\\midi_service\\tests\\fixtures\\piano_c_major.wav';
const DEV_URL = 'http://localhost:5173';

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function addArtifact(type, artifactPath) {
  RESULTS.artifacts.push({ type, path: artifactPath });
}

async function testServerReachability() {
  log('Testing dev server reachability at ' + DEV_URL);
  try {
    const response = await fetch(DEV_URL, { timeout: 5000 });
    log(`Server is reachable (status: ${response.status})`);
    return true;
  } catch (error) {
    log(`Server unreachable: ${error.message}`, 'ERROR');
    RESULTS.errors.push(`Server unreachability: ${error.message}`);
    return false;
  }
}

async function scenarioA(page, browser) {
  log('Starting Scenario A: Quality 4-stem separation');
  const scenarioResult = {
    name: 'Scenario A: 4-Stem Separation',
    status: 'running',
    timings: {},
    metrics: { peakMemoryMB: 0, peakCpuPercent: 0 },
    errors: [],
  };

  try {
    // Navigate to app
    log('Navigating to app');
    const navigationStart = Date.now();
    await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 30000 });
    scenarioResult.timings.pageLoadMs = Date.now() - navigationStart;
    log(`Page loaded in ${scenarioResult.timings.pageLoadMs}ms`);

    // Wait for upload dropzone to be available
    log('Waiting for upload dropzone');
    try {
      await page.locator('[data-testid="split-upload-dropzone"]').first().waitFor({ timeout: 10000 });
      log('Upload dropzone found');
    } catch (e) {
      log('Upload dropzone not found within 10s - proceeding anyway', 'WARN');
    }

    // Take screenshot of home page
    const homeScreenshot = path.join(ARTIFACT_DIR, 'v2-scenario-a-home.png');
    await page.screenshot({ path: homeScreenshot, fullPage: true });
    addArtifact('screenshot', homeScreenshot);
    log(`Saved home screenshot: ${homeScreenshot}`);

    // Start tracing
    const traceFile = path.join(ARTIFACT_DIR, 'v2-trace-sep.trace.zip');
    await page.context().tracing.start({ screenshots: true, snapshots: true });

    // Look for file input and upload
    log('Looking for file input');
    const fileInput = page.locator('input[type="file"]');
    
    if ((await fileInput.count()) > 0) {
      log('Found file input, uploading sample WAV');
      await fileInput.first().setInputFiles(SAMPLE_WAV);
      log('File uploaded to input');
      await page.waitForTimeout(2000);

      // Look for the quality selector (should default to 4 stems after 2-stem separation)
      // The UI might show options to "Expand to 4 stems" or similar
      const expandButton = page.locator('button:has-text("Expand"), button:has-text("4 stems")');
      if ((await expandButton.count()) > 0) {
        log('Found expand button, clicking');
        await expandButton.first().click();
        scenarioResult.timings.qualitySelected = true;
      }
    } else {
      log('No file input found', 'WARN');
      scenarioResult.errors.push('No file input found in DOM');
    }

    // Wait for processing button
    log('Looking for process/start button');
    const processButton = page.locator('button:has-text("Process"), button:has-text("Split"), button:has-text("Separate")').first();
    
    if ((await processButton.count()) > 0) {
      log('Found process button, clicking');
      const separationStart = Date.now();
      await processButton.click();
      log('Started separation/processing');

      // Wait for completion (max 5 minutes, but check more frequently)
      const maxWait = 300000; // 5 minutes
      const pollInterval = 2000; // 2 seconds
      const startWaitTime = Date.now();
      let separationComplete = false;

      while (Date.now() - startWaitTime < maxWait) {
        // Check for success indicators (stems visible, progress 100%, etc.)
        const stems = await page.locator('[data-testid*="stem"], .stem-track, .stem, [class*="stem"]').count();
        const progressBar = page.locator('[role="progressbar"], .progress, [class*="progress"]');
        const progressValue = await progressBar.evaluate((el) => {
          return el.getAttribute('aria-valuenow') || el.textContent;
        }).catch(() => null);

        if (stems > 0) {
          log(`Found ${stems} stem elements in DOM`);
          separationComplete = true;
          break;
        }

        if (progressValue === '100' || progressValue?.includes('100')) {
          log('Progress reached 100%');
          separationComplete = true;
          break;
        }

        // Check for error messages
        const errorMessages = await page.locator('[class*="error"], [class*="error-message"], text=/error|failed/i').count();
        if (errorMessages > 0) {
          log('Error detected in UI', 'WARN');
          scenarioResult.errors.push('Separation error detected in UI');
          break;
        }

        await page.waitForTimeout(pollInterval);
        const elapsed = ((Date.now() - startWaitTime) / 1000).toFixed(1);
        if (elapsed % 10 < 2.5) {
          log(`Waiting for separation... ${elapsed}s`);
        }
      }

      scenarioResult.timings.separationMs = Date.now() - separationStart;
      log(`Separation took ${scenarioResult.timings.separationMs}ms (complete: ${separationComplete})`);
    } else {
      log('No process button found', 'WARN');
      scenarioResult.errors.push('No process button found');
    }

    // Take screenshot of separated stems
    const stemsScreenshot = path.join(ARTIFACT_DIR, 'v2-scenario-a-stems.png');
    await page.screenshot({ path: stemsScreenshot, fullPage: true });
    addArtifact('screenshot', stemsScreenshot);
    log(`Saved stems screenshot: ${stemsScreenshot}`);

    // Check for stems in DOM
    const stemCount = await page.locator('[data-testid*="stem"], .stem-track, [class*="stem"]').count();
    scenarioResult.metrics.stemCount = stemCount;
    log(`Found ${stemCount} stem elements in DOM`);

    // Stop tracing
    await page.context().tracing.stop({ path: traceFile });
    addArtifact('trace', traceFile);
    log(`Saved trace: ${traceFile}`);

    scenarioResult.status = 'completed';
    RESULTS.scenarios.scenarioA = scenarioResult;
    log('Scenario A completed');

    return true;
  } catch (error) {
    log(`Scenario A failed: ${error.message}`, 'ERROR');
    scenarioResult.status = 'failed';
    scenarioResult.errors.push(error.message);
    RESULTS.scenarios.scenarioA = scenarioResult;
    RESULTS.errors.push(`Scenario A: ${error.message}`);
    return false;
  }
}

async function scenarioB(page, browser) {
  log('Starting Scenario B: Load many stems concurrency stress');
  const scenarioResult = {
    name: 'Scenario B: Load Many Stems',
    status: 'running',
    timings: {},
    metrics: { peakMemoryMB: 0, peakCpuPercent: 0, stemLoadCount: 0 },
    errors: [],
  };

  try {
    // Start tracing
    const traceFile = path.join(ARTIFACT_DIR, 'v2-trace-load.trace.zip');
    await page.context().tracing.start({ screenshots: true, snapshots: true });

    // Create temp directory with multiple stem files
    log('Preparing stem files for bulk load test');
    const tmpStemsDir = path.join(ARTIFACT_DIR, 'v2-test-stems');
    if (!fs.existsSync(tmpStemsDir)) {
      fs.mkdirSync(tmpStemsDir, { recursive: true });
    }

    // Create multiple WAV files by copying the sample
    const stemCount = 5; // Reduced for practical testing
    const filePaths = [];
    for (let i = 1; i <= stemCount; i++) {
      const stemPath = path.join(tmpStemsDir, `test-stem-${String(i).padStart(2, '0')}.wav`);
      try {
        fs.copyFileSync(SAMPLE_WAV, stemPath);
        filePaths.push(stemPath);
        log(`Created stem file: ${path.basename(stemPath)}`);
      } catch (e) {
        log(`Failed to copy stem file: ${e.message}`, 'WARN');
      }
    }

    // Look for load-stems dropzone
    log(`Uploading ${filePaths.length} stem files`);
    const loadStart = Date.now();

    const loadDropzone = page.locator('[data-testid="load-upload-dropzone"]');
    const fileInput = page.locator('input[type="file"]').last(); // Get last file input (usually for load mode)

    if ((await loadDropzone.count()) > 0 && (await fileInput.count()) > 0) {
      for (const stemPath of filePaths) {
        try {
          await fileInput.setInputFiles(stemPath);
          log(`Uploaded stem: ${path.basename(stemPath)}`);
          scenarioResult.metrics.stemLoadCount++;
          await page.waitForTimeout(500); // Brief pause between uploads
        } catch (e) {
          log(`Failed to upload stem: ${e.message}`, 'WARN');
        }
      }
    } else {
      log('Load-stems dropzone not found, skipping bulk load', 'WARN');
    }

    scenarioResult.timings.bulkLoadMs = Date.now() - loadStart;
    log(`Bulk load took ${scenarioResult.timings.bulkLoadMs}ms for ${scenarioResult.metrics.stemLoadCount} stems`);

    // Check UI responsiveness
    log('Testing UI responsiveness with click events');
    const playButton = page.locator('button:has-text("Play"), [role="button"]:has-text("Play")').first();
    const responseStart = Date.now();
    if ((await playButton.count()) > 0) {
      try {
        await playButton.click({ timeout: 5000 });
        scenarioResult.timings.uiClickResponseMs = Date.now() - responseStart;
        log(`UI response time to click: ${scenarioResult.timings.uiClickResponseMs}ms`);
      } catch (e) {
        log(`UI click timeout or not visible: ${e.message}`, 'WARN');
        scenarioResult.errors.push('UI did not respond to click within 5s');
      }
    }

    // Take screenshot
    const stemsLoadScreenshot = path.join(ARTIFACT_DIR, 'v2-scenario-b-stems-loaded.png');
    await page.screenshot({ path: stemsLoadScreenshot, fullPage: true });
    addArtifact('screenshot', stemsLoadScreenshot);

    // Stop tracing
    await page.context().tracing.stop({ path: traceFile });
    addArtifact('trace', traceFile);
    log(`Saved trace: ${traceFile}`);

    scenarioResult.status = 'completed';
    RESULTS.scenarios.scenarioB = scenarioResult;
    log('Scenario B completed');

    return true;
  } catch (error) {
    log(`Scenario B failed: ${error.message}`, 'ERROR');
    scenarioResult.status = 'failed';
    scenarioResult.errors.push(error.message);
    RESULTS.scenarios.scenarioB = scenarioResult;
    RESULTS.errors.push(`Scenario B: ${error.message}`);
    return false;
  }
}

async function scenarioExports(page, browser) {
  log('Starting Scenario: Exports and Encoding');
  const scenarioResult = {
    name: 'Scenario: Exports and Encoding',
    status: 'running',
    timings: {},
    metrics: { mp3EncodingMs: 0, zipEncodingMs: 0, workerDetected: false },
    exports: [],
    errors: [],
  };

  try {
    // Start tracing
    const traceFile = path.join(ARTIFACT_DIR, 'v2-trace-export.trace.zip');
    await page.context().tracing.start({ screenshots: true, snapshots: true });

    log('Looking for export buttons');
    const exportMp3Button = page.locator('button:has-text("Export"), button:has-text("Download"), [role="button"]:has-text("MP3")').first();
    const exportZipButton = page.locator('button:has-text("Zip"), button:has-text("Stems"), [role="button"]:has-text("ZIP")').first();

    // Try MP3 export
    if ((await exportMp3Button.count()) > 0) {
      log('Found export button, starting export');
      const mp3Start = Date.now();

      // Listen for downloads
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      
      try {
        await exportMp3Button.click();
      } catch (e) {
        log(`Could not click export button: ${e.message}`, 'WARN');
      }

      const download = await downloadPromise;
      scenarioResult.timings.mp3EncodingMs = Date.now() - mp3Start;
      log(`Export took ${scenarioResult.timings.mp3EncodingMs}ms`);

      if (download) {
        const downloadPath = path.join(ARTIFACT_DIR, 'v2-export-master.mp3');
        try {
          await download.saveAs(downloadPath);
          const fileSize = fs.statSync(downloadPath).size;
          scenarioResult.exports.push({
            type: 'mp3',
            path: downloadPath,
            sizeBytes: fileSize,
          });
          addArtifact('export', downloadPath);
          log(`MP3 export saved: ${path.basename(downloadPath)} (${fileSize} bytes)`);
        } catch (e) {
          log(`Failed to save MP3: ${e.message}`, 'WARN');
        }
      }
    } else {
      log('No export button found on current page', 'WARN');
    }

    // Take screenshot
    const exportsScreenshot = path.join(ARTIFACT_DIR, 'v2-scenario-exports.png');
    await page.screenshot({ path: exportsScreenshot, fullPage: true });
    addArtifact('screenshot', exportsScreenshot);

    // Stop tracing
    await page.context().tracing.stop({ path: traceFile });
    addArtifact('trace', traceFile);
    log(`Saved trace: ${traceFile}`);

    scenarioResult.status = 'completed';
    RESULTS.scenarios.scenarioExports = scenarioResult;
    log('Scenario Exports completed');

    return true;
  } catch (error) {
    log(`Scenario Exports failed: ${error.message}`, 'ERROR');
    scenarioResult.status = 'failed';
    scenarioResult.errors.push(error.message);
    RESULTS.scenarios.scenarioExports = scenarioResult;
    RESULTS.errors.push(`Scenario Exports: ${error.message}`);
    return false;
  }
}

async function collectConsoleLogsAndErrors(page) {
  log('Setting up console and error logging');
  const consoleLogs = [];
  const pageErrors = [];

  page.on('console', (message) => {
    const entry = {
      type: message.type(),
      text: message.text(),
      timestamp: new Date().toISOString(),
    };
    consoleLogs.push(entry);
    if (message.type() === 'error' || message.type() === 'warning') {
      if (!message.text().includes('AudioContext')) { // Skip common AudioContext warnings
        log(`Browser ${message.type()}: ${message.text()}`);
      }
    }
  });

  page.on('pageerror', (error) => {
    const entry = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };
    pageErrors.push(entry);
    log(`Page error: ${error.message}`, 'ERROR');
  });

  return { consoleLogs, pageErrors };
}

async function main() {
  let browser;
  try {
    log('======================================');
    log('Burnt Beats E2E Workload Test (v2)');
    log('======================================');

    // Step 1: Test server reachability
    const serverOk = await testServerReachability();
    if (!serverOk) {
      log('Server is not reachable, aborting tests', 'ERROR');
      RESULTS.status = 'failed';
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'v2-results.json'),
        JSON.stringify(RESULTS, null, 2)
      );
      process.exit(1);
    }

    // Step 2: Launch browser
    log('Launching Chromium browser');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Enable detailed logging
    const { consoleLogs, pageErrors } = await collectConsoleLogsAndErrors(page);

    // Run scenarios
    log('Running test scenarios');
    await scenarioA(page, browser);
    await page.reload();
    await page.waitForTimeout(3000);
    await scenarioB(page, browser);
    await page.reload();
    await page.waitForTimeout(3000);
    await scenarioExports(page, browser);

    // Save logs
    const logsFile = path.join(ARTIFACT_DIR, 'v2-console-logs.json');
    fs.writeFileSync(
      logsFile,
      JSON.stringify({ 
        consoleLogs: consoleLogs.filter(l => !l.text.includes('AudioContext')), 
        pageErrors 
      }, null, 2)
    );
    addArtifact('logs', logsFile);
    log(`Saved console logs: ${path.basename(logsFile)}`);

    // Cleanup
    await context.close();
    await browser.close();

    RESULTS.status = 'completed';
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'ERROR');
    RESULTS.status = 'failed';
    RESULTS.errors.push(`Fatal: ${error.message}`);
    if (browser) await browser.close();
  } finally {
    // Save results
    const resultsFile = path.join(ARTIFACT_DIR, 'v2-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(RESULTS, null, 2));
    addArtifact('results', resultsFile);

    log('======================================');
    log(`Test execution completed at ${new Date().toISOString()}`);
    log(`Results saved to: ${resultsFile}`);
    log(`Artifacts: ${RESULTS.artifacts.length} files`);
    log('======================================');
    console.log(JSON.stringify(RESULTS, null, 2));
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
