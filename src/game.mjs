export const RARITIES = Object.freeze({
  common: Object.freeze({ name: '普通', color: '#94a4ae', chance: 60 }),
  rare: Object.freeze({ name: '稀有', color: '#6eaeff', chance: 28 }),
  epic: Object.freeze({ name: '史诗', color: '#bd8eff', chance: 10 }),
  legendary: Object.freeze({ name: '传说', color: '#ffc56d', chance: 2 }),
});

const rarityKeys = Object.keys(RARITIES);
function series(id, name, subtitle, price, color, names, values, kinds) {
  return Object.freeze({ id, name, subtitle, price, color, items: Object.freeze(names.map((name, index) => Object.freeze({
    id: `${id}-${rarityKeys[index]}`, name, rarity: rarityKeys[index], value: values[index],
    color: RARITIES[rarityKeys[index]].color, kind: kinds[index],
  }))) });
}

export const SERIES = Object.freeze([
  series('street', '街角漫游', '把城市里的小确幸带回家', 100, '#f2af91',
    ['咖啡小熊', '滑板企鹅', '霓虹独角兽', '金色宇航员'], [45, 100, 240, 900],
    ['bear', 'penguin', 'unicorn', 'astronaut']),
  series('forest', '森野来信', '来自森林深处的温柔问候', 260, '#9bc7aa',
    ['苔藓团子', '蘑菇精灵', '月光小鹿', '森林守护者'], [110, 260, 650, 2000],
    ['slime', 'mushroom', 'deer', 'guardian']),
  series('cosmos', '星际漫游', '收藏一场遥远的宇宙旅行', 600, '#a49ee9',
    ['月球兔', '星云猫', '轨道机器人', '银河旅人'], [250, 600, 1500, 5000],
    ['rabbit', 'cat', 'robot', 'traveler']),
]);

const allItems = new Map(SERIES.flatMap(entry => entry.items.map(item => [item.id, item])));
const safeInt = value => Number.isSafeInteger(value) && value >= 0;

export function getItem(id) { return allItems.get(id); }

export function createGame() {
  return {
    version: 1, coins: 1200, inventory: [], discovered: [], pending: null,
    opened: 0, sold: 0, watchSeconds: 0, rewardCount: 0,
    settings: { sound: true, fast: false, music: true, musicVolume: .35 }, history: [],
  };
}

function record(state, text, type) {
  return [{ text, type }, ...state.history].slice(0, 30);
}

export function buy(state, seriesId, rng = Math.random, boxNumber = state.opened % 6 + 1) {
  if (state.pending) throw new Error('请先处理刚刚开出的藏品。');
  const selected = SERIES.find(entry => entry.id === seriesId);
  if (!selected) throw new Error('没有找到这个盲盒系列。');
  if (!Number.isInteger(boxNumber) || boxNumber < 1 || boxNumber > 6) throw new Error('请选择 1 到 6 号盲盒。');
  if (state.coins < selected.price) throw new Error(`金币不足，还差 ${selected.price - state.coins} 金币。`);
  const roll = rng();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('开盒随机数无效，请重试。');
  let threshold = 0;
  const item = selected.items.find(entry => {
    threshold += RARITIES[entry.rarity].chance;
    return roll < threshold / 100;
  });
  const pending = { id: `box-${state.opened + 1}`, itemId: item.id, seriesId: selected.id, boxNumber };
  return {
    ...state, coins: state.coins - selected.price, pending, opened: state.opened + 1,
    discovered: state.discovered.includes(item.id) ? [...state.discovered] : [...state.discovered, item.id],
    history: record(state, `购买「${selected.name}」${boxNumber}号盒，开出${item.name}`, 'buy'),
  };
}

export function enqueue(state, seriesId, rng = Math.random, boxNumber = 1, queueAhead = 3) {
  if (!Number.isInteger(queueAhead) || queueAhead < 0 || queueAhead > 4) throw new Error('排队位置无效。');
  const next = buy(state, seriesId, rng, boxNumber);
  return { ...next, pending: { ...next.pending, status: 'queued', queueAhead },
    history: record(state, `购买「${SERIES.find(entry => entry.id === seriesId).name}」${boxNumber}号盒，已加入代拆队列`, 'buy') };
}

export function advanceQueue(state) {
  if (state.pending?.status !== 'queued' || state.pending.queueAhead < 1) throw new Error('没有可推进的排队订单。');
  return { ...state, pending: { ...state.pending, queueAhead: state.pending.queueAhead - 1 } };
}

export function beginQueuedOpening(state) {
  if (state.pending?.status !== 'queued' || state.pending.queueAhead !== 0) throw new Error('还没轮到你的订单。');
  return { ...state, pending: { ...state.pending, status: 'opening' } };
}

export function readyQueuedOpening(state) {
  if (state.pending?.status !== 'opening') throw new Error('订单尚未开始拆封。');
  return { ...state, pending: { ...state.pending, status: 'ready' } };
}

export function settle(state, action) {
  if (!state.pending) throw new Error('没有等待处理的藏品。');
  if (state.pending.status && state.pending.status !== 'ready') throw new Error('请等待主播拆完你的订单。');
  if (action !== 'keep' && action !== 'sell') throw new Error('请选择收入背包或折现。');
  const item = getItem(state.pending.itemId);
  if (action === 'keep') {
    const { status, queueAhead, ...instance } = state.pending;
    return { ...state, pending: null, inventory: [...state.inventory, instance],
      history: record(state, `${item.name}已收入背包`, 'keep') };
  }
  return { ...state, pending: null, coins: state.coins + item.value, sold: state.sold + 1,
    history: record(state, `${item.name}折现 +${item.value} 金币`, 'sell') };
}

