"use strict";

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let state          = null;
let pendingBet     = 0;
let useImages      = false;
let toastTimer     = null;
let animating      = false;
let prevPhase      = null;
let handCounts     = null;   // card-per-hand counts from last render (null = fresh hand)
let sessionId      = null;   // detects server restart

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

const api = {
  get:  url       => fetch(url).then(r => r.json()),
  post: (url, d={}) => fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  }).then(r => r.json()),
};

/* Card value helpers (mirrors Python logic) */
function rankValue(rank) {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

/**
 * Compute { total, isSoft, isBJ } from an array of card dicts,
 * ignoring hidden cards. Works the same as hand_total() in Python.
 */
function computeHandInfo(cards) {
  let total = 0, aces = 0;
  cards.filter(c => !c.hidden).forEach(c => {
    const v = rankValue(c.rank);
    total += v;
    if (v === 11) aces++;
  });
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const visible = cards.filter(c => !c.hidden);
  const isSoft  = aces > 0 && total <= 21;
  const isBJ    = visible.length === 2 && cards.length === 2 && total === 21;
  return { total, isSoft, isBJ };
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  useImages = await checkCardImages();
  state = await api.get("/api/state");
  render(state);
  bindEvents();
});

function checkCardImages() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = "/static/images/cards/back.png";
  });
}

/* ═══════════════════════════════════════════
   MASTER RENDER
═══════════════════════════════════════════ */
async function render(s) {
  if (animating) return;

  // If the server restarted, its session_id will differ — reload to get fresh state.
  if (sessionId !== null && s.session_id !== sessionId) {
    location.reload();
    return;
  }
  sessionId = s.session_id;

  const incoming = s.phase;
  const outgoing = prevPhase;

  if (incoming === "setup") {
    state = s; prevPhase = incoming;
    showScreen("setup");
    return;
  }
  if (incoming === "game_over") {
    state = s; prevPhase = incoming;
    showScreen("gameover");
    return;
  }

  showScreen("game");

  // Reset card tracking at the start of each fresh deal
  if (outgoing === "betting" || outgoing === null || outgoing === "setup") {
    handCounts = null;
  }

  const oldBalance = state ? state.balance : s.balance;
  state = s;
  prevPhase = incoming;

  if (outgoing === "player_turn" && incoming === "resolution") {
    await animateDealerReveal(s, oldBalance);
    return;
  }

  doRender(s, oldBalance);
}

function doRender(s, oldBalance) {
  if (oldBalance != null && oldBalance !== s.balance) {
    animateBalance(oldBalance, s.balance);
  } else {
    updateBottomBalance(s.balance);
  }
  renderDealer(s.dealer, s.phase);
  renderPlayerHands(s.player_hands, s.phase);
  renderCenter(s);
  renderActionArea(s);
}

/* ═══════════════════════════════════════════
   DEALER BADGE HELPER
   Works from any array of card dicts (hidden or not).
═══════════════════════════════════════════ */
function updateDealerBadge(cards) {
  const badge = document.getElementById("dealer-total");
  const info  = computeHandInfo(cards);
  if (info.total > 0) {
    if (info.isBJ) {
      badge.textContent = "BJ — 21";
      badge.style.color = "var(--gold)";
    } else if (info.isSoft && info.total < 21) {
      badge.textContent = "soft " + info.total;
      badge.style.color = "";
    } else {
      badge.textContent = info.total;
      badge.style.color = "";
    }
  } else {
    badge.textContent = "";
    badge.style.color = "";
  }
}

