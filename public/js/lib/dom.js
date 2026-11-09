/**
 * ============================================================
 *  dom.js — criador de elementos seguro (substitui innerHTML)
 * ============================================================
 *  Uso:  h('div', { class: 'card', onclick: fn }, 'texto', h('b', {}, 'negrito'))
 *  - Textos viram nós de texto (nunca HTML) → protege contra XSS.
 *  - Props: class, style (texto ou objeto), data-*, aria-*, on<evento>, e atributos normais.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Substitui todo o conteúdo de um elemento. */
export function setChildren(el, ...children) { el.replaceChildren(); return append(el, children); }

/** Atalhos de seleção. */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Cria um elemento SVG a partir de um texto FIXO e confiável (ícones/ilustrações do próprio código). */
export function svgFromString(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

/** Executa fn no máximo 1x a cada `ms` ms depois da última chamada (útil em buscas). */
export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
