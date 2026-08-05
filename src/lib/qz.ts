import qz from 'qz-tray';

/**
 * QZ Tray integration for direct thermal printing.
 *
 * Everything here assumes an 80mm receipt printer connected to the Windows
 * machine that runs QZ Tray. Nothing in this file ever calls window.print().
 */

/** Physical paper width of the roll, in millimetres. */
export const PAPER_WIDTH_MM = 80;

/**
 * Reference width, in CSS pixels, used when laying the receipt out offscreen.
 * The receipt stylesheet is written in viewport-relative units, so this only
 * sets the layout resolution. 302px == 80mm at 96dpi.
 */
const MEASURE_WIDTH_PX = 302;

/**
 * Rasterisation density. 203dpi is the native resolution of every common 80mm
 * thermal head, so the bitmap lands on the paper without resampling.
 */
const RENDER_DPI = 203;
const RENDER_SCALE = RENDER_DPI / 96;

/**
 * Slack added after the last line, in millimetres, when falling back to QZ's
 * own HTML renderer. That renderer lays text out with slightly different
 * metrics than Chrome, so the page needs a hair of room to avoid clipping.
 * The bitmap path does not use this: there the page is the image.
 */
const HEIGHT_TOLERANCE_MM = 0.5;

/**
 * Further slack for that same fallback, as a share of the content height.
 *
 * The two renderers disagree per line box, not per receipt, so the gap between
 * the height measured here and the height QZ actually lays out grows with the
 * number of rows: a flat 0.5mm covers a short slip and comes up short on a long
 * one. Undershooting pushes the tail onto a second page as tall as the receipt
 * itself, so a couple of millimetres of blank paper is the cheaper mistake.
 * Only the fallback needs this - the bitmap path prints the very image it
 * measured, so there is no second engine to disagree with.
 */
const HEIGHT_TOLERANCE_RATIO = 0.02;

/**
 * Largest canvas edge Chrome will allocate. A receipt with a few hundred lines
 * reaches it at 203dpi, and the failure matters: renderReceiptBitmap() would
 * throw on exactly the long receipts that need it most, dropping them into the
 * HTML fallback above - the path whose text metrics leave the blank tail.
 * Rasterising a very long slip slightly below the head's native density is a
 * far better trade than losing the exact-height guarantee.
 */
const MAX_CANVAS_EDGE_PX = 16384;

/**
 * Safety buffer under the bitmap, in millimetres, so the cut never clips the
 * last line. Two dots at 203dpi - small enough to read as no gap at all.
 */
const BITMAP_HEIGHT_BUFFER_MM = 0.5;

/**
 * Cut the paper immediately after the last line of the receipt.
 *
 * The command goes out as a raw follow-up job to the same printer the slip was
 * rendered on, so the cutter fires as soon as the last line clears the head -
 * no trailing blank paper. It is only sent to printers that look like ESC/POS
 * thermal units (see `supportsAutoCut`), because a driver that does not pass
 * raw bytes through would print the command as stray characters instead.
 */
const AUTO_CUT = true;

/**
 * ESC/POS "feed to cutter and partial cut" (GS V B 0). Function B feeds only
 * the few millimetres between the print head and the blade, which is the
 * closest a thermal printer can physically cut to the last printed line.
 */
const CUT_COMMAND = '\x1D\x56\x42\x00';

const PREFERRED_PRINTER_KEY = 'qz.preferredPrinter';
const AUTO_CUT_KEY = 'qz.autoCut';

/**
 * Name fragments common to 80mm thermal printers, most specific first. Used to
 * auto-detect the receipt printer when the user has not picked one.
 */
const THERMAL_HINTS = [
  '80mm',
  'thermal',
  'receipt',
  'pos-80',
  'pos80',
  'pos-58',
  'xp-80',
  'xprinter',
  'rp80',
  'tm-t',
  'tm-u',
  'epson tm',
  'star tsp',
  'bixolon',
  'srp-',
  'zj-',
  'gp-',
  'pos',
];

export type QzErrorCode =
  | 'not-running'
  | 'no-printer'
  | 'measure-failed'
  | 'print-failed';

export class QzError extends Error {
  code: QzErrorCode;
  cause?: unknown;

  constructor(code: QzErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'QzError';
    this.code = code;
    this.cause = cause;
  }
}

let apiConfigured = false;
let connecting: Promise<void> | null = null;

