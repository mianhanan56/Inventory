# Till printer setup — ON TARGET UNITED

Everything needed to make invoice printing work on the shop's till, in order.
Follow it top to bottom on the Windows PC that the **Xprinter XP-Q200** is
plugged into. It takes about 15 minutes and is done **once**.

Nothing here has to be repeated on other computers — only the till PC prints.

---

## Why this is needed

Until now the app printed through the browser's own print dialog. A browser
sends the printer a **page**, and Windows decides how much paper a page gets —
which is why every slip came out the same length no matter how many items were
on it, and why long invoices came out narrow.

The app now talks to the printer directly instead, the same way a pharmacy or
restaurant till does: it sends the receipt line by line and then a **cut**
command. There is no page, so the paper is always exactly as long as the sale.

That direct route needs one small free program on the till — **QZ Tray** —
because a browser is not allowed to send raw data to a USB printer on its own.
These steps install it and let it trust our app.

---

## Step 1 — Install QZ Tray

1. Download from <https://qz.io/download/> (Windows installer, free).
2. Run the installer and accept the defaults. It brings its own Java; nothing
   else needs installing.
3. After it finishes, QZ Tray starts and an icon appears in the system tray
   (bottom-right, near the clock — you may need to click the small `^` arrow).

Leave it running. Do not close it.

---

## Step 2 — Printer settings

Two settings, in two different places. Both matter: the app sends its own cut
command, so the printer must be able to cut, and the driver must **not** cut a
second time.

### 2a. The printer's own cutter switch (hardware)

There is a bank of DIP switches on the printer. **SW-1 must be OFF**, which
means the cutter is enabled.

To check what the switches are currently set to: switch the printer **off**,
hold down the **FEED** button, switch it **on** while still holding FEED. It
prints a self-test listing every switch:

```
DIP-8  Function                    ON    OFF
SW-1   Select cutter               No    Yes    <- must be OFF
SW-6   Cutter with cash drawer     Yes   No
```

If SW-1 is ON, switch the printer off, flip SW-1 to OFF, switch it back on.

### 2b. The Windows driver's cutter (software)

**Settings → Bluetooth & devices → Printers & scanners → (the XP-Q200) →
Printing preferences**

- **Paper cut / Cutter**: set to **No cut** or **None**.
  The app cuts the paper itself, right after the last line. If the driver cuts
  as well you get two cuts per slip.
- **Paper size**: the roll size (often listed as `80(72.1) x 3276mm`,
  `Roll Paper` or `Receipt`).
  This one only matters as a safety net — if QZ Tray is ever not running the
  app falls back to browser printing, and that fallback depends on this.

Print a Windows test page to confirm the printer works before going further.

---

## Step 3 — Save the certificate on the till

This file is the app's ID card. QZ Tray checks it so that only our app can
print, and so that it stops asking permission for every receipt.

**It is not a password.** It is safe to email, message or copy anywhere.

1. Create the folder:
   ```
   C:\ProgramData\OnTarget
   ```
   (`ProgramData` is hidden by default. Paste the path into the Explorer
   address bar and press Enter, or turn on **View → Show → Hidden items**.)

2. Open **Notepad** and paste everything in the box below — from `-----BEGIN`
   to `-----END CERTIFICATE-----`, including both of those lines.

3. **File → Save As**, then:
   - Navigate to `C:\ProgramData\OnTarget`
   - **Save as type**: change it to **All Files (\*.\*)** — this matters, or
     Notepad saves it as `digital-certificate.txt.txt`
   - **File name**: `digital-certificate.txt`
   - **Encoding**: `UTF-8`

The finished file must be exactly:

```
C:\ProgramData\OnTarget\digital-certificate.txt
```

### The certificate

```
-----BEGIN CERTIFICATE-----
MIID3TCCAsWgAwIBAgIURIBLZGbcrkpAjELrCu5sLEFMOAYwDQYJKoZIhvcNAQEN
BQAwfjELMAkGA1UEBhMCWkExFjAUBgNVBAgMDUt3YVp1bHUtTmF0YWwxDzANBgNV
BAcMBkR1cmJhbjEZMBcGA1UECgwQT04gVEFSR0VUIFVOSVRFRDEMMAoGA1UECwwD
UE9TMR0wGwYDVQQDDBRPTiBUQVJHRVQgVU5JVEVEIFBPUzAeFw0yNjA5MDcxMDM4
NDdaFw0zNjA5MDQxMDM4NDdaMH4xCzAJBgNVBAYTAlpBMRYwFAYDVQQIDA1Ld2Fa
dWx1LU5hdGFsMQ8wDQYDVQQHDAZEdXJiYW4xGTAXBgNVBAoMEE9OIFRBUkdFVCBV
TklURUQxDDAKBgNVBAsMA1BPUzEdMBsGA1UEAwwUT04gVEFSR0VUIFVOSVRFRCBQ
T1MwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC3xT4fBOx8F2r6a6d+
tJHhsdcYmo1MhF9CUO2u2e+RL3I1Lc+bnmgIdyqbFsXplYvqUMTWKU82nqRsTW22
UKmBCxkW68IrHevPbyCjic/cbCY9/IlnCAjbrBC+zQ5CLkrunylhaMzNICSRnPN2
F0UQIFXJcSSYlsp/br9IM7HpIYEk3vM8OIhayo/7vxtuuKSmVSm6PBDbbRIEF4bb
IxOW0Tu+EQ/j4e+o5Cb5KfyfLWeVQvSIdQWuQxyc6TXjO+PQsiqzTbWs5pB2C9Ah
tAjzs01E/JYXNzXyHXALvetwzpbRLzEIHG8OdurtiZi00zm4JtBIa5sZmKW+XPpA
BW1jAgMBAAGjUzBRMB0GA1UdDgQWBBTzKlS2DSF1HXsCug6Qsn0BiC0c3jAfBgNV
HSMEGDAWgBTzKlS2DSF1HXsCug6Qsn0BiC0c3jAPBgNVHRMBAf8EBTADAQH/MA0G
CSqGSIb3DQEBDQUAA4IBAQBCc2uiTWxnmXwUoFo+zllA6w7pnR752hjkNqOKpf3f
6WhJXg5NT6gupvPTmnawiWn4qfznAbHFnsZRcCUllX4R2nqLpPxiuKPafw/q22fJ
9lIUQy+az+uM0aPkn4wIjHgUawwxurF0r6WlUQ1PtsiE1CkXYxi9rlYRAxPEmV15
zTzNPP+awwaPF6P5sTVAsux5jOWL18NSXky7Y1JDpms5HAnAc0qHdqKugRZfRTwv
Ze1vDlmwfaqdwhMj0ds7sWPjWq3ybUBd5oEut+14fp4RfpfYsQgadWj3qNRj4o7E
khh/4MPaSQb1eioc82qw/lsZ50FdDA6Htz0qqSUjlShK
-----END CERTIFICATE-----
```

