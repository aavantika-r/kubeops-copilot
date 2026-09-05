import json
import os
import subprocess

from dotenv import load_dotenv
from groq import Groq


# ==================================================
# LOAD ENVIRONMENT VARIABLES
# ==================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

load_dotenv(
    os.path.join(BASE_DIR, ".env")
)


# ==================================================
# GROQ CLIENT
# ==================================================

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


# ==================================================
# RUN KUBECTL
# ==================================================

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
            ).get("waiting")

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

    # ------------------------------------------------
    # Get Pod information
    # ------------------------------------------------

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

    pod_data = json.loads(
        pod_output
    )


    # ------------------------------------------------
    # Get Pod events
    # ------------------------------------------------

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


    # ------------------------------------------------
    # Get Pod logs
    # ------------------------------------------------

    logs_output, logs_error = run_kubectl([
        "kubectl",
        "logs",
        pod_name
    ])

    logs = ""

    if not logs_error and logs_output:

        logs = logs_output


    # ------------------------------------------------
    # Return collected data
    # ------------------------------------------------

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
# FIND DEPLOYMENT FROM POD
# ==================================================

def get_deployment_name(pod_name):

    # ------------------------------------------------
    # Get Pod
    # ------------------------------------------------

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

    pod_data = json.loads(
        pod_output
    )


    # ------------------------------------------------
    # Find ReplicaSet
    # ------------------------------------------------

    owner_references = pod_data.get(
        "metadata",
        {}
    ).get(
        "ownerReferences",
        []
    )

    replica_set_name = None

    for owner in owner_references:

        if owner.get("kind") == "ReplicaSet":

            replica_set_name = owner.get(
                "name"
            )

            break


    if not replica_set_name:

        return None, (
            "Could not find ReplicaSet owner "
            "for this Pod."
        )


    # ------------------------------------------------
    # Get ReplicaSet
    # ------------------------------------------------

    rs_output, error = run_kubectl([
        "kubectl",
        "get",
        "replicaset",
        replica_set_name,
        "-o",
        "json"
    ])

    if error:
        return None, error

    rs_data = json.loads(
        rs_output
    )


    # ------------------------------------------------
    # Find Deployment
    # ------------------------------------------------

    deployment_references = rs_data.get(
        "metadata",
        {}
    ).get(
        "ownerReferences",
        []
    )

    deployment_name = None

    for owner in deployment_references:

        if owner.get("kind") == "Deployment":

            deployment_name = owner.get(
                "name"
            )

            break


    if not deployment_name:

        return None, (
            "Could not find Deployment owner "
            "for this ReplicaSet."
        )


    return deployment_name, None


# ==================================================
# GET AUTO-FIX PROPOSAL
# ==================================================

