// Original one-shot instrumental, “拆袋小惊喜”. Synthesized locally; no samples or speech.
const frequency = note => 440 * 2 ** ((note - 69) / 12);

function score(seconds) {
  const notes = [];
  const add = (kind, at, note, length, level) => notes.push({ kind, at, note, length, level });
  if (seconds < 1.4) {
    // A short opening gets its own sparse flourish, not a sped-up full arrangement.
    [76, 79, 84].forEach((note, i) => add('bell', seconds * i * .29, note, seconds * .42, .32));
    add('bass', 0, 48, seconds * .62, .19);
    for (const note of [60, 64, 67]) add('pluck', 0, note, seconds * .7, .075);
  } else {
    const scale = seconds / 4.5;
    [76, 79, 81, 79, 76, 74, 77, 81, 79, 74, 71, 72].forEach((note, i) =>
      add('bell', i * .35 * scale, note, (i === 11 ? .65 : .38) * scale, .28));
    [[60, 64, 67], [53, 57, 60], [55, 59, 62]].forEach((chord, i) => {
      const at = i * 1.4 * scale;
      chord.forEach((note, string) => {
        add('pluck', at + string * .025 * scale, note, .65 * scale, .09);
        add('pluck', at + .7 * scale + string * .025 * scale, note, .48 * scale, .065);
      });
      add('bass', at, chord[0] - 12, .7 * scale, .22);
      add('bass', at + .7 * scale, chord[2] - 12, .48 * scale, .15);
    });
  }
  return notes;
}

/** Host starts at opening and stops at reveal/cancel/visibility change. No async playback restart. */
export function createUnboxingMusic(dependencies = {}) {
  const makeContext = dependencies.createContext || (() => {
    const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Constructor ? new Constructor() : null;
  });
  const later = dependencies.setTimeout || globalThis.setTimeout.bind(globalThis);
  const cancel = dependencies.clearTimeout || globalThis.clearTimeout.bind(globalThis);
  let context = null, session = null, destroyed = false;

  function stop() {
    const active = session;
    session = null;
    if (!active) return;
    if (active.timer !== null) cancel(active.timer);
    // Disconnect as well as stopping: even a context resumed much later stays silent.
    try {
      active.master.gain.cancelScheduledValues(context.currentTime);
      active.master.gain.setValueAtTime(0, context.currentTime);
    } catch { /* An unavailable/closed device is already silent. */ }
    for (const voice of active.voices) {
      try { voice.source.stop(context.currentTime); } catch { /* Already ended. */ }
      for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
    }
    active.voices.clear();
    try { active.master.disconnect(); } catch { /* Already disconnected. */ }
  }

  function start({ durationMs = 0, volume = .35 } = {}) {
    stop();
    const level = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
    if (destroyed || !Number.isFinite(durationMs) || durationMs <= 0 || level === 0) return false;
    try {
      context ||= makeContext();
      if (!context || context.state === 'closed') return false;
      const seconds = durationMs / 1000;
      const now = context.currentTime, deadline = now + seconds;
      const master = context.createGain();
      master.gain.setValueAtTime(level * .5, now);
      master.gain.setValueAtTime(0, deadline);
      master.connect(context.destination);
      const active = { master, voices: new Set(), timer: null };
      session = active;
      for (const note of score(seconds)) {
        const when = now + note.at, end = Math.min(deadline, when + note.length);
        if (end <= when) continue;
        const envelope = context.createGain();
        const source = context.createOscillator();
        const voice = { source, nodes: [source, envelope] };
        active.voices.add(voice);
        source.type = note.kind === 'pluck' ? 'triangle' : 'sine';
        source.frequency.setValueAtTime(frequency(note.note), when);
        source.connect(envelope); envelope.connect(master);
        const attack = Math.min(.006, (end - when) * .15);
        envelope.gain.setValueAtTime(0, when);
        envelope.gain.linearRampToValueAtTime(note.level, when + attack);
        envelope.gain.exponentialRampToValueAtTime(.0001, end);
        envelope.gain.setValueAtTime(0, end);
        source.onended = () => {
          for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Already disconnected. */ } }
          active.voices.delete(voice);
        };
        source.start(when);
        source.stop(end);
      }
      // The visual clock keeps advancing while an audio device is suspended.
      active.timer = later(() => { if (session === active) stop(); }, durationMs);
      if (context.state === 'suspended') {
        // Schedule synchronously; resolving resume never schedules or restarts anything.
        Promise.resolve(context.resume()).catch(() => { if (session === active) stop(); });
      }
      return true;
    } catch {
      stop();
      return false;
    }
  }

  return {
    start,
    stop,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      if (context) {
        try { Promise.resolve(context.close()).catch(() => {}); } catch { /* No audio device. */ }
      }
    },
  };
}