export function sellItem(state, inventoryInstanceId) {
  const instance = state.inventory.find(entry => entry.id === inventoryInstanceId);
  if (!instance) throw new Error('背包里没有这件藏品，可能已经折现。');
  const item = getItem(instance.itemId);
  return { ...state, coins: state.coins + item.value, sold: state.sold + 1,
    inventory: state.inventory.filter(entry => entry.id !== inventoryInstanceId),
    history: record(state, `背包中的${item.name}折现 +${item.value} 金币`, 'sell') };
}

export function tickWatch(state, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('观看时间无效。');
  if (state.rewardCount >= 3) return { ...state, watchSeconds: 0 };
  const total = state.watchSeconds + Math.min(seconds, 90);
  const rewardCount = Math.min(3, state.rewardCount + Math.floor(total / 30));
  return { ...state, rewardCount, watchSeconds: rewardCount === 3 ? 0 : total % 30 };
}

export function claimReward(state) {
  if (state.rewardCount === 0) throw new Error('观看奖励还没准备好，再看一会儿吧。');
  const amount = state.rewardCount * 60;
  return { ...state, coins: state.coins + amount, rewardCount: 0,
    history: record(state, `领取观看奖励 +${amount} 金币`, 'reward') };
}

export function collectionValue(state) {
  return state.inventory.reduce((sum, instance) => sum + getItem(instance.itemId).value, 0);
}

export function hydrate(raw) {
  const invalid = () => { throw new Error('存档数据损坏或版本不兼容，请保留备份后重新开始。'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) invalid();
  if (!safeInt(raw.coins) || !safeInt(raw.opened) || !safeInt(raw.sold) || !safeInt(raw.rewardCount) || raw.rewardCount > 3) invalid();
  if (!Number.isFinite(raw.watchSeconds) || raw.watchSeconds < 0 || raw.watchSeconds >= 30 || (raw.rewardCount === 3 && raw.watchSeconds !== 0)) invalid();
  if (!raw.settings || typeof raw.settings.sound !== 'boolean' || typeof raw.settings.fast !== 'boolean') invalid();
  if (raw.settings.music !== undefined && typeof raw.settings.music !== 'boolean') invalid();
  if (raw.settings.musicVolume !== undefined && (!Number.isFinite(raw.settings.musicVolume) || raw.settings.musicVolume < 0 || raw.settings.musicVolume > 1)) invalid();
  if (!Array.isArray(raw.inventory) || !Array.isArray(raw.discovered) || !Array.isArray(raw.history) || raw.history.length > 30) invalid();
  if (raw.discovered.some(id => typeof id !== 'string' || !getItem(id)) || new Set(raw.discovered).size !== raw.discovered.length || raw.discovered.length > raw.opened) invalid();
  const ids = new Set();
  function instance(entry) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !/^box-[1-9]\d*$/.test(entry.id)) invalid();
    const serial = Number(entry.id.slice(4));
    const selected = SERIES.find(option => option.id === entry.seriesId);
    if (!Number.isSafeInteger(serial) || serial > raw.opened || ids.has(entry.id) || !selected || !selected.items.some(item => item.id === entry.itemId) || !raw.discovered.includes(entry.itemId)) invalid();
    ids.add(entry.id);
    if (entry.boxNumber !== undefined && (!Number.isInteger(entry.boxNumber) || entry.boxNumber < 1 || entry.boxNumber > 6)) invalid();
    return { id: entry.id, itemId: entry.itemId, seriesId: entry.seriesId, ...(entry.boxNumber === undefined ? {} : { boxNumber: entry.boxNumber }) };
  }
  const inventory = raw.inventory.map(instance);
  const pending = raw.pending === null ? null : instance(raw.pending);
  if (pending && raw.pending.status !== undefined) {
    if (!['queued', 'opening', 'ready'].includes(raw.pending.status) || !Number.isInteger(raw.pending.queueAhead) || raw.pending.queueAhead < 0 || raw.pending.queueAhead > 4 || (raw.pending.status !== 'queued' && raw.pending.queueAhead !== 0)) invalid();
    pending.status = raw.pending.status; pending.queueAhead = raw.pending.queueAhead;
  } else if (pending && raw.pending.queueAhead !== undefined) invalid();
  if (raw.opened !== inventory.length + raw.sold + (pending ? 1 : 0)) invalid();
  const history = raw.history.map(entry => {
    if (!entry || typeof entry.text !== 'string' || entry.text.length > 300 || (entry.type !== undefined && typeof entry.type !== 'string')) invalid();
    return entry.type === undefined ? { text: entry.text } : { text: entry.text, type: entry.type };
  });
  return {
    version: 1, coins: raw.coins, inventory, discovered: [...raw.discovered], pending,
    opened: raw.opened, sold: raw.sold, watchSeconds: raw.watchSeconds, rewardCount: raw.rewardCount,
    settings: { sound: raw.settings.sound, fast: raw.settings.fast, music: raw.settings.music ?? true, musicVolume: raw.settings.musicVolume ?? .35 }, history,
  };
}
