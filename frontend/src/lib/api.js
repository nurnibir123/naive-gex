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

const pendingRequests = new Map();

function getOnce(path) {
  if (!pendingRequests.has(path)) {
    pendingRequests.set(path, request(path).finally(() => pendingRequests.delete(path)));
  }
  return pendingRequests.get(path);
}

export function getDataDates(ticker = 'SPX') {
  return getOnce(withQuery('/api/data/dates', { ticker }));
}

export function getSpxGamma(date, ticker = 'SPX') {
  return getOnce(withQuery('/api/gex/spx', { date, ticker }));
}

export function refreshSpxGamma(date, force = false, ticker = 'SPX') {
  return request(withQuery('/api/gex/spx/refresh', { date, force, ticker }), { method: 'POST' });
}
