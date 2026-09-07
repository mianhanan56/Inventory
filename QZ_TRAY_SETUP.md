# Thermal printing with QZ Tray (80mm)

Receipt printing goes straight to the thermal printer through QZ Tray whenever
QZ Tray is running. When it is not, [src/lib/printReceipt.ts](src/lib/printReceipt.ts)
falls back to the old `window.print()` path so a till is never unable to print -
but that path hands the page to the Windows print driver, and the driver decides
how much paper to feed. Every "all the slips come out the same length" report
this app has ever had is that fallback running on a till whose driver is on a
fixed sheet form. The thermal route has no page and no driver in the way, which
is the entire reason it exists.

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
     This only matters for the browser fallback; the thermal route sets its own page.
   - **Paper cut / Cutter**: *No cut* — the app sends its own cut command right
     after the last line (see §5). Leaving the driver's cutter on as well gives
     you two cuts per slip.
   - **Margins**: 0 where the driver allows it.
3. Print a Windows test page to confirm the driver works before testing the app.

### The printer's own cutter switch

The app's cut command is ignored by a unit whose cutter is disabled **in
hardware**, and that is a DIP switch on the printer, not a driver setting. Hold
the FEED button while switching the printer on and it prints its self-test,
which lists the switches. On the client's Xprinter XP-Q200:

```
DIP-8  Function                    ON    OFF
SW-1   Select cutter               No    Yes     <- must be OFF (= cutter on)
SW-6   Cutter with cash drawer     Yes   No
```

The same self-test confirms the rest of what this file assumes: `Cutter: Yes`,
`Character per line: 48 (font A)`, i.e. 80mm paper and a 576-dot head.

The app auto-detects the printer: it prefers a pinned choice, then the first
installed printer whose name looks thermal (`80mm`, `thermal`, `receipt`, `POS-80`,
`XP-80`, `TM-T`, `Star TSP`, …), then the Windows default printer. The hint list
lives in `THERMAL_HINTS` in [src/lib/qz.ts](src/lib/qz.ts).

## 3. Allow the site to print

**Both halves of this section are required.** Skip either one and a dialog
appears on the till for every single receipt.

Measured against a real QZ Tray 2.2, printing two receipts unsigned: **seven
anonymous requests, four dialogs**. QZ prompts for the connect handshake, for
listing printers, for the bitmap and again for the cut, and an *anonymous*
request cannot be remembered — ticking "Remember this decision" does not
persist it, so the box asks again on the next slip. A cashier cannot work like
that, so the requests are signed and the certificate is pre-trusted.

### 3a. The app signs its requests

Already set up. The keypair was generated with:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out qz-private-key.pem
openssl req -new -x509 -key qz-private-key.pem -sha512 -days 3650 \
  -subj "/C=ZA/ST=KwaZulu-Natal/L=Durban/O=ON TARGET UNITED/OU=POS/CN=ON TARGET UNITED POS" \
  -out qz-signing/digital-certificate.txt
```

The **certificate** is public and lives in
[qz-signing/digital-certificate.txt](qz-signing/digital-certificate.txt)
(valid to 2036). The **private key** is not in git. Both reach the app
base64-wrapped, so a multi-line PEM survives a `.env` file:

```bash
# .env  (and the same two names in the Vercel environment variables)
VITE_QZ_CERT_B64=<base64 of qz-signing/digital-certificate.txt>
VITE_QZ_KEY_B64=<base64 of the private key PEM>
```

Signing happens in the browser with Web Crypto (RSASSA-PKCS1-v1_5 / SHA-512),
not against an endpoint. `qz.ts` signs roughly four calls per receipt, and
putting the network in front of each of them would mean a till that cannot
print when a function is cold. The key authorises one thing — printing to a QZ
Tray that trusts this certificate — and is not a credential to any data or
account. `VITE_QZ_CERT_URL` / `VITE_QZ_SIGN_URL` still work and take
precedence if a server-side signer is ever preferred; see
<https://qz.io/docs/signing>.

Verify it is on: the QZ log says `Allowed ON TARGET UNITED POS ...` rather than
`Allowed An anonymous request ...`.

### 3b. The till trusts the certificate

Signing alone is not enough: a self-signed certificate is still untrusted, so
QZ keeps prompting (it just names the shop while it does). Copy the certificate
onto the till and name it in QZ Tray's properties file:

```properties
# Linux:   /opt/qz-tray/qz-tray.properties        (root-owned, needs sudo)
# Windows: C:\Program Files\QZ Tray\qz-tray.properties   (needs Administrator)
authcert.override=C:\ProgramData\OnTarget\digital-certificate.txt
```

Then **restart QZ Tray**. The property name is `authcert.override` exactly — it
is read straight out of `qz-tray.jar`.

Verify: print a few receipts and check `~/.qz/debug.log` (Windows:
`%USERPROFILE%\.qz\debug.log`). There must be **no** `Calculated dialog centered
at` lines.

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

Re-measured headlessly after the September rework (`renderReceiptBitmap()` on the
current layout, 4mm side margins), which is what the slips are now:

| items | paper | items | paper |
| --- | --- | --- | --- |
| 1 | 104mm | 16 | 248mm |
| 3 | 121mm | 20 | 293mm |
| 5 | 146mm | 30 | 385mm |
| 10 | 190mm | 45 | 532mm |

Every bitmap comes out 639px wide — 80mm at 203dpi, the head's own density, so
the image lands on its dots without resampling. Note 15 → 16 items adds 6mm and
nothing else: the item-count *width* rule in `invoices.ts` (which makes a
16-item slip print **shorter** than a 15-item one once a driver has shrunk the
wider page) is not on this path at all.

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

One entry point, which picks the route and reports which one it took:

```tsx
import { printSaleReceipt } from '../lib/printReceipt';

const outcome = await printSaleReceipt(sale, items);

if (outcome.route === 'thermal') {
  console.log(`${outcome.printer}: ${outcome.heightMm.toFixed(1)}mm, cut: ${outcome.cut}`);
} else {
  console.warn(`QZ Tray unavailable (${outcome.fallbackReason}); printed through the browser.`);
}
```

Do not call `printInvoice()` from `invoices.ts` directly - that is the browser
fallback, and calling it bypasses the thermal route entirely.

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

- [src/lib/printReceipt.ts](src/lib/printReceipt.ts) — the one entry point: thermal, or the browser fallback.
- [src/lib/qz.ts](src/lib/qz.ts) — connection, printer detection, bitmap rendering, print job, cut.
- [src/lib/invoices.ts](src/lib/invoices.ts) — receipt HTML (logo, company info, date/time, items, qty, unit price, VAT, totals, return policy) and `printInvoice`.
- [src/hooks/useThermalPrinter.ts](src/hooks/useThermalPrinter.ts) — React state wrapper.
- [src/types/qz-tray.d.ts](src/types/qz-tray.d.ts) — TypeScript definitions for the `qz-tray` package.
- [tools/qz-test/](tools/qz-test/) — virtual printer harness for testing without hardware.
