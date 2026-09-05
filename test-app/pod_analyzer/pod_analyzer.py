import json
import os
import subprocess

from dotenv import load_dotenv
from flask import Blueprint, jsonify
from groq import Groq


# ===============================
# Load Environment Variables
# ===============================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

load_dotenv(os.path.join(BASE_DIR, ".env"))


# ===============================
# Flask Router
# ===============================

router = Blueprint("pod_analyzer", __name__)


# ===============================
# Groq Client
# ===============================

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


# ===============================
# Run kubectl
# ===============================

def run_kubectl(command):

    result = subprocess.run(
        command,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return None, result.stderr

    return result.stdout, None


# ==================================================
# GET ALL PODS
# ==================================================

def get_all_pods():

    output, error = run_kubectl([
        "kubectl",
        "get",
        "pods",
        "-o",
        "json"
    ])

    if error:
        return None, error

    data = json.loads(output)

    pods = []

    for item in data["items"]:

        status = item["status"]["phase"]

        container_status = item.get(
            "status",
            {}
        ).get(
            "containerStatuses",
            []
        )

        if container_status:

            waiting = container_status[0].get(
                "state",
                {}
            ).get(
                "waiting"
            )

            if waiting:

                status = waiting.get(
                    "reason"
                )

        pods.append({
            "name": item["metadata"]["name"],
            "namespace": item["metadata"]["namespace"],
            "status": status
        })

    return pods, None


# ==================================================
# COLLECT POD DATA
# ==================================================

def collect_pod_data(pod_name):

    # Get complete Pod information
    pod_output, error = run_kubectl([
        "kubectl",
        "get",
        "pod",
        pod_name,
        "-o",
        "json"
    ])

    if error:
        return None, error

    pod_data = json.loads(pod_output)


    # -------------------------------
    # Get Pod Events
    # -------------------------------

    events_output, events_error = run_kubectl([
        "kubectl",
        "get",
        "events",
        "--field-selector",
        f"involvedObject.name={pod_name}",
        "-o",
        "json"
    ])

    events = []

    if not events_error and events_output:

        events = json.loads(
            events_output
        )


    # -------------------------------
    # Get Pod Logs
    # -------------------------------

    logs_output, logs_error = run_kubectl([
        "kubectl",
        "logs",
        pod_name
    ])

    logs = ""

    if not logs_error and logs_output:

        logs = logs_output


    # -------------------------------
    # Return Everything
    # -------------------------------

    return {
        "pod": pod_data,
        "events": events,
        "logs": logs
    }, None


# ==================================================
# AI ROOT CAUSE ANALYSIS
# ==================================================

def analyze_pod(pod_name):

    pod_data, error = collect_pod_data(
        pod_name
    )

    if error:
        return None, error


    prompt = f"""
You are an expert Kubernetes Site Reliability Engineer.

Analyze the following Kubernetes Pod information.

Identify the actual root cause of the problem.

Return ONLY these headings:

Root Cause:
Why it happened:
Impact:
Severity:
Recommended Solution:

Pod Information:

{json.dumps(
    pod_data,
    indent=2
)}
"""


    try:

        response = client.chat.completions.create(

            model="openai/gpt-oss-20b",

            messages=[

                {
                    "role": "system",
                    "content":
                    "You are an expert Kubernetes RCA assistant."
                },

                {
                    "role": "user",
                    "content": prompt
                }

            ]
        )


        return (
            response
            .choices[0]
            .message
            .content,
            None
        )


    except Exception as e:

        return None, str(e)


# ==================================================
# OLD FLASK ROUTES
# Keep these so MiniShop does not break
# ==================================================

@router.route("/pods", methods=["GET"])
def flask_get_all_pods():

    pods, error = get_all_pods()

    if error:

        return jsonify({
            "error": error
        }), 500

    return jsonify(pods)


@router.route("/rca/<pod_name>", methods=["GET"])
def flask_get_rca(pod_name):

    result, error = analyze_pod(
        pod_name
    )

    if error:

        return jsonify({
            "error": error
        }), 404

    return jsonify({

        "pod_name": pod_name,

        "rca": result

    })