/* ═══════════════════════════════════════════
   DEALER REVEAL ANIMATION
═══════════════════════════════════════════ */
async function animateDealerReveal(s, oldBalance) {
  animating = true;

  // Keep panel-play visible with action buttons disabled (prevents board height shift).
  // Do NOT call hideAllPanels() here.
  document.getElementById("panel-betting").classList.add("hidden");
  document.getElementById("panel-play").classList.remove("hidden");
  document.getElementById("action-btns").classList.remove("hidden");
  document.getElementById("result-btns").classList.add("hidden");
  ["hit", "stand", "double", "split"].forEach(a =>
    document.getElementById(`btn-${a}`).disabled = true
  );

  updateBottomBalance(oldBalance);

  // Show player hands without result badges
  renderPlayerHands(s.player_hands, "player_turn");

  const msgEl = document.getElementById("center-message");
  msgEl.className = "center-message";
  msgEl.textContent = "";

  // Show dealer with hole card still face-down
  const faceDownDealer = {
    cards: [s.dealer.cards[0], { hidden: true, image: "back" }],
    total: null, is_soft: false, is_blackjack: false,
  };
  renderDealer(faceDownDealer, "player_turn");

  await sleep(550);

  // Flip hole card in place
  const dealerRow = document.getElementById("dealer-cards");
  const holeEl    = dealerRow.children[1];
  if (holeEl && s.dealer.cards[1]) {
    const revealed = buildCard(s.dealer.cards[1], 1, false, 0);
    revealed.classList.add("flip-in");
    holeEl.replaceWith(revealed);
  }

  // Update badge immediately after flip
  updateDealerBadge([s.dealer.cards[0], s.dealer.cards[1]]);

  await sleep(480);

  // Deal any extra cards the dealer drew, one by one
  for (let i = 2; i < s.dealer.cards.length; i++) {
    const cardEl = buildCard(s.dealer.cards[i], i, false, 0);
    dealerRow.appendChild(cardEl);
    updateDealerBadge(s.dealer.cards.slice(0, i + 1));
    await sleep(440);
  }

  await sleep(380);

  // Animate balance, then reveal result UI
  animateBalance(oldBalance, s.balance);
  renderPlayerHands(s.player_hands, "resolution");
  renderCenter(s);
  renderActionArea(s);

  animating = false;
}

function hideAllPanels() {
  ["panel-betting", "panel-play"].forEach(id =>
    document.getElementById(id).classList.add("hidden")
  );
}

/* ═══════════════════════════════════════════
   SCREEN / BALANCE
═══════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.add("hidden"));
  document.getElementById(`screen-${name}`)?.classList.remove("hidden");
}

function updateBottomBalance(balance) {
  document.getElementById("balance-display").textContent = "$" + balance.toLocaleString();
}

/* ═══════════════════════════════════════════
   DEALER RENDER
═══════════════════════════════════════════ */
function renderDealer(dealer, phase) {
  const row = document.getElementById("dealer-cards");
  row.innerHTML = "";
  dealer.cards.forEach((card, i) => {
    const delay = (handCounts === null) ? 0.3 + i * 0.16 : 0;
    row.appendChild(buildCard(card, i, false, delay));
  });
  // Always compute from visible cards so we show the face-up card value
  // even while the hole card is hidden
  updateDealerBadge(dealer.cards);
}

/* ═══════════════════════════════════════════
   PLAYER HANDS RENDER
═══════════════════════════════════════════ */
function renderPlayerHands(hands, phase) {
  const row = document.getElementById("player-hands-row");

  const splitOccurred = handCounts !== null && hands.length !== handCounts.length;
  const prevCounts    = splitOccurred ? null : handCounts;
  const isInitialDeal = prevCounts === null;

  row.innerHTML = "";

  hands.forEach((hand, hi) => {
    const handEl = document.createElement("div");
    handEl.className = "player-hand";
    if (hand.is_active) handEl.classList.add("active");
    if (hand.result)    handEl.classList.add(`result-${hand.result}`);

    if (hand.result && phase === "resolution") {
      const badge = document.createElement("div");
      badge.className = "hand-result-badge";
      badge.textContent = resultLabel(hand);
      handEl.appendChild(badge);
    }

    const cardsDiv = document.createElement("div");
    cardsDiv.className = "cards-row";
    const prevCount = (prevCounts && hi < prevCounts.length) ? prevCounts[hi] : 0;

    hand.cards.forEach((card, ci) => {
      const isExisting = !isInitialDeal && ci < prevCount;
      const delay      = isInitialDeal ? ci * 0.16 : 0;
      cardsDiv.appendChild(buildCard(card, ci, isExisting, delay));
    });
    handEl.appendChild(cardsDiv);

    // Total + bet badges
    const meta = document.createElement("div");
    meta.className = "hand-meta";

    const totalBadge = document.createElement("span");
    totalBadge.className = "hand-total-badge";

    if (hand.total > 21) {
      totalBadge.textContent = "BUST";
      totalBadge.classList.add("bust");
    } else if (hand.is_blackjack) {
      totalBadge.textContent = "BJ";
      totalBadge.classList.add("bj");
    } else {
      const soft = hand.is_soft ? "soft " : "";
      totalBadge.textContent = soft + hand.total;
      if (hand.is_soft) totalBadge.classList.add("soft");
    }

    const betBadge = document.createElement("span");
    betBadge.className = "hand-bet-badge";
    betBadge.textContent = "$" + hand.bet.toLocaleString();

    meta.append(totalBadge, betBadge);
    handEl.appendChild(meta);
    row.appendChild(handEl);
  });

  handCounts = hands.map(h => h.cards.length);
}

