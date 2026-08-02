import { Sale, SaleItem } from "../types";
import { LOGO_DATA_URI } from "./logo";
import {
  PAPER_WIDTH_MM,
  PrintReceiptResult,
  describePrintError,
  printReceiptHtml,
} from "./qz";

/**
 * Reference width, in CSS pixels, that the receipt stylesheet is designed
 * against (80mm at 96dpi). Use it for on-screen previews so the preview and
 * the printed slip look identical.
 */
export const RECEIPT_PREVIEW_WIDTH_PX = 302;

export function generateInvoiceHTML(sale: Sale, items: SaleItem[]) {
  const fmt = (v: number) =>
    `R ${v.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const stamp = sale.created_at ? new Date(sale.created_at) : new Date();

  const saleDate = stamp.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const saleTime = stamp.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const saleStamp = `Date: ${saleDate} | Time: ${saleTime}`;

  return `
<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8" />
  <title>Invoice ${sale.invoice_number}</title>

  <style>
    /*
      Sized in CSS pixels against a 302px reference width (80mm at 96dpi) -
      the same numbers the original design used. Typography is scoped to
      .invoice rather than body, so the receipt renders identically whether it
      is laid out as a document or rasterised inside an SVG foreignObject,
      where body/html rules and rem units do not apply.
    */

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #fff;
    }

    img {
      max-width: 100%;
    }

    .invoice {
      /* 72mm of content on the 80mm roll, centred. */
      width: 72mm;
      margin: 0 auto;
      padding: 11px 0;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.2;
      font-weight: 450;
    }

    .header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
    }

    .company-info .logo {
      height: 60px;
      width: auto;
      margin-bottom: 4px;
      display: block;
      margin-left: auto;
      margin-right: auto;
    }

    .company-info h1 {
      color: #000;
      font-size: 24px;
      font-weight: 700;
    }

    .company-info p {
      color: #000;
      font-size: 12px;
      margin-top: 2px;
    }

    .company-info .meta-date {
      font-size: 12px;
      margin-top: 4px;
      white-space: nowrap;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      table-layout: fixed;
    }

    thead th {
      background: #fff;
      color: #000;
      padding: 4px 2px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      border-bottom: 2px solid #000;
      overflow-wrap: break-word;
    }

    thead th:last-child,
    thead th:nth-child(n + 3) {
      text-align: right;
    }

    tbody td {
      padding: 4px 2px;
      font-size: 13px;
      overflow-wrap: break-word;
    }

    tbody td:last-child,
    tbody td:nth-child(n + 3) {
      text-align: right;
    }

    th:nth-child(1),
    td:nth-child(1) {
      width: 32%;
    }

    th:nth-child(2),
    td:nth-child(2) {
      width: 9%;
    }

    th:nth-child(3),
    td:nth-child(3) {
      width: 24%;
    }

    th:nth-child(4),
    td:nth-child(4) {
      width: 14%;
    }

    th:nth-child(5),
    td:nth-child(5) {
      width: 21%;
    }

    .totals {
      width: 100%;
      margin-left: auto;
    }

    .totals .row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 13px;
    }

    .totals .row.total {
      font-size: 16px;
      font-weight: 700;
      border-top: 2px solid #000;
      padding-top: 4px;
      margin-top: 3px;
    }

    .returns-policy {
      margin-top: 10px;
      text-align: center;
    }

    .returns-policy p {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.3;
      text-transform: uppercase;
    }

    .returns-policy .thanks {
      margin-top: 4px;
      font-weight: 700;
      text-transform: none;
    }
  </style>
</head>

<body>

  <div class="invoice">

    <div class="header">
      <div class="company-info">

        <img
          class="logo"
          src="${LOGO_DATA_URI}"
          alt="ON TARGET UNITED logo"
        />

        <h1>ON TARGET UNITED</h1>

        <p>BLOCK C SHOP # 74 CHINA MALL, SPRINGFIELD, DURBAN</p>

        <p>Tel: 078 863 8987 | 067 606 1458</p>

        <p class="meta-date">${saleStamp}</p>

      </div>
    </div>

    <table>

      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>VAT %</th>
          <th>Line Total</th>
        </tr>
      </thead>

      <tbody>

        ${items
          .map(
            (item) => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>${fmt(item.unit_price)}</td>
            <td>${item.vat_rate}%</td>
            <td>${fmt(item.line_total)}</td>
          </tr>
        `,
          )
          .join("")}

      </tbody>

    </table>

    <div class="totals">

      <div class="row">
        <span>Subtotal</span>
        <span>${fmt(Number(sale.subtotal))}</span>
      </div>

      <div class="row">
        <span>VAT</span>
        <span>${fmt(Number(sale.vat_total))}</span>
      </div>

      ${
        Number(sale.discount_total) > 0
          ? `
        <div class="row">
          <span>Discount</span>
          <span>-${fmt(Number(sale.discount_total))}</span>
        </div>
      `
          : ""
      }

      <div class="row total">
        <span>Total</span>
        <span>${fmt(Number(sale.total))}</span>
      </div>

    </div>

    <div class="returns-policy">

      <p>
        NO RETURN, NO REFUND. EXCHANGE ONLY IN 7 DAYS WITH VALID
        PROOF OF PURCHASE.
        <br />
        ITEM SHOULD BE ORIGINAL PACKING &amp; RESALABLE
      </p>

      <p class="thanks">
        Thanks for shopping with us!
      </p>

    </div>

  </div>

</body>

</html>
`;
}

/**
 * Print an invoice directly to the 80mm thermal printer through QZ Tray.
 * No browser print dialog is involved. Rejects with a QzError the caller can
 * surface to the cashier.
 */
export function printInvoice(
  sale: Sale,
  items: SaleItem[],
  options: { printerName?: string } = {},
): Promise<PrintReceiptResult> {
  return printReceiptHtml(generateInvoiceHTML(sale, items), {
    printerName: options.printerName,
    jobName: `Invoice ${sale.invoice_number}`,
  });
}

/**
 * printInvoice for the plain buttons that have no error UI of their own: the
 * cashier gets an alert instead of a silently dropped receipt. Screens with
 * richer feedback should use printInvoice / useThermalPrinter directly.
 */
export async function printInvoiceWithAlert(
  sale: Sale,
  items: SaleItem[],
): Promise<boolean> {
  try {
    await printInvoice(sale, items);
    return true;
  } catch (err) {
    alert(`Could not print invoice ${sale.invoice_number}:\n${describePrintError(err)}`);
    return false;
  }
}

export { PAPER_WIDTH_MM };
