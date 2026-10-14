import { SERIES, RARITIES, createGame, buy, settle, sellItem, tickWatch, claimReward, hydrate, getItem, collectionValue } from './game.mjs';
import { toy } from './art.mjs';
import { playReel } from './reel.mjs';

const $ = selector => document.querySelector(selector);
const format = value => value.toLocaleString('zh-CN');
const escape = text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const storageKey = 'live-shopping-simulator-v1';
const modal = $('#modal');
let state = createGame();
let selected = SERIES[0];
let busy = false;
let saving = false;
let blocked = false;
let modalKind = '';
let toastTimer;
let audio;
let newDiscovery = false;
let resetting = false;
let selectedBox = null;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = value => String(value).padStart(2, '0');

function setStep(step) {
  document.querySelectorAll('[data-step]').forEach(element => {
    element.classList.toggle('active', Number(element.dataset.step) === step);
    element.classList.toggle('complete', Number(element.dataset.step) < step);
  });
}
function renderBoxes() {
  $('#box-grid').innerHTML = Array.from({ length: 6 }, (_, index) => {
    const number = index + 1;
    return `<button class="table-box ${selectedBox === number ? 'chosen' : ''}" data-box="${number}" aria-label="选择 ${number} 号盲盒" aria-pressed="${selectedBox === number}" style="--box-color:${selected.color}"><span class="table-box-top"></span><span class="table-box-front"><small>PLAY CLUB</small><b>${pad(number)}</b><span>原封盲盒</span><i>✳</i></span><span class="table-box-foot">${pad(number)} 号</span></button>`;
  }).join('');
  $('#auto-pick').setAttribute('aria-pressed', String(selectedBox === null));
  $('#auto-pick').textContent = selectedBox === null ? '✓ 主播帮选' : '让主播帮选';
  render();
}
function updateOrder(pending = null) {
  $('#order-title').textContent = pending ? `第 ${String(state.opened).padStart(3, '0')} 单 · 我的订单` : '等你选一盒';
  $('#order-detail').textContent = pending ? `${SERIES.find(series => series.id === pending.seriesId).name} / ${pending.boxNumber ? `${pad(pending.boxNumber)} 号盒` : '历史订单'}` : '专属席位 · 随拍随拆';
}

