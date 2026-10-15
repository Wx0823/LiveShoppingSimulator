import { RARITIES } from './game.mjs';
import { toy } from './art.mjs';

// This seed generates presentation only. The paid, persisted order owns the award.
function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function buildReel(items, winnerId, seed) {
  if (!Array.isArray(items) || !items.length || items.some(item => !item || typeof item.id !== 'string' || !RARITIES[item.rarity])) {
    throw new Error('开箱展示需要有效的系列藏品。');
  }
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('系列藏品编号不能重复。');
  const winner = items.find(item => item.id === winnerId);
  if (!winner) throw new Error('已支付订单的藏品不属于当前系列。');
  if (typeof seed !== 'string' && !(typeof seed === 'number' && Number.isFinite(seed))) throw new Error('开箱展示种子无效。');
  const rng = seededRandom(seed);
  const groups = Object.entries(RARITIES).map(([rarity, definition]) => ({
    chance: definition.chance, items: items.filter(item => item.rarity === rarity),
  })).filter(group => group.items.length);
  const total = groups.reduce((sum, group) => sum + group.chance, 0);
  const pick = () => {
    let roll = rng() * total;
    const selected = groups.find(group => { roll -= group.chance; return roll < 0; }) || groups.at(-1);
    return selected.items[Math.floor(rng() * selected.items.length)];
  };
  const cards = Array.from({ length: 48 }, pick);
  const winnerIndex = cards.length - 7;
  cards[winnerIndex] = winner;
  return { items: cards, winnerIndex };
}

const escapeXml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

// Integrate a short acceleration, a steady run, then a long deceleration.
// The curve only controls presentation distance, never the awarded item.
function motionAt(time) {
  const t = Math.max(0, Math.min(1, time));
  const acceleration = .12;
  const braking = .25;
  const power = 1.6;
  const brakeArea = (1 - braking) / (power + 1);
  const area = acceleration / 2 + braking - acceleration + brakeArea;
  if (t < acceleration) return { progress: t * t / (2 * acceleration * area), speed: t / acceleration, area };
  if (t < braking) return { progress: (acceleration / 2 + t - acceleration) / area, speed: 1, area };
  const remaining = (1 - t) / (1 - braking);
  return { progress: 1 - brakeArea * remaining ** (power + 1) / area, speed: remaining ** power, area };
}

