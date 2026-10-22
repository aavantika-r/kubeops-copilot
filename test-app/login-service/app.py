from flask import Flask, render_template, request
from supabase import create_client
from dotenv import load_dotenv
import os

app = Flask(__name__)

base_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(base_dir, ".env"))
load_dotenv(os.path.join(base_dir, "..", ".env"))


def get_supabase():
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        raise ValueError("SUPABASE_URL or SUPABASE_KEY is missing")

    return create_client(url, key)


@app.route("/health")
def health():
    return {"status": "ok"}, 200


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return render_template("login.html")

    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")

    if not email or not password:
        return render_template(
            "login.html", error="Please enter email and password"
        ), 400

    try:
        result = (
            get_supabase()
            .table("users")
            .select("email")
            .eq("email", email)
            .eq("password", password)
            .execute()
        )
    except Exception as e:
        print("Login error:", e)
        return render_template(
            "login.html", error="Login service error. Please try again."
        ), 500

    if result.data:
        return {"success": True}, 200

    return render_template(
        "login.html", error="Invalid email or password"
    ), 401


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "GET":
        return render_template("register.html")

    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")
    confirm_password = request.form.get("confirm_password")

    if not name or not email or not password:
        return render_template(
            "register.html", error="Please enter name, email and password"
        ), 400

    if confirm_password is not None and password != confirm_password:
        return render_template(
            "register.html", error="Passwords do not match"
        ), 400

    try:
        supabase = get_supabase()

        existing = (
            supabase.table("users")
            .select("email")
            .eq("email", email)
            .execute()
        )

        if existing.data:
            return render_template(
                "register.html", error="Email already registered"
            ), 409

        supabase.table("users").insert(
            {"name": name, "email": email, "password": password}
        ).execute()
    except Exception as e:
        print("Registration error:", e)
        return render_template(
            "register.html",
            error="Registration failed. Please try again."
        ), 500

    return render_template(
        "login.html", message="Account created successfully. Please login."
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)