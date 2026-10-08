export function formatCurrency(value: number) {
  // Use space as thousands separator and dot as decimal separator, two decimals
  const parts = value.toFixed(2).split('.');
  const intPart = parts[0];
  const decPart = parts[1];
  // Insert spaces as thousand separators
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `R ${withSep}.${decPart}`;
}

export default formatCurrency;
