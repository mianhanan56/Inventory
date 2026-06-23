import { format } from 'date-fns';
import { Sale, SaleItem } from '../types';

export function generateInvoiceHTML(sale: Sale, items: SaleItem[]) {
  const customer = sale.customer;
  const fmt = (v: number) => `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const date = format(new Date(sale.created_at), 'dd MMMM yyyy');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${sale.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; }
    .invoice { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #d4a017; padding-bottom: 20px; }
    .company-info h1 { color: #0d1240; font-size: 28px; font-weight: 700; }
    .company-info p { color: #6b7280; font-size: 13px; margin-top: 4px; }
    .invoice-badge { background: #0d1240; color: #d4a017; padding: 12px 24px; border-radius: 8px; text-align: right; }
    .invoice-badge h2 { font-size: 20px; font-weight: 700; }
    .invoice-badge p { font-size: 12px; color: #9fa8da; margin-top: 2px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 40px; }
    .party { flex: 1; }
    .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 8px; }
    .party p { font-size: 14px; color: #1a1a2e; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #0d1240; color: white; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:last-child, thead th:nth-child(n+3) { text-align: right; }
    tbody td { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    tbody td:last-child, tbody td:nth-child(n+3) { text-align: right; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .totals { margin-left: auto; width: 300px; }
    .totals .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #374151; }
    .totals .row.total { font-size: 20px; font-weight: 700; color: #0d1240; border-top: 2px solid #d4a017; padding-top: 12px; margin-top: 8px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; }
    .footer p { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .vat-note { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-top: 20px; font-size: 12px; color: #166534; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: #0d1240; color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 999; }
    .print-btn:hover { background: #1a237e; }
    @media print { .print-btn { display: none; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="company-info">
        <h1>ON TARGET UNITED</h1>
        <p>VAT Registration: 4123456789</p>
        <p>123 Business Park, Sandton, Gauteng, 2196</p>
        <p>Tel: +27 11 123 4567 | info@ontargetunited.co.za</p>
      </div>
      <div class="invoice-badge">
        <h2>TAX INVOICE</h2>
        <p>${sale.invoice_number}</p>
        <p>${date}</p>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Bill From</h3>
        <p><strong>ON TARGET UNITED</strong></p>
        <p>123 Business Park</p>
        <p>Sandton, Gauteng, 2196</p>
        <p>South Africa</p>
        <p>VAT No: 4123456789</p>
      </div>
      <div class="party">
        <h3>Bill To</h3>
        ${customer ? `
          <p><strong>${customer.name}</strong></p>
          ${customer.address ? `<p>${customer.address}</p>` : ''}
          ${customer.city || customer.province ? `<p>${[customer.city, customer.province].filter(Boolean).join(', ')}</p>` : ''}
          <p>South Africa</p>
          ${customer.vat_number ? `<p>VAT No: ${customer.vat_number}</p>` : ''}
        ` : `
          <p><strong>Walk-in Customer</strong></p>
          <p>Cash Sale</p>
        `}
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

    <div class="vat-note">
      Tax Invoice as per Section 54 of the Value-Added Tax Act, No. 89 of 1991. VAT included where applicable at 15%.
    </div>

    <div class="footer">
      <p><strong>ON TARGET UNITED</strong> | VAT Reg: 4123456789</p>
      <p>Payment Method: ${sale.payment_method.toUpperCase()} | Thank you for your business!</p>
      <p>Bank: FNB | Account: 62789012345 | Branch: 250655</p>
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
