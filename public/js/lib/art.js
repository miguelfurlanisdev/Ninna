/**
 * ============================================================
 *  art.js — logo e ilustrações editoriais (SVG próprio, sem imagens externas)
 *  🔧 EDITAR: cores usam os mesmos tons de css/tokens.css; formas ficam nas funções abaixo.
 * ============================================================
 */
import { svgFromString } from './dom.js';

const C = { forest: '#2C5446', deep: '#152B24', sage: '#86A481', sageL: '#E3ECE1', sageM: '#C8D8C5', cream: '#FAF6EE', rose: '#C9786B', roseL: '#F6E3DD', roseM: '#E3A99B', lav: '#C9BBE3', lavL: '#EFEAF7' };

/** Marca da NINNA: um berço/rede que acolhe uma pequena semente. */
export function logo(size = 34) {
  return svgFromString(`<svg viewBox="0 0 48 48" width="${size}" height="${size}" role="img" aria-label="NINNA"><circle cx="24" cy="24" r="24" fill="${C.forest}"/><path d="M11 24c1.6 9 8 13.5 13 13.5S35.4 33 37 24c-4.6 2.4-8.6 3.4-13 3.4S15.6 26.4 11 24z" fill="${C.cream}"/><circle cx="24" cy="16.5" r="5.2" fill="${C.roseM}"/></svg>`);
}

/**
 * Flor que "abre" conforme a semana (1–42): mais pétalas e maior a cada semana.
 * É uma ilustração simbólica — NÃO representa o tamanho real do bebê.
 */
export function bloomArt(week = 20, { size = 280, label } = {}) {
  const w = Math.max(1, Math.min(42, week)), t = w / 40;
  const petals = 5 + Math.round(t * 7);
  const len = 30 + t * 50, wid = 16 + t * 16;
  let pet = '';
  for (let i = 0; i < petals; i++) {
    const a = (360 / petals) * i;
    pet += `<ellipse cx="160" cy="${150 - len * 0.55}" rx="${wid / 2}" ry="${len / 2}" transform="rotate(${a} 160 150)" fill="${i % 2 ? C.lav : C.roseM}" opacity=".92"/>`;
  }
  const core = 14 + t * 10;
  const leaves = Math.min(1 + Math.floor(w / 9), 4);
  let lv = '';
  for (let i = 0; i < leaves; i++) {
    const y = 232 + i * 17, s = i % 2 ? 1 : -1;
    lv += `<path d="M160 ${y} q${s * 34} -18 ${s * 54} -${6 + i * 3} q${-s * 14} 24 ${-s * 54} ${6 + i * 3}z" fill="${i % 2 ? C.sage : C.forest}" opacity=".9"/>`;
  }
  return svgFromString(`<svg viewBox="0 0 320 320" width="${size}" height="${size}" role="img" aria-label="${label || `Ilustração simbólica da semana ${w}`}" class="art">
    <circle cx="160" cy="160" r="146" fill="${C.sageL}"/>
    <circle cx="214" cy="104" r="62" fill="${C.lavL}"/>
    <g class="art-orbit"><circle cx="160" cy="160" r="132" fill="none" stroke="${C.sageM}" stroke-dasharray="2 9" stroke-linecap="round" stroke-width="2.5"/><circle cx="160" cy="28" r="6" fill="${C.rose}"/><circle cx="292" cy="160" r="4" fill="${C.sage}"/></g>
    <path d="M160 190 C158 230 164 262 160 300" stroke="${C.forest}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    ${lv}
    <g class="art-breathe">${pet}<circle cx="160" cy="150" r="${core}" fill="${C.cream}"/><circle cx="160" cy="150" r="${core * 0.42}" fill="${C.rose}"/></g>
  </svg>`);
}

/** Ilustração para quem está tentando engravidar: anel do ciclo com a fase marcada. */
export function cycleArt({ day = 1, length = 28, size = 280 } = {}) {
  const r = 108, circ = 2 * Math.PI * r, pct = Math.min(1, day / length);
  const ang = pct * 2 * Math.PI - Math.PI / 2;
  const ox = 160 + r * Math.cos(2 * Math.PI * ((length - 14) / length) - Math.PI / 2);
  const oy = 160 + r * Math.sin(2 * Math.PI * ((length - 14) / length) - Math.PI / 2);
  return svgFromString(`<svg viewBox="0 0 320 320" width="${size}" height="${size}" role="img" aria-label="Ilustração do ciclo menstrual: dia ${day} de cerca de ${length}" class="art">
    <circle cx="160" cy="160" r="146" fill="${C.lavL}"/><circle cx="110" cy="214" r="64" fill="${C.roseL}"/>
    <g class="art-orbit"><circle cx="160" cy="160" r="132" fill="none" stroke="${C.lav}" stroke-dasharray="2 9" stroke-linecap="round" stroke-width="2.5"/><circle cx="160" cy="28" r="5" fill="${C.sage}"/></g>
    <circle cx="160" cy="160" r="${r}" fill="none" stroke="${C.sageM}" stroke-width="14"/>
    <circle cx="160" cy="160" r="${r}" fill="none" stroke="${C.forest}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${circ * pct} ${circ}" transform="rotate(-90 160 160)" class="art-ring"/>
    <circle cx="${ox}" cy="${oy}" r="9" fill="${C.cream}" stroke="${C.rose}" stroke-width="3"/>
    <circle cx="${160 + r * Math.cos(ang)}" cy="${160 + r * Math.sin(ang)}" r="9" fill="${C.rose}"/>
    <g class="art-breathe"><path d="M160 140c-8-14-26-6-24 8 2 14 24 26 24 26s22-12 24-26c2-14-16-22-24-8z" fill="${C.roseM}"/></g>
  </svg>`);
}

