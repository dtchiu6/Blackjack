"use strict";

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let state = null;
let pendingBet = 0;
let useImages = false;
let toastTimer = null;

/* ═══════════════════════════════════════════
   API HELPERS
═══════════════════════════════════════════ */
const api = {
  get: (url) => fetch(url).then(r => r.json()),
  post: (url, data = {}) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(r => r.json()),
};

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  // Check if custom card images are available
  useImages = await checkCardImages();

  state = await api.get("/api/state");
  render(state);
  bindEvents();
});

function checkCardImages() {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = "/static/images/cards/back.png";
  });
}

/* ═══════════════════════════════════════════
   RENDER (master)
═══════════════════════════════════════════ */
function render(s) {
  state = s;
  switch (s.phase) {
    case "setup":
      showScreen("setup");
      break;
    case "game_over":
      showScreen("gameover");
      break;
    default:
      showScreen("game");
      renderHeader(s);
      renderDealer(s.dealer, s.phase);
      renderPlayerHands(s.player_hands, s.phase);
      renderCenter(s);
      renderActionArea(s);
  }
}

/* ═══════════════════════════════════════════
   SCREEN SWITCHING
═══════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.add("hidden"));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.remove("hidden");
}

/* ═══════════════════════════════════════════
   HEADER
═══════════════════════════════════════════ */
function renderHeader(s) {
  document.getElementById("balance-display").textContent = "$" + s.balance.toLocaleString();
}

/* ═══════════════════════════════════════════
   DEALER
═══════════════════════════════════════════ */
function renderDealer(dealer, phase) {
  const row = document.getElementById("dealer-cards");
  const totalEl = document.getElementById("dealer-total");

  row.innerHTML = "";
  dealer.cards.forEach((card, i) => {
    const el = buildCard(card, i);
    // Flip the previously-hidden card when resolving
    if (!card.hidden && phase !== "player_turn" && i === 1 && dealer.cards.length >= 2) {
      el.classList.add("flip-in");
    }
    row.appendChild(el);
  });

  if (dealer.total !== null && dealer.cards.length) {
    const soft = dealer.is_soft && dealer.total < 21 ? "soft " : "";
    totalEl.textContent = soft + dealer.total;
    if (dealer.is_blackjack) {
      totalEl.textContent = "BJ — 21";
      totalEl.style.color = "var(--gold)";
    } else {
      totalEl.style.color = "";
    }
  } else {
    totalEl.textContent = "";
  }
}

/* ═══════════════════════════════════════════
   PLAYER HANDS
═══════════════════════════════════════════ */
function renderPlayerHands(hands, phase) {
  const row = document.getElementById("player-hands-row");
  row.innerHTML = "";

  hands.forEach((hand, hi) => {
    const handEl = document.createElement("div");
    handEl.className = "player-hand";
    if (hand.is_active)  handEl.classList.add("active");
    if (hand.result)     handEl.classList.add(`result-${hand.result}`);

    // Result badge (shown after round)
    if (hand.result && phase === "resolution") {
      const badge = document.createElement("div");
      badge.className = "hand-result-badge";
      badge.textContent = resultLabel(hand);
      handEl.appendChild(badge);
    }

    // Cards
    const cardsRow = document.createElement("div");
    cardsRow.className = "cards-row";
    hand.cards.forEach((card, ci) => cardsRow.appendChild(buildCard(card, ci)));
    handEl.appendChild(cardsRow);

    // Meta row: total + bet
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

    meta.appendChild(totalBadge);
    meta.appendChild(betBadge);
    handEl.appendChild(meta);

    row.appendChild(handEl);
  });
}

function resultLabel(hand) {
  const map = {
    win:       "WIN",
    blackjack: "BLACKJACK",
    loss:      "LOSE",
    bust:      "BUST",
    push:      "PUSH",
    dealer_bj: "DEALER BJ",
  };
  return map[hand.result] || hand.result.toUpperCase();
}

/* ═══════════════════════════════════════════
   CENTER MESSAGE
═══════════════════════════════════════════ */
function renderCenter(s) {
  const msgEl = document.getElementById("center-message");
  const shoeEl = document.getElementById("shoe-indicator");

  msgEl.className = "center-message";

  if (s.phase === "betting") {
    msgEl.textContent = "Place your bet";
    msgEl.classList.add("neutral");
  } else if (s.phase === "player_turn") {
    msgEl.textContent = "";
  } else if (s.phase === "resolution") {
    msgEl.textContent = s.message;
    const net = s.player_hands.reduce((acc, h) => acc + h.net, 0);
    if (net > 0) msgEl.classList.add("win");
    else if (net < 0) msgEl.classList.add("loss");
    else msgEl.classList.add("push");
  }

  // Shoe indicator
  shoeEl.innerHTML = "";
  if (s.reshuffled) {
    const notice = document.createElement("span");
    notice.className = "reshuffle-notice";
    notice.textContent = "✦ Shoe reshuffled";
    shoeEl.appendChild(notice);
  } else if (s.shoe_remaining !== undefined) {
    shoeEl.textContent = `${s.shoe_remaining} cards remaining`;
  }
}

/* ═══════════════════════════════════════════
   ACTION AREA
═══════════════════════════════════════════ */
function renderActionArea(s) {
  document.getElementById("panel-betting").classList.add("hidden");
  document.getElementById("panel-action").classList.add("hidden");
  document.getElementById("panel-result").classList.add("hidden");

  if (s.phase === "betting") {
    document.getElementById("panel-betting").classList.remove("hidden");
    updateBetDisplay();
    const rebetBtn = document.getElementById("rebet-btn");
    rebetBtn.disabled = s.last_bet < 1;
  } else if (s.phase === "player_turn") {
    document.getElementById("panel-action").classList.remove("hidden");
    updateActionButtons(s);
  } else if (s.phase === "resolution") {
    document.getElementById("panel-result").classList.remove("hidden");
    renderResultPanel(s);
  }
}

