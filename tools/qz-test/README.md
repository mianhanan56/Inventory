# Testing receipts without a printer

Three ways to check the receipt, in increasing order of thoroughness. None of
them needs the thermal printer to exist.

## 1. Content only — no QZ Tray needed

Open any invoice in the app and hit the eye icon. The preview modal renders the
receipt at its true 80mm width (302px), so you can check the logo, columns,
totals and wording. It will not tell you anything about paper length or pages.

## 2. Real print job, no hardware — "Microsoft Print to PDF" (Windows)

The quickest realistic test on the client's machine, using a printer Windows
already ships with.

1. Install and start QZ Tray.
2. Pin the PDF printer as the target, in the browser console:
   ```js
   localStorage.setItem('qz.preferredPrinter', 'Microsoft Print to PDF')
   ```
3. Print an invoice. Windows asks where to save; open the PDF.

Check: the page is **80mm wide**, exactly **one page**, and its height grows
with the item count. Print a 2-item and a 30-item sale and compare.

The cut command is deliberately **not** sent to a PDF printer (`cut: false`) —
only printers whose name looks thermal receive raw bytes. Undo the pin with
`localStorage.removeItem('qz.preferredPrinter')`.

## 3. Byte-level — a virtual 80mm thermal printer (Linux/macOS, CUPS)

Creates a real print queue that captures everything sent to it, so you can see
page count, page size and the ESC/POS cut command. This is what caught the
multi-page and clipped-tail bugs.

```bash
node tools/qz-test/virtual-printer.mjs setup     # create queue + start capturing
# restart QZ Tray so it sees the new queue, then print from the app
node tools/qz-test/virtual-printer.mjs report
node tools/qz-test/virtual-printer.mjs teardown  # remove the queue
```

The queue is named `XP-80C-Thermal-80mm-TEST`, so the app's auto-detection picks
it up as the receipt printer without any configuration.

Sample output:

```
job-001.bin  OK   pages=1  page 80.0 x 124.9 mm
job-002.bin  CUT  1d564200  (ESC/POS GS V B 0)
job-003.bin  OK   pages=1  page 80.0 x 299.7 mm
job-004.bin  CUT  1d564200  (ESC/POS GS V B 0)

All receipts printed as a single 80mm-wide page.
```

What to look for:

- `pages=1` on every receipt — more than one means the slip would be split.
- Width always `80.0 mm`.
- Height changing with the item count, and only with the item count.
- A `CUT` job after each receipt.

Captured jobs land in `/tmp/qz-test-jobs`. They are PostScript, so you can also
render one to see the actual paper:

```bash
gs -q -dNOPAUSE -dBATCH -sDEVICE=pnggray -r203 -sOutputFile=receipt.png /tmp/qz-test-jobs/job-001.bin
```

If a job is rejected with "the printer rejected the job", check the queue is
still enabled (`lpstat -p`) — CUPS stops a queue when its backend dies, and the
capture server must be running for the backend to work.
