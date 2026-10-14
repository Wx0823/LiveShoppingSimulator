import { toy } from './art.mjs';
import { getItem, SERIES, RARITIES } from './game.mjs';

let sceneSerial = 0;
const hostAtlas = new URL('../assets/host-xiaotao-atlas.png', import.meta.url).href;
// Keep the source atlas intact; SVG viewports select each transparent rigging layer.
const texture = (viewBox, x, y, width, height) => `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="none" overflow="hidden"><image href="${hostAtlas}" x="0" y="0" width="1882" height="836"/></svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** Presentation only. Cancelling a performance always settles its original promise. */
export function createLiveScene({ container, onCue = () => {} }) {
  if (!container) throw new TypeError('Live scene requires a container.');
  const uid = `live-actor-${++sceneSerial}`;
  const root = document.createElement('div');
  root.className = 'actor-stage';
  root.dataset.phase = 'idle';
  root.dataset.testid = 'live-actor';
  root.innerHTML = `<div class="actor-spotlight"></div><svg class="actor-canvas" viewBox="0 0 520 470" aria-label="小桃正在直播拆盲袋" role="img">
    <defs>
      <linearGradient id="${uid}-hoodie" x2=".9" y2="1"><stop stop-color="#ffbb80"/><stop offset="1" stop-color="#df7952"/></linearGradient>
      <linearGradient id="${uid}-skin" x2=".6" y2="1"><stop stop-color="#ffe5cc"/><stop offset="1" stop-color="#efb593"/></linearGradient>
      <linearGradient id="${uid}-bag" x2="1" y2=".7"><stop stop-color="#fff9e6"/><stop offset=".46" stop-color="#f4d89b"/><stop offset=".64" stop-color="#fff4cc"/><stop offset="1" stop-color="#dcb57b"/></linearGradient>
      <radialGradient id="${uid}-glow"><stop stop-color="#fff6c3" stop-opacity=".95"/><stop offset=".45" stop-color="#ffc978" stop-opacity=".4"/><stop offset="1" stop-color="#ffc978" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="284" cy="451" rx="162" ry="16" fill="#45362d" opacity=".16"/>
    <g class="actor-figure actor-portrait" data-testid="actor-portrait">
      ${texture('112 4 490 828', 157.3, 55, 225.4, 380.88)}
    </g>
    <g class="actor-arm actor-arm-left" data-testid="actor-left-arm">
      <g transform="rotate(40 166 246)">${texture('680 345 350 410', 136.6, 222.9, 147, 172.2)}</g>
    </g>
    <g class="actor-arm actor-arm-right" data-testid="actor-right-arm">
      <g transform="rotate(-40 374 246)">${texture('1470 345 365 410', 260.6, 222.9, 153.3, 172.2)}</g>
    </g>
    <g class="actor-result-light"><ellipse cx="270" cy="302" rx="180" ry="170" fill="url(#${uid}-glow)"/><path d="M270 162v-25m97 63 19-18m-206 18-19-18m210 121h25m-250 0h-23" stroke="#ffe6a2" stroke-width="5" stroke-linecap="round"/></g>
    <g class="actor-result-card" data-testid="actor-result-card"></g>
    <g class="actor-bag-frame" data-testid="actor-bag">
      <g class="actor-bag-half actor-bag-left"><path d="M215 312h56l-6 16 11 15-10 19 8 19-9 19 6 21h-64Z" fill="url(#${uid}-bag)" stroke="#c7a06b" stroke-width="2"/><path d="M212 324h53m-56 85h57" stroke="#c09d68" stroke-width="3" stroke-dasharray="2 3"/><path d="M226 336l-4 63" stroke="#fffaf0" stroke-width="5" opacity=".6"/></g>
      <g class="actor-bag-half actor-bag-right"><path d="M271 312h54l8 109h-62l-6-21 9-19-8-19 10-19-11-15Z" fill="url(#${uid}-bag)" stroke="#c7a06b" stroke-width="2"/><path d="M275 324h50m-49 85h53" stroke="#c09d68" stroke-width="3" stroke-dasharray="2 3"/><path d="M316 339l5 57" stroke="#d2ad78" stroke-width="3" opacity=".5"/></g>
      <g class="actor-bag-print"><circle cx="270" cy="365" r="28" fill="#ecac79"/><path d="M270 342l6 15 16 7-16 6-6 16-6-16-16-6 16-7Z" fill="#fff9e5"/><text class="actor-bag-number" x="270" y="405" text-anchor="middle" fill="#896a45" font-size="10" font-weight="700" letter-spacing="2">BLIND BAG / 01</text></g>
    </g>
    <g class="actor-confetti">${Array.from({ length: 12 }, (_, index) => `<rect class="actor-spark" x="${264 + index % 3 * 5}" y="320" width="${index % 2 ? 5 : 8}" height="${index % 2 ? 11 : 6}" rx="1" fill="${['#ffd78b', '#f59e7d', '#fff9d9', '#a6cdb9'][index % 4]}"/>`).join('')}</g>
    <g class="actor-table"><path d="M93 439h354l28 23H72Z" fill="#f5dbb6" stroke="#c9a27d" stroke-width="2"/><path d="M72 462h403v8H72Z" fill="#b48361"/><path d="M139 444h236l14 12H125Z" fill="#729084" stroke="#43675c" stroke-width="1.5"/><path d="M151 449h212" stroke="#b7d4bd" stroke-width="1" stroke-dasharray="3 6"/></g>
  </svg><div class="actor-live-note"><i></i><span>小桃正在拆袋</span></div>`;
  container.append(root);
  const node = selector => root.querySelector(selector);
  const parts = {
    left: node('.actor-arm-left'), right: node('.actor-arm-right'), bag: node('.actor-bag-frame'),
    bagLeft: node('.actor-bag-left'), bagRight: node('.actor-bag-right'), print: node('.actor-bag-print'),
    card: node('.actor-result-card'), light: node('.actor-result-light'),

  };
  // Textured arms include their hands; place them above the bag and below the revealed card.
  parts.bag.after(parts.left, parts.right, parts.card);
  let active = null;
  let destroyed = false;

  function reset() {
    const run = active;
    active = null;
    if (run) {
      for (const timer of run.timers) clearTimeout(timer);
      for (const animation of run.animations) animation.cancel();
      run.resolve({ cancelled: true });
    }
    root.dataset.phase = 'idle';
    delete root.dataset.player;
    node('.actor-live-note span').textContent = '小桃正在准备下一袋';
  }

  function play(order, { fast = false, reducedMotion = false } = {}) {
    if (destroyed) return Promise.resolve({ cancelled: true });
    reset();
    const item = getItem(order?.itemId) || SERIES[0].items[0];
    const rarity = RARITIES[item.rarity];
    const seriesColor = SERIES.find(series => series.id === order?.seriesId)?.color || '#f4d89b';
    root.querySelectorAll(`[id="${uid}-bag"] stop`).forEach((stop, index) => {
      if (index === 1 || index === 3) stop.setAttribute('stop-color', seriesColor);
    });
    root.style.setProperty('--actor-rarity', order?.isPlayer ? '#d9b77d' : rarity.color);
    root.dataset.player = String(Boolean(order?.isPlayer));
    root.classList.toggle('actor-reduced', reducedMotion);
    const owner = order?.owner || (order?.isPlayer ? '你的订单' : '直播间藏友');
    node('.actor-bag-number').textContent = `BLIND BAG / ${String(order?.boxNumber || 1).padStart(2, '0')}`;
    parts.card.innerHTML = order?.isPlayer
      ? '<rect x="204" y="239" width="132" height="166" rx="13" fill="#345e52" stroke="#ebcd92" stroke-width="5"/><rect x="213" y="248" width="114" height="148" rx="7" fill="none" stroke="#ebcd9270" stroke-width="1.5"/><path d="M270 270l33 52-33 52-33-52Z" fill="#537b64" stroke="#ebcd92" stroke-width="1.5"/><text x="270" y="337" text-anchor="middle" font-size="44" font-weight="800" fill="#ffedbc">?</text><text x="270" y="386" text-anchor="middle" font-size="10" font-weight="700" fill="#fff2d6">你的惊喜 · 即将揭晓</text>'
      : `<rect x="204" y="239" width="132" height="166" rx="13" fill="#fffcf1" stroke="${rarity.color}" stroke-width="5"/><rect x="211" y="246" width="118" height="19" rx="7" fill="${rarity.color}"/><text x="270" y="259" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${escape(rarity.name)} · COLLECTIBLE</text><svg x="214" y="264" width="112" height="112" viewBox="0 0 160 160">${toy(item).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</svg><text x="270" y="388" text-anchor="middle" font-size="12" font-weight="700" fill="#3c5146">${escape(item.name)}</text>`;
    const scale = fast ? .28 : 1;
    const times = reducedMotion ? [0, 100, 220, 340, 850, 1000] : [0, 800, 1650, 2320, 4250, 4950].map(time => time * scale);
    return new Promise(resolve => {
      const run = { timers: [], animations: [], resolve };
      active = run;
      const animate = (element, frames, duration, options = {}) => {
        if (!element.animate || reducedMotion) return;
        const animation = element.animate(frames, { duration: duration * scale, fill: 'forwards', easing: 'cubic-bezier(.22,.7,.25,1)', ...options });
        run.animations.push(animation);

      };
      const cue = phase => {
        if (active !== run) return;
        root.dataset.phase = phase;
        node('.actor-live-note span').textContent = ({ receive: `${owner} · 接单拿袋`, grip: '捏住封口，准备拆！', tear: '撕开啦——', reveal: `${owner} · ${order?.isPlayer ? '即将揭晓' : item.name}`, clear: '收好这一份惊喜' })[phase];
        if (phase === 'receive') {
          animate(parts.bag, [{ transform: 'translate(-310px, 50px) rotate(-24deg)', opacity: 0 }, { transform: 'translate(-25px, -13px) rotate(8deg)', opacity: 1, offset: .8 }, { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 }], 780);
          animate(parts.left, [{ transform: 'rotate(18deg)' }, { transform: 'rotate(0deg)' }], 780);
        } else if (phase === 'grip') {
          animate(parts.left, [{ transform: 'rotate(0deg)' }, { transform: 'translate(4px, -5px) rotate(-3deg)' }, { transform: 'translate(1px, 0) rotate(0deg)' }], 800);
          animate(parts.right, [{ transform: 'rotate(0deg)' }, { transform: 'translate(-4px, -5px) rotate(3deg)' }, { transform: 'translate(-1px, 0) rotate(0deg)' }], 800);
          animate(parts.bag, [{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(0,-4px) scale(1.04,.97)', offset: .55 }, { transform: 'translate(0,0) scale(1)' }], 800);
        } else if (phase === 'tear') {
          animate(parts.left, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'rotate(20deg)', offset: .35 }, { transform: 'rotate(17deg)' }], 650);
          animate(parts.right, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'rotate(-20deg)', offset: .35 }, { transform: 'rotate(-17deg)' }], 650);
          animate(parts.bagLeft, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(-38px,20px) rotate(-14deg)' }], 580);
          animate(parts.bagRight, [{ transform: 'translate(0,0) rotate(0deg)' }, { transform: 'translate(38px,20px) rotate(14deg)' }], 580);
          animate(parts.print, [{ opacity: 1 }, { opacity: 0 }], 100);
          root.querySelectorAll('.actor-spark').forEach((spark, index) => {
            const angle = (index / 12) * Math.PI * 2;
            animate(spark, [{ opacity: 0, transform: 'translate(0,0) rotate(0)' }, { opacity: 1, offset: .12 }, { opacity: 0, transform: `translate(${Math.cos(angle) * 135}px,${Math.sin(angle) * 80 - 45}px) rotate(${index * 67}deg)` }], 1100);
          });
        } else if (phase === 'reveal') {
          animate(parts.card, [{ opacity: 0, transform: 'translate(0,80px) scale(.25,.7)' }, { opacity: 1, transform: 'translate(0,-43px) scale(1.08,1.08)', offset: .68 }, { opacity: 1, transform: 'translate(0,-32px) scale(1)' }], 900);
          animate(parts.light, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.1)', offset: .5 }, { opacity: .85, transform: 'scale(1)' }], 950);
        } else if (phase === 'clear') {
          animate(parts.card, [{ opacity: 1, transform: 'translate(0,-32px) scale(1)' }, { opacity: 0, transform: 'translate(100px,-55px) scale(.75)' }], 600);
          animate(parts.light, [{ opacity: .85 }, { opacity: 0 }], 400);
          animate(parts.bag, [{ opacity: 1, transform: 'translate(0,0)' }, { opacity: 0, transform: 'translate(15px,90px)' }], 550);
          animate(parts.left, [{ transform: 'rotate(17deg)' }, { transform: 'translate(0,0) rotate(0)' }], 650);
          animate(parts.right, [{ transform: 'rotate(-17deg)' }, { transform: 'translate(0,0) rotate(0)' }], 650);
        }
        // A consumer callback cannot strand this scene's playback promise.
        try { onCue(phase, order); } catch (error) { console.error('Live scene cue failed:', error); }
      };
      ['receive', 'grip', 'tear', 'reveal', 'clear'].forEach((phase, index) => {
        if (index > 0) run.timers.push(setTimeout(() => cue(phase), times[index]));
      });
      run.timers.push(setTimeout(() => {
        if (active !== run) return;
        active = null;
        for (const animation of run.animations) animation.cancel();
        root.dataset.phase = 'idle';
        node('.actor-live-note span').textContent = '下一袋，继续拆！';
        resolve({ cancelled: false });
      }, times[5]));
      cue('receive');
    });
  }

  return { play, reset, destroy() { destroyed = true; reset(); root.remove(); } };
}
