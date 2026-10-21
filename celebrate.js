// Full-screen celebration for a hole in one or an albatross. The trigger is a
// feed post carrying a `feat` (written by actions.js when the hole is posted).
// Feed posts sync to everyone, so every phone that has the app open sees the
// splash within a moment; a phone that opens the app later within the window
// below sees it too. Each phone remembers what it has already celebrated.

const CELEBRATE_MAX_AGE_MS = 20 * 60 * 1000;   // don't replay old feats when a phone first loads
const CELEBRATE_SHOW_MS = 25000;               // goes away by itself if nobody taps it
const CONFETTI_COLORS = ['#0b1a5a', '#9aa0ae', '#e0b030', '#ffffff', '#f4d56a', '#4d5262'];

const Celebrate = { queue: [], showing: false, timer: null };

// Called after every render: queue any feat this phone hasn't celebrated yet.
function checkCelebrations(state) {
  if (!state || !state.feed) return;
  const seen = state.ui.celebrated = state.ui.celebrated || [];
  const fresh = state.feed
    .filter((f) => f.feat && seen.indexOf(f.id) === -1 && Date.now() - f.ts < CELEBRATE_MAX_AGE_MS)
    .sort((a, b) => a.ts - b.ts);
  if (!fresh.length) return;
  fresh.forEach((f) => { seen.push(f.id); Celebrate.queue.push(f); });
  if (seen.length > 60) state.ui.celebrated = seen.slice(-60);
  persist();
  showNextCelebration();
}

function celebrationSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [523, 659, 784, 1047, 1319].forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.55);
    });
  } catch (e) { /* the phone won't play sound until the page has been tapped; that's fine */ }
}

function confettiMarkup(count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 2.5).toFixed(2);
    const dur = (3 + Math.random() * 3).toFixed(2);
    const size = 6 + Math.round(Math.random() * 8);
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const rot = Math.round(Math.random() * 360);
    out += `<i class="confetti-piece" style="left:${left}%;width:${size}px;height:${Math.round(size * 1.6)}px;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;transform:rotate(${rot}deg)"></i>`;
  }
  return out;
}

function showNextCelebration() {
  if (Celebrate.showing || !Celebrate.queue.length) return;
  const f = Celebrate.queue.shift();
  const feat = f.feat;
  const p = PLAYERS_BY_ID[feat.playerId];
  if (!p) { showNextCelebration(); return; }
  Celebrate.showing = true;

  const isAce = feat.type === 'ace';
  const el = document.createElement('div');
  el.id = 'celebrate';
  el.className = 'celebrate';
  el.setAttribute('role', 'alertdialog');
  el.innerHTML = `
    <div class="confetti-layer" aria-hidden="true">${confettiMarkup(isAce ? 90 : 60)}</div>
    <div class="celebrate-card">
      <img src="./logo.png" alt="" width="64" height="60" class="celebrate-logo">
      <div class="celebrate-kicker">${isAce ? 'Hole in one' : 'Double eagle'}</div>
      <div class="celebrate-title">${isAce ? 'HOLE IN ONE!' : 'ALBATROSS!'}</div>
      <div class="celebrate-name">${esc(p.name)}</div>
      <div class="celebrate-where">${esc(ordinal(feat.holeN))} hole &middot; ${esc(feat.course)}</div>
      <div class="celebrate-bounty">Everyone else pays ${esc(p.name)} $${feat.bounty}<br><strong>$${feat.total} on the way</strong></div>
      <button class="celebrate-btn" data-celebrate-close="1">Nice!</button>
    </div>`;
  document.body.appendChild(el);
  celebrationSound();
  try { if (navigator.vibrate) navigator.vibrate([180, 90, 180, 90, 320]); } catch (e) { /* not supported on iPhone */ }

  const close = () => {
    clearTimeout(Celebrate.timer);
    el.remove();
    Celebrate.showing = false;
    showNextCelebration();
  };
  el.addEventListener('click', close);
  Celebrate.timer = setTimeout(close, CELEBRATE_SHOW_MS);
}
