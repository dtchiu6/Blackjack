from flask import Flask, jsonify, request, render_template
from game import BlackjackGame

app = Flask(__name__)
game = BlackjackGame()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def get_state():
    return jsonify(game.get_state())


@app.route("/api/start", methods=["POST"])
def start():
    data = request.json or {}
    try:
        balance = int(str(data.get("balance", "")).replace(",", ""))
        if not (1 <= balance <= 999_999_999):
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "Enter a whole number between $1 and $999,999,999."}), 400
    game.__init__()
    game.start_session(balance)
    return jsonify(game.get_state())


@app.route("/api/bet", methods=["POST"])
def place_bet():
    data = request.json or {}
    try:
        bet = int(data.get("bet", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid bet amount."}), 400
    ok, msg = game.place_bet(bet)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify(game.get_state())


@app.route("/api/action", methods=["POST"])
def player_action():
    data = request.json or {}
    act = data.get("action", "")
    if act not in ("hit", "stand", "double", "split"):
        return jsonify({"error": "Invalid action."}), 400
    ok, msg = game.action(act)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify(game.get_state())


@app.route("/api/new_hand", methods=["POST"])
def new_hand():
    game.new_hand()
    return jsonify(game.get_state())


@app.route("/api/rebet_deal", methods=["POST"])
def rebet_deal():
    last = game.last_bet
    if not game.new_hand():
        return jsonify({"error": "Cannot start new hand."}), 400
    ok, msg = game.place_bet(last)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify(game.get_state())


@app.route("/api/double_deal", methods=["POST"])
def double_deal():
    doubled = game.last_bet * 2
    if not game.new_hand():
        return jsonify({"error": "Cannot start new hand."}), 400
    ok, msg = game.place_bet(doubled)
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify(game.get_state())


@app.route("/api/restart", methods=["POST"])
def restart():
    game.__init__()
    return jsonify(game.get_state())


if __name__ == "__main__":
    app.run(debug=True, port=5000)
