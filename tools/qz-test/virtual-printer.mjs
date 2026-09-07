#!/usr/bin/env node
/**
 * A fake 80mm thermal printer, for testing receipts without hardware.
 *
 * Creates a CUPS raw queue that forwards to a local socket, captures every
 * byte the print path sends, and reports what actually reached the "printer":
 * page count, page size, and where the ink sits on the paper.
 *
 *   node tools/qz-test/virtual-printer.mjs setup     # create the queue + start capturing
 *   node tools/qz-test/virtual-printer.mjs report    # inspect what was captured
 *   node tools/qz-test/virtual-printer.mjs teardown  # remove the queue
 *
 * Linux/macOS (CUPS) only. On Windows, test against "Microsoft Print to PDF"
 * instead - see QZ_TRAY_SETUP.md.
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const QUEUE = 'XP-80C-Thermal-80mm-TEST';
const PORT = 9100;
const OUT_DIR = path.join(os.tmpdir(), 'qz-test-jobs');

/** ESC/POS "feed to cutter and partial cut" - what the app sends after a slip. */
const CUT = Buffer.from([0x1d, 0x56, 0x42, 0x00]);

function capture() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let n = fs.readdirSync(OUT_DIR).length;

  net
    .createServer((socket) => {
      const file = path.join(OUT_DIR, `job-${String(++n).padStart(3, '0')}.bin`);
      const out = fs.createWriteStream(file);
      socket.pipe(out);
      socket.on('close', () => out.end(() => console.log(`captured ${path.basename(file)}`)));
      socket.on('error', () => socket.destroy());
    })
    .listen(PORT, '127.0.0.1', () => {
      console.log(`Virtual printer "${QUEUE}" is capturing to ${OUT_DIR}`);
      console.log('Print from the app, then run:  node tools/qz-test/virtual-printer.mjs report');
      console.log('Ctrl+C to stop.');
    });
}

function setup() {
  try {
    execFileSync('lpadmin', ['-p', QUEUE, '-E', '-v', `socket://127.0.0.1:${PORT}`, '-m', 'raw'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    console.error('Could not create the CUPS queue. Are you in the "lpadmin" group?');
    console.error(String(err.stderr || err.message).trim());
    process.exit(1);
  }
  console.log(`Created queue ${QUEUE}. Restart QZ Tray so it picks the queue up.`);
  capture();
}

function teardown() {
  try {
    execFileSync('lpadmin', ['-x', QUEUE], { stdio: 'ignore' });
    console.log(`Removed queue ${QUEUE}.`);
  } catch {
    console.log(`Queue ${QUEUE} was not present.`);
  }
}

/** Page geometry straight out of the PostScript the driver received. */
function describe(buffer) {
  const text = buffer.toString('latin1');
  const pages = (text.match(/\n%%Page:/g) || []).length;
  const size = text.match(/\/PageSize \[([\d.]+) ([\d.]+)\]/);
  if (!size) return { pages, widthMm: null, heightMm: null };
  return {
    pages,
    widthMm: (parseFloat(size[1]) / 72) * 25.4,
    heightMm: (parseFloat(size[2]) / 72) * 25.4,
  };
}

function report() {
  if (!fs.existsSync(OUT_DIR) || !fs.readdirSync(OUT_DIR).length) {
    console.log(`Nothing captured yet in ${OUT_DIR}.`);
    return;
  }

  let failures = 0;

  for (const name of fs.readdirSync(OUT_DIR).sort()) {
    const buffer = fs.readFileSync(path.join(OUT_DIR, name));

    if (buffer.equals(CUT)) {
      console.log(`${name}  CUT  ${buffer.toString('hex')}  (ESC/POS GS V B 0)`);
      continue;
    }

    const { pages, widthMm, heightMm } = describe(buffer);
    if (widthMm === null) {
      console.log(`${name}  ${buffer.length} bytes, no PostScript page size found`);
      continue;
    }

    const onePage = pages === 1;
    const rightWidth = Math.abs(widthMm - 80) < 1;
    if (!onePage || !rightWidth) failures++;

    console.log(
      `${name}  ${onePage ? 'OK ' : 'BAD'}  pages=${pages}  ` +
        `page ${widthMm.toFixed(1)} x ${heightMm.toFixed(1)} mm` +
        (onePage ? '' : '   <-- receipt split across pages') +
        (rightWidth ? '' : '   <-- not 80mm wide'),
    );
  }

  console.log(
    failures
      ? `\n${failures} job(s) failed the one-page / 80mm check.`
      : '\nAll receipts printed as a single 80mm-wide page.',
  );
}

const command = process.argv[2];
if (command === 'setup') setup();
else if (command === 'watch') capture();
else if (command === 'report') report();
else if (command === 'teardown') teardown();
else {
  console.log('usage: node tools/qz-test/virtual-printer.mjs <setup|watch|report|teardown>');
  process.exit(1);
}
