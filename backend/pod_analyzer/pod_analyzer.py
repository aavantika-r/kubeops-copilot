from flask import Blueprint, jsonify
from groq import Groq
from dotenv import load_dotenv
import subprocess
import json
import os

# Load .env from backend folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

router = Blueprint("pod_analyzer", __name__)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def run_kubectl(command):
    result = subprocess.run(
        command,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return None, result.stderr

    return result.stdout, None


# -------------------------------
# Get All Pods
# -------------------------------
@router.route("/pods", methods=["GET"])
def get_all_pods():

    output, error = run_kubectl([
        "kubectl", "get", "pods", "-o", "json"
    ])

    if error:
        return jsonify({"error": error}), 500

    data = json.loads(output)
    pods = []

    for item in data["items"]:

        status = item["status"]["phase"]

        container_status = item.get("status", {}).get("containerStatuses", [])

        if container_status:
            waiting = container_status[0].get("state", {}).get("waiting")

            if waiting:
                status = waiting.get("reason")

        pods.append({
            "name": item["metadata"]["name"],
            "namespace": item["metadata"]["namespace"],
            "status": status
        })

    return jsonify(pods)


# -------------------------------
# AI Root Cause Analysis
# -------------------------------
@router.route("/rca/<pod_name>", methods=["GET"])
def get_rca(pod_name):

    pod_output, error = run_kubectl([
        "kubectl",
        "get",
        "pod",
        pod_name,
        "-o",
        "json"
    ])

    if error:
        return jsonify({"error": error}), 404

    prompt = f"""
You are an expert Kubernetes Site Reliability Engineer.

Analyze this Kubernetes Pod JSON.

Return ONLY these headings:

Root Cause:
Why it happened:
Impact:
Severity:
Recommended Solution:

Pod JSON:
{pod_output}
"""

    response = client.chat.completions.create(
       model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": "You are an expert Kubernetes RCA assistant."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return jsonify({
        "pod_name": pod_name,
        "rca": response.choices[0].message.content
    })