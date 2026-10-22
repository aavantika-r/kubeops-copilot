from flask import Flask, render_template, Response, request, redirect
import requests

app = Flask(__name__)

LOGIN_URL = "http://login:5001"
PAYMENT_URL = "http://payment:5004"


@app.route("/")
def root():
    response = requests.get(f"{LOGIN_URL}/login")
    return Response(response.text, mimetype="text/html")


@app.route("/login", methods=["GET"])
def login_page():
    response = requests.get(f"{LOGIN_URL}/login")
    return Response(response.text, mimetype="text/html")


@app.route("/login", methods=["POST"])
def login_submit():
    response = requests.post(f"{LOGIN_URL}/login", data=request.form)

    if response.status_code == 200:
        return redirect("/shop")

    return Response(
        response.content,
        status=response.status_code,
        mimetype="text/html"
    )


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        response = requests.get(f"{LOGIN_URL}/register")
    else:
        response = requests.post(f"{LOGIN_URL}/register", data=request.form)

    return Response(
        response.content,
        status=response.status_code,
        content_type=response.headers.get("Content-Type", "text/html")
    )


@app.route("/shop")
def shop():
    response = requests.get("http://product:5002/api/products")
    products = response.json()
    return render_template("index.html", products=products)


@app.route("/images/<filename>")
def images(filename):
    response = requests.get(f"http://product:5002/static/images/{filename}")

    return Response(
        response.content,
        mimetype=response.headers.get("Content-Type", "image/png")
    )


@app.route("/cart", methods=["GET"])
def view_cart():
    response = requests.get("http://cart:5003/cart")
    return Response(response.text, mimetype="text/html")


@app.route("/cart", methods=["POST"])
def add_to_cart():
    response = requests.post("http://cart:5003/cart", json=request.get_json())

    return Response(
        response.content,
        status=response.status_code,
        mimetype="application/json"
    )


@app.route("/cart/delete/<int:item_id>", methods=["POST"])
def delete_item(item_id):
    response = requests.post(f"http://cart:5003/cart/delete/{item_id}")

    return Response(
        response.content,
        status=response.status_code,
        mimetype="application/json"
    )


@app.route("/payment")
def payment_page():
    response = requests.get(f"{PAYMENT_URL}/payment")
    return Response(
        response.content,
        status=response.status_code,
        mimetype="text/html"
    )


@app.route("/pay")
def pay():
    response = requests.get(f"{PAYMENT_URL}/pay")
    return Response(
        response.content,
        status=response.status_code,
        mimetype="text/html"
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)