async function writeSave(next) {
  const content = JSON.stringify(next);
  if (window.desktop) await window.desktop.writeSave(content);
  else localStorage.setItem(storageKey, content);
}
async function backupSave() {
  if (window.desktop) await window.desktop.backupSave();
  else {
    const raw = localStorage.getItem(storageKey);
    if (raw) localStorage.setItem(`${storageKey}-backup-${Date.now()}`, raw);
  }
}
async function commit(next) {
  if (saving || blocked) return false;
  saving = true;
  $('#save-status').textContent = '正在保存…';
  try {
    await writeSave(next);
    state = next;
    $('#save-status').textContent = '进度已保存';
    render();
    return true;
  } catch (error) {
    $('#save-status').textContent = '保存失败';
    toast('存档写入失败，本次操作未生效。请检查磁盘空间后重试。');
    console.error('Save failed', error);
    return false;
  } finally { saving = false; }
}
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500);
}
function sound(type = 'tap') {
  if (!state.settings.sound) return;
  try {
    audio ||= new AudioContext();
    if (audio.state === 'suspended') audio.resume();
    const frequencies = type === 'reveal' ? [523, 659, 784, 1047] : type === 'coin' ? [880, 1175] : type === 'tick' ? [1450] : [440];
    frequencies.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * .095;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const length = type === 'tick' ? .035 : .25;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(type === 'tick' ? .025 : .06, start + .005); gain.gain.exponentialRampToValueAtTime(.001, start + length);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + length + .02);
    });
  } catch { /* Audio is optional; the game stays playable without a device. */ }
}
function render() {
  $('#coins').textContent = format(state.coins);
  $('#opened').textContent = state.opened;
  $('#bag-count').textContent = state.inventory.length;
  $('#sound-toggle').textContent = state.settings.sound ? '♫' : '♪';
  $('#sound-toggle').setAttribute('aria-label', state.settings.sound ? '关闭音效' : '开启音效');
  const buyButton = $('#buy');
  buyButton.disabled = busy || Boolean(state.pending) || blocked;
  buyButton.innerHTML = busy ? '主播正在拆盒… <span>✦</span>' : '让主播开一盒 <span>↗</span>';
  $('#purchase-hint').textContent = state.coins < selected.price ? `还差 ${format(selected.price - state.coins)} 金币，可领取观看奖励` : selectedBox ? `已选 ${pad(selectedBox)} 号盒 · 下单后现场拆封` : '主播替你选盒 · 下单后现场拆封';
  document.querySelectorAll('[data-box], #auto-pick').forEach(element => { element.disabled = busy || Boolean(state.pending) || blocked; });
  $('#reward-status').textContent = state.rewardCount ? `已攒下 ${state.rewardCount} 份 · ${state.rewardCount * 60} 金币` : `再看 ${Math.ceil(30 - state.watchSeconds)} 秒，领取 60 金币`;
  $('#claim-reward').disabled = !state.rewardCount || blocked;
  $('#claim-reward').textContent = state.rewardCount ? `领取 +${state.rewardCount * 60}` : '待领取';
  $('#reward-progress').style.width = `${state.rewardCount === 3 ? 100 : state.watchSeconds / 30 * 100}%`;
}
function renderSeries() {
  const kickers = ['A LITTLE CITY ADVENTURE', 'A LETTER FROM THE WOODS', 'SOMEWHERE IN THE UNIVERSE'];
  $('#series-list').innerHTML = SERIES.map((series, index) => `<button class="series-card ${series.id === selected.id ? 'selected' : ''}" data-series="${series.id}" aria-pressed="${series.id === selected.id}"><span class="series-check">✓</span>${toy({ ...series.items[0], color: series.color })}<div class="series-info"><span class="series-kicker">${kickers[index]}</span><h3>${series.name}</h3><p>${series.subtitle}</p><span class="price">◆ ${series.price}<small>金币</small></span></div><span class="series-number">0${index + 1} / COLLECTION</span></button>`).join('');
  $('#selected-label').textContent = selected.name;
  $('#selected-price').textContent = format(selected.price);
  $('#stage-theme').textContent = `${selected.name} · 正在代拆`;
  $('.box-face').style.background = `linear-gradient(115deg,color-mix(in srgb,${selected.color} 65%,white),${selected.color})`;
  $('.box-lid').style.background = `linear-gradient(color-mix(in srgb,${selected.color} 45%,white) 25%,${selected.color} 26%)`;
  renderBoxes();
}
function showModal(kind, html, className = '') {
  modalKind = kind;
  modal.className = className;
  $('#modal-content').innerHTML = html;
  if (!modal.open) modal.showModal();
}
function closeModal() {
  if (modalKind === 'result' || modalKind === 'load-error' || modalKind === 'reel') return;
  modal.close(); modalKind = '';
  document.querySelectorAll('.nav-item').forEach(element => element.classList.toggle('active', element.id === 'nav-live'));
}
function modalHeader(title, subtitle = '') {
  return `<div class="modal-header"><div><div class="eyebrow">THE LITTLE THINGS WE KEEP</div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="close-modal" data-action="close" aria-label="关闭">×</button></div>`;
}
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function purchase() {
  if (busy || saving || blocked || state.pending) return;
  let next;
  const number = selectedBox || Math.floor(Math.random() * 6) + 1;
  try { next = buy(state, selected.id, Math.random, number); } catch (error) { toast(error.message); sound(); return; }
  newDiscovery = !state.discovered.includes(next.pending.itemId);
  busy = true;
  render();
  if (!await commit(next)) { busy = false; render(); return; }
  try {
    const order = { ...state.pending };
    const fast = state.settings.fast || reducedMotion();
    updateOrder(order);
    setStep(2);
    sound();
    addChat('我', `拍下「${selected.name}」，请拆 ${pad(number)} 号盒。`, '我', true);
    $('#host-line').textContent = `收到第 ${state.opened} 单！拿 ${pad(number)} 号，给你检查封条。`;
    $('#table-status').textContent = `正在处理你的订单 · ${pad(number)} 号盒`;
    $('#stage').classList.add('selecting');
    if (!selectedBox && !fast) {
      for (const highlight of [2, 5, number]) {
        document.querySelectorAll('[data-box]').forEach(element => element.classList.toggle('picked', Number(element.dataset.box) === highlight));
        sound('tick');
        await wait(160);
      }
    }
    document.querySelectorAll('[data-box]').forEach(element => element.classList.toggle('picked', Number(element.dataset.box) === number));
    await wait(fast ? 30 : 350);
    $('#opening-box-number').textContent = pad(number);
    $('#stage').classList.add('opening');
    $('#opening-label').textContent = `${pad(number)} 号已取出 · 正在拆封`;
    await wait(fast ? 50 : 650);
    $('#stage').classList.remove('opening');
    $('#stage').classList.add('reveal');
    $('#opening-label').textContent = '封条已拆 · 开始揭晓';
    await wait(fast ? 30 : 300);
    setStep(3);
    showModal('reel', `<div class="opening-header"><div><span>LIVE UNBOXING / 现场拆单</span><h2>这一盒，会是谁？</h2><p>第 ${String(state.opened).padStart(3, '0')} 单 · ${selected.name} · ${pad(number)} 号盒</p></div><div class="opening-host"><span>小桃</span><b>正在为你开盒</b></div></div><div id="reel-container"></div><div class="opening-footer"><span>✦ ${selected.name} / 4 款可收藏</span><span>揭晓后选择折现或收入背包</span></div>`, 'opening-dialog');
    await playReel({
      container: $('#reel-container'), items: selected.items, winnerId: order.itemId, seed: `${order.id}:${order.itemId}`,
      fast: state.settings.fast, reducedMotion: reducedMotion(), onTick: () => sound('tick'),
      onPhase: phase => { if (phase === 'revealed') sound('reveal'); }
    });
  } catch (error) {
    console.error('Opening presentation failed', error);
    toast('动画暂时中断，已为你保留并展示本次藏品。');
  } finally {
    busy = false;
    showResult();
    render();
  }
}
function showResult() {
  if (!state.pending) return;
  const item = getItem(state.pending.itemId);
  const rarity = RARITIES[item.rarity];
  const series = SERIES.find(entry => entry.id === state.pending.seriesId);
  const lines = { common: '小小收藏，也有自己的位置。', rare: '这款不错，细节很有意思！', epic: '紫光！这次开到好东西了！', legendary: '金光亮了——是传说藏品！' };
  setStep(4);
  updateOrder(state.pending);
  $('#host-line').textContent = lines[item.rarity];
  showModal('result', `<div class="result-panel" style="--rarity:${rarity.color}"><span class="result-kicker">A LITTLE SURPRISE, JUST FOR YOU</span><div class="result-art">${toy(item, 210)}</div><span class="rarity">${rarity.name}藏品</span>${newDiscovery ? '<span class="new-badge">首次发现</span>' : ''}<h2>${item.name}</h2><span class="result-series">${series.name}系列 · 第 ${state.opened} 次开盒</span><p class="result-subtitle">${lines[item.rarity]}<br>这份惊喜，由你决定去留。</p><div class="result-actions"><button class="secondary-button" data-action="sell-result">折现 +${format(item.value)} 金币</button><button class="primary-button" data-action="keep-result">收入我的背包 ↗</button></div></div>`, 'result-dialog');
}
async function resolveResult(action) {
  if (!state.pending || saving) return;
  const item = getItem(state.pending.itemId);
  if (!await commit(settle(state, action))) return;
  modal.close(); modalKind = '';
  $('#stage').classList.remove('opening', 'reveal', 'selecting');
  $('#opening-label').textContent = '';
  selectedBox = null;
  renderBoxes();
  setStep(1);
  updateOrder();
  $('#table-status').textContent = '新一轮已补盒 · 可以继续挑选';
  $('#host-line').textContent = action === 'keep' ? '已经收好了，去背包看看吧。' : '金币到账，下一盒由你决定。';
  toast(action === 'keep' ? `${item.name}已收入背包` : `折现成功，+${format(item.value)} 金币`);
  sound(action === 'keep' ? 'tap' : 'coin');
  addChat('小桃', action === 'keep' ? '喜欢就留下，这份收藏属于你。' : '收好金币，慢慢挑，不着急。', '桃');
  render();
}
function openBag() {
  if (busy || state.pending || blocked) return;
  $('#nav-live').classList.remove('active'); $('#nav-bag').classList.add('active');
  const cards = state.inventory.map(instance => {
    const item = getItem(instance.itemId); const rarity = RARITIES[item.rarity];
    return `<article class="item-card" style="--rarity:${rarity.color}">${toy(item)}<div><span class="rarity">${rarity.name}</span></div><h3>${item.name}</h3><span class="item-series">${SERIES.find(entry => entry.id === instance.seriesId).name}系列</span><button data-sell="${instance.id}">折现 +${format(item.value)} 金币</button></article>`;
  }).join('');
  showModal('bag', modalHeader('我的背包', '留下喜欢的，也可以随时将藏品折现。') + `<div class="modal-body"><div class="inventory-stats"><span>拥有 <b>${state.inventory.length}</b> 件藏品</span><span>总估值 <b>◆ ${format(collectionValue(state))}</b></span></div>${cards ? `<div class="item-grid">${cards}</div>` : '<div class="empty-state"><div class="empty-symbol">▧</div><h3>为你的第一件收藏，留了个位置</h3><p>去直播间开一盒吧。<br>开出后选择「收入我的背包」，就能在这里找到它。</p><button class="primary-button" data-action="close">回直播间看看 ↗</button></div>'}</div>`);
}
function openCollection() {
  if (busy || state.pending || blocked) return;
  $('#nav-live').classList.remove('active'); $('#nav-collection').classList.add('active');
  showModal('collection', modalHeader('收藏图鉴', '每一次相遇都会被记住，折现也不会清除发现记录。') + `<div class="modal-body"><div class="inventory-stats"><span>已发现 <b>${state.discovered.length} / 12</b></span><span>累计开盒 <b>${state.opened}</b> 次</span></div><div class="collection-progress"><div style="width:${state.discovered.length / 12 * 100}%"></div></div><div class="item-grid">${SERIES.flatMap(series => series.items.map(item => `<article class="item-card ${state.discovered.includes(item.id) ? '' : 'locked'}" style="--rarity:${RARITIES[item.rarity].color}">${toy(item)}<div><span class="rarity">${RARITIES[item.rarity].name}</span></div><h3>${item.name}</h3><span class="item-series">${state.discovered.includes(item.id) ? '✓ 已发现' : '尚未发现'} · ${series.name}</span></article>`)).join('')}</div></div>`);
}
function openOdds() {
  if (busy || state.pending || blocked) return;
  showModal('odds', modalHeader('每一份惊喜，都明明白白', '所有盲盒独立抽取，三种系列使用相同的稀有度概率。') + `<div class="modal-body"><table class="probability-table"><thead><tr><th>稀有度</th><th>出现概率</th>${SERIES.map(series => `<th>${series.name}<br>${series.price} 金币 / 盒</th>`).join('')}</tr></thead><tbody>${Object.entries(RARITIES).map(([key, rarity]) => `<tr><td style="color:${rarity.color}">${rarity.name}</td><td>${rarity.chance}%</td>${SERIES.map(series => { const item = series.items.find(entry => entry.rarity === key); return `<td>${item.name}<br><small>折现 ${format(item.value)} 金币</small></td>`; }).join('')}</tr>`).join('')}</tbody></table><p class="probability-note">每次开盒互相独立，不设保底。开出结果在扣款时保存，重新进入可继续处理。<br>折现价格固定，背包出售与即时折现价格相同。金币只在本单机游戏内使用。</p></div>`);
}
function openRules() {
  if (busy || state.pending || blocked) return;
  showModal('rules', modalHeader('欢迎来到拆播间', '一场悠闲的收藏之旅，从这里开始。') + `<div class="modal-body"><div class="rule-list">${[['坐下来，看一会儿直播','你有 1,200 枚初始金币。前台观看直播每 30 秒可获得一份 60 金币奖励，最多积攒 3 份；切到后台或打开面板时暂停。'],['挑选喜欢的盲盒','从三个系列挑选，点击桌面 01–06 号盒，或交给主播帮选。下单后报号、拆封，再滚动揭晓藏品；盒号不改变概率。'],['为惊喜，选一个去处','滚动条在中央指针处停下，展示你的藏品。可跳过动画，结果不变。随后选择折现或收入背包；图鉴会保留发现记录。'],['按自己的节奏来','游戏会自动保存。空格开盒，Esc 关闭面板，F11 切换全屏。设置中可开启快速开盒，或关闭音效。']].map(([title, text], index) => `<div class="rule-step"><span>0${index + 1}</span><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}</div></div>`, 'help-dialog');
}
function openSettings() {
  if (busy || state.pending || blocked) return;
  showModal('settings', modalHeader('按你的节奏来', '一点小设置，让收藏之旅更合心意。') + `<div class="modal-body"><div class="setting-row"><div><h3>游戏音效</h3><p>轻柔的点击、开盒和金币提示音</p></div><button class="toggle ${state.settings.sound ? 'on' : ''}" data-setting="sound">${state.settings.sound ? '已开启' : '已关闭'}</button></div><div class="setting-row"><div><h3>快速开盒</h3><p>缩短选盒拆封和滚动揭晓，也可在动画中直接跳过</p></div><button class="toggle ${state.settings.fast ? 'on' : ''}" data-setting="fast">${state.settings.fast ? '已开启' : '已关闭'}</button></div><div class="setting-row"><div><h3>重新开始</h3><p>清空金币、背包和收藏记录，恢复初始状态</p></div><button class="danger-button" data-action="reset-confirm">重置存档</button></div><p class="version-note">拆播间 · Live Shopping Simulator v0.2.0<br>原创虚构直播间 · 离线单机 · 游戏内虚拟金币<br>${window.desktop ? '桌面存档保存在当前用户的应用数据目录。' : '网页预览存档保存在当前浏览器，与桌面版互相独立。'}</p><h3 style="font-size:12px">最近的收藏足迹</h3><ul class="history-list">${state.history.slice(0, 8).map(entry => `<li>${escape(entry.text)}</li>`).join('') || '<li>故事才刚刚开始。</li>'}</ul></div>`, 'help-dialog');
}
function addChat(name, message, avatar, self = false) {
  const element = document.createElement('div');
  element.className = `chat-message ${self ? 'self' : ''}`;
  element.innerHTML = `<span class="chat-avatar">${escape(avatar)}</span><p><span class="username">${escape(name)}</span>${escape(message)}</p>`;
  $('#chat-messages').append(element);
  while ($('#chat-messages').children.length > 6) $('#chat-messages').firstElementChild.remove();
}
const messages = [['云朵收藏家', '今天来补图鉴 ✨', '云'], ['半糖拿铁', '小熊手上的咖啡也太可爱了', '半'], ['一颗青柠', '拆盒的声音好治愈', '柠'], ['盒子里的宇宙', '我想把整片星空带回家', '宇'], ['慢慢来', '喜欢的就留下，开心最重要', '慢'], ['薄荷汽水', '这个直播间好适合发呆 🌿', '薄'], ['阿橘', '森野来信系列，长在我的审美上', '橘'], ['桃子乌龙', '坐好了，准备看开盒！', '桃']];
messages.slice(0, 5).forEach(message => addChat(...message));
let chatIndex = 5;
setInterval(() => { if (!document.hidden && !blocked) addChat(...messages[chatIndex++ % messages.length]); }, 6400);

$('#series-list').addEventListener('click', event => {
  const card = event.target.closest('[data-series]');
  if (!card || busy || state.pending || blocked) return;
  selected = SERIES.find(entry => entry.id === card.dataset.series); renderSeries(); sound();
});
$('#box-grid').addEventListener('click', event => {
  const box = event.target.closest('[data-box]');
  if (!box || busy || state.pending || blocked) return;
  selectedBox = Number(box.dataset.box);
  renderBoxes();
  $('#host-line').textContent = `记下啦，${pad(selectedBox)} 号盒。下单后就给你拿！`;
  sound();
});
$('#auto-pick').addEventListener('click', () => {
  if (busy || state.pending || blocked) return;
  selectedBox = null;
  renderBoxes();
  $('#host-line').textContent = '交给我，下单后帮你挑一盒。';
});
$('#buy').addEventListener('click', purchase);
$('#claim-reward').addEventListener('click', async () => {
  if (saving || !state.rewardCount) return;
  const amount = state.rewardCount * 60;
  if (await commit(claimReward(state))) { sound('coin'); toast(`谢谢你的陪伴，+${amount} 金币`); }
});
$('#nav-bag').addEventListener('click', openBag);
$('#nav-collection').addEventListener('click', openCollection);
$('#nav-settings').addEventListener('click', openSettings);
$('#nav-live').addEventListener('click', closeModal);
$('#rules').addEventListener('click', openRules);
$('#odds').addEventListener('click', openOdds);
$('#wallet-help').addEventListener('click', () => toast('金币用于购买盲盒；观看直播和出售藏品都能获得金币。'));
$('#sound-toggle').addEventListener('click', async () => { if (await commit({ ...state, settings: { ...state.settings, sound: !state.settings.sound } })) { sound(); toast(state.settings.sound ? '音效已开启' : '音效已关闭'); } });
async function fullscreen() {
  try {
    if (window.desktop) await window.desktop.fullscreen();
    else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('当前窗口暂不支持全屏。'); }
}
$('#fullscreen').addEventListener('click', fullscreen);
$('#send-chat').addEventListener('click', () => { addChat('我', '大家好，一起拆点小惊喜吧！', '我', true); sound(); });
$('#heart').addEventListener('click', () => { const heart = document.createElement('span'); heart.className = 'heart-float'; heart.textContent = '♥'; $('#stage').append(heart); setTimeout(() => heart.remove(), 2200); sound(); });
modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
modal.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target || saving || resetting) return;
  const action = target.dataset.action;
  if (action === 'close') closeModal();
  else if (action === 'sell-result') await resolveResult('sell');
  else if (action === 'keep-result') await resolveResult('keep');
  else if (target.dataset.sell) {
    try { if (await commit(sellItem(state, target.dataset.sell))) { sound('coin'); toast('藏品已折现，图鉴记录会一直保留。'); openBag(); } } catch (error) { toast(error.message); }
  } else if (target.dataset.setting) {
    const key = target.dataset.setting;
    if (await commit({ ...state, settings: { ...state.settings, [key]: !state.settings[key] } })) openSettings();
  } else if (action === 'reset-confirm') {
    showModal('reset', modalHeader('重新开始这段收藏之旅？') + '<div class="modal-body"><p class="confirm-text">这会清空当前背包、金币、图鉴与开盒记录，恢复为 1,200 初始金币。现有存档会保留一份备份。</p><div class="modal-actions"><button class="secondary-button" data-action="cancel-reset">继续我的收藏</button><button class="danger-button" data-action="reset">确认重新开始</button></div></div>', 'help-dialog');
  } else if (action === 'cancel-reset') openSettings();
  else if (action === 'reset' || action === 'recover') {
    resetting = true;
    try {
      await backupSave();
      blocked = false;
      if (await commit(createGame())) {
        modal.close(); modalKind = ''; selected = SERIES[0]; selectedBox = null; renderSeries();
        $('#stage').classList.remove('opening', 'reveal', 'selecting'); $('#opening-label').textContent = '';
        setStep(1); updateOrder();
        $('#table-status').textContent = '点击桌上编号选盒，或让主播帮你选';
        $('#host-line').textContent = '新的收藏故事，今天开始。'; toast('已重新开始，旧存档已备份。');
      } else if (action === 'recover') blocked = true;
    } catch (error) { toast('无法备份原存档，未执行重置。'); }
    finally { resetting = false; }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'F11') { event.preventDefault(); fullscreen(); }
  if (event.code === 'Space' && !modal.open && !event.repeat && !['BUTTON', 'INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); purchase(); }
});
let lastTick = performance.now();
setInterval(async () => {
  const now = performance.now(); const elapsed = Math.min((now - lastTick) / 1000, 1.5); lastTick = now;
  if (document.hidden || !document.hasFocus() || modal.open || saving || blocked) return;
  await commit(tickWatch(state, elapsed));
}, 1000);

async function init() {
  blocked = true;
  try {
    const raw = window.desktop ? await window.desktop.readSave() : localStorage.getItem(storageKey);
    state = raw === null ? createGame() : hydrate(JSON.parse(raw));
    blocked = false;
    renderSeries();
    if (state.pending) { selected = SERIES.find(entry => entry.id === state.pending.seriesId); renderSeries(); showResult(); }
  } catch (error) {
    renderSeries();
    $('#save-status').textContent = '存档需要处理';
    showModal('load-error', modalHeader('这份存档暂时无法读取') + '<div class="modal-body"><p class="confirm-text">存档可能损坏或来自不兼容版本。原文件尚未改动。你可以退出游戏检查存档，也可以先备份原存档，再开始新游戏。</p><button class="primary-button" data-action="recover">备份原存档并重新开始</button></div>', 'help-dialog');
    console.error('Could not load save', error);
  }
}
await init();
