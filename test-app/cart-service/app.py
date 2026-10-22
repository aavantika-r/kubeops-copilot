from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)
def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
        sslmode="require"
    )


# ------------------ VIEW CART ------------------

@app.route("/cart")
def cart():

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            c.id,
            p.name,
            p.price,
            c.quantity
        FROM cart_items c
        JOIN products p
        ON c.product_id = p.id
        ORDER BY c.id DESC
    """)

    items = cur.fetchall()

    total = sum(item[2] * item[3] for item in items)

    cur.close()
    conn.close()

    return render_template(
        "cart.html",
        items=items,
        total=total
    )


# ------------------ ADD TO CART ------------------

@app.route("/cart", methods=["POST"])
def add_cart():

    data = request.get_json()
    product_id = data["product_id"]

    conn = get_db_connection()
    cur = conn.cursor()

    # Check product exists
    cur.execute(
        "SELECT name FROM products WHERE id=%s",
        (product_id,)
    )

    product = cur.fetchone()

    if not product:
        return jsonify({"error": "Product not found"}), 404

    # Already in cart?
    cur.execute("""
        SELECT id, quantity
        FROM cart_items
        WHERE product_id=%s
    """, (product_id,))

    existing = cur.fetchone()

    if existing:

        cur.execute("""
            UPDATE cart_items
            SET quantity = quantity + 1
            WHERE id=%s
        """, (existing[0],))

    else:

        cur.execute("""
            INSERT INTO cart_items
            (product_id, quantity)
            VALUES (%s, 1)
        """, (product_id,))

    conn.commit()

    cur.close()
    conn.close()

    return jsonify({
        "message": "Added",
        "product": {
            "name": product[0]
        }
    })


# ------------------ DELETE ------------------

@app.route("/cart/delete/<int:item_id>", methods=["POST"])
def delete_item(item_id):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        "DELETE FROM cart_items WHERE id=%s",
        (item_id,)
    )

    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"success": True})


# ------------------ RUN ------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5003,
        debug=True
    )