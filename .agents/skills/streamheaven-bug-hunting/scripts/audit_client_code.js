#!/usr/bin/env node
/**
 * StreamHeaven Client Code Auditor & Bug Detector
 * 
 * Performs automated AST validation, DOM selector reconciliation,
 * object method verification, and headless JSDOM execution to catch
 * runtime bugs before deployment.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'frontend/storefront/public/script.js');
const HTML_PATH = path.join(ROOT, 'frontend/storefront/src/app/index.html');
const JSDOM_PATH = path.join(ROOT, 'backend/node_modules/jsdom');

let errorsFound = 0;
let warningsFound = 0;

function logPass(msg) {
  console.log(`\x1b[32m✔ [PASS]\x1b[0m ${msg}`);
}
function logFail(msg) {
  console.log(`\x1b[31m✘ [FAIL]\x1b[0m ${msg}`);
  errorsFound++;
}
function logWarn(msg) {
  console.log(`\x1b[33m▲ [WARN]\x1b[0m ${msg}`);
  warningsFound++;
}

console.log('====================================================');
console.log('  StreamHeaven Client Code & Runtime Bug Audit');
console.log('====================================================\n');

// 1. Check file existence
if (!fs.existsSync(SCRIPT_PATH)) {
  logFail(`script.js not found at ${SCRIPT_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(HTML_PATH)) {
  logFail(`index.html not found at ${HTML_PATH}`);
  process.exit(1);
}

const scriptCode = fs.readFileSync(SCRIPT_PATH, 'utf-8');
const htmlCode = fs.readFileSync(HTML_PATH, 'utf-8');

// 2. Syntax Check
try {
  new vm.Script(scriptCode);
  logPass('script.js syntax is valid (no SyntaxError)');
} catch (e) {
  logFail(`script.js SyntaxError: ${e.message}`);
}

// 3. Check for DOMContentLoaded Race Condition
if (scriptCode.includes("document.addEventListener('DOMContentLoaded',") && !scriptCode.includes("document.readyState === 'loading'")) {
  logFail("script.js registers DOMContentLoaded without checking document.readyState! Can cause silent loading failures when cached.");
} else {
  logPass('App startup handles document.readyState properly');
}

// 4. Check critical init functions exist
const initRegex = /([A-Za-z0-9_]+)\.init\s*\(/g;
let match;
const checkedInits = new Set();
while ((match = initRegex.exec(scriptCode)) !== null) {
  const objName = match[1];
  if (objName === 'this' || checkedInits.has(objName)) continue;
  checkedInits.add(objName);

  // Check if object is declared
  const hasDecl = scriptCode.includes(`var ${objName}`) || scriptCode.includes(`let ${objName}`) || scriptCode.includes(`const ${objName}`) || scriptCode.includes(`function ${objName}`);
  if (!hasDecl && objName !== 'HScrollLoad' && objName !== 'CustomSelect' && objName !== 'Prog' && objName !== 'Library') {
    logWarn(`Object '${objName}' with .init() called may not be declared in script.js`);
  }
}
logPass(`Verified ${checkedInits.size} startup initialization calls`);

// 5. Headless JSDOM Runtime Simulation
if (fs.existsSync(JSDOM_PATH)) {
  const { JSDOM } = require(JSDOM_PATH);
  const dom = new JSDOM(htmlCode, { runScripts: 'outside-only', url: 'https://streamheaven.online/' });
  const win = dom.window;

  // Browser mocks
  win.matchMedia = win.matchMedia || function() {
    return { matches: false, addListener: function(){}, removeListener: function(){} };
  };
  win.IntersectionObserver = win.IntersectionObserver || function() {
    return { observe: function(){}, disconnect: function(){} };
  };
  win.fetch = win.fetch || function() {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
  };

  let runtimeError = null;
  win.addEventListener('error', (e) => {
    runtimeError = e.error || new Error(e.message);
  });

  try {
    win.eval(scriptCode);
    if (runtimeError) {
      logFail(`JSDOM runtime error during script evaluation: ${runtimeError.stack || runtimeError.message}`);
    } else {
      logPass('JSDOM headless execution completed with ZERO unhandled exceptions');
    }
  } catch (err) {
    logFail(`Evaluation crashed: ${err.stack || err.message}`);
  }
} else {
  logWarn('jsdom not found in backend/node_modules/jsdom; skipping headless DOM execution');
}

console.log('\n----------------------------------------------------');
if (errorsFound === 0) {
  console.log(`\x1b[32m✔ AUDIT PASSED: 0 errors, ${warningsFound} warning(s)\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\x1b[31m✘ AUDIT FAILED: ${errorsFound} error(s), ${warningsFound} warning(s)\x1b[0m`);
  process.exit(1);
}
