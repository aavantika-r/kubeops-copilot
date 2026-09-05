from flask import Flask
from flask_cors import CORS
from pod_analyzer.pod_analyzer import router

app = Flask(__name__)
CORS(app)

app.register_blueprint(router)

@app.route("/")
def home():
    return {"message": "KubeOps Backend Running"}

if __name__ == "__main__":
    app.run(debug=True, port=5000)