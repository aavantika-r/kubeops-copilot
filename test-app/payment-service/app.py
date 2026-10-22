from flask import Flask, render_template
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)


def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
        sslmode="require"
    )


@app.route("/health")
def health():
    return {"status": "ok"}, 200


@app.route("/payment")
def payment():
    try:
        conn = get_db()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT p.name, p.price, c.quantity
                FROM cart_items c
                JOIN products p ON c.product_id = p.id
            """)
            items = cur.fetchall()
            cur.close()
        finally:
            conn.close()
    except Exception as e:
        print("Payment error:", e)
        return "Payment service error. Please try again.", 500

    total = sum(i[1] * i[2] for i in items)
    return render_template("payment.html", items=items, total=total)


@app.route("/pay")
def pay():
    try:
        conn = get_db()
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM cart_items")
            conn.commit()
            cur.close()
        finally:
            conn.close()
    except Exception as e:
        print("Pay error:", e)
        return "Payment failed. Please try again.", 500

    return render_template("success.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5004, debug=True)