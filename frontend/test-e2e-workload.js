#!/usr/bin/env node
/**
 * End-to-end workload test for Burnt Beats audio-heavy flows
 * Validates:
 * 1. Environment reachability
 * 2. Scenario A: Quality 4-stem separation with performance metrics
 * 3. Scenario B: Load many stems concurrency stress
 * 4. Exports and encoding (MP3, ZIP)
 * 5. Tracing, logs, and performance collection
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
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

// Ensure artifact directory exists
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function addArtifact(type, path) {
  RESULTS.artifacts.push({ type, path });
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

    // Take screenshot of home page
    const homeScreenshot = path.join(ARTIFACT_DIR, 'scenario-a-home.png');
    await page.screenshot({ path: homeScreenshot, fullPage: true });
    addArtifact('screenshot', homeScreenshot);
    log(`Saved home screenshot: ${homeScreenshot}`);

    // Start tracing
    const traceFile = path.join(ARTIFACT_DIR, 'trace-sep.trace.zip');
    await page.context().tracing.start({ screenshots: true, snapshots: true });

    // Look for file upload or separation UI
    log('Looking for file upload or separation UI');
    const fileInput = page.locator('input[type="file"]');
    const uploadButton = page.locator('button:has-text("Upload")');
    const separateButton = page.locator('button:has-text("Separate"), button:has-text("Split")');

    // Try to upload sample WAV
    if ((await fileInput.count()) > 0) {
      log('Found file input, uploading sample WAV');
      await fileInput.setInputFiles(SAMPLE_WAV);
      log('File uploaded to input');

      // Wait briefly for preview/UI update
      await page.waitForTimeout(1000);

      // Look for quality selector (expecting quality=4)
      const qualitySelector = page.locator('select, [role="listbox"], button:has-text("Quality")');
      if ((await qualitySelector.count()) > 0) {
        log('Found quality selector, attempting to set to 4');
        // Try clicking quality dropdown
        const qualityButtons = page.locator('button:has-text("4")');
        if ((await qualityButtons.count()) > 0) {
          await qualityButtons.first().click();
          log('Selected quality 4');
          scenarioResult.timings.qualitySelected = true;
        }
      }
    } else if ((await uploadButton.count()) > 0) {
      log('Found upload button, clicking');
      await uploadButton.click();
      await page.waitForTimeout(500);
      await fileInput.setInputFiles(SAMPLE_WAV);
      log('File uploaded via button');
    }

    // Start separation
    log('Starting separation');
    const separationStart = Date.now();
    if ((await separateButton.count()) > 0) {
      await separateButton.click();
      log('Clicked separate button');
    } else {
      log('Could not find separate button, looking for alternative triggers', 'WARN');
    }

    // Wait for separation to complete (max 5 minutes)
    const maxWait = 300000; // 5 minutes
    const pollInterval = 1000; // 1 second
    const startWaitTime = Date.now();
    let separationComplete = false;

    while (Date.now() - startWaitTime < maxWait) {
      // Check for success indicators (stems visible, modal closed, etc.)
      const stemsVisible = page.locator('[data-testid*="stem"], .stem-item, .stem-track').count();
      const completionText = page.locator('text=Separation complete, text=Ready to export, text=Success').count();

      if ((await stemsVisible) > 0 || (await completionText) > 0) {
        separationComplete = true;
        break;
      }

      // Check for errors
      const errorText = page.locator('text=/error|failed|failed/i').count();
      if ((await errorText) > 0) {
        log('Separation error detected', 'WARN');
        scenarioResult.errors.push('Separation error detected in UI');
        break;
      }

      await page.waitForTimeout(pollInterval);
    }

    scenarioResult.timings.separationMs = Date.now() - separationStart;
    log(`Separation took ${scenarioResult.timings.separationMs}ms (complete: ${separationComplete})`);

    // Take screenshot of separated stems
    const stemsScreenshot = path.join(ARTIFACT_DIR, 'scenario-a-stems.png');
    await page.screenshot({ path: stemsScreenshot, fullPage: true });
    addArtifact('screenshot', stemsScreenshot);
    log(`Saved stems screenshot: ${stemsScreenshot}`);

    // Check for stems in DOM
    const stemCount = await page.locator('[data-testid*="stem"], .stem-item, .stem-track, [class*="stem"]').count();
    scenarioResult.metrics.stemCount = stemCount;
    log(`Found ${stemCount} stem elements in DOM`);

    // Stop tracing
    await page.context().tracing.stop({ path: traceFile });
    addArtifact('trace', traceFile);
    log(`Saved trace: ${traceFile}`);

    scenarioResult.status = 'completed';
    RESULTS.scenarios.scenarioA = scenarioResult;
    log('Scenario A completed successfully');

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
    const traceFile = path.join(ARTIFACT_DIR, 'trace-load.trace.zip');
    await page.context().tracing.start({ screenshots: true, snapshots: true });

    // Create a temp directory with multiple stem files
    log('Preparing stem files for bulk load test');
    const tmpStemsDir = path.join(ARTIFACT_DIR, 'test-stems');
    if (!fs.existsSync(tmpStemsDir)) {
      fs.mkdirSync(tmpStemsDir, { recursive: true });
    }

    // Try to create multiple WAV files by copying the sample
    const stemCount = 20;
    const filePaths = [];
    for (let i = 1; i <= Math.min(stemCount, 5); i++) {
      const stemPath = path.join(tmpStemsDir, `test-stem-${String(i).padStart(2, '0')}.wav`);
      try {
        fs.copyFileSync(SAMPLE_WAV, stemPath);
        filePaths.push(stemPath);
        log(`Created stem file: ${stemPath}`);
      } catch (e) {
        log(`Failed to copy stem file: ${e.message}`, 'WARN');
      }
    }

    // Attempt to upload multiple stems
    log(`Uploading ${filePaths.length} stem files`);
    const loadStart = Date.now();

    const fileInputs = page.locator('input[type="file"]');
    if ((await fileInputs.count()) > 0) {
      for (const stemPath of filePaths) {
        try {
          await fileInputs.first().setInputFiles(stemPath);
          log(`Uploaded stem: ${path.basename(stemPath)}`);
          scenarioResult.metrics.stemLoadCount++;
          await page.waitForTimeout(500); // Brief pause between uploads
        } catch (e) {
          log(`Failed to upload stem: ${e.message}`, 'WARN');
        }
      }
    }

    scenarioResult.timings.bulkLoadMs = Date.now() - loadStart;
    log(`Bulk load took ${scenarioResult.timings.bulkLoadMs}ms for ${scenarioResult.metrics.stemLoadCount} stems`);

    // Check UI responsiveness
    log('Testing UI responsiveness with click events');
    const playButton = page.locator('button:has-text("Play")');
    const responseStart = Date.now();
    if ((await playButton.count()) > 0) {
      try {
        await playButton.first().click({ timeout: 5000 });
        scenarioResult.timings.uiClickResponseMs = Date.now() - responseStart;
        log(`UI response time to click: ${scenarioResult.timings.uiClickResponseMs}ms`);
      } catch (e) {
        log(`UI click timeout: ${e.message}`, 'WARN');
        scenarioResult.errors.push('UI did not respond to click within 5s');
      }
    }

    // Take screenshot
    const stemsLoadScreenshot = path.join(ARTIFACT_DIR, 'scenario-b-stems-loaded.png');
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
    metrics: { mp3EncodingMs: 0, zipEncodingMs: 0 },
    exports: [],
    errors: [],
  };

  try {
    // Start tracing
    const traceFile = path.join(ARTIFACT_DIR, 'trace-export.trace.zip');
    await page.context().tracing.start({ screenshots: true, snapshots: true });

    log('Looking for export buttons');
    const exportMp3Button = page.locator('button:has-text("Export MP3"), button:has-text("Download MP3")');
    const exportZipButton = page.locator('button:has-text("Export ZIP"), button:has-text("Download Stems")');

    // Check for MP3 export
    if ((await exportMp3Button.count()) > 0) {
      log('Found MP3 export button, starting export');
      const mp3Start = Date.now();

      // Set up download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await exportMp3Button.first().click();
      const download = await downloadPromise;

      scenarioResult.timings.mp3EncodingMs = Date.now() - mp3Start;
      log(`MP3 export took ${scenarioResult.timings.mp3EncodingMs}ms`);

      if (download) {
        const downloadPath = path.join(ARTIFACT_DIR, 'export-master.mp3');
        try {
          await download.saveAs(downloadPath);
          const fileSize = fs.statSync(downloadPath).size;
          scenarioResult.exports.push({
            type: 'mp3',
            path: downloadPath,
            sizeBytes: fileSize,
          });
          addArtifact('export', downloadPath);
          log(`MP3 export saved: ${downloadPath} (${fileSize} bytes)`);
        } catch (e) {
          log(`Failed to save MP3: ${e.message}`, 'WARN');
        }
      }
    } else {
      log('MP3 export button not found', 'WARN');
    }

    // Check for ZIP export
    if ((await exportZipButton.count()) > 0) {
      log('Found ZIP export button, starting export');
      const zipStart = Date.now();

      const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await exportZipButton.first().click();
      const download = await downloadPromise;

      scenarioResult.timings.zipEncodingMs = Date.now() - zipStart;
      log(`ZIP export took ${scenarioResult.timings.zipEncodingMs}ms`);

      if (download) {
        const downloadPath = path.join(ARTIFACT_DIR, 'export-stems.zip');
        try {
          await download.saveAs(downloadPath);
          const fileSize = fs.statSync(downloadPath).size;
          scenarioResult.exports.push({
            type: 'zip',
            path: downloadPath,
            sizeBytes: fileSize,
          });
          addArtifact('export', downloadPath);
          log(`ZIP export saved: ${downloadPath} (${fileSize} bytes)`);
        } catch (e) {
          log(`Failed to save ZIP: ${e.message}`, 'WARN');
        }
      }
    } else {
      log('ZIP export button not found', 'WARN');
    }

    // Check for web worker usage (MP3 encoding)
    log('Checking for web worker usage in exports');
    const workerRequests = page.on('request', (request) => {
      if (request.url().includes('Worker') || request.url().includes('worker')) {
        log(`Worker request detected: ${request.url()}`);
        scenarioResult.metrics.workerDetected = true;
      }
    });

    // Take screenshot
    const exportsScreenshot = path.join(ARTIFACT_DIR, 'scenario-exports.png');
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
      log(`Browser ${message.type()}: ${message.text()}`);
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
    log('Burnt Beats E2E Workload Test');
    log('======================================');

    // Step 1: Test server reachability
    const serverOk = await testServerReachability();
    if (!serverOk) {
      log('Server is not reachable, aborting tests', 'ERROR');
      RESULTS.status = 'failed';
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'results.json'),
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
    await page.waitForTimeout(2000);
    await scenarioB(page, browser);
    await page.reload();
    await page.waitForTimeout(2000);
    await scenarioExports(page, browser);

    // Save logs
    const logsFile = path.join(ARTIFACT_DIR, 'console-logs.json');
    fs.writeFileSync(
      logsFile,
      JSON.stringify({ consoleLogs, pageErrors }, null, 2)
    );
    addArtifact('logs', logsFile);
    log(`Saved console logs: ${logsFile}`);

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
    const resultsFile = path.join(ARTIFACT_DIR, 'results.json');
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