function resultLabel(hand) {
  return { win: "WIN", blackjack: "BLACKJACK", loss: "LOSE",
           bust: "BUST", push: "PUSH", dealer_bj: "DEALER BJ" }[hand.result]
         ?? hand.result.toUpperCase();
}

/* ═══════════════════════════════════════════
   CENTER MESSAGE
═══════════════════════════════════════════ */
function renderCenter(s) {
  const msgEl  = document.getElementById("center-message");
  const shoeEl = document.getElementById("shoe-indicator");

  msgEl.className = "center-message";

  if (s.phase === "betting") {
    msgEl.textContent = "Place your bet";
    msgEl.classList.add("neutral");
  } else if (s.phase === "player_turn") {
    msgEl.textContent = "";
  } else if (s.phase === "resolution") {
    msgEl.textContent = s.message;
    const net = s.player_hands.reduce((a, h) => a + h.net, 0);
    msgEl.classList.add(net > 0 ? "win" : net < 0 ? "loss" : "push");
  }

  shoeEl.innerHTML = "";
  if (s.reshuffled) {
    const n = document.createElement("span");
    n.className = "reshuffle-notice";
    n.textContent = "✦ Shoe reshuffled";
    shoeEl.appendChild(n);
  } else if (s.shoe_remaining != null) {
    shoeEl.textContent = `${s.shoe_remaining} cards remaining`;
  }
}

/* ═══════════════════════════════════════════
   ACTION AREA
═══════════════════════════════════════════ */
function renderActionArea(s) {
  hideAllPanels();

  if (s.phase === "betting") {
    document.getElementById("panel-betting").classList.remove("hidden");
    updateBetDisplay();
    document.getElementById("rebet-btn").disabled = s.last_bet < 1;
  } else if (s.phase === "player_turn") {
    document.getElementById("panel-play").classList.remove("hidden");
    document.getElementById("action-btns").classList.remove("hidden");
    document.getElementById("result-btns").classList.add("hidden");
    updateActionButtons(s);
  } else if (s.phase === "resolution") {
    document.getElementById("panel-play").classList.remove("hidden");
    document.getElementById("action-btns").classList.add("hidden");
    document.getElementById("result-btns").classList.remove("hidden");
    document.getElementById("rebet-deal-btn").disabled =
      s.last_bet < 1 || s.last_bet > s.balance;
    document.getElementById("double-deal-btn").disabled =
      s.last_bet < 1 || s.last_bet * 2 > s.balance;
  }
}

function updateActionButtons(s) {
  const hand    = s.player_hands[s.current_hand_idx];
  const actions = hand ? hand.available_actions : [];
  ["hit", "stand", "double", "split"].forEach(a => {
    document.getElementById(`btn-${a}`).disabled = !actions.includes(a);
  });
}

function animateBalance(from, to, duration = 900) {
  const el = document.getElementById("balance-display");
  const diff = to - from;
  if (diff === 0) { updateBottomBalance(to); return; }

  el.style.color = diff > 0 ? "var(--green-win)" : "var(--red)";
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = "$" + Math.round(from + diff * eased).toLocaleString();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = "$" + to.toLocaleString();
      setTimeout(() => { el.style.color = ""; }, 1200);
    }
  }
  requestAnimationFrame(step);
}

/* ═══════════════════════════════════════════
   CARD BUILDING
═══════════════════════════════════════════ */
function buildCard(cardData, index, isExisting = false, delay = 0) {
  const el = document.createElement("div");
  el.className = "card";

  if (isExisting) {
    el.style.animation = "none";
  } else {
    el.style.animationDelay = `${delay}s`;
  }

  if (cardData.hidden) {
    el.classList.add("card-back", "has-image");
    const img = document.createElement("img");
    img.className = "card-img";
    img.src = "/static/images/cards/back.png";
    el.appendChild(img);
    return el;
  }

  el.classList.add(cardData.is_red ? "red" : "black");

  if (useImages) {
    const img     = document.createElement("img");
    img.className = "card-img";
    img.src       = `/static/images/cards/${cardData.image}.png`;
    img.onerror   = () => { el.innerHTML = ""; el.classList.remove("has-image"); renderCSSCard(el, cardData); };
    img.onload    = () => el.classList.add("has-image");
    el.appendChild(img);
  } else {
    renderCSSCard(el, cardData);
  }

  return el;
}

function renderCSSCard(el, card) {
  el.innerHTML = `
    <div class="card-corner top">
      <div class="card-rank">${card.rank_display}</div>
      <div class="card-suit-sm">${card.suit_symbol}</div>
    </div>
    <div class="card-center">
      <div class="card-suit-lg">${card.suit_symbol}</div>
    </div>
    <div class="card-corner bottom">
      <div class="card-rank">${card.rank_display}</div>
      <div class="card-suit-sm">${card.suit_symbol}</div>
    </div>`;
}

