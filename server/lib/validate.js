/**
 * ============================================================
 *  Validação de entrada no SERVIDOR (nunca confie só no front-end)
 * ============================================================
 *  Exemplo de esquema:
 *    { title: {type:'string', min:1, max:120, required:true},
 *      done:  {type:'bool'} }
 *  Tipos: string, int, bool, date (AAAA-MM-DD), datetime (AAAA-MM-DDTHH:MM), enum, json
 *  Campos desconhecidos são IGNORADOS (nada além do esquema chega ao banco).
 */
import { HttpError } from './http.js';
import { parseISO } from '../../shared/gestation.js';

export function validate(body, schema, { partial = false } = {}) {
  const out = {};
  body = body && typeof body === 'object' ? body : {};
  for (const [key, rule] of Object.entries(schema)) {
    let val = body[key];
    const missing = val === undefined || val === null || val === '';
    if (missing) {
      if (rule.required && !partial) throw new HttpError(400, `Campo obrigatório: ${rule.label || key}.`);
      if (val === null || val === '') { if (rule.nullable !== false && key in body) out[key] = null; }
      else if (rule.default !== undefined && !partial) out[key] = rule.default;
      continue;
    }
    const label = rule.label || key;
    switch (rule.type) {
      case 'string': {
        if (typeof val !== 'string') throw new HttpError(400, `${label} inválido.`);
        val = val.trim().replace(/\u0000/g, '');
        if (val.length < (rule.min ?? 0)) throw new HttpError(400, `${label} é muito curto.`);
        if (val.length > (rule.max ?? 500)) throw new HttpError(400, `${label} é muito longo (máx. ${rule.max ?? 500}).`);
        break;
      }
      case 'int': {
        val = Number(val);
        if (!Number.isInteger(val) || val < (rule.min ?? -1e9) || val > (rule.max ?? 1e9)) throw new HttpError(400, `${label} inválido.`);
        break;
      }
      case 'bool': val = val === true || val === 1 || val === '1' || val === 'true' ? 1 : 0; break;
      case 'date':
        if (!parseISO(val)) throw new HttpError(400, `${label}: data inválida.`);
        break;
      case 'datetime':
        if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val) || !parseISO(val.slice(0, 10)))
          throw new HttpError(400, `${label}: data/hora inválida.`);
        break;
      case 'enum':
        if (!rule.values.includes(val)) throw new HttpError(400, `${label} inválido.`);
        break;
      case 'json': {
        const s = JSON.stringify(val);
        if (s.length > (rule.max ?? 5000)) throw new HttpError(400, `${label} muito grande.`);
        val = s;
        break;
      }
      default: throw new Error('tipo desconhecido ' + rule.type);
    }
    out[key] = val;
  }
  return out;
}
