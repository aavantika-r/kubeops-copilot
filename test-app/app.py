from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from pod_analyzer.pod_analyzer import router as pod_router
import os
import psycopg2

load_dotenv()

app = Flask(__name__)
app.register_blueprint(pod_router)

# Database connection
def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
                sslmode="require"
    )


# Home page
@app.route("/")
def home():
    return render_template("index.html")


# Add product to cart
@app.route("/cart", methods=["POST"])
def add_to_cart():

    data = request.get_json()
    product_id = data.get("product_id")

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO cart_items (product_id, quantity)
        VALUES (%s, %s)
        """,
        (product_id, 1)
    )

    conn.commit()

    # Get product name
    cur.execute(
        "SELECT name FROM products WHERE id = %s",
        (product_id,)
    )

    product = cur.fetchone()

    cur.close()
    conn.close()

    return jsonify({
        "message": "Product added to cart",
        "product": {
            "name": product[0]
        }
    })


# View cart
@app.route("/cart", methods=["GET"])
def view_cart():

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            c.id,
            p.name,
            p.price,
            c.quantity,
            (p.price * c.quantity) AS subtotal
        FROM cart_items c
        JOIN products p
        ON c.product_id = p.id
        """
    )

    cart_items = cur.fetchall()

    total = sum(item[4] for item in cart_items)

    cur.close()
    conn.close()

    return render_template(
        "cart.html",
        cart_items=cart_items,
        total=total
    )
@app.route("/cart/delete/<int:item_id>", methods=["POST"])
def delete_cart_item(item_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute(
        "DELETE FROM cart_items WHERE id = %s",
        (item_id,)
    )

    conn.commit()

    cur.close()
    conn.close()

    return jsonify({"message": "Item removed from cart"})

# Run application
if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )