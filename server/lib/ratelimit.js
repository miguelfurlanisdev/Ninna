/**
 * Limitador de requisições em memória (janela deslizante simples).
 * 🔧 EDITAR: limites usados em cada rota (veja chamadas a `limit(...)`).
 * ⚠️ Em memória = por processo. Com vários servidores, use Redis ou similar.
 */
import { HttpError } from './http.js';

const buckets = new Map();

/** Lança 429 se a chave exceder `max` ações em `windowMs`. */
export function limit(key, max, windowMs) {
  if (process.env.NINNA_TEST === '1') return; // testes automatizados criam muitas contas seguidas
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retry = Math.ceil((windowMs - (now - arr[0])) / 1000);
    throw new HttpError(429, `Muitas tentativas. Aguarde ${retry}s e tente novamente.`, { retryAfter: retry });
  }
  arr.push(now);
  buckets.set(key, arr);
}

// Limpeza periódica para não crescer para sempre
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) if (!arr.length || now - arr[arr.length - 1] > 3600_000) buckets.delete(k);
}, 600_000).unref();