/* ═══════════════════════════════════════════
   BETTING HELPERS
═══════════════════════════════════════════ */
function addChip(value) {
  if (!state || animating) return;
  pendingBet = Math.min(pendingBet + value, state.balance);
  updateBetDisplay();
}

function clearBet() {
  pendingBet = 0;
  updateBetDisplay();
}

function updateBetDisplay() {
  document.getElementById("bet-amount").textContent = "$" + pendingBet.toLocaleString();
  document.getElementById("deal-btn").disabled = pendingBet < 1;
}

/* ═══════════════════════════════════════════
   EVENT BINDING
═══════════════════════════════════════════ */
function bindEvents() {

  /* ── Setup ── */
  document.getElementById("start-btn").addEventListener("click", async () => {
    const raw     = document.getElementById("balance-input").value.replace(/,/g, "");
    const balance = parseInt(raw, 10);
    const errEl   = document.getElementById("setup-error");
    if (isNaN(balance) || balance < 1 || balance > 999_999_999) {
      errEl.textContent = "Enter a whole number between $1 and $999,999,999.";
      errEl.classList.remove("hidden");
      return;
    }
    errEl.classList.add("hidden");
    const s = await api.post("/api/start", { balance });
    if (s.error) { showToast(s.error); return; }
    prevPhase = "setup";
    render(s);
  });

  document.getElementById("balance-input").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("start-btn").click();
  });

  /* ── Chips ── */
  document.querySelectorAll(".chip").forEach(chip =>
    chip.addEventListener("click", () => addChip(parseInt(chip.dataset.value, 10)))
  );

  document.getElementById("clear-bet-btn").addEventListener("click", clearBet);

  document.getElementById("rebet-btn").addEventListener("click", () => {
    if (state && state.last_bet > 0) {
      pendingBet = Math.min(state.last_bet, state.balance - 1);
      updateBetDisplay();
    }
  });

  /* ── Deal ── */
  document.getElementById("deal-btn").addEventListener("click", async () => {
    if (pendingBet < 1 || animating) return;
    const bet = pendingBet;
    pendingBet = 0;
    const s = await api.post("/api/bet", { bet });
    if (s.error) { pendingBet = bet; updateBetDisplay(); showToast(s.error); return; }
    render(s);
  });

  /* ── Action buttons ── */
  ["hit", "stand", "double", "split"].forEach(act => {
    document.getElementById(`btn-${act}`).addEventListener("click", async () => {
      if (animating) return;
      const s = await api.post("/api/action", { action: act });
      if (s.error) { showToast(s.error); return; }
      render(s);
    });
  });

  /* ── Rebet & Deal ── */
  document.getElementById("rebet-deal-btn").addEventListener("click", async () => {
    if (animating || !state) return;
    prevPhase  = "betting";
    handCounts = null;
    const s = await api.post("/api/rebet_deal");
    if (s.error) { showToast(s.error); return; }
    render(s);
  });

  /* ── 2X & Deal ── */
  document.getElementById("double-deal-btn").addEventListener("click", async () => {
    if (animating || !state) return;
    prevPhase  = "betting";
    handCounts = null;
    const s = await api.post("/api/double_deal");
    if (s.error) { showToast(s.error); return; }
    render(s);
  });

  /* ── Change Bet ── */
  document.getElementById("change-bet-btn").addEventListener("click", async () => {
    if (animating) return;
    const s = await api.post("/api/new_hand");
    render(s);
  });

  /* ── Restart ── */
  document.getElementById("restart-btn").addEventListener("click", async () => {
    const s = await api.post("/api/restart");
    prevPhase  = null;
    handCounts = null;
    render(s);
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener("keydown", async e => {
    if (animating) return;

    // H / S / D / P during player turn
    if (state?.phase === "player_turn") {
      const hand    = state.player_hands[state.current_hand_idx];
      const actions = hand?.available_actions ?? [];
      const map     = { h: "hit", s: "stand", d: "double", p: "split" };
      const act     = map[e.key.toLowerCase()];
      if (act && actions.includes(act)) {
        e.preventDefault();
        const s = await api.post("/api/action", { action: act });
        if (s.error) { showToast(s.error); return; }
        render(s);
      }
    }

    // Enter / Space at resolution → rebet & deal if possible, else change bet
    if (state?.phase === "resolution" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const rebetBtn = document.getElementById("rebet-deal-btn");
      if (!rebetBtn.disabled) rebetBtn.click();
      else document.getElementById("change-bet-btn").click();
    }
  });
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3000);
}
