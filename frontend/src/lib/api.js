function withQuery(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload.detail || `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return response.json();
}

export function getDataDates(ticker = 'SPX') {
  return request(withQuery('/api/data/dates', { ticker }));
}

export function getSpxGamma(date, ticker = 'SPX') {
  return request(withQuery('/api/gex/spx', { date, ticker }));
}

export function refreshSpxGamma(date, force = false, ticker = 'SPX') {
  return request(withQuery('/api/gex/spx/refresh', { date, force, ticker }), { method: 'POST' });
}
