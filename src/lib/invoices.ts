import { Sale, SaleItem } from '../types';
import { LOGO_DATA_URI } from './logo';

export function generateInvoiceHTML(sale: Sale, items: SaleItem[]) {
  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${sale.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; background: #fff; line-height: 1.2; font-weight: 450; }
    .invoice { max-width: 800px; margin: 0 auto; padding: 20px 2px 2px; }
    .header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }
    .company-info .logo { height: 60px; width: auto; margin-bottom: 4px; display: block; margin-left: auto; margin-right: auto; }
    .company-info h1 { color: #000; font-size: 24px; font-weight: 700; }
    .company-info p { color: #000; font-size: 12px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
    thead th { background: #fff; color: #000; padding: 4px 2px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0; border-bottom: 2px solid #000; word-wrap: break-word; overflow-wrap: break-word; }
    thead th:last-child, thead th:nth-child(n+3) { text-align: right; }
    tbody td { padding: 4px 2px; border-bottom: 1px solid #000; font-size: 13px; word-wrap: break-word; overflow-wrap: break-word; }
    tbody td:last-child, tbody td:nth-child(n+3) { text-align: right; }
    th:nth-child(1), td:nth-child(1) { width: 32%; }
    th:nth-child(2), td:nth-child(2) { width: 9%; }
    th:nth-child(3), td:nth-child(3) { width: 24%; }
    th:nth-child(4), td:nth-child(4) { width: 14%; }
    th:nth-child(5), td:nth-child(5) { width: 21%; }
    .totals { margin-left: auto; width: 100%; }
    .totals .row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; color: #000; }
    .totals .row.total { font-size: 16px; font-weight: 700; color: #000; border-top: 2px solid #000; padding-top: 4px; margin-top: 3px; }
    .returns-policy { margin-top: 10px; text-align: center; }
    .returns-policy p { font-size: 12px; font-weight: 600; color: #000; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.3; }
    .returns-policy .thanks { margin-top: 4px; font-weight: 700; text-transform: none; color: #000; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999; }
    .print-btn:hover { background: #333; }
    @media print {
      @page { size: 80mm auto; margin: 0; }
      html, body { width: 80mm; margin: 0; padding: 0; }
      .print-btn { display: none; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* 80mm roll: printable area is ~72mm, ~4mm non-printable each side.
         Content is 72mm centred so nothing is clipped on the right edge. */
      .invoice { width: 72mm; max-width: none; margin: 0 auto; padding: 4mm 0 3mm; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-info">
        <img class="logo" src="${LOGO_DATA_URI}" alt="ON TARGET UNITED logo" />
        <h1>ON TARGET UNITED</h1>
        <p>BLOCK C SHOP # 74 CHINA MALL, SPRINGFIELD, DURBAN</p>
        <p>Tel: 078 863 8987 | 067 606 1458</p>
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
        ${items.map(item => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>${fmt(item.unit_price)}</td>
            <td>${item.vat_rate}%</td>
            <td>${fmt(item.line_total)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${fmt(Number(sale.subtotal))}</span></div>
      <div class="row"><span>VAT</span><span>${fmt(Number(sale.vat_total))}</span></div>
      ${Number(sale.discount_total) > 0 ? `<div class="row"><span>Discount</span><span>-${fmt(Number(sale.discount_total))}</span></div>` : ''}
      <div class="row total"><span>Total</span><span>${fmt(Number(sale.total))}</span></div>
    </div>

    <div class="returns-policy">
      <p>NO RETURN, NO REFUND. EXCHANGE ONLY IN 7 DAYS WITH VALID PROOF OF PURCHASE.<br>ITEM SHOULD BE ORIGINAL PACKING &amp; RESALABLE</p>
      <p class="thanks">Thanks for shopping with us!</p>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
    Print Invoice
  </button>
</body>
</html>`;
}

export function openInvoiceWindow(sale: Sale, items: SaleItem[]) {
  const html = generateInvoiceHTML(sale, items);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

export function printInvoice(sale: Sale, items: SaleItem[]) {
  openInvoiceWindow(sale, items);
}
