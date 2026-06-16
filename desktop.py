import threading
import time
import webview
from app import app

PORT = 5001


def _run_flask():
    app.run(host='127.0.0.1', port=PORT, debug=False, use_reloader=False)


if __name__ == '__main__':
    t = threading.Thread(target=_run_flask, daemon=True)
    t.start()
    time.sleep(0.5)

    webview.create_window(
        'Blackjack',
        f'http://127.0.0.1:{PORT}',
        width=1280,
        height=800,
        resizable=True,
    )
    webview.start()
