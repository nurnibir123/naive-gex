const numberFormatter = new Intl.NumberFormat('en-US');

export function formatWithCommas(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return numberFormatter.format(Number(value));
}

export function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return Number(value).toFixed(2);
}

export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return `${Number(value).toFixed(2)}%`;
}

export function formatNotionalBn(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }

  const amount = Number(value);
  const absAmount = Math.abs(amount);
  if (absAmount >= 1) {
    return `${amount.toFixed(2)} Bn`;
  }
  return `${(amount * 1000).toFixed(2)} Mn`;
}
