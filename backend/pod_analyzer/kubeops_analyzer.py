import json
import os
import subprocess
import time

from dotenv import load_dotenv
from groq import Groq


# ==================================================
# KUBERNETES NAMESPACE
# ==================================================

KUBE_NAMESPACE = "minishop"


# ==================================================
# LOAD ENVIRONMENT
# ==================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

load_dotenv(
    os.path.join(BASE_DIR, ".env")
)


# ==================================================
# GROQ
# ==================================================

client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


# ==================================================
# KUBECTL HELPER
# ==================================================

def run_kubectl(command):

    result = subprocess.run(
        command,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return None, result.stderr.strip()

    return result.stdout, None


# ==================================================
# GET ALL PODS
# ==================================================

def get_all_pods():

    output, error = run_kubectl([
        "kubectl",
        "get",
        "pods",
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:
        return None, error

    data = json.loads(output)

    pods = []

    for item in data.get("items", []):

        status = (
            item.get("status", {})
            .get("phase", "Unknown")
        )

        container_statuses = (
            item.get("status", {})
            .get("containerStatuses", [])
        )

        if container_statuses:

            container = container_statuses[0]

            waiting = (
                container
                .get("state", {})
                .get("waiting")
            )

            terminated = (
                container
                .get("state", {})
                .get("terminated")
            )

            if waiting and waiting.get("reason"):

                status = waiting["reason"]

            elif terminated and terminated.get("reason"):

                status = terminated["reason"]

            elif not container.get("ready", False):

                status = "NotReady"

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

    pod_output, error = run_kubectl([
        "kubectl",
        "get",
        "pod",
        pod_name,
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:
        return None, error

    full_pod = json.loads(pod_output)

    pod_data = {
        "name": full_pod["metadata"]["name"],
        "namespace": full_pod["metadata"]["namespace"],
        "phase": full_pod.get("status", {}).get("phase"),
        "conditions": full_pod.get(
            "status", {}
        ).get(
            "conditions",
            []
        ),
        "containerStatuses": full_pod.get(
            "status",
            {}
        ).get(
            "containerStatuses",
            []
        ),
        "containers": full_pod.get(
            "spec",
            {}
        ).get(
            "containers",
            []
        ),
        "labels": full_pod.get(
            "metadata",
            {}
        ).get(
            "labels",
            {}
        )
    }

    # ==================================================
    # EVENTS
    # ==================================================

    events_output, events_error = run_kubectl([
        "kubectl",
        "get",
        "events",
        "-n",
        KUBE_NAMESPACE,
        "--field-selector",
        f"involvedObject.name={pod_name}",
        "-o",
        "json"
    ])

    events = []

    if not events_error and events_output:

        items = json.loads(
            events_output
        ).get(
            "items",
            []
        )

        for event in items[-20:]:

            events.append({
                "reason": event.get("reason"),
                "type": event.get("type"),
                "message": event.get("message")
            })

    # ==================================================
    # LOGS
    # ==================================================

    logs_output, logs_error = run_kubectl([
        "kubectl",
        "logs",
        pod_name,
        "-n",
        KUBE_NAMESPACE,
        "--tail=50"
    ])

    logs = ""

    if not logs_error and logs_output:
        logs = logs_output

    # ==================================================
    # PREVIOUS LOGS
    # ==================================================

    previous_output, previous_error = run_kubectl([
        "kubectl",
        "logs",
        pod_name,
        "-n",
        KUBE_NAMESPACE,
        "--previous",
        "--tail=50"
    ])

    previous_logs = ""

    if not previous_error and previous_output:
        previous_logs = previous_output

    return {
        "pod": pod_data,
        "events": events,
        "logs": logs,
        "previous_logs": previous_logs
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

Analyze the Kubernetes Pod information below.

Identify the ACTUAL root cause from Kubernetes
status, container state, events, command, probes,
resources and logs.

Do not invent information.

Return ONLY:

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

    except Exception as error:

        return None, str(error)


# ==================================================
# FIND DEPLOYMENT FROM POD
# ==================================================

def get_deployment_name(pod_name):

    pod_output, error = run_kubectl([
        "kubectl",
        "get",
        "pod",
        pod_name,
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:
        return None, error

    pod_data = json.loads(
        pod_output
    )

    owners = (
        pod_data
        .get("metadata", {})
        .get("ownerReferences", [])
    )

    replica_set_name = None

    for owner in owners:

        if owner.get("kind") == "ReplicaSet":

            replica_set_name = owner.get(
                "name"
            )

            break

    if not replica_set_name:

        return None, (
            "Could not find ReplicaSet owner."
        )

    rs_output, error = run_kubectl([
        "kubectl",
        "get",
        "replicaset",
        replica_set_name,
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:
        return None, error

    rs_data = json.loads(
        rs_output
    )

    deployment_owners = (
        rs_data
        .get("metadata", {})
        .get("ownerReferences", [])
    )

    for owner in deployment_owners:

        if owner.get("kind") == "Deployment":

            return owner.get("name"), None

    return None, (
        "Could not find Deployment owner."
    )


# ==================================================
# GET DEPLOYMENT
# ==================================================

def get_deployment(deployment_name):

    output, error = run_kubectl([
        "kubectl",
        "get",
        "deployment",
        deployment_name,
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:
        return None, error

    return json.loads(output), None


# ==================================================
# GET CURRENT CONTAINER
# ==================================================

def get_container(deployment_data):

    containers = (
        deployment_data
        .get("spec", {})
        .get("template", {})
        .get("spec", {})
        .get("containers", [])
    )

    if not containers:
        return None

    return containers[0]


# ==================================================
# DETECT FAILURE
# ==================================================

def detect_failure_type(pod_data):

    pod = pod_data["pod"]

    phase = pod.get(
        "phase",
        ""
    )

    statuses = pod.get(
        "containerStatuses",
        []
    )

    events = pod_data.get(
        "events",
        []
    )

    # ==================================================
    # CONTAINER STATES
    # ==================================================

    for status in statuses:

        waiting = (
            status
            .get("state", {})
            .get("waiting")
        )

        terminated = (
            status
            .get("state", {})
            .get("terminated")
        )

        last_state = (
            status
            .get("lastState", {})
            .get("terminated")
        )

        # Active waiting state.
        if waiting:

            reason = waiting.get(
                "reason",
                ""
            )

            if reason == "CrashLoopBackOff":
                return "CrashLoopBackOff"

            if reason == "ImagePullBackOff":
                return "ImagePullBackOff"

            if reason == "ErrImagePull":
                return "ImagePullBackOff"

            if reason == "CreateContainerConfigError":
                return "ConfigurationError"

        # Active terminated state.
        if terminated:

            reason = terminated.get(
                "reason",
                ""
            )

            exit_code = terminated.get(
                "exitCode"
            )

            if reason == "OOMKilled":
                return "OOMKilled"

            # A Deployment-managed application container that is
            # terminated is not healthy, even when exitCode == 0.
            # A successful command that exits immediately is still a
            # workload failure for a long-running service.
            if (
                phase != "Succeeded"
                and (
                    reason
                    or exit_code is not None
                )
            ):
                return "CrashLoopBackOff"

        # Previous terminated state.
        if last_state:

            reason = last_state.get(
                "reason",
                ""
            )

            if reason == "OOMKilled":
                return "OOMKilled"

            if reason in [
                "Error",
                "ContainerCannotRun"
            ]:
                return "CrashLoopBackOff"

    # ==================================================
    # PENDING
    # ==================================================

    if phase == "Pending":

        for event in events:

            reason = event.get(
                "reason",
                ""
            )

            message = (
                event.get(
                    "message",
                    ""
                )
                .lower()
            )

            if reason == "FailedScheduling":
                return "Pending"

            if "insufficient" in message:
                return "Pending"

            if "didn't match" in message:
                return "Pending"

            if "taint" in message:
                return "Pending"

        return "Pending"

    # ==================================================
    # READINESS
    # ==================================================

    for condition in pod.get(
        "conditions",
        []
    ):

        if condition.get("type") == "Ready":

            if condition.get("status") != "True":

                # Only classify as readiness failure when the
                # containers themselves are not terminated/crashing.
                has_terminated_container = any(
                    (
                        status
                        .get("state", {})
                        .get("terminated")
                    )
                    for status in statuses
                )

                if not has_terminated_container:
                    return "ReadinessProbeFailure"

    # ==================================================
    # EVENTS
    # ==================================================

    for event in events:

        reason = event.get(
            "reason",
            ""
        )

        message = (
            event.get(
                "message",
                ""
            )
            .lower()
        )

        if reason == "Unhealthy":

            if (
                "readiness" in message
                or "probe" in message
            ):
                return "ReadinessProbeFailure"

    # ==================================================
    # SERVICE
    # ==================================================

    return "ServiceUnavailable"


# ==================================================
# FIND WORKING IMAGE
# ==================================================

def find_working_image(
    deployment_data,
    current_image
):

    selector = (
        deployment_data
        .get("spec", {})
        .get("selector", {})
        .get("matchLabels", {})
    )

    if not selector:
        return ""

    label_selector = ",".join(
        f"{key}={value}"
        for key, value in selector.items()
    )

    output, error = run_kubectl([
        "kubectl",
        "get",
        "pods",
        "-n",
        KUBE_NAMESPACE,
        "-l",
        label_selector,
        "-o",
        "json"
    ])

    if error:
        return ""

    data = json.loads(output)

    for pod in data.get("items", []):

        if (
            pod
            .get("status", {})
            .get("phase")
            != "Running"
        ):
            continue

        statuses = (
            pod
            .get("status", {})
            .get("containerStatuses", [])
        )

        if not statuses:
            continue

        if not all(
            status.get("ready") is True
            for status in statuses
        ):
            continue

        containers = (
            pod
            .get("spec", {})
            .get("containers", [])
        )

        for container in containers:

            image = container.get(
                "image",
                ""
            )

            if (
                image
                and image != current_image
            ):
                return image

    return ""


# ==================================================
# MEMORY HELPERS
# ==================================================

def memory_to_mi(value):

    if not value:
        return 128

    value = str(value).strip()

    try:

        if value.endswith("Gi"):
            return int(
                float(value[:-2]) * 1024
            )

        if value.endswith("Mi"):
            return int(
                float(value[:-2])
            )

        if value.endswith("Ki"):
            return max(
                1,
                int(
                    float(value[:-2]) / 1024
                )
            )

        if value.endswith("M"):
            return int(
                float(value[:-1])
            )

        if value.endswith("G"):
            return int(
                float(value[:-1]) * 1024
            )

        return max(
            128,
            int(
                int(value) /
                (1024 * 1024)
            )
        )

    except Exception:

        return 128


def next_memory(value):

    current = memory_to_mi(value)

    if current < 256:
        new_value = 512
    elif current < 512:
        new_value = 1024
    elif current < 1024:
        new_value = 2048
    else:
        new_value = current * 2

    return f"{new_value}Mi"


# ==================================================
# GET SERVICE FOR DEPLOYMENT
# ==================================================

def get_service_for_deployment(
    deployment_name
):

    deployment_data, error = get_deployment(
        deployment_name
    )

    if error:
        return None, error

    labels = (
        deployment_data
        .get("spec", {})
        .get("template", {})
        .get("metadata", {})
        .get("labels", {})
    )

    if not labels:
        return None, None

    services_output, error = run_kubectl([
        "kubectl",
        "get",
        "services",
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:
        return None, error

    services = json.loads(
        services_output
    ).get(
        "items",
        []
    )

    for service in services:

        selector = (
            service
            .get("spec", {})
            .get("selector", {})
        )

        if not selector:
            continue

        matches = True

        for key, value in selector.items():

            if labels.get(key) != value:
                matches = False
                break

        if matches:
            return service, None

    return None, None


# ==================================================
# GET AUTO-FIX PROPOSAL
# ==================================================

def get_auto_fix_proposal(pod_name):

    pod_data, error = collect_pod_data(
        pod_name
    )

    if error:
        return None, error

    deployment_name, error = get_deployment_name(
        pod_name
    )

    if error:
        return None, error

    deployment_data, error = get_deployment(
        deployment_name
    )

    if error:
        return None, error

    container = get_container(
        deployment_data
    )

    if not container:
        return None, "No container found."

    failure_type = detect_failure_type(
        pod_data
    )

    current_image = container.get(
        "image",
        ""
    )

    current_policy = container.get(
        "imagePullPolicy",
        "default"
    )

    current_command = container.get(
        "command",
        []
    )

    resources = container.get(
        "resources",
        {}
    )

    limits = resources.get(
        "limits",
        {}
    )

    current_memory = limits.get(
        "memory",
        ""
    )

    # ==================================================
    # CRASHLOOP
    # ==================================================

    if failure_type == "CrashLoopBackOff":

        command_text = " ".join(
            str(value)
            for value in current_command
        )

        # A Deployment service normally needs a long-running
        # process. If an explicit command exists and it is clearly
        # an artificial/test command or an immediate-exit command,
        # removing the override lets the image use its normal
        # startup command.
        command_looks_like_test_or_exit = (
            bool(current_command)
            and (
                "python -c" in command_text.lower()
                or "python -m" in command_text.lower()
                or "exit " in command_text.lower()
                or "exit(" in command_text.lower()
                or "sleep " in command_text.lower()
                or "echo " in command_text.lower()
            )
        )

        if command_looks_like_test_or_exit:

            return {
                "pod_name": pod_name,
                "deployment": deployment_name,
                "failure_type": failure_type,
                "fix_type": "remove_command",
                "problem": (
                    "The container is repeatedly crashing because "
                    "an explicit command overrides the image's normal "
                    "startup command."
                ),
                "recommended_fix": (
                    "Remove the failing command override so the "
                    "image uses its original startup command."
                ),
                "current_image": current_image,
                "new_image": "",
                "current_image_pull_policy": current_policy,
                "new_image_pull_policy": "",
                "current_command": current_command,
                "new_command": "Image default command",
                "current_memory": current_memory,
                "new_memory": ""
            }, None

        working_image = find_working_image(
            deployment_data,
            current_image
        )

        if working_image:

            return {
                "pod_name": pod_name,
                "deployment": deployment_name,
                "failure_type": failure_type,
                "fix_type": "image",
                "problem": (
                    "The container is repeatedly crashing."
                ),
                "recommended_fix": (
                    "Replace the unhealthy image with "
                    "a known working image."
                ),
                "current_image": current_image,
                "new_image": working_image,
                "current_image_pull_policy": current_policy,
                "new_image_pull_policy": (
                    "IfNotPresent"
                    if current_policy == "Never"
                    else ""
                )
            }, None

        return {
            "pod_name": pod_name,
            "deployment": deployment_name,
            "failure_type": failure_type,
            "fix_type": "restart",
            "problem": "The container is repeatedly crashing.",
            "recommended_fix": (
                "Restart the Deployment and verify "
                "the replacement Pod."
            ),
            "current_image": current_image,
            "new_image": "",
            "current_image_pull_policy": current_policy,
            "new_image_pull_policy": ""
        }, None

    # ==================================================
    # IMAGE PULL
    # ==================================================

    if failure_type == "ImagePullBackOff":

        working_image = find_working_image(
            deployment_data,
            current_image
        )

        return {
            "pod_name": pod_name,
            "deployment": deployment_name,
            "failure_type": failure_type,
            "fix_type": "image",
            "problem": (
                "Kubernetes cannot pull the configured image."
            ),
            "recommended_fix": (
                "Replace the image with a known working image."
            ),
            "current_image": current_image,
            "new_image": working_image,
            "current_image_pull_policy": (
                "IfNotPresent"
                if working_image
                else current_policy
            ),
            "new_image_pull_policy": (
                "IfNotPresent"
                if working_image
                else ""
            )
        }, None

    # ==================================================
    # OOM
    # ==================================================

    if failure_type == "OOMKilled":

        new_memory = next_memory(
            current_memory
        )

        return {
            "pod_name": pod_name,
            "deployment": deployment_name,
            "failure_type": failure_type,
            "fix_type": "memory",
            "problem": (
                "The container was terminated with OOMKilled."
            ),
            "recommended_fix": (
                f"Increase memory limit to {new_memory}."
            ),
            "current_image": current_image,
            "new_image": "",
            "current_image_pull_policy": current_policy,
            "new_image_pull_policy": "",
            "current_memory": current_memory,
            "new_memory": new_memory
        }, None

    # ==================================================
    # READINESS
    # ==================================================

    if failure_type == "ReadinessProbeFailure":

        return {
            "pod_name": pod_name,
            "deployment": deployment_name,
            "failure_type": failure_type,
            "fix_type": "readiness_probe",
            "problem": (
                "The Pod is running but is not Ready "
                "because its readiness check is failing."
            ),
            "recommended_fix": (
                "Remove the failing readiness probe."
            ),
            "current_image": current_image,
            "new_image": "",
            "current_image_pull_policy": current_policy,
            "new_image_pull_policy": "",
            "current_probe": container.get(
                "readinessProbe"
            ),
            "new_probe": "Removed"
        }, None

    # ==================================================
    # PENDING
    # ==================================================

    if failure_type == "Pending":

        return {
            "pod_name": pod_name,
            "deployment": deployment_name,
            "failure_type": failure_type,
            "fix_type": "scheduling",
            "problem": (
                "The Pod cannot be scheduled."
            ),
            "recommended_fix": (
                "Remove restrictive scheduling rules."
            ),
            "current_image": current_image,
            "new_image": "",
            "current_image_pull_policy": current_policy,
            "new_image_pull_policy": ""
        }, None

    # ==================================================
    # SERVICE
    # ==================================================

    service, service_error = (
        get_service_for_deployment(
            deployment_name
        )
    )

    service_name = ""

    if service:

        service_name = (
            service
            .get("metadata", {})
            .get("name", "")
        )

    return {
        "pod_name": pod_name,
        "deployment": deployment_name,
        "failure_type": "ServiceUnavailable",
        "fix_type": "service_restart",
        "problem": (
            f"Service '{service_name or deployment_name}' "
            "does not currently have healthy endpoints."
        ),
        "recommended_fix": (
            "Restart the workload and verify endpoints."
        ),
        "current_image": current_image,
        "new_image": "",
        "current_image_pull_policy": current_policy,
        "new_image_pull_policy": "",
        "service": service_name
    }, None


# ==================================================
# PATCH REMOVE COMMAND
# ==================================================

def remove_command(
    deployment_name,
    container_name
):

    patch = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": container_name,
                            "command": None,
                            "args": None
                        }
                    ]
                }
            }
        }
    }

    result = subprocess.run(
        [
            "kubectl",
            "patch",
            "deployment",
            deployment_name,
            "-n",
            KUBE_NAMESPACE,
            "--type=strategic",
            "-p",
            json.dumps(patch)
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# PATCH MEMORY
# ==================================================

def update_memory(
    deployment_name,
    container_name,
    new_memory
):

    patch = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": container_name,
                            "resources": {
                                "limits": {
                                    "memory": new_memory
                                }
                            }
                        }
                    ]
                }
            }
        }
    }

    result = subprocess.run(
        [
            "kubectl",
            "patch",
            "deployment",
            deployment_name,
            "-n",
            KUBE_NAMESPACE,
            "--type=strategic",
            "-p",
            json.dumps(patch)
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# REMOVE READINESS PROBE
# ==================================================

def remove_readiness_probe(
    deployment_name,
    container_name
):

    patch = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": container_name,
                            "readinessProbe": None
                        }
                    ]
                }
            }
        }
    }

    result = subprocess.run(
        [
            "kubectl",
            "patch",
            "deployment",
            deployment_name,
            "-n",
            KUBE_NAMESPACE,
            "--type=strategic",
            "-p",
            json.dumps(patch)
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# REMOVE SCHEDULING RESTRICTIONS
# ==================================================

def remove_scheduling_restrictions(
    deployment_name
):

    patch = {
        "spec": {
            "template": {
                "spec": {
                    "nodeSelector": None,
                    "affinity": None,
                    "tolerations": []
                }
            }
        }
    }

    result = subprocess.run(
        [
            "kubectl",
            "patch",
            "deployment",
            deployment_name,
            "-n",
            KUBE_NAMESPACE,
            "--type=strategic",
            "-p",
            json.dumps(patch)
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# RESTART DEPLOYMENT
# ==================================================

def restart_deployment(
    deployment_name
):

    result = subprocess.run(
        [
            "kubectl",
            "rollout",
            "restart",
            f"deployment/{deployment_name}",
            "-n",
            KUBE_NAMESPACE
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# UPDATE IMAGE
# ==================================================

def update_image(
    deployment_name,
    container_name,
    new_image
):

    result = subprocess.run(
        [
            "kubectl",
            "set",
            "image",
            f"deployment/{deployment_name}",
            f"{container_name}={new_image}",
            "-n",
            KUBE_NAMESPACE
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# UPDATE IMAGE PULL POLICY
# ==================================================

def update_image_policy(
    deployment_name,
    container_name,
    policy
):

    patch = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": container_name,
                            "imagePullPolicy": policy
                        }
                    ]
                }
            }
        }
    }

    result = subprocess.run(
        [
            "kubectl",
            "patch",
            "deployment",
            deployment_name,
            "-n",
            KUBE_NAMESPACE,
            "--type=strategic",
            "-p",
            json.dumps(patch)
        ],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return False, result.stderr.strip()

    return True, None


# ==================================================
# GET CURRENT REVISION PODS
# ==================================================

def get_current_revision_pods(
    deployment_name,
    deployment_data
):
    """
    Return ONLY Pods belonging to the newest ReplicaSet owned by
    this Deployment.
    """

    deployment_selector = (
        deployment_data
        .get("spec", {})
        .get("selector", {})
        .get("matchLabels", {})
    )

    if not deployment_selector:
        return [], "Deployment selector not found."

    deployment_label_selector = ",".join(
        f"{key}={value}"
        for key, value in deployment_selector.items()
    )

    rs_output, rs_error = run_kubectl([
        "kubectl",
        "get",
        "replicasets",
        "-n",
        KUBE_NAMESPACE,
        "-l",
        deployment_label_selector,
        "-o",
        "json"
    ])

    if rs_error:
        return [], rs_error

    rs_data = json.loads(rs_output)
    deployment_rs = []

    for rs in rs_data.get("items", []):

        owners = (
            rs
            .get("metadata", {})
            .get("ownerReferences", [])
        )

        owned_by_deployment = any(
            owner.get("kind") == "Deployment"
            and owner.get("name") == deployment_name
            and owner.get("controller") is True
            for owner in owners
        )

        if not owned_by_deployment:
            continue

        annotations = (
            rs
            .get("metadata", {})
            .get("annotations", {})
        )

        revision_raw = annotations.get(
            "deployment.kubernetes.io/revision",
            "0"
        )

        try:
            revision = int(revision_raw)
        except (TypeError, ValueError):
            revision = 0

        deployment_rs.append(
            (revision, rs)
        )

    if not deployment_rs:
        return [], (
            f"No ReplicaSet owned by Deployment "
            f"'{deployment_name}' was found."
        )

    deployment_rs.sort(
        key=lambda item: item[0],
        reverse=True
    )

    current_revision, current_rs = deployment_rs[0]

    current_rs_name = (
        current_rs
        .get("metadata", {})
        .get("name")
    )

    current_rs_selector = (
        current_rs
        .get("spec", {})
        .get("selector", {})
        .get("matchLabels", {})
    )

    if current_rs_selector:
        pod_selector = current_rs_selector
    else:
        pod_template_hash = (
            current_rs
            .get("metadata", {})
            .get("labels", {})
            .get("pod-template-hash")
        )

        if not pod_template_hash:
            return [], (
                f"Current ReplicaSet '{current_rs_name}' "
                "does not contain pod-template-hash."
            )

        pod_selector = {
            **deployment_selector,
            "pod-template-hash": pod_template_hash
        }

    label_selector = ",".join(
        f"{key}={value}"
        for key, value in pod_selector.items()
    )

    output, error = run_kubectl([
        "kubectl",
        "get",
        "pods",
        "-n",
        KUBE_NAMESPACE,
        "-l",
        label_selector,
        "-o",
        "json"
    ])

    if error:
        return [], error

    data = json.loads(output)
    current_pods = []

    for pod in data.get("items", []):

        metadata = pod.get(
            "metadata",
            {}
        )

        if metadata.get("deletionTimestamp"):
            continue

        owners = metadata.get(
            "ownerReferences",
            []
        )

        rs_owner = None

        for owner in owners:
            if owner.get("kind") == "ReplicaSet":
                rs_owner = owner.get("name")
                break

        if rs_owner != current_rs_name:
            continue

        current_pods.append(pod)

    return current_pods, None


# ==================================================
# CHECK POD HEALTH
# ==================================================

def inspect_pod_health(pod):

    metadata = pod.get(
        "metadata",
        {}
    )

    status = pod.get(
        "status",
        {}
    )

    pod_name = metadata.get(
        "name",
        "unknown"
    )

    phase = status.get(
        "phase",
        "Unknown"
    )

    container_statuses = status.get(
        "containerStatuses",
        []
    )

    reasons = []

    # --------------------------------------------------
    # PHASE
    # --------------------------------------------------

    if phase != "Running":

        reasons.append(
            f"Pod phase is {phase}"
        )

    # --------------------------------------------------
    # CONTAINERS
    # --------------------------------------------------

    if not container_statuses:

        reasons.append(
            "No container status available"
        )

    for container in container_statuses:

        if container.get("ready") is not True:

            reasons.append(
                f"Container {container.get('name')} is not Ready"
            )

        state = container.get(
            "state",
            {}
        )

        running = state.get(
            "running"
        )

        waiting = state.get(
            "waiting"
        )

        terminated = state.get(
            "terminated"
        )

        # --------------------------------------------------
        # ACTIVE WAITING ERROR
        # --------------------------------------------------

        if waiting:

            reason = waiting.get(
                "reason"
            )

            if reason:

                reasons.append(
                    f"Container waiting: {reason}"
                )

        # --------------------------------------------------
        # ACTIVE TERMINATED ERROR
        # --------------------------------------------------

        if terminated:

            reason = terminated.get(
                "reason"
            )

            exit_code = terminated.get(
                "exitCode"
            )

            reasons.append(
                f"Container terminated: "
                f"{reason or 'Unknown'} "
                f"(exitCode={exit_code})"
            )

        # --------------------------------------------------
        # MUST CURRENTLY BE RUNNING
        # --------------------------------------------------

        if not running:

            reasons.append(
                f"Container {container.get('name')} "
                "is not currently running"
            )

    healthy = len(reasons) == 0

    return {
        "name": pod_name,
        "phase": phase,
        "healthy": healthy,
        "reasons": reasons
    }


# ==================================================
# VERIFY DEPLOYMENT
# ==================================================

def verify_deployment(
    deployment_name,
    timeout=45
):
    """
    Verify real recovery against the newest ReplicaSet.

    A workload is successful only when the desired number of Pods
    from the CURRENT revision are Running + Ready and that state is
    stable for 3 consecutive checks.
    """

    deadline = time.time() + timeout

    required_healthy_checks = 3
    consecutive_healthy_checks = 0

    last_result = {
        "replicas": 0,
        "ready_replicas": 0,
        "available_replicas": 0,
        "healthy_pods": 0,
        "unhealthy_pods": []
    }

    while time.time() < deadline:

        deployment_data, deployment_error = (
            get_deployment(
                deployment_name
            )
        )

        if deployment_error:
            consecutive_healthy_checks = 0
            time.sleep(2)
            continue

        status = deployment_data.get(
            "status",
            {}
        )

        spec = deployment_data.get(
            "spec",
            {}
        )

        desired_replicas = spec.get(
            "replicas",
            0
        )

        replicas = status.get(
            "replicas",
            0
        )

        ready = status.get(
            "readyReplicas",
            0
        )

        available = status.get(
            "availableReplicas",
            0
        )

        current_pods, pods_error = (
            get_current_revision_pods(
                deployment_name,
                deployment_data
            )
        )

        if pods_error:
            consecutive_healthy_checks = 0
            time.sleep(2)
            continue

        healthy_pods = 0
        unhealthy_pods = []

        for pod in current_pods:

            health = inspect_pod_health(
                pod
            )

            if health["healthy"]:

                healthy_pods += 1

            else:

                unhealthy_pods.append({
                    "name": health["name"],
                    "phase": health["phase"],
                    "reasons": health["reasons"]
                })

        last_result = {
            "replicas": replicas,
            "ready_replicas": ready,
            "available_replicas": available,
            "healthy_pods": healthy_pods,
            "unhealthy_pods": unhealthy_pods
        }

        deployment_healthy = (
            desired_replicas > 0
            and replicas == desired_replicas
            and ready == desired_replicas
            and available == desired_replicas
        )

        current_revision_healthy = (
            len(current_pods) == desired_replicas
            and healthy_pods == desired_replicas
            and len(unhealthy_pods) == 0
        )

        if (
            deployment_healthy
            and current_revision_healthy
        ):

            consecutive_healthy_checks += 1

            if consecutive_healthy_checks >= required_healthy_checks:

                return {
                    "success": True,
                    **last_result
                }

        else:

            consecutive_healthy_checks = 0

        time.sleep(2)

    return {
        "success": False,
        **last_result
    }


# ==================================================
# GET DEPLOYMENT PODS
# ==================================================

def get_deployment_pods(
    deployment_name
):

    deployment_data, error = get_deployment(
        deployment_name
    )

    if error:
        return [], error

    selector = (
        deployment_data
        .get("spec", {})
        .get("selector", {})
        .get("matchLabels", {})
    )

    if not selector:
        return [], None

    label_selector = ",".join(
        f"{key}={value}"
        for key, value in selector.items()
    )

    output, error = run_kubectl([
        "kubectl",
        "get",
        "pods",
        "-n",
        KUBE_NAMESPACE,
        "-l",
        label_selector,
        "-o",
        "json"
    ])

    if error:
        return [], error

    data = json.loads(output)

    return data.get(
        "items",
        []
    ), None


# ==================================================
# VERIFY SERVICE ENDPOINTS
# ==================================================

def verify_service(
    service_name
):

    if not service_name:

        return {
            "healthy": True,
            "endpoints": 0
        }

    output, error = run_kubectl([
        "kubectl",
        "get",
        "endpoints",
        service_name,
        "-n",
        KUBE_NAMESPACE,
        "-o",
        "json"
    ])

    if error:

        return {
            "healthy": False,
            "endpoints": 0,
            "error": error
        }

    data = json.loads(output)

    subsets = data.get(
        "subsets",
        []
    )

    endpoint_count = 0

    for subset in subsets:

        endpoint_count += len(
            subset.get(
                "addresses",
                []
            )
        )

    return {
        "healthy": endpoint_count > 0,
        "endpoints": endpoint_count
    }


# ==================================================
# APPLY AUTO-FIX
# ==================================================

def apply_auto_fix(pod_name):

    # ==================================================
    # GET PROPOSAL
    # ==================================================

    proposal, error = get_auto_fix_proposal(
        pod_name
    )

    if error:
        return None, error

    deployment_name = proposal.get(
        "deployment"
    )

    if not deployment_name:

        return None, (
            "Deployment could not be identified."
        )

    # ==================================================
    # GET DEPLOYMENT
    # ==================================================

    deployment_data, error = get_deployment(
        deployment_name
    )

    if error:
        return None, error

    container = get_container(
        deployment_data
    )

    if not container:

        return None, (
            "No container found in Deployment."
        )

    container_name = container.get(
        "name"
    )

    if not container_name:

        return None, (
            "Container name not found."
        )

    fix_type = proposal.get(
        "fix_type",
        ""
    )

    # ==================================================
    # APPLY REMEDIATION
    # ==================================================

    success = False
    fix_error = None

    if fix_type == "remove_command":

        success, fix_error = remove_command(
            deployment_name,
            container_name
        )

    elif fix_type == "image":

        new_image = proposal.get(
            "new_image",
            ""
        )

        if not new_image:

            return None, (
                "No working image was identified."
            )

        success, fix_error = update_image(
            deployment_name,
            container_name,
            new_image
        )

        if success:

            new_policy = proposal.get(
                "new_image_pull_policy",
                ""
            )

            if new_policy:

                success, fix_error = (
                    update_image_policy(
                        deployment_name,
                        container_name,
                        new_policy
                    )
                )

    elif fix_type == "memory":

        success, fix_error = update_memory(
            deployment_name,
            container_name,
            proposal.get(
                "new_memory"
            )
        )

    elif fix_type == "readiness_probe":

        success, fix_error = (
            remove_readiness_probe(
                deployment_name,
                container_name
            )
        )

    elif fix_type == "scheduling":

        success, fix_error = (
            remove_scheduling_restrictions(
                deployment_name
            )
        )

    elif fix_type in [
        "service_restart",
        "restart"
    ]:

        success, fix_error = restart_deployment(
            deployment_name
        )

    else:

        return None, (
            f"Unsupported remediation type: {fix_type}"
        )

    if not success:

        return None, (
            "Failed to apply Kubernetes remediation: "
            + str(fix_error)
        )

    # ==================================================
    # WAIT + VERIFY REAL RECOVERY
    # ==================================================

    verification = verify_deployment(
        deployment_name,
        timeout=45
    )

    # ==================================================
    # SERVICE
    # ==================================================

    service_name = proposal.get(
        "service",
        ""
    )

    service_status = verify_service(
        service_name
    )

    # ==================================================
    # FINAL STATUS
    # ==================================================

    recovered = verification["success"]

    if fix_type == "service_restart":

        recovered = (
            recovered
            and service_status.get(
                "healthy",
                False
            )
        )

    if recovered:

        final_status = "Fixed"

        message = (
            "Auto-Fix applied successfully. "
            "The workload is running, all current "
            "revision Pods are Ready, and Kubernetes "
            "recovery was verified."
        )

    else:

        final_status = "Fix Failed"

        message = (
            "Auto-Fix was applied, but Kubernetes "
            "recovery verification failed."
        )

    # ==================================================
    # RETURN
    # ==================================================

    return {
        "pod_name": pod_name,

        "deployment": deployment_name,

        "status": final_status,

        "message": message,

        "failure_type":
            proposal.get(
                "failure_type",
                "Unknown"
            ),

        "fix_type":
            fix_type,

        "problem":
            proposal.get(
                "problem",
                ""
            ),

        "recommended_fix":
            proposal.get(
                "recommended_fix",
                ""
            ),

        "old_image":
            proposal.get(
                "current_image",
                ""
            ),

        "new_image":
            proposal.get(
                "new_image",
                ""
            ),

        "old_image_pull_policy":
            proposal.get(
                "current_image_pull_policy",
                ""
            ),

        "new_image_pull_policy":
            proposal.get(
                "new_image_pull_policy",
                ""
            ),

        "current_command":
            proposal.get(
                "current_command",
                []
            ),

        "new_command":
            proposal.get(
                "new_command",
                ""
            ),

        "old_memory":
            proposal.get(
                "current_memory",
                ""
            ),

        "new_memory":
            proposal.get(
                "new_memory",
                ""
            ),

        "service":
            service_name,

        "replicas":
            verification.get(
                "replicas",
                0
            ),

        "ready_replicas":
            verification.get(
                "ready_replicas",
                0
            ),

        "available_replicas":
            verification.get(
                "available_replicas",
                0
            ),

        "healthy_pods":
            verification.get(
                "healthy_pods",
                0
            ),

        "unhealthy_pods":
            verification.get(
                "unhealthy_pods",
                []
            ),

        "service_endpoints":
            service_status.get(
                "endpoints",
                0
            )

    }, None