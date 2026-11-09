/**
 * ============================================================
 *  api.js — comunicação com o servidor (/api/*)
 * ============================================================
 *  - Envia cookies de sessão automaticamente.
 *  - Converte erros em ApiError com mensagem pronta para mostrar à usuária.
 *  - Detecta falta de conexão e avisa (evento "ninna:offline").
 *  - Se a sessão expirar (401), dispara "ninna:unauth" para voltar ao login.
 */
export class ApiError extends Error {
  constructor(message, status = 0, data = {}) { super(message); this.status = status; this.data = data; }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api' + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    if ([...qs].length) url += '?' + qs;
  }
  let res;
  try {
    res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    window.dispatchEvent(new Event('ninna:offline'));
    throw new ApiError('Sem conexão com a internet (ou o servidor está fora do ar). Verifique e tente novamente.', 0);
  }
  let data = {};
  try { data = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('ninna:unauth'));
    throw new ApiError(data.error || 'Algo deu errado. Tente novamente.', res.status, data);
  }
  return data;
}

// Atalhos
export const get = (p, query) => api(p, { query });
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });
