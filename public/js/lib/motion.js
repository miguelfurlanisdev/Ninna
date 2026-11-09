/**
 * ============================================================
 *  motion.js — animações (sem bibliotecas: CSS + Web Animations API)
 * ============================================================
 *  Por que não Framer Motion? A NINNA roda sem etapa de build (mais simples de subir
 *  e manter). Estas utilidades cobrem: cards em cascata, contadores, barras de progresso
 *  e confete discreto. TODAS respeitam "reduzir movimento" do sistema.
 *  🔧 EDITAR: durações/atrasos aqui; curvas em css/tokens.css (--ease).
 */
export const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let io;
/** Faz elementos com a classe .reveal aparecerem em cascata ao entrarem na tela. */
export function revealAll(root = document) {
  const els = [...root.querySelectorAll('.reveal:not(.in)')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  io ||= new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  els.forEach((e, i) => { e.style.setProperty('--d', Math.min(i, 8) * 70 + 'ms'); io.observe(e); });
}

/** Anima um número de 0 até `to` dentro do elemento. */
export function countUp(el, to, { ms = 900, format = (n) => String(Math.round(n)) } = {}) {
  if (reduced() || !Number.isFinite(to)) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = format(to * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Preenche uma barra .progress > i até `pct` (0–100) com animação. */
export function fillBar(bar, pct) {
  const i = bar.querySelector('i'); if (!i) return;
  requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = Math.max(0, Math.min(100, pct)) + '%'; }));
}

/** Confete bem discreto para conquistas (6–14 pecinhas). */
export function celebrate(origin) {
  if (reduced()) return;
  const r = origin?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const colors = ['#C9786B', '#86A481', '#C9BBE3', '#2C5446', '#E3A99B'];
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('i'); p.className = 'confetti';
    p.style.left = cx + 'px'; p.style.top = cy + 'px'; p.style.background = colors[i % colors.length];
    document.body.append(p);
    const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.5, d = 50 + Math.random() * 60;
    p.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 30}px) rotate(${Math.random() * 360}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
  }
}

/** Pulso verde rápido: feedback visual de "salvo". */
export function pulseOk(el) {
  if (!el || reduced()) return;
  el.classList.remove('pulse-ok'); void el.offsetWidth; el.classList.add('pulse-ok');
}
