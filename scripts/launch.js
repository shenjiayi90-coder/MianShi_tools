#!/usr/bin/env node
/**
 * Cross-platform Electron launcher.
 *
 * The original scripts were:
 *   "start": "env -u ELECTRON_RUN_AS_NODE electron ."
 *   "dev":   "env -u ELECTRON_RUN_AS_NODE electron . --no-sandbox --disable-gpu"
 *
 * `env` is a Unix utility. On Windows `npm start` therefore fails outright with
 * "'env' is not recognized as an internal or external command", which makes the
 * documented quick-start path unusable on the platform the app ships NSIS
 * installers for.
 *
 * This launcher does the same job in Node, so it behaves identically on
 * Windows, macOS and Linux:
 *   - removes ELECTRON_RUN_AS_NODE, which makes the electron binary boot as
 *     plain Node instead of a GUI app (symptom: "Cannot read properties of
 *     undefined (reading 'commandLine')" in main.js)
 *   - forwards any extra CLI flags through to Electron
 *
 * Usage: node scripts/launch.js [electron flags...]
 */
const { spawn } = require('child_process');
const path = require('path');

const electronBinary = require('electron');

// Must be deleted rather than set to '' — an empty string is still "present"
// for Electron's purposes in some shells.
delete process.env.ELECTRON_RUN_AS_NODE;

const projectRoot = path.join(__dirname, '..');
const extraArgs = process.argv.slice(2);

const child = spawn(electronBinary, [projectRoot, ...extraArgs], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: false
});

child.on('error', (error) => {
  console.error(`Failed to launch Electron: ${error.message}`);
  console.error('If Electron is not installed, run: npm install');
  process.exit(1);
});

child.on('close', (code, signal) => {
  if (signal) {
    // Ctrl+C and friends: mirror the conventional 130 so callers can detect it.
    process.exit(signal === 'SIGINT' ? 130 : 1);
  }
  process.exit(code === null ? 0 : code);
});

// Forward termination signals so Ctrl+C stops the app rather than orphaning it.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
