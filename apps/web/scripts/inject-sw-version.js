#!/usr/bin/env node

/* eslint-disable no-undef */
/**
 * Inject cache version into service worker
 * This script replaces __CACHE_VERSION__ placeholder with current timestamp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swSourcePath = path.join(__dirname, '../public/sw.js');
const swBuildPath = path.join(__dirname, '../build/client/sw.js');

// Generate cache version from timestamp
const cacheVersion = Date.now().toString();

try {
  // Read source service worker
  let swContent = fs.readFileSync(swSourcePath, 'utf-8');

  // Replace placeholder with actual version
  swContent = swContent.replace(/__CACHE_VERSION__/g, cacheVersion);

  // Write versioned service worker to build output
  // (Vite should have already created the build/client directory)
  fs.writeFileSync(swBuildPath, swContent);

  console.log(`[SW] Service worker cache version: ${cacheVersion}`);
  console.log(`[SW] Updated service worker written to: ${swBuildPath}`);
} catch (error) {
  console.error('[SW] Failed to inject cache version:', error);
  process.exit(1);
}
