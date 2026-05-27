import random

SUITS = ["Hearts", "Clubs", "Spades", "Diamonds"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
NUM_DECKS = 3
RESHUFFLE_THRESHOLD = 104  # reshuffle after 104 cards dealt


def build_shoe():
    shoe = [f"{rank} of {suit}" for _ in range(NUM_DECKS) for suit in SUITS for rank in RANKS]
    random.shuffle(shoe)
    return shoe


def card_display(card):
    rank = card.split(" of ")[0]
    suit = card.split(" of ")[1]
    suit_symbol = {"Hearts": "♥", "Clubs": "♣", "Spades": "♠", "Diamonds": "♦"}[suit]
    return f"{rank}{suit_symbol}"


def card_value(card):
    rank = card.split(" of ")[0]
    if rank in ("J", "Q", "K"):
        return 10
    if rank == "A":
        return 11
    return int(rank)


def hand_total(hand):
    total = 0
    aces = 0
    for card in hand:
        val = card_value(card)
        total += val
        if val == 11:
            aces += 1
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return total


def is_soft(hand):
    total = 0
    aces = 0
    for card in hand:
        val = card_value(card)
        total += val
        if val == 11:
            aces += 1
    while total > 21 and aces:
        total -= 10
        aces -= 1
    return aces > 0 and total <= 21


def is_blackjack(hand):
    return len(hand) == 2 and hand_total(hand) == 21


def is_pair(hand):
    if len(hand) != 2:
        return False
    rank1 = hand[0].split(" of ")[0]
    rank2 = hand[1].split(" of ")[0]
    return rank1 == rank2


def display_hand(label, hand, hide_second=False):
    if hide_second:
        cards = card_display(hand[0]) + "  [hidden]"
        print(f"  {label}: {cards}")
    else:
        cards = "  ".join(card_display(c) for c in hand)
        total = hand_total(hand)
        soft_str = " (soft)" if is_soft(hand) and total < 21 else ""
        print(f"  {label}: {cards}  [{total}{soft_str}]")


def get_starting_balance():
    while True:
        try:
            val = input("Enter your starting balance (whole number, 1 to 999,999,999): $").strip()
            if "." in val:
                print("  No decimals allowed.")
                continue
            n = int(val)
            if n < 1 or n > 999_999_999:
                print("  Must be greater than 1 and less than 1,000,000,000.")
            else:
                return n
        except ValueError:
            print("  Please enter a whole number.")


def get_bet(balance):
    while True:
        try:
            val = input(f"  Place your bet (1 to {balance - 1}): $").strip()
            if "." in val:
                print("  No decimals allowed.")
                continue
            n = int(val)
            if n < 1 or n >= balance:
                print(f"  Bet must be at least $1 and less than your balance of ${balance}.")
            else:
                return n
        except ValueError:
            print("  Please enter a whole number.")


def get_action(can_split, can_double):
    options = ["[H]it", "[S]tand"]
    valid = {"h", "s"}
    if can_double:
        options.append("[D]ouble")
        valid.add("d")
    if can_split:
        options.append("s[P]lit")
        valid.add("p")
    prompt = " / ".join(options) + " > "
    while True:
        choice = input(f"  Action: {prompt}").strip().lower()
        if choice in valid:
            return choice
        print("  Invalid choice.")


def dealer_turn(hand, shoe, dealt_count):
    while True:
        total = hand_total(hand)
        # dealer stands on all 17s (hard and soft)
        if total >= 17:
            break
        hand.append(shoe.pop())
        dealt_count += 1
    return dealt_count


def payout_message(result):
    messages = {
        "player_blackjack": "Player Blackjack!",
        "dealer_blackjack": "Dealer Blackjack!",
        "player_wins": "Player Wins!",
        "dealer_wins": "Dealer Wins!",
        "push": "Push — Bet returned.",
    }
    print(f"\n  *** {messages[result]} ***")


def resolve_hand(player_hand, dealer_hand, bet, balance, split_hand=False):
    player_total = hand_total(player_hand)
    dealer_total = hand_total(dealer_hand)
    dealer_bj = is_blackjack(dealer_hand)
    # blackjack on split hands counts as 21, not blackjack
    player_bj = is_blackjack(player_hand) and not split_hand

    if player_total > 21:
        payout_message("dealer_wins")
        return balance - bet, -bet

    if dealer_bj and player_bj:
        payout_message("push")
        return balance, 0

    if dealer_bj:
        payout_message("dealer_blackjack")
        return balance - bet, -bet

    if player_bj:
        winnings = int(bet * 1.5)
        payout_message("player_blackjack")
        return balance + winnings, winnings

    if dealer_total > 21:
        payout_message("player_wins")
        return balance + bet, bet

    if player_total > dealer_total:
        payout_message("player_wins")
        return balance + bet, bet

    if dealer_total > player_total:
        payout_message("dealer_wins")
        return balance - bet, -bet

    payout_message("push")
    return balance, 0


def play_hand(shoe, dealt_count, balance):
    print(f"\n  Balance: ${balance}")
    bet = get_bet(balance)

    # deal initial cards
    player = [shoe.pop(), shoe.pop()]
    dealer = [shoe.pop(), shoe.pop()]
    dealt_count += 4

    print()
    display_hand("Dealer", dealer, hide_second=True)
    display_hand("You   ", player)

    # check for immediate player blackjack
    if is_blackjack(player):
        print()
        display_hand("Dealer", dealer)
        balance, _ = resolve_hand(player, dealer, bet, balance)
        return shoe, dealt_count, balance

    # player turn — supports up to 4 total hands via splitting
    # queue entries: (hand, bet, is_split_hand)
    hands_queue = [(player, bet, False)]
    final_hands = []
    total_hands = 1  # track how many hands exist (including queued)

    while hands_queue:
        current_hand, current_bet, is_split = hands_queue.pop(0)

        # split aces only receive one additional card each — stand immediately
        if is_split and len(current_hand) == 2 and current_hand[0].split(" of ")[0] == "A":
            final_hands.append((current_hand, current_bet, True))
            continue

        while True:
            print()
            display_hand("Dealer", dealer, hide_second=True)
            if total_hands > 1:
                hand_num = len(final_hands) + 1
                print(f"  --- Hand {hand_num} of {total_hands} ---")
            display_hand("You   ", current_hand)

            total = hand_total(current_hand)
            if total >= 21:
                break

            can_double = len(current_hand) == 2 and (balance - current_bet) >= current_bet
            # can split if it's a pair, have enough balance, and haven't reached 4 hands
            can_split = (
                is_pair(current_hand)
                and total_hands < 4
                and (balance - current_bet * total_hands) >= current_bet
            )

            action = get_action(can_split, can_double)

            if action == "s":
                break

            elif action == "h":
                current_hand.append(shoe.pop())
                dealt_count += 1

            elif action == "d":
                current_hand.append(shoe.pop())
                dealt_count += 1
                current_bet *= 2
                display_hand("You   ", current_hand)
                break

            elif action == "p":
                # split into two hands, each gets one new card immediately
                new_hand1 = [current_hand[0], shoe.pop()]
                new_hand2 = [current_hand[1], shoe.pop()]
                dealt_count += 2
                total_hands += 1  # one hand becomes two (net +1)
                hands_queue.insert(0, (new_hand1, current_bet, True))
                hands_queue.insert(1, (new_hand2, current_bet, True))
                current_hand = None
                break

        if current_hand is not None:
            final_hands.append((current_hand, current_bet, is_split))

    # dealer draws only if at least one player hand hasn't busted
    live = any(hand_total(h) <= 21 for h, _, _ in final_hands)
    if live:
        dealt_count = dealer_turn(dealer, shoe, dealt_count)

    print()
    display_hand("Dealer", dealer)

    # resolve each hand
    for i, (hand, hand_bet, split_flag) in enumerate(final_hands):
        if total_hands > 1:
            print(f"\n  --- Hand {i + 1} of {total_hands} ---")
            display_hand("You   ", hand)
        balance, _ = resolve_hand(hand, dealer, hand_bet, balance, split_hand=split_flag)

    return shoe, dealt_count, balance


def main():
    print("=" * 50)
    print("           BLACKJACK")
    print("  3-Deck Shoe  |  Dealer Stands Soft 17")
    print("=" * 50)

    balance = get_starting_balance()
    shoe = build_shoe()
    dealt_count = 0

    while True:
        if balance < 1:
            print("\n  You're out of money. Game over.")
            break

        if dealt_count >= RESHUFFLE_THRESHOLD:
            print("\n  --- Reshuffling the shoe ---")
            shoe = build_shoe()
            dealt_count = 0

        shoe, dealt_count, balance = play_hand(shoe, dealt_count, balance)

        print(f"\n  Balance: ${balance}")
        again = input("\n  Play another hand? [Y]es / [N]o > ").strip().lower()
        if again != "y":
            print(f"\n  Thanks for playing! Final balance: ${balance}")
            break


if __name__ == "__main__":
    main()
