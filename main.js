// Single delegated click handler for the whole app, bound once — safe
// across full re-renders since #app itself is never replaced.
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset;
  switch (a.action) {
    case 'go-screen': goScreen(a.screen); break;
    case 'go-back': goBack(); break;
    case 'open-setup': openSetup(a.session); break;
    case 'open-card': openCard(a.match); break;
    case 'open-rounds': goScreen('rounds'); break;
    case 'pick-course': pickCourse(a.session, a.course); break;
    case 'pick-shape': pickShape(a.session, a.shape); break;
    case 'pick-game': pickGame(a.session, a.game); break;
    case 'toggle-counts': toggleCounts(a.session); break;
    case 'lock-in': {
      const s = findSession(a.session);
      const hasScores = s.matches.some((m) => Object.keys(m.grossScores).some((id) => Object.keys(m.grossScores[id]).length));
      if (hasScores && !confirm('This round already has scores. Locking in again replaces its matches and CLEARS those scores for everyone. Continue?')) break;
      lockInSession(a.session);
      break;
    }
    case 'step-gross': stepGross(a.match, a.player, Number(a.delta)); break;
    case 'toggle-tag': toggleTag(a.match, a.tag); break;
    case 'go-to-hole': goToHole(a.match, Number(a.idx)); break;
    case 'step-hole': stepHole(a.match, Number(a.delta)); break;
    case 'post-hole': postHoleAndAdvance(a.match); break;
    case 'pick-money-tab': pickMoneyTab(a.tab); break;
    case 'open-fines': openFines(); break;
    case 'close-fines': closeFines(); break;
    case 'close-fines-backdrop': closeFines(); break;
    case 'submit-fine': {
      const player = document.getElementById('fine-player').value;
      const type = document.getElementById('fine-type').value;
      const amount = Number(document.getElementById('fine-amount').value) || 10;
      chargeFine(player, type, amount);
      break;
    }
    case 'send-feed': {
      sendFeedPost(document.getElementById('feed-input').value);
      break;
    }
    case 'pick-me': {
      const codeInput = document.getElementById('trip-code-input');
      if (codeInput) {
        if (!normalizeTripCode(codeInput.value)) { codeInput.focus(); break; }
        applyTripCode(codeInput.value);
      }
      setMe(a.player);
      break;
    }
    case 'edit-hcp': openHcp(a.player); break;
    case 'close-hcp': closeHcp(); break;
    case 'save-hcp': {
      const raw = document.getElementById('hcp-input').value.trim();
      const value = Number(raw);
      if (raw === '' || !Number.isFinite(value) || value < -10 || value > 54) {
        alert('Enter a handicap index between -10 and 54 (one decimal is fine, e.g. 11.4).');
        break;
      }
      setHandicap(a.player, Math.round(value * 10) / 10);
      break;
    }
    case 'open-verify': openVerify(a.session); break;
    case 'view-photo': viewPhoto(a.photo); break;
    case 'close-photo': closePhoto(); break;
    case 'photo-zoom': zoomPhoto(Number(a.delta)); break;
    case 'remove-photo':
      if (confirm('Delete this scorecard photo for everyone?')) removePhoto(a.photo);
      break;
    case 'fix-hole': fixHole(a.match, Number(a.idx)); break;
    case 'mark-verified': {
      if (photosFor(getState(), a.session).length === 0 &&
          !confirm('No scorecard photo has been added for this round. Mark the scores as verified anyway?')) break;
      markVerified(a.session);
      break;
    }
    case 'clear-verified': clearVerified(a.session); break;
    case 'forget-me': forgetMe(); break;
    case 'share-invite': {
      const link = inviteLink();
      const done = () => alert('Invite link copied. Text it to the group:\n\n' + link);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => prompt('Copy this invite link:', link));
      else prompt('Copy this invite link:', link);
      break;
    }
    case 'reset-trip': {
      const msg = a.kind === 'sample'
        ? 'Replace EVERYTHING in this trip (for all players) with the sample trip data?'
        : 'Erase ALL scores, money and chat for this trip (for all players) and start clean?';
      if (confirm(msg)) resetTrip(a.kind);
      break;
    }
    default: break; // includes 'noop'
  }
});

// <select> pickers fire `change`, not `click`.
document.addEventListener('change', (ev) => {
  const file = ev.target.closest('input[type="file"][data-action="photo-file"]');
  if (file) {
    const files = Array.from(file.files || []);
    file.value = '';
    addPhotos(file.dataset.session, files);
    return;
  }
  const el = ev.target.closest('select[data-action]');
  if (!el) return;
  if (el.dataset.action === 'set-slot') setSlot(el.dataset.session, el.dataset.team, Number(el.dataset.slot), el.value);
  if (el.dataset.action === 'set-tee') pickTee(el.dataset.session, el.value);
});

initStore();

// An invite link looks like  https://…/#trip=hawks-7k2q  — adopt the code,
// then strip it from the address bar.
(function readInviteHash() {
  const m = location.hash.match(/trip=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const code = normalizeTripCode(m[1]);
  const state = getState();
  if (code && code !== state.ui.tripCode) {
    if (syncAvailable()) {
      state.ui.tripCode = code;
      const fresh = freshState(state.ui);
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, fresh);
      persist();
    } else {
      state.ui.tripCode = code;
    }
  }
  history.replaceState(null, '', location.pathname + location.search);
})();

render();
startSync();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
