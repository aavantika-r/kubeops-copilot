from flask import Flask, render_template, jsonify
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
        sslmode="require"
    )

@app.route("/api/products")
def api_products():

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT id, name, price FROM products ORDER BY id"
    )

    rows = cur.fetchall()

    cur.close()
    conn.close()

    products = []

    for p in rows:
        products.append({
            "id": p[0],
            "name": p[1],
            "price": p[2]
        })

    return jsonify(products)
@app.route("/")
def products():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id, name, price FROM products ORDER BY id")
    products = cur.fetchall()

    cur.close()
    conn.close()

    return render_template("products.html", products=products)


@app.route("/add/<int:product_id>")
def add_to_cart(product_id):

    conn = get_db_connection()
    cur = conn.cursor()

    # Get selected product
    cur.execute(
        "SELECT name, price FROM products WHERE id=%s",
        (product_id,)
    )

    product = cur.fetchone()

    if product:
        name, price = product

        # Insert into cart_items
        cur.execute(
            """
            INSERT INTO cart_items
            (product_name, price, quantity)
            VALUES (%s,%s,1)
            """,
            (name, price)
        )

        conn.commit()

    cur.close()
    conn.close()

    # Redirect to Cart service
    return redirect("http://127.0.0.1:5000/cart")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True)