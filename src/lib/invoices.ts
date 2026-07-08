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
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #000; background: #fff; }
    .invoice { max-width: 800px; margin: 0 auto; padding: 20px 2px 2px; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #000; padding-bottom: 20px; }
    .company-info .logo { height: 80px; width: auto; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; }
    .company-info h1 { color: #000; font-size: 28px; font-weight: 700; }
    .company-info p { color: #000; font-size: 13px; margin-top: 4px; }
    .invoice-meta { text-align: right; }
    .invoice-meta p { font-size: 13px; color: #000; margin-top: 2px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 40px; }
    .party { flex: 1; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #000; margin-bottom: 8px; }
    .party p { font-size: 14px; color: #000; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #fff; color: #000; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #000; }
    thead th:last-child, thead th:nth-child(n+3) { text-align: right; }
    tbody td { padding: 12px 16px; border-bottom: 1px solid #000; font-size: 14px; }
    tbody td:last-child, tbody td:nth-child(n+3) { text-align: right; }
    .totals { margin-left: auto; width: 300px; }
    .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #000; }
    .totals .row.total { font-size: 20px; font-weight: 700; color: #000; border-top: 2px solid #000; padding-top: 12px; margin-top: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #000; text-align: center; }
    .footer p { font-size: 12px; color: #000; margin-bottom: 4px; }
    .returns-policy { margin-top: 24px; text-align: center; }
    .returns-policy p { font-size: 12px; font-weight: 600; color: #000; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.6; }
    .returns-policy .thanks { margin-top: 8px; font-weight: 700; text-transform: none; color: #000; }
    .vat-note { background: #fff; border: 1px solid #000; border-radius: 8px; padding: 12px 16px; margin-top: 20px; font-size: 12px; color: #000; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #000; color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999; }
    .print-btn:hover { background: #333; }
    @media print { .print-btn { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-info">
        <img class="logo" src="${LOGO_DATA_URI}" alt="ON TARGET UNITED logo" />
        <h1>ON TARGET UNITED</h1>
        <p>BLOCK C CHINA MALL, SPRINGFIELD, DURBAN</p>
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
