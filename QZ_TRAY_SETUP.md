# Thermal printing with QZ Tray (80mm)

All receipt printing goes straight to the thermal printer through QZ Tray.
`window.print()`, Ctrl+P and PDF printing are no longer used anywhere in the app.

## 1. Install

In the app (already done in this repo):

```bash
npm install qz-tray
```

On the Windows POS machine:

1. Download QZ Tray from <https://qz.io/download/> and install it (it bundles its own Java runtime).
2. Launch it — a tray icon appears near the clock. It must be running whenever the app prints.
3. Set it to start with Windows: tray icon → **Advanced** → **Start automatically**.

## 2. Printer setup (Windows)

1. Install the vendor's Windows driver for the 80mm printer (Epson TM-T, Xprinter XP-80, POS-80, Star TSP, Bixolon…).
2. Open **Settings → Printers & scanners → <printer> → Printing preferences** and set:
   - **Paper size**: the roll's 80mm continuous size (often `80(72.1) x 3276mm` or `Roll Paper 80 x 297`).
   - **Paper cut / Cutter**: *No cut* — the app sends its own cut command right
     after the last line (see §5). Leaving the driver's cutter on as well gives
     you two cuts per slip.
   - **Margins**: 0 where the driver allows it.
3. Print a Windows test page to confirm the driver works before testing the app.

The app auto-detects the printer: it prefers a pinned choice, then the first
installed printer whose name looks thermal (`80mm`, `thermal`, `receipt`, `POS-80`,
`XP-80`, `TM-T`, `Star TSP`, …), then the Windows default printer. The hint list
lives in `THERMAL_HINTS` in [src/lib/qz.ts](src/lib/qz.ts).

## 3. Allow the site to print

Unsigned requests make QZ Tray show a one-time prompt on the first print:
choose **Allow** and tick **Remember this decision**. That is enough for a
single-shop deployment.

For a signed (prompt-free) setup, follow <https://qz.io/docs/signing> and set:

```bash
# .env
VITE_QZ_CERT_URL=https://your-server/qz/certificate
VITE_QZ_SIGN_URL=https://your-server/qz/sign
```

When both are present the app signs every request (SHA512) via those endpoints;
when they are absent it runs unsigned. See `configureApi()` in `src/lib/qz.ts`.

## 4. How the receipt height works

There is never a second page and never trailing blank paper:

1. `generateInvoiceHTML()` produces the receipt, sized in CSS pixels against a
   302px reference width (80mm at 96dpi) — the original design's numbers.
2. `renderReceiptBitmap()` lays that HTML out in a hidden 302px-wide iframe,
   waits for the logo and fonts, then rasterizes it in the browser (via an SVG
   foreignObject onto a canvas) at 203dpi — the native resolution of an 80mm
   thermal head. The result is a 639px-wide PNG.
3. The page height is derived from that very bitmap
   (`heightPx / widthPx × 80mm`) and sent to QZ as
   `size: { width: 80, height: <bitmap> }`, `margins: 0`, `scaleContent: true`.

Rasterizing in the browser is the point: there is no second layout engine whose
text metrics could disagree with the measurement, so the paper cannot come out
too long (blank tail) or too short (clipped last line). Verified against a real
QZ Tray: 2 items → 125mm, 20 → 237mm, 100 → 737mm, **one page every time**.

If canvas rasterization ever fails, the code falls back to letting QZ render the
HTML itself (`rasterize: false`, vector, still one page). That path uses
`measureReceiptHeightMm()` and its 1.5mm tolerance, and can leave a few
millimetres at the bottom because QZ's renderer lays text out slightly shorter
than Chrome.

Note `scaleContent: true` is required. With `false`, QZ prints the raster at its
native pixel size, which overflows onto extra pages — 6 pages for a 20-item
receipt in testing.

## 5. Cutting

The app cuts the paper itself, immediately after the last line: as soon as the
slip has been rendered it sends the ESC/POS *feed-to-cutter and partial cut*
command (`GS V B 0`) as a raw follow-up job to the same printer. Function B
feeds only the few millimetres between the print head and the blade, so the cut
lands right below the last printed row with no blank tail.

