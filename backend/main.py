from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pod_analyzer.kubeops_analyzer import (
    get_all_pods,
    collect_pod_data,
    analyze_pod,
    get_auto_fix_proposal,
    apply_auto_fix
)


# ==================================================
# CREATE FASTAPI APP
# ==================================================

app = FastAPI(
    title="KubeOps Copilot",
    description="AI-Powered Kubernetes Troubleshooting Platform",
    version="1.0"
)


# ==================================================
# CORS
# ==================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================================================
# HOME
# ==================================================

@app.get("/")
def home():

    return {
        "message": "KubeOps Copilot Backend is running"
    }


# ==================================================
# HEALTH CHECK
# ==================================================

@app.get("/health")
def health():

    return {
        "status": "healthy"
    }


# ==================================================
# GET ALL PODS
# ==================================================

@app.get("/pods")
def pods():

    data, error = get_all_pods()

    if error:

        return {
            "success": False,
            "error": error
        }

    return data


# ==================================================
# GET POD DETAILS
# ==================================================

@app.get("/pod/{pod_name}")
def pod_details(pod_name):

    data, error = collect_pod_data(
        pod_name
    )

    if error:

        return {
            "success": False,
            "error": error
        }

    return data


# ==================================================
# AI ROOT CAUSE ANALYSIS
# ==================================================

@app.get("/rca/{pod_name}")
def rca(pod_name):

    result, error = analyze_pod(
        pod_name
    )

    if error:

        return {
            "success": False,
            "error": error
        }

    return {
        "success": True,
        "pod_name": pod_name,
        "rca": result
    }


# ==================================================
# AUTO-FIX PREVIEW
# ==================================================

@app.get("/auto-fix/{pod_name}")
def auto_fix_preview(pod_name):

    result, error = get_auto_fix_proposal(
        pod_name
    )

    if error:

        return {
            "success": False,
            "error": error
        }

    return {
        "success": True,
        "proposal": result
    }


# ==================================================
# APPLY AUTO-FIX
# ==================================================

@app.post("/apply-fix/{pod_name}")
def apply_fix(pod_name):

    result, error = apply_auto_fix(
        pod_name
    )

    if error:

        return {
            "success": False,
            "error": error
        }

    return {
        "success": True,
        **result
    }