Valid until **September 2036**. The same file works on any number of tills.

---

## Step 4 — Tell QZ Tray to trust it

Skip this and printing still works — but QZ Tray will pop up a permission
window **two or three times for every single receipt**, and that window often
opens *behind* the browser, so it looks like the app has frozen.

1. Click **Start**, type `notepad`, right-click **Notepad** →
   **Run as administrator**. (Administrator is required — `C:\Program Files`
   is protected and the file will not save otherwise.)
2. In Notepad: **File → Open**, set the file-type dropdown to **All Files**,
   and open:
   ```
   C:\Program Files\QZ Tray\qz-tray.properties
   ```
3. Go to the very end of the file and add this on a new line:
   ```
   authcert.override=C:\ProgramData\OnTarget\digital-certificate.txt
   ```
4. **File → Save**.

> This path must match Step 3 exactly. If you saved the certificate somewhere
> else, write that location here instead. Do not use `Downloads`, `Desktop` or
> any temporary folder — if the file is ever deleted the pop-ups come back.

---

## Step 5 — Restart QZ Tray, and make it start by itself

1. Right-click the QZ Tray icon in the system tray → **Exit**.
2. Start it again from the Start menu.
   *(Settings are only read when it starts, so this step is required.)*
3. Right-click the icon → **Advanced** → tick **Start automatically**.

Step 3 matters: if QZ Tray is not running, the app quietly falls back to
browser printing and the old wrong-length slips come back.

---

## Step 6 — Test it

Open the app and print **two** invoices:

- one small — 2 or 3 items
- one large — 20 items or more

### What correct looks like

- **No print dialog.** Press Print and the slip comes straight out.
- **No permission pop-up.**
- The small slip is **short** — it ends just after "Thanks for shopping with
  us!", with no long blank tail.
- The large slip is **clearly longer** than the small one.
- Both are the **full width** of the paper, in the same size text.
- Nothing reading `about:blank`, a web address, a date, or `1/1` is printed.
- The paper is cut just below the last line.

Before pressing Print, the window shows which route it is about to take:

> *Printing to `<printer name>` · cut to length*

If it instead says **"QZ Tray is not running"**, QZ Tray is not started — go
back to Step 5. There is also a **Retry** button next to that message.

---

## If something is wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| "QZ Tray is not running" in the app | QZ Tray is closed or still starting | Start it, then press **Retry**. Do Step 5.3 so it starts by itself. |
| A permission pop-up on every receipt | Step 4 did not take effect | Check the path in `qz-tray.properties` matches where the file actually is, then restart QZ Tray (Step 5). |
| The browser's print dialog appears | The app fell back to browser printing | QZ Tray is not reachable. Same as the first row. |
| Two cuts per slip | The driver is cutting as well as the app | Step 2b — set the driver's cutter to **No cut**. |
| No cut at all | Cutter disabled in hardware | Step 2a — DIP **SW-1 must be OFF**. |
| Wrong printer is used | Auto-detection picked the wrong one | The window has a printer dropdown next to "Printing to…". Pick the XP-Q200; it is remembered. |
| Every slip the same length again | Printing went back through the browser | QZ Tray is not running — Step 5. |

### If it still will not work

Send these three things:

1. A photo of both test slips, laid flat, full length in frame.
2. A screenshot of the app window **before** pressing Print, showing the
   "Printing to…" line.
3. The QZ Tray log file:
   ```
   C:\Users\<your username>\.qz\debug.log
   ```

That log records exactly what the printer was sent and what it answered, and is
usually enough to identify the problem without another visit.

---

## Notes

- **The certificate is public.** It identifies the app; it grants nothing. It
  can be emailed or messaged freely.
- **QZ Tray must be running whenever the till prints.** That is what Step 5.3
  is for.
- **If printing ever breaks, the app does not stop.** It falls back to browser
  printing and says so on screen. Sales are never blocked — the slip is just
  the wrong length until QZ Tray is running again.