def get_auto_fix_proposal(pod_name):

    # ------------------------------------------------
    # Get Pod data
    # ------------------------------------------------

    pod_data, error = collect_pod_data(
        pod_name
    )

    if error:
        return None, error


    # ------------------------------------------------
    # Find Deployment
    # ------------------------------------------------

    deployment_name, error = get_deployment_name(
        pod_name
    )

    if error:
        return None, error


    # ------------------------------------------------
    # Get Deployment
    # ------------------------------------------------

    deployment_output, error = run_kubectl([
        "kubectl",
        "get",
        "deployment",
        deployment_name,
        "-o",
        "json"
    ])

    if error:
        return None, error

    deployment_data = json.loads(
        deployment_output
    )


    # ------------------------------------------------
    # Get container information
    # ------------------------------------------------

    containers = (
        deployment_data
        .get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )

    if not containers:

        return None, (
            "No containers found in Deployment."
        )


    container = containers[0]

    current_image = container.get(
        "image",
        ""
    )

    current_policy = container.get(
        "imagePullPolicy",
        "default"
    )


    # ==================================================
    # ASK GROQ FOR PROPOSAL
    # ==================================================

    prompt = f"""
You are an expert Kubernetes troubleshooting assistant.

A Kubernetes Pod is unhealthy.

Pod information:

{json.dumps(
    pod_data,
    indent=2
)}

Current container configuration:

{json.dumps(
    container,
    indent=2
)}

Determine the safest possible fix.

Return ONLY valid JSON in exactly this format:

{{
    "problem": "short description of the problem",
    "recommended_fix": "short description of the recommended fix",
    "new_image": "",
    "new_image_pull_policy": ""
}}

Rules:

1. Do NOT generate Kubernetes YAML.
2. Do NOT generate kubectl commands.
3. Do NOT change replicas.
4. Do NOT change ports.
5. Do NOT change environment variables.
6. Do NOT change volumes.
7. Do NOT change application configuration.
8. Only recommend changes directly related to the detected problem.
9. If the image is the problem, provide a replacement image ONLY if it
   can be confidently determined from the Kubernetes information.
10. If no replacement image can be confidently determined, leave
    new_image empty.
11. If imagePullPolicy should change, provide:
    IfNotPresent, Always, or Never.
"""


    try:

        response = client.chat.completions.create(

            model="openai/gpt-oss-20b",

            messages=[

                {
                    "role": "system",
                    "content":
                    "Return only valid JSON. Do not return YAML."
                },

                {
                    "role": "user",
                    "content": prompt
                }

            ]
        )


        result = (
            response
            .choices[0]
            .message
            .content
            .strip()
        )


        # ------------------------------------------------
        # Remove markdown fences if AI adds them
        # ------------------------------------------------

        if result.startswith("```"):

            lines = result.splitlines()

            if lines:
                lines = lines[1:]

            if (
                lines
                and lines[-1].strip() == "```"
            ):

                lines = lines[:-1]

            result = "\n".join(lines)


        proposal = json.loads(
            result
        )


    except Exception as e:

        return None, (
            "Failed to generate Auto-Fix proposal: "
            + str(e)
        )


    # ==================================================
    # FIND A KNOWN WORKING IMAGE
    # ==================================================

    new_image = proposal.get(
        "new_image",
        ""
    )


    # ------------------------------------------------
    # Get Deployment selector
    # ------------------------------------------------

    selector = (
        deployment_data
        .get("spec", {})
        .get("selector", {})
        .get("matchLabels", {})
    )


    working_images = []


    # ------------------------------------------------
    # Find Running Pods belonging to Deployment
    # ------------------------------------------------

    if selector:

        label_selector = ",".join(
            f"{key}={value}"
            for key, value in selector.items()
        )


        pods_output, pods_error = run_kubectl([
            "kubectl",
            "get",
            "pods",
            "-l",
            label_selector,
            "-o",
            "json"
        ])


        if not pods_error and pods_output:

            pods_data = json.loads(
                pods_output
            )


            for pod in pods_data.get(
                "items",
                []
            ):

                pod_phase = (
                    pod
                    .get("status", {})
                    .get("phase")
                )


                # Only trust Running Pods
                if pod_phase != "Running":

                    continue


                pod_containers = (
                    pod
                    .get("spec", {})
                    .get("containers", [])
                )


                for pod_container in pod_containers:

                    image = pod_container.get(
                        "image"
                    )


                    if (
                        image
                        and image != current_image
                        and image not in working_images
                    ):

                        working_images.append(
                            image
                        )


    # ==================================================
    # SELECT SAFE IMAGE
    # ==================================================

    # If AI did not provide an image,
    # use a known working image.

    if not new_image and working_images:

        new_image = working_images[0]


    # ------------------------------------------------
    # If AI provided an image, verify it is known
    # ------------------------------------------------

    if new_image:

        if working_images:

            if new_image not in working_images:

                new_image = ""

        else:

            # No known working image.
            # Do not trust an AI-invented image.
            new_image = ""


    # ==================================================
    # VALIDATE IMAGE PULL POLICY
    # ==================================================

    new_policy = proposal.get(
        "new_image_pull_policy",
        ""
    )


    allowed_policies = {
        "IfNotPresent",
        "Always",
        "Never"
    }


    if new_policy not in allowed_policies:

        new_policy = ""


    # ------------------------------------------------
    # If current policy is Never and we have a known
    # working image, use IfNotPresent.
    # ------------------------------------------------

    if (
        new_image
        and current_policy == "Never"
    ):

        new_policy = "IfNotPresent"


    # ==================================================
    # RETURN PROPOSAL
    # ==================================================

    return {

        "pod_name":
            pod_name,

        "deployment":
            deployment_name,

        "problem":
            proposal.get(
                "problem",
                "Kubernetes Pod is unhealthy."
            ),

        "recommended_fix":
            proposal.get(
                "recommended_fix",
                "No automatic fix available."
            ),

        "current_image":
            current_image,

        "new_image":
            new_image,

        "current_image_pull_policy":
            current_policy,

        "new_image_pull_policy":
            new_policy

    }, None