/**
 * True only once QZ has finished its handshake. This is deliberately not
 * qz.websocket.isActive(): that returns true while the socket is still
 * CONNECTING, and QZ only attaches its send machinery when the socket opens,
 * so anything sent during that window dies with "sendData is not a function".
 */
let established = false;

/** Serialises print jobs so two clicks can never interleave on one printer. */
let jobQueue: Promise<unknown> = Promise.resolve();

const ALREADY_OPEN = /already exists/i;
const HANDSHAKE_IN_FLIGHT = /has not returned yet|previous disconnect/i;

const CONNECT_ROUNDS = 3;
const CONNECT_RETRY_DELAY_MS = 300;

/**
 * Hard ceiling on the whole handshake. QZ cycles four ports across two hosts
 * per attempt, and an unreachable host can sit there for seconds, so without
 * this the cashier would wait minutes for "QZ Tray is not running".
 */
const CONNECT_TIMEOUT_MS = 8000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function configureApi() {
  if (apiConfigured) return;
  apiConfigured = true;

  // The npm build ships without a Promise implementation bound.
  qz.api.setPromiseType((resolver) => new Promise(resolver as ConstructorParameters<typeof Promise>[0]));

  // A dropped connection must invalidate the handshake, or the next print
  // would send on a dead socket.
  qz.websocket.setClosedCallbacks(() => {
    established = false;
  });

  const certUrl = import.meta.env.VITE_QZ_CERT_URL;
  const signUrl = import.meta.env.VITE_QZ_SIGN_URL;

  // Optional: signed requests. Without these the client runs unsigned and QZ
  // Tray shows a one-time "Allow" prompt that the operator can remember.
  if (certUrl && signUrl) {
    qz.security.setCertificatePromise((resolve, reject) => {
      fetch(certUrl, { cache: 'no-store' })
        .then((r) => r.text())
        .then(resolve)
        .catch(reject);
    });

    qz.security.setSignatureAlgorithm('SHA512');

    qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
      fetch(`${signUrl}?request=${encodeURIComponent(toSign)}`, { cache: 'no-store' })
        .then((r) => r.text())
        .then(resolve)
        .catch(reject);
    });
  }
}