function updateActionButtons(s) {
  const activeHand = s.player_hands[s.current_hand_idx];
  const actions = activeHand ? activeHand.available_actions : [];

  ["hit", "stand", "double", "split"].forEach(a => {
    const btn = document.getElementById(`btn-${a}`);
    btn.disabled = !actions.includes(a);
  });

  const hint = document.getElementById("action-hint");
  hint.textContent = actions.map(a => a[0].toUpperCase() + a.slice(1)).join(" · ");
}

function renderResultPanel(s) {
  const row = document.getElementById("result-row");
  row.innerHTML = "";

  s.player_hands.forEach(hand => {
    const item = document.createElement("div");
    item.className = "result-item";

    const label = document.createElement("div");
    label.className = `result-label ${hand.result}`;
    label.textContent = resultLabel(hand);

    const net = document.createElement("div");
    net.className = "result-net";
    if (hand.net > 0) {
      net.textContent = `+$${hand.net.toLocaleString()}`;
      net.classList.add("positive");
    } else if (hand.net < 0) {
      net.textContent = `-$${Math.abs(hand.net).toLocaleString()}`;
      net.classList.add("negative");
    } else {
      net.textContent = "—";
      net.classList.add("zero");
    }

    item.appendChild(label);
    item.appendChild(net);
    row.appendChild(item);
  });
}

/* ═══════════════════════════════════════════
   CARD BUILDING
═══════════════════════════════════════════ */
function buildCard(cardData, index) {
  const el = document.createElement("div");
  el.className = "card";
  el.style.animationDelay = `${index * 0.07}s`;

  if (cardData.hidden) {
    el.classList.add("card-back");
    return el;
  }

  el.classList.add(cardData.is_red ? "red" : "black");

  if (useImages) {
    const img = document.createElement("img");
    img.className = "card-img";
    img.src = `/static/images/cards/${cardData.image}.png`;
    img.onerror = () => {
      el.innerHTML = "";
      el.classList.remove("has-image");
      renderCSSCard(el, cardData);
    };
    img.onload = () => el.classList.add("has-image");
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
    </div>
  `;
}

/* ═══════════════════════════════════════════
   BETTING
═══════════════════════════════════════════ */
function addChip(value) {
  if (!state) return;
  const max = state.balance - 1;
  pendingBet = Math.min(pendingBet + value, max);
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
  // Setup
  document.getElementById("start-btn").addEventListener("click", async () => {
    const raw = document.getElementById("balance-input").value.replace(/,/g, "");
    const balance = parseInt(raw, 10);
    const errEl = document.getElementById("setup-error");
    if (isNaN(balance) || balance < 1 || balance > 999_999_999) {
      errEl.textContent = "Enter a whole number between $1 and $999,999,999.";
      errEl.classList.remove("hidden");
      return;
    }
    errEl.classList.add("hidden");
    const s = await api.post("/api/start", { balance });
    if (s.error) { showToast(s.error); return; }
    render(s);
  });

  document.getElementById("balance-input").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("start-btn").click();
  });

  // Chips
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => addChip(parseInt(chip.dataset.value, 10)));
  });

  document.getElementById("clear-bet-btn").addEventListener("click", clearBet);

  document.getElementById("rebet-btn").addEventListener("click", () => {
    if (state && state.last_bet > 0) {
      pendingBet = Math.min(state.last_bet, state.balance - 1);
      updateBetDisplay();
    }
  });

  document.getElementById("deal-btn").addEventListener("click", async () => {
    if (pendingBet < 1) return;
    const bet = pendingBet;
    pendingBet = 0;
    const s = await api.post("/api/bet", { bet });
    if (s.error) { pendingBet = bet; updateBetDisplay(); showToast(s.error); return; }
    render(s);
  });

  // Action buttons
  ["hit", "stand", "double", "split"].forEach(act => {
    document.getElementById(`btn-${act}`).addEventListener("click", async () => {
      const s = await api.post("/api/action", { action: act });
      if (s.error) { showToast(s.error); return; }
      render(s);
    });
  });

  // Next hand
  document.getElementById("next-hand-btn").addEventListener("click", async () => {
    const s = await api.post("/api/new_hand");
    render(s);
  });

  // Restart
  document.getElementById("restart-btn").addEventListener("click", async () => {
    const s = await api.post("/api/restart");
    render(s);
  });

  // Keyboard shortcuts (during player_turn)
  document.addEventListener("keydown", async e => {
    if (!state || state.phase !== "player_turn") return;
    const activeHand = state.player_hands[state.current_hand_idx];
    if (!activeHand) return;
    const actions = activeHand.available_actions;

    let act = null;
    switch (e.key.toLowerCase()) {
      case "h": if (actions.includes("hit"))    act = "hit";    break;
      case "s": if (actions.includes("stand"))  act = "stand";  break;
      case "d": if (actions.includes("double")) act = "double"; break;
      case "p": if (actions.includes("split"))  act = "split";  break;
    }
    if (!act) return;
    e.preventDefault();
    const s = await api.post("/api/action", { action: act });
    if (s.error) { showToast(s.error); return; }
    render(s);
  });

  // Enter key during resolution = next hand
  document.addEventListener("keydown", async e => {
    if (!state) return;
    if (state.phase === "resolution" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const s = await api.post("/api/new_hand");
      render(s);
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