# ==================================================
# APPLY CONTROLLED AUTO-FIX
# ==================================================

def apply_auto_fix(pod_name):

    # ------------------------------------------------
    # Get proposal
    # ------------------------------------------------

    proposal, error = get_auto_fix_proposal(
        pod_name
    )

    if error:
        return None, error


    deployment_name = proposal[
        "deployment"
    ]

    new_image = proposal[
        "new_image"
    ]

    new_policy = proposal[
        "new_image_pull_policy"
    ]


    # ==================================================
    # SAFETY CHECK
    # ==================================================

    if not new_image:

        return None, (
            "Auto-Fix stopped: "
            "No safe known working image was identified."
        )


    # ==================================================
    # GET CURRENT DEPLOYMENT
    # ==================================================

    deployment_output, error = run_kubectl([
        "kubectl",
        "get",
        "deployment",
        deployment_name,
        "-o",
        "json"
    ])

    if error:
        return None, error


    deployment_data = json.loads(
        deployment_output
    )


    containers = (
        deployment_data
        .get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )


    if not containers:

        return None, (
            "No containers found."
        )


    container_name = containers[0].get(
        "name"
    )


    if not container_name:

        return None, (
            "Container name not found."
        )


    # ==================================================
    # CHANGE ONLY IMAGE
    # ==================================================

    image_result = subprocess.run(
        [
            "kubectl",
            "set",
            "image",
            f"deployment/{deployment_name}",
            f"{container_name}={new_image}"
        ],
        capture_output=True,
        text=True
    )


    if image_result.returncode != 0:

        return None, (
            "Failed to update image:\n"
            + image_result.stderr
        )


    # ==================================================
    # CHANGE IMAGE PULL POLICY
    # ==================================================

    if new_policy:

        patch = (
            '{"spec":{"template":{"spec":{"containers":'
            '[{"name":"' + container_name +
            '","imagePullPolicy":"' + new_policy +
            '"}]}}}}'
        )


        policy_result = subprocess.run(
            [
                "kubectl",
                "patch",
                "deployment",
                deployment_name,
                "-p",
                patch
            ],
            capture_output=True,
            text=True
        )


        if policy_result.returncode != 0:

            return None, (
                "Image was updated, but "
                "imagePullPolicy could not be updated:\n"
                + policy_result.stderr
            )


    # ==================================================
    # WAIT FOR ROLLOUT
    # ==================================================

    rollout = subprocess.run(
        [
            "kubectl",
            "rollout",
            "status",
            f"deployment/{deployment_name}",
            "--timeout=60s"
        ],
        capture_output=True,
        text=True
    )


    if rollout.returncode != 0:

        return None, (
            "Fix was applied, but rollout did not "
            "complete:\n"
            + rollout.stderr
        )


    # ==================================================
    # CHECK DEPLOYMENT STATUS
    # ==================================================

    status_output, status_error = run_kubectl([
        "kubectl",
        "get",
        "deployment",
        deployment_name,
        "-o",
        "json"
    ])


    if status_error:

        return None, status_error


    deployment_status = json.loads(
        status_output
    ).get(
        "status",
        {}
    )


    replicas = deployment_status.get(
        "replicas",
        0
    )


    ready_replicas = deployment_status.get(
        "readyReplicas",
        0
    )


    # ==================================================
    # FINAL RESULT
    # ==================================================

    if (
        replicas > 0
        and ready_replicas == replicas
    ):

        status = "Fixed"

    else:

        status = "Fix Applied - Waiting"


    return {

        "pod_name":
            pod_name,

        "deployment":
            deployment_name,

        "status":
            status,

        "message":
            "Auto-Fix applied successfully.",

        "problem":
            proposal["problem"],

        "recommended_fix":
            proposal["recommended_fix"],

        "old_image":
            proposal["current_image"],

        "new_image":
            new_image,

        "old_image_pull_policy":
            proposal[
                "current_image_pull_policy"
            ],

        "new_image_pull_policy":
            new_policy,

        "replicas":
            replicas,

        "ready_replicas":
            ready_replicas

    }, None