/** Ilustração do pós-parto: berço com lua e estrelas. */
export function cradleArt({ size = 280 } = {}) {
  return svgFromString(`<svg viewBox="0 0 320 320" width="${size}" height="${size}" role="img" aria-label="Ilustração de um berço sob a lua" class="art">
    <circle cx="160" cy="160" r="146" fill="${C.roseL}"/><circle cx="108" cy="106" r="54" fill="${C.lavL}"/>
    <g class="art-orbit"><circle cx="160" cy="160" r="132" fill="none" stroke="${C.roseM}" stroke-dasharray="2 9" stroke-linecap="round" stroke-width="2.5"/><circle cx="160" cy="28" r="5" fill="${C.forest}"/></g>
    <path d="M118 96a28 28 0 1 0 30 38 22 22 0 0 1-30-38z" fill="${C.cream}"/>
    <g class="art-breathe"><circle cx="205" cy="110" r="4" fill="${C.rose}"/><circle cx="232" cy="140" r="3" fill="${C.sage}"/><circle cx="186" cy="82" r="3" fill="${C.forest}"/></g>
    <path d="M70 188c5 44 44 70 90 70s85-26 90-70c-30 14-60 20-90 20s-60-6-90-20z" fill="${C.forest}"/>
    <path d="M92 190c4 28 30 44 68 44s64-16 68-44c-22 8-44 11-68 11s-46-3-68-11z" fill="${C.cream}"/>
    <circle cx="160" cy="184" r="22" fill="${C.roseM}"/><path d="M150 186q10 8 20 0" stroke="${C.deep}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M100 262h120" stroke="${C.forest}" stroke-width="5" stroke-linecap="round"/>
  </svg>`);
}

/** Ilustração para quem apoia: duas mãos/corações entrelaçados. */
export function supportArt({ size = 280 } = {}) {
  return svgFromString(`<svg viewBox="0 0 320 320" width="${size}" height="${size}" role="img" aria-label="Ilustração de dois corações juntos" class="art">
    <circle cx="160" cy="160" r="146" fill="${C.sageL}"/><circle cx="220" cy="226" r="60" fill="${C.lavL}"/>
    <g class="art-orbit"><circle cx="160" cy="160" r="132" fill="none" stroke="${C.sageM}" stroke-dasharray="2 9" stroke-linecap="round" stroke-width="2.5"/><circle cx="160" cy="28" r="5" fill="${C.rose}"/></g>
    <g class="art-breathe"><path d="M130 130c-14-22-46-8-42 18 4 26 42 50 42 50s38-24 42-50c4-26-28-40-42-18z" fill="${C.roseM}"/>
    <path d="M200 150c-10-16-34-6-31 13 3 19 31 36 31 36s28-17 31-36c3-19-21-29-31-13z" fill="${C.forest}"/></g>
  </svg>`);
}

/** Escolhe a ilustração certa para a fase da usuária. */
export function heroArt(stage, ctx = {}) {
  if (stage === 'pregnant') return bloomArt(ctx.week || 1, { size: ctx.size });
  if (stage === 'trying') return cycleArt({ day: ctx.day || 1, length: ctx.length || 28, size: ctx.size });
  if (stage === 'postpartum') return cradleArt({ size: ctx.size });
  return supportArt({ size: ctx.size });
}

/** Folhagem decorativa para a página inicial. */
export function botanical({ size = 320 } = {}) {
  return svgFromString(`<svg viewBox="0 0 320 320" width="${size}" height="${size}" aria-hidden="true" class="art">
    <path d="M160 316C150 240 154 160 160 40" stroke="${C.forest}" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${158 - i * 0.5} ${270 - i * 44} q-60 -10 -84 -${34 + i * 4} q56 -6 84 ${34 + i * 4}z" fill="${i % 2 ? C.sage : C.forest}" opacity=".92"/><path d="M${161 + i * 0.5} ${248 - i * 44} q60 -10 84 -${30 + i * 4} q-56 -6 -84 ${30 + i * 4}z" fill="${i % 2 ? C.forest : C.sage}" opacity=".92"/>`).join('')}
    <circle cx="160" cy="34" r="16" fill="${C.roseM}"/><circle cx="160" cy="34" r="6" fill="${C.cream}"/>
  </svg>`);
}
