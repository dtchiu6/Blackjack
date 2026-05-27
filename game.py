import random
import uuid

SUITS = ["Hearts", "Clubs", "Spades", "Diamonds"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
NUM_DECKS = 3
RESHUFFLE_THRESHOLD = 104

SUIT_SYMBOL = {"Hearts": "♥", "Clubs": "♣", "Spades": "♠", "Diamonds": "♦"}
SUIT_SHORT = {"Hearts": "H", "Clubs": "C", "Spades": "S", "Diamonds": "D"}
RED_SUITS = {"Hearts", "Diamonds"}


def build_shoe():
    shoe = [f"{rank} of {suit}" for _ in range(NUM_DECKS) for suit in SUITS for rank in RANKS]
    random.shuffle(shoe)
    return shoe


def card_value(card):
    rank = card.split(" of ")[0]
    if rank in ("J", "Q", "K"):
        return 10
    if rank == "A":
        return 11
    return int(rank)


def hand_total(hand):
    total, aces = 0, 0
    for card in hand:
        v = card_value(card)
        total += v
        if v == 11:
            aces += 1
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total


def is_soft(hand):
    total, aces = 0, 0
    for card in hand:
        v = card_value(card)
        total += v
        if v == 11:
            aces += 1
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return aces > 0 and total <= 21


def is_blackjack(hand):
    return len(hand) == 2 and hand_total(hand) == 21


TEN_RANKS = {"10", "J", "Q", "K"}

def is_pair(hand):
    if len(hand) != 2:
        return False
    r1 = hand[0].split(" of ")[0]
    r2 = hand[1].split(" of ")[0]
    return r1 == r2 or (r1 in TEN_RANKS and r2 in TEN_RANKS)


def card_to_dict(card):
    rank, suit = card.split(" of ")
    image_rank = "T" if rank == "10" else rank
    return {
        "card": card,
        "rank": rank,
        "rank_display": rank,
        "suit": suit,
        "suit_symbol": SUIT_SYMBOL[suit],
        "suit_short": SUIT_SHORT[suit],
        "is_red": suit in RED_SUITS,
        "image": f"{image_rank}{SUIT_SHORT[suit]}",
    }


class BlackjackGame:
    def __init__(self):
        self.session_id = str(uuid.uuid4())
        self.shoe = []
        self.dealt_count = 0
        self.balance = 0
        self.dealer_hand = []
        self.player_hands = []
        self.current_hand_idx = 0
        self.phase = "setup"
        self.last_bet = 0
        self.message = ""
        self.reshuffled = False

    def start_session(self, balance):
        self.balance = balance
        self.shoe = build_shoe()
        self.dealt_count = 0
        self.phase = "betting"
        self.last_bet = 0
        self.message = "Place your bet to begin."

    def place_bet(self, bet):
        if self.phase != "betting":
            return False, "Not in betting phase."
        try:
            bet = int(bet)
        except (ValueError, TypeError):
            return False, "Invalid bet."
        if bet < 1 or bet > self.balance:
            return False, f"Bet must be between $1 and ${self.balance}."

        self.reshuffled = False
        if self.dealt_count >= RESHUFFLE_THRESHOLD:
            self.shoe = build_shoe()
            self.dealt_count = 0
            self.reshuffled = True

        self.last_bet = bet
        self.dealer_hand = [self.shoe.pop(), self.shoe.pop()]
        player_hand = [self.shoe.pop(), self.shoe.pop()]
        self.dealt_count += 4

        self.player_hands = [{
            "hand": player_hand,
            "bet": bet,
            "is_split": False,
            "done": False,
            "result": None,
            "net": 0,
        }]
        self.current_hand_idx = 0
        self.phase = "player_turn"

        if is_blackjack(player_hand) or is_blackjack(self.dealer_hand):
            self._resolve_round()
            return True, "Dealt!"

        self.message = self._action_hint()
        return True, "Dealt!"

    def _action_hint(self):
        h = self._current_hand()
        if not h:
            return ""
        actions = ["Hit", "Stand"]
        if len(h["hand"]) == 2 and (self.balance - h["bet"]) >= h["bet"]:
            actions.append("Double")
        if (is_pair(h["hand"]) and len(self.player_hands) < 4
                and (self.balance - h["bet"] * len(self.player_hands)) >= h["bet"]):
            actions.append("Split")
        return " · ".join(actions)

    def _current_hand(self):
        if 0 <= self.current_hand_idx < len(self.player_hands):
            return self.player_hands[self.current_hand_idx]
        return None

    def action(self, act):
        if self.phase != "player_turn":
            return False, "Not your turn."
        h = self._current_hand()
        if not h:
            return False, "No active hand."

        if act == "stand":
            h["done"] = True
            self._next_hand()
            return True, "Stand."

        if act == "hit":
            h["hand"].append(self.shoe.pop())
            self.dealt_count += 1
            if hand_total(h["hand"]) >= 21:
                h["done"] = True
                self._next_hand()
            else:
                self.message = self._action_hint()
            return True, "Hit."

        if act == "double":
            if len(h["hand"]) != 2 or (self.balance - h["bet"]) < h["bet"]:
                return False, "Cannot double."
            h["hand"].append(self.shoe.pop())
            self.dealt_count += 1
            h["bet"] *= 2
            h["done"] = True
            self._next_hand()
            return True, "Doubled."

        if act == "split":
            if not (is_pair(h["hand"]) and len(self.player_hands) < 4
                    and (self.balance - h["bet"] * len(self.player_hands)) >= h["bet"]):
                return False, "Cannot split."
            c1, c2 = h["hand"]
            h1 = {"hand": [c1, self.shoe.pop()], "bet": h["bet"], "is_split": True, "done": False, "result": None, "net": 0}
            h2 = {"hand": [c2, self.shoe.pop()], "bet": h["bet"], "is_split": True, "done": False, "result": None, "net": 0}
            self.dealt_count += 2
            self.player_hands[self.current_hand_idx:self.current_hand_idx + 1] = [h1, h2]
            if c1.split(" of ")[0] == "A":
                h1["done"] = True
                h2["done"] = True
                self._next_hand()
            else:
                # Auto-stand any split hand that immediately reaches 21
                if hand_total(h1["hand"]) >= 21:
                    h1["done"] = True
                if hand_total(h2["hand"]) >= 21:
                    h2["done"] = True
                if h1["done"]:
                    self._next_hand()
                else:
                    self.message = self._action_hint()
            return True, "Split."

        return False, "Unknown action."

    def _next_hand(self):
        for i, h in enumerate(self.player_hands):
            if not h["done"]:
                self.current_hand_idx = i
                self.message = self._action_hint()
                return
        self._resolve_round()

    def _resolve_round(self):
        live = any(hand_total(h["hand"]) <= 21 for h in self.player_hands)
        if live:
            while hand_total(self.dealer_hand) < 17:
                self.dealer_hand.append(self.shoe.pop())
                self.dealt_count += 1

        dealer_total = hand_total(self.dealer_hand)
        dealer_bj = is_blackjack(self.dealer_hand)
        total_net = 0

        for h in self.player_hands:
            ptotal = hand_total(h["hand"])
            pbj = is_blackjack(h["hand"]) and not h["is_split"]
            bet = h["bet"]

            if ptotal > 21:
                h["result"], h["net"] = "bust", -bet
            elif dealer_bj and pbj:
                h["result"], h["net"] = "push", 0
            elif dealer_bj:
                h["result"], h["net"] = "dealer_bj", -bet
            elif pbj:
                h["result"], h["net"] = "blackjack", int(bet * 1.5)
            elif dealer_total > 21:
                h["result"], h["net"] = "win", bet
            elif ptotal > dealer_total:
                h["result"], h["net"] = "win", bet
            elif dealer_total > ptotal:
                h["result"], h["net"] = "loss", -bet
            else:
                h["result"], h["net"] = "push", 0

            self.balance += h["net"]
            total_net += h["net"]

        if self.balance < 1:
            self.phase = "game_over"
            self.message = "Out of chips."
        else:
            self.phase = "resolution"

        if total_net > 0:
            self.message = f"+${total_net:,}"
        elif total_net < 0:
            self.message = f"-${abs(total_net):,}"
        else:
            self.message = "Push"

    def new_hand(self):
        if self.phase != "resolution":
            return False
        self.dealer_hand = []
        self.player_hands = []
        self.current_hand_idx = 0
        self.phase = "betting"
        self.message = "Place your bet."
        return True

    def get_state(self):
        hide_dealer = self.phase == "player_turn"

        dealer_cards = []
        for i, card in enumerate(self.dealer_hand):
            if hide_dealer and i == 1:
                dealer_cards.append({"hidden": True, "image": "back"})
            else:
                dealer_cards.append({"hidden": False, **card_to_dict(card)})

        dealer_total = hand_total(self.dealer_hand) if self.dealer_hand else None
        dealer_soft = is_soft(self.dealer_hand) if self.dealer_hand and not hide_dealer else False

        player_hands = []
        for i, h in enumerate(self.player_hands):
            total = hand_total(h["hand"])
            soft = is_soft(h["hand"]) and total < 21
            cards = [{"hidden": False, **card_to_dict(c)} for c in h["hand"]]
            available_actions = []
            if self.phase == "player_turn" and i == self.current_hand_idx:
                available_actions = ["hit", "stand"]
                if len(h["hand"]) == 2 and (self.balance - h["bet"]) >= h["bet"]:
                    available_actions.append("double")
                if (is_pair(h["hand"]) and len(self.player_hands) < 4
                        and (self.balance - h["bet"] * len(self.player_hands)) >= h["bet"]):
                    available_actions.append("split")

            player_hands.append({
                "cards": cards,
                "total": total,
                "is_soft": soft,
                "bet": h["bet"],
                "is_split": h["is_split"],
                "done": h["done"],
                "result": h["result"],
                "net": h["net"],
                "is_active": (i == self.current_hand_idx and self.phase == "player_turn"),
                "is_blackjack": is_blackjack(h["hand"]),
                "available_actions": available_actions,
            })

        return {
            "session_id": self.session_id,
            "phase": self.phase,
            "balance": self.balance,
            "last_bet": self.last_bet,
            "dealer": {
                "cards": dealer_cards,
                "total": dealer_total if not hide_dealer else None,
                "is_soft": dealer_soft,
                "is_blackjack": is_blackjack(self.dealer_hand) if self.dealer_hand else False,
            },
            "player_hands": player_hands,
            "current_hand_idx": self.current_hand_idx,
            "message": self.message,
            "reshuffled": self.reshuffled,
            "shoe_remaining": len(self.shoe),
        }