/** True when the handshake with QZ Tray has completed and calls can be sent. */
export function isConnected(): boolean {
  return established && qz.websocket.isActive();
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function notRunning(cause?: unknown) {
  return new QzError(
    'not-running',
    'Could not reach QZ Tray. Make sure QZ Tray is installed and running on this computer, then try again.',
    cause,
  );
}

/**
 * Try to open the socket. QZ picks secure ports on https pages and insecure
 * ones on http pages; the explicit insecure pass covers installs where the
 * secure certificate is not trusted by the browser.
 */
async function attemptConnections(): Promise<void> {
  let lastError: unknown;

  for (let round = 0; round < CONNECT_ROUNDS; round++) {
    for (const options of [{}, { usingSecure: false, host: ['localhost'] }]) {
      try {
        await qz.websocket.connect(options);
        return;
      } catch (err) {
        lastError = err;
        const message = messageOf(err);

        // Someone else already opened it - nothing left to do.
        if (ALREADY_OPEN.test(message)) return;

        // A handshake is mid-flight (ours or a stale one): wait it out rather
        // than talking to a socket that has not opened yet.
        if (HANDSHAKE_IN_FLIGHT.test(message)) break;
      }
    }

    await sleep(CONNECT_RETRY_DELAY_MS);
  }

  throw notRunning(lastError);
}

async function openSocket(): Promise<void> {
  let timer: ReturnType<typeof setTimeout>;

  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(notRunning(new Error('Connection attempt timed out'))), CONNECT_TIMEOUT_MS);
  });

  try {
    await Promise.race([attemptConnections(), expiry]);
  } catch (err) {
    // Cancel whatever socket QZ left half-open, so the next attempt starts clean.
    qz.websocket.disconnect().catch(() => undefined);
    throw err;
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Open (or reuse) the websocket connection to QZ Tray. Concurrent callers all
 * await the same handshake - none of them proceeds until the socket is fully
 * open.
 */
export function connect(): Promise<void> {
  configureApi();

  // Order matters: an in-flight handshake must be awaited before the
  // "already connected" shortcut is considered.
  if (connecting) return connecting;
  if (isConnected()) return Promise.resolve();

  connecting = openSocket()
    .then(() => {
      established = true;
    })
    .catch((err) => {
      established = false;
      throw err;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

/** Close the websocket. Safe to call when already disconnected. */
export async function disconnect(): Promise<void> {
  established = false;
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

/** Run `task` after every print job queued before it has finished. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = jobQueue.then(task, task);
  jobQueue = result.catch(() => undefined);
  return result;
}

/** Every printer installed on the machine running QZ Tray. */
export async function listPrinters(): Promise<string[]> {
  await connect();
  const found = await qz.printers.find();
  return Array.isArray(found) ? found : found ? [found] : [];
}

export function getPreferredPrinter(): string | null {
  try {
    return localStorage.getItem(PREFERRED_PRINTER_KEY);
  } catch {
    return null;
  }
}

/** Pin a specific printer. Pass null to go back to auto-detection. */
export function setPreferredPrinter(name: string | null): void {
  try {
    if (name) localStorage.setItem(PREFERRED_PRINTER_KEY, name);
    else localStorage.removeItem(PREFERRED_PRINTER_KEY);
  } catch {
    /* storage disabled - fall back to auto-detection */
  }
}

function scoreThermal(name: string): number {
  const lower = name.toLowerCase();
  const index = THERMAL_HINTS.findIndex((hint) => lower.includes(hint));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Force the cutter on or off for this machine, overriding the name-based
 * detection below. Pass null to go back to auto. Use 'off' for the rare driver
 * that swallows raw bytes and prints the cut command as characters.
 */
export function setAutoCutOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(AUTO_CUT_KEY);
    else localStorage.setItem(AUTO_CUT_KEY, value ? 'on' : 'off');
  } catch {
    /* storage disabled - fall back to detection */
  }
}

export function getAutoCutOverride(): boolean | null {
  try {
    const stored = localStorage.getItem(AUTO_CUT_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether to send the ESC/POS cut to this printer. An operator override wins;
 * otherwise a thermal-looking printer name is taken as "has a cutter", which
 * covers every 80mm receipt printer this app targets. Anything else (an office
 * laser picked as fallback) never receives raw bytes.
 */
export function supportsAutoCut(printerName: string): boolean {
  if (!AUTO_CUT) return false;
  const override = getAutoCutOverride();
  if (override !== null) return override;
  return scoreThermal(printerName) !== Number.MAX_SAFE_INTEGER;
}

/**
 * Cut the paper on the given printer. Never throws: the slip is already out of
 * the printer by this point, so a cutter failure is a warning, not a lost sale.
 */
export async function cutPaper(printerName: string): Promise<boolean> {
  try {
    await connect();
    await qz.print(qz.configs.create(printerName, { encoding: 'ISO-8859-1' }), [
      { type: 'raw', format: 'command', flavor: 'plain', data: CUT_COMMAND },
    ]);
    return true;
  } catch (err) {
    console.warn(`Receipt printed, but the cut command failed on "${printerName}".`, err);
    return false;
  }
}

/**
 * Resolve the printer to use: the pinned one if it is still installed,
 * otherwise the best thermal-looking name, otherwise the system default.
 */
export async function detectPrinter(): Promise<string> {
  const printers = await listPrinters();

  if (!printers.length) {
    throw new QzError('no-printer', 'QZ Tray did not find any installed printers on this computer.');
  }

  const preferred = getPreferredPrinter();
  if (preferred) {
    const match = printers.find((p) => p === preferred) ?? printers.find((p) => p.toLowerCase() === preferred.toLowerCase());
    if (match) return match;
  }

  const thermal = [...printers].sort((a, b) => scoreThermal(a) - scoreThermal(b))[0];
  if (thermal && scoreThermal(thermal) !== Number.MAX_SAFE_INTEGER) return thermal;

  const fallback = await qz.printers.getDefault();
  return fallback ?? printers[0];
}

/**
 * Lay the receipt out in a hidden iframe at the reference width and hand the
 * settled document to `read`. Images and fonts are resolved first, so anything
 * measured or captured afterwards is final.
 */
async function withReceiptDocument<T>(html: string, read: (doc: Document) => T | Promise<T>): Promise<T> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${MEASURE_WIDTH_PX}px`,
    'height:10px',
    'border:0',
    'visibility:hidden',
    'pointer-events:none',
  ].join(';');

  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Receipt render timed out')), 10000);
      iframe.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      iframe.srcdoc = html;
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Receipt document unavailable');

    // The logo is a data URI, but decoding still happens asynchronously.
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );

    if (doc.fonts?.ready) await doc.fonts.ready;

    return await read(doc);
  } finally {
    iframe.remove();
  }
}

function contentHeightPx(doc: Document): number {
  const height = Math.max(
    doc.documentElement.scrollHeight,
    doc.body.scrollHeight,
    Math.ceil(doc.body.getBoundingClientRect().height),
  );

  if (!height) throw new Error('Measured receipt height was zero');
  return height;
}

/**
 * Content height of the receipt in millimetres, for the fallback path where QZ
 * renders the HTML itself. Includes the cross-renderer tolerance.
 */
export async function measureReceiptHeightMm(html: string, widthMm = PAPER_WIDTH_MM): Promise<number> {
  try {
    const heightPx = await withReceiptDocument(html, contentHeightPx);
    const contentMm = (heightPx / MEASURE_WIDTH_PX) * widthMm;
    return contentMm * (1 + HEIGHT_TOLERANCE_RATIO) + HEIGHT_TOLERANCE_MM;
  } catch (err) {
    throw new QzError('measure-failed', 'Could not work out the receipt height before printing.', err);
  }
}

export interface ReceiptRaster {
  /** PNG bytes, base64 encoded, ready for a QZ pixel/image job. */
  base64: string;
  widthPx: number;
  heightPx: number;
  /** Paper height that matches the bitmap exactly, in millimetres. */
  heightMm: number;
}

/**
 * Rasterise the receipt in the browser, at the thermal head's own resolution.
 *
 * This is what guarantees the slip is exactly as long as its content: the page
 * height is derived from the bitmap we just produced, so there is no second
 * layout engine whose text metrics could disagree and leave a blank tail. The
 * HTML goes through an SVG foreignObject, which needs XML-well-formed markup -
 * hence XMLSerializer rather than innerHTML.
 */
export async function renderReceiptBitmap(html: string, widthMm = PAPER_WIDTH_MM): Promise<ReceiptRaster> {
  const { svg, heightPx } = await withReceiptDocument(html, (doc) => {
    const height = contentHeightPx(doc);
    const serializer = new XMLSerializer();

    const style = Array.from(doc.querySelectorAll('style'))
      .map((el) => el.textContent ?? '')
      .join('\n')
      .replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));

    const body = Array.from(doc.body.children)
      .map((el) => serializer.serializeToString(el))
      .join('');

    // A real <body> element, not a <div>: the stylesheet's body-scoped rules
    // must apply here exactly as they did while measuring, or the content
    // reflows and the tail of a long receipt gets clipped.
    const xhtml =
      `<body xmlns="http://www.w3.org/1999/xhtml" style="width:${MEASURE_WIDTH_PX}px;background:#fff">` +
      `<style>${style}</style>${body}</body>`;

    return {
      heightPx: height,
      svg:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${MEASURE_WIDTH_PX}" height="${height}" ` +
        `viewBox="0 0 ${MEASURE_WIDTH_PX} ${height}">` +
        `<foreignObject width="${MEASURE_WIDTH_PX}" height="${height}">${xhtml}</foreignObject></svg>`,
    };
  });

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Receipt bitmap could not be rendered'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  // Native head density, unless the receipt is so long that 203dpi would take
  // the canvas past what Chrome can allocate. Dropping the density keeps the
  // exact-height guarantee; throwing here would forfeit it.
  const scale = Math.min(
    RENDER_SCALE,
    MAX_CANVAS_EDGE_PX / heightPx,
    MAX_CANVAS_EDGE_PX / MEASURE_WIDTH_PX,
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(MEASURE_WIDTH_PX * scale);
  canvas.height = Math.round(heightPx * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  // Thermal paper is white; anything transparent must come out white, not black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL('image/png').split(',')[1];
  if (!base64) throw new Error('Receipt bitmap could not be encoded');

  return {
    base64,
    widthPx: canvas.width,
    heightPx: canvas.height,
    // The page is the image: height comes from the bitmap's own aspect ratio,
    // so no second layout engine can disagree about where the receipt ends.
    heightMm: (canvas.height / canvas.width) * widthMm + BITMAP_HEIGHT_BUFFER_MM,
  };
}

export interface PrintReceiptOptions {
  /** Override the auto-detected printer. */
  printerName?: string;
  /** Job name shown in the Windows print queue. */
  jobName?: string;
  /**
   * Force the cut on or off for this job. Defaults to `supportsAutoCut()`,
   * i.e. cut whenever the target looks like an ESC/POS thermal printer.
   */
  autoCut?: boolean;
}

/**
 * Which engine produced the slip:
 *
 *   bitmap  - browser raster, page height taken from the image. Exact.
 *   html    - QZ rendered the markup itself. Height is an estimate, so a blank
 *             tail is possible; seeing this in the field means the bitmap path
 *             failed and the warning it logged is worth reading.
 *   preview - not printed at all, just Chrome's print dialog (IS_LOCAL_TEST).
 */
export type PrintRenderer = 'bitmap' | 'html' | 'preview';

export interface PrintReceiptResult {
  printer: string;
  heightMm: number;
  /** True when the paper was cut right after the last line. */
  cut: boolean;
  renderer: PrintRenderer;
}

/**
 * Print receipt HTML straight to the thermal printer: one continuous slip,
 * 80mm wide, exactly as tall as its content, no dialog, no page breaks.
 */
export function printReceiptHtml(
  html: string,
  options: PrintReceiptOptions = {},
): Promise<PrintReceiptResult> {
  return enqueue(() => runPrintJob(html, options));
}

function receiptConfig(printer: string, heightMm: number, jobName: string) {
  return qz.configs.create(printer, {
    units: 'mm',
    // One page, sized to the content. This is what stops the slip from being
    // split across pages or padded with blank paper.
    size: { width: PAPER_WIDTH_MM, height: heightMm },
    margins: 0,
    orientation: 'portrait',
    colorType: 'grayscale',
    interpolation: 'nearest-neighbor',
    // Map the render onto the page. Without this QZ prints the raster at its
    // native pixel size, which overflows onto extra pages.
    scaleContent: true,
    copies: 1,
    jobName,
  });
}

async function runPrintJob(
  html: string,
  options: PrintReceiptOptions,
): Promise<PrintReceiptResult> {
  await connect();

  const printer = options.printerName ?? (await detectPrinter());
  const jobName = options.jobName ?? 'Receipt';

  let heightMm: number;
  let renderer: PrintRenderer;
  let config: ReturnType<typeof receiptConfig>;
  let payload: { type: 'pixel'; format: 'image' | 'html'; flavor: 'base64' | 'plain'; data: string };

  try {
    // Preferred path: the browser rasterises the slip, so the paper length is
    // derived from the very bitmap being printed - no blank tail is possible.
    const raster = await renderReceiptBitmap(html, PAPER_WIDTH_MM);
    heightMm = raster.heightMm;
    renderer = 'bitmap';
    config = receiptConfig(printer, heightMm, jobName);
    config.reconfigure({ rasterize: true });
    payload = { type: 'pixel', format: 'image', flavor: 'base64', data: raster.base64 };
  } catch (err) {
    // Fallback: let QZ render the HTML. Vector output, still a single page, but
    // its text metrics are only an estimate of where the receipt ends - this is
    // the path that can leave a blank tail, so it is worth knowing when it runs.
    console.warn(
      'Receipt rasterisation failed; falling back to QZ-side HTML rendering, ' +
        'whose page height is an estimate and may leave a blank tail.',
      err,
    );
    heightMm = await measureReceiptHeightMm(html, PAPER_WIDTH_MM);
    renderer = 'html';
    config = receiptConfig(printer, heightMm, jobName);
    config.reconfigure({ rasterize: false, scaleContent: false });
    payload = { type: 'pixel', format: 'html', flavor: 'plain', data: html };
  }

  try {
    await qz.print(config, [payload]);
  } catch (err) {
    throw new QzError('print-failed', `The printer "${printer}" rejected the job.`, err);
  }

  // Straight after the last line, while the slip is still in the printer.
  const shouldCut = options.autoCut ?? supportsAutoCut(printer);
  const cut = shouldCut ? await cutPaper(printer) : false;

  return { printer, heightMm, cut, renderer };
}

/** Human-readable message for anything thrown by this module. */
export function describePrintError(err: unknown): string {
  if (err instanceof QzError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Printing failed for an unknown reason.';
}