/** Animate a saved award, never draw an award. Resolves after the winning card is revealed. */
export function playReel({ container, items, winnerId, seed, packMarkup = '', fast = false, reducedMotion = false, onTick = () => {}, onPhase = () => {} }) {
  const reel = buildReel(items, winnerId, seed);
  const document = container.ownerDocument;
  const window = document.defaultView;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const root = element('section', 'reel-stage');
  root.classList.add('reel-opening');
  if (reducedMotion) root.classList.add('reel-reduced-motion');
  root.style.setProperty('--reel-award-color', RARITIES[reel.items[reel.winnerIndex].rarity].color);
  root.setAttribute('aria-label', '盲盒藏品揭晓');
  const viewport = element('div', 'reel-viewport');
  const track = element('div', 'reel-track');
  track.setAttribute('aria-hidden', 'true');
  const cards = reel.items.map((item, index) => {
    const card = element('div', 'reel-card' + (item.kind === 'general' ? ' reel-general' : ''));
    card.dataset.index = String(index);
    card.style.setProperty('--reel-rarity', RARITIES[item.rarity].color);
    const rarity = element('span', 'reel-rarity', RARITIES[item.rarity].name);
    const art = element('div', 'reel-art');
    // toy() returns SVG markup; escape its only free text and use trusted rarity colors.
    art.innerHTML = toy({ ...item, name: escapeXml(item.name), color: RARITIES[item.rarity].color }, 138);
    card.append(rarity, art, element('strong', 'reel-name', item.name));
    track.append(card);
    return card;
  });
  viewport.append(track, element('div', 'reel-marker'));
  const caption = element('div', 'reel-caption');
  const status = element('p', 'reel-status', '拆开这一袋，接住你的惊喜');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const hint = element('p', 'reel-hint', '拆封中 · 你的专属揭晓');
  const skip = element('button', 'reel-skip', '跳过动画');
  skip.type = 'button';
  caption.append(status, skip);
  const seal = element('div', 'reel-seal', '✦');
  if (packMarkup) { seal.innerHTML = packMarkup; seal.classList.add('reel-pack-seal'); }
  seal.setAttribute('aria-hidden', 'true');
  root.append(element('div', 'reel-guide', 'YOUR NEXT COLLECTIBLE'), viewport, seal, caption, hint);
  container.replaceChildren(root);

  return new Promise(resolve => {
    const openingDuration = reducedMotion || fast ? 0 : 400;
    const duration = reducedMotion ? 0 : fast ? 620 : 4100;
    const start = window.performance.now();
    let finished = false;
    let resolved = false;
    let frame = 0;
    let timer;
    let observer;
    let previousIndex = -1;
    let lastTick = -Infinity;
    let slowing = false;
    let rolling = false;
    let focusedIndex = -1;
    // Audio/status hooks must not be able to leave a paid order locked in animation.
    const notify = (callback, ...args) => { try { callback(...args); } catch { /* Presentation hook only. */ } };
    function position(progress) {
      const first = cards[2];
      const winner = cards[reel.winnerIndex];
      const from = first.offsetLeft + first.offsetWidth / 2;
      const to = winner.offsetLeft + winner.offsetWidth / 2;
      const travel = from + (to - from) * progress;
      track.style.transform = `translate3d(${viewport.clientWidth / 2 - travel}px,0,0)`;
      const index = Math.round(2 + (reel.winnerIndex - 2) * progress);
      if (index !== focusedIndex) {
        cards[focusedIndex]?.classList.remove('reel-current');
        cards[index].classList.add('reel-current');
        focusedIndex = index;
      }
      return index;
    }
    function complete() {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      skip.removeEventListener('click', finish);
      resolve(winnerId);
    }
    function finish() {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      position(1);
      root.classList.remove('reel-opening');
      cards[reel.winnerIndex].classList.add('reel-winner');
      root.classList.add('reel-revealed');
      status.textContent = `开出来了！${reel.items[reel.winnerIndex].name}`;
      hint.textContent = `${RARITIES[reel.items[reel.winnerIndex].rarity].name}藏品 · 已为你锁定`;
      skip.disabled = true;
      skip.textContent = '揭晓完成';
      notify(onPhase, 'revealed');
      // Resolve immediately in a hidden window; no frame/transition event is required.
      if (document.hidden) complete();
      else if (!resolved) timer = window.setTimeout(complete, reducedMotion ? 180 : fast ? 120 : 650);
    }
    function animate(now) {
      if (finished) return;
      const elapsed = now - start - openingDuration;
      if (elapsed < 0) { frame = window.requestAnimationFrame(animate); return; }
      if (!rolling) {
        rolling = true;
        root.classList.remove('reel-opening');
        status.textContent = '藏品巡游 · 惊喜正在靠近';
        hint.textContent = '目光跟随中央指针';
        notify(onPhase, 'rolling');
      }
      const time = duration ? Math.min(1, elapsed / duration) : 1;
      const motion = motionAt(time);
      const index = position(motion.progress);
      if (index !== previousIndex && now - lastTick >= 48 && time < 1 && motion.speed > .01) {
        notify(onTick, index, { speed: motion.speed, cardsPerSecond: motion.speed * (reel.winnerIndex - 2) / (motion.area * duration / 1000), progress: time });
        lastTick = now;
      }
      previousIndex = index;
      if (!slowing && time > 0.52) {
        slowing = true;
        root.classList.add('reel-slowing');
        status.textContent = '慢一点……惊喜即将停靠';
        hint.textContent = '即将揭晓';
        notify(onPhase, 'slowing');
      }
      if (time >= 1) finish();
      else frame = window.requestAnimationFrame(animate);
    }
    function resize() {
      if (resolved) return;
      // Keep the highlighted award centered throughout its final reveal hold.
      if (finished) { position(1); return; }
      const time = duration ? (window.performance.now() - start - openingDuration) / duration : 1;
      position(motionAt(time).progress);
    }
    function visibility() { if (document.hidden) { if (finished) complete(); else finish(); } }
    skip.addEventListener('click', finish, { once: true });
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibility);
    if (window.ResizeObserver) {
      observer = new window.ResizeObserver(resize);
      observer.observe(viewport);
    }
    notify(onPhase, 'opening');
    position(reducedMotion ? 1 : 0);
    // The independent deadline also works when animation frames are suspended.
    timer = window.setTimeout(finish, openingDuration + duration + 100);
    if (reducedMotion || document.hidden) finish();
    else frame = window.requestAnimationFrame(animate);
  });
}