It is sent only to printers that look like ESC/POS thermal units (the same name
match used for detection, `supportsAutoCut()` in [src/lib/qz.ts](src/lib/qz.ts)),
so an office laser picked as a fallback never receives raw bytes. If the cut
fails the receipt is still reported as printed — a warning goes to the console
and `PrintReceiptResult.cut` comes back `false`.

Overrides, in order of precedence:

```ts
import { setAutoCutOverride } from '../lib/qz';

setAutoCutOverride(true);   // always cut, even if the name doesn't look thermal
setAutoCutOverride(false);  // never cut — for a driver that swallows raw bytes
setAutoCutOverride(null);   // back to auto-detection
```

Per job: `printReceiptHtml(html, { autoCut: false })`.
Globally: `AUTO_CUT` in [src/lib/qz.ts](src/lib/qz.ts).

If your driver is *also* set to "cut after each document" you will get two cuts;
in that case either turn the driver's cutter off (recommended — the app's cut is
tighter to the last line) or call `setAutoCutOverride(false)`.

## 6. Using it in code

Fire-and-report (what the Print buttons use):

```tsx
import { printInvoiceWithAlert } from '../../lib/invoices';

<button onClick={() => printInvoiceWithAlert(sale, items)}>Print</button>
```

Full control, with the error surfaced yourself:

```tsx
import { printInvoice } from '../lib/invoices';
import { describePrintError } from '../lib/qz';

try {
  const { printer, heightMm, cut } = await printInvoice(sale, items);
  console.log(`Printed on ${printer} (${heightMm.toFixed(1)}mm), cut: ${cut}`);
} catch (err) {
  setMessage(describePrintError(err));
}
```

React state (status, detected printer, printer picker, print action):

```tsx
import { useThermalPrinter } from '../hooks/useThermalPrinter';

function PrinterBar({ sale, items }) {
  const { status, printer, printers, printing, error, selectPrinter, print, refresh } =
    useThermalPrinter();

  return (
    <div>
      <span>
        {status === 'ready' ? `Printer: ${printer}` : status === 'error' ? error : 'Connecting…'}
      </span>

      <select value={printer ?? ''} onChange={(e) => selectPrinter(e.target.value || null)}>
        <option value="">Auto-detect</option>
        {printers.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <button onClick={refresh}>Reconnect</button>
      <button disabled={printing} onClick={() => print(sale, items)}>
        {printing ? 'Printing…' : 'Print receipt'}
      </button>
    </div>
  );
}
```

Any receipt-shaped HTML can go through the same path:

```ts
import { printReceiptHtml } from '../lib/qz';

await printReceiptHtml(html, { jobName: 'Shift report' });
```

## 7. Errors

Failures throw a `QzError` with a `code`, and `describePrintError()` turns any
error into a cashier-friendly message:

| code | Meaning | Fix |
| --- | --- | --- |
| `not-running` | Websocket to QZ Tray refused (secure and insecure) | Start QZ Tray on the POS machine |
| `no-printer` | QZ Tray reports zero installed printers | Install the printer driver in Windows |
| `measure-failed` | Receipt HTML could not be rendered/measured | Check the logo data URI and the browser console |
| — | Connection attempts give up after 8s (`CONNECT_TIMEOUT_MS`) | Raise it only if QZ Tray is slow to start on the POS box |
| `print-failed` | QZ Tray or the driver rejected the job | Check the Windows queue, driver and paper |

## 8. Testing without a printer

See [tools/qz-test/README.md](tools/qz-test/README.md): preview only, a real job
against "Microsoft Print to PDF" on Windows, or a virtual 80mm thermal queue
that captures the bytes (`node tools/qz-test/virtual-printer.mjs setup`).

## 9. Files

- [src/lib/qz.ts](src/lib/qz.ts) — connection, printer detection, bitmap rendering, print job, cut.
- [src/lib/invoices.ts](src/lib/invoices.ts) — receipt HTML (logo, company info, date/time, items, qty, unit price, VAT, totals, return policy) and `printInvoice`.
- [src/hooks/useThermalPrinter.ts](src/hooks/useThermalPrinter.ts) — React state wrapper.
- [src/types/qz-tray.d.ts](src/types/qz-tray.d.ts) — TypeScript definitions for the `qz-tray` package.
- [tools/qz-test/](tools/qz-test/) — virtual printer harness for testing without hardware.
