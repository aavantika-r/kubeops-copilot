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
        "http://localhost:5173",
        "http://127.0.0.1:5173",
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
# LIVE CLUSTER INFORMATION
# ==================================================

@app.get("/cluster-info")
def cluster_info():

    from kubernetes import client, config

    try:

        # --------------------------------------------------
        # GET CURRENT KUBERNETES CONTEXT
        # --------------------------------------------------

        contexts, active_context = (
            config.list_kube_config_contexts()
        )

        current_context = (
            active_context["name"]
            if active_context
            else "Unknown"
        )

        # --------------------------------------------------
        # LOAD KUBERNETES CONFIG
        # --------------------------------------------------

        config.load_kube_config()

        v1 = client.CoreV1Api()

        # --------------------------------------------------
        # KUBERNETES VERSION
        # --------------------------------------------------

        version_api = client.VersionApi()

        version_info = (
            version_api.get_code()
        )

        kubernetes_version = (
            version_info.git_version
        )

        # --------------------------------------------------
        # NODES
        # --------------------------------------------------

        nodes = v1.list_node().items

        ready_nodes = 0

        node_details = []

        for node in nodes:

            ready = False

            for condition in (
                node.status.conditions or []
            ):

                if (
                    condition.type == "Ready"
                    and condition.status == "True"
                ):

                    ready = True
                    break

            if ready:
                ready_nodes += 1

            node_details.append({
                "name": node.metadata.name,
                "ready": ready
            })

        # --------------------------------------------------
        # ALL PODS
        # --------------------------------------------------

        pods = (
            v1.list_pod_for_all_namespaces()
            .items
        )

        pod_stats = {
            "total": len(pods),
            "running": 0,
            "pending": 0,
            "failed": 0,
            "succeeded": 0
        }

        for pod in pods:

            phase = (
                pod.status.phase
                or "Unknown"
            )

            if phase == "Running":

                pod_stats["running"] += 1

            elif phase == "Pending":

                pod_stats["pending"] += 1

            elif phase == "Failed":

                pod_stats["failed"] += 1

            elif phase == "Succeeded":

                pod_stats["succeeded"] += 1

        # --------------------------------------------------
        # NAMESPACES
        # --------------------------------------------------

        namespaces = (
            v1.list_namespace().items
        )

        namespace_list = [
            namespace.metadata.name
            for namespace in namespaces
        ]

        # --------------------------------------------------
        # RETURN LIVE DATA
        # --------------------------------------------------

        return {

            "connected": True,

            "context": current_context,

            "kubernetes_version":
                kubernetes_version,

            "nodes": {

                "total":
                    len(nodes),

                "ready":
                    ready_nodes,

                "details":
                    node_details
            },

            "pods":
                pod_stats,

            "namespaces":
                namespace_list
        }

    except Exception as error:

        return {

            "connected": False,

            "context": None,

            "kubernetes_version": None,

            "nodes": {

                "total": 0,

                "ready": 0,

                "details": []
            },

            "pods": {

                "total": 0,

                "running": 0,

                "pending": 0,

                "failed": 0,

                "succeeded": 0
            },

            "namespaces": [],

            "error":
                str(error)
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