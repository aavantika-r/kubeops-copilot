from kubernetes import client
from kubernetes_client import get_kubernetes_client
# Kubernetes Core API
v1 = get_kubernetes_client()
# Kubernetes Apps API
apps_v1 = client.AppsV1Api()
# ==================================================
# 1. PODS
# ==================================================
print("\n========== PODS ==========")
pods = v1.list_pod_for_all_namespaces()
for pod in pods.items:
    print(
        "Namespace:", pod.metadata.namespace,
        "| Pod:", pod.metadata.name,
        "| Status:", pod.status.phase
    )
# ==================================================
# 2. NAMESPACES
# ==================================================
print("\n========== NAMESPACES ==========")
namespaces = v1.list_namespace()
for namespace in namespaces.items:
    print(
        "Namespace:",
        namespace.metadata.name
    )
# ==================================================
# 3. NODES
# ==================================================
print("\n========== NODES ==========")
nodes = v1.list_node()
for node in nodes.items:
    print(
        "Node:",
        node.metadata.name
    )
# ==================================================
# 4. SERVICES
# ==================================================
print("\n========== SERVICES ==========")
services = v1.list_service_for_all_namespaces()

for service in services.items:
    print(
        "Namespace:", service.metadata.namespace,
        "| Service:", service.metadata.name,
        "| Type:", service.spec.type
    )


# ==================================================
# 5. DEPLOYMENTS
# ==================================================

print("\n========== DEPLOYMENTS ==========")

deployments = apps_v1.list_deployment_for_all_namespaces()

for deployment in deployments.items:
    print(
        "Namespace:", deployment.metadata.namespace,
        "| Deployment:", deployment.metadata.name,
        "| Desired Replicas:", deployment.spec.replicas
    )


# ==================================================
# 6. REPLICASETS
# ==================================================

print("\n========== REPLICASETS ==========")

replicasets = apps_v1.list_replica_set_for_all_namespaces()

for replica in replicasets.items:
    print(
        "Namespace:", replica.metadata.namespace,
        "| ReplicaSet:", replica.metadata.name
    )


# ==================================================
# 7. CONFIGMAPS
# ==================================================

print("\n========== CONFIGMAPS ==========")

configmaps = v1.list_config_map_for_all_namespaces()

for configmap in configmaps.items:
    print(
        "Namespace:", configmap.metadata.namespace,
        "| ConfigMap:", configmap.metadata.name
    )


# ==================================================
# 8. SECRETS
# ==================================================

print("\n========== SECRETS ==========")

secrets = v1.list_secret_for_all_namespaces()

for secret in secrets.items:
    print(
        "Namespace:", secret.metadata.namespace,
        "| Secret:", secret.metadata.name
    )


# ==================================================
# 9. EVENTS
# ==================================================

print("\n========== EVENTS ==========")

events = v1.list_event_for_all_namespaces()

for event in events.items:
    print(
        "Namespace:", event.metadata.namespace,
        "| Reason:", event.reason,
        "| Message:", event.message
    )


# ==================================================
# 10. POD LOGS
# ==================================================

print("\n========== POD LOGS ==========")

for pod in pods.items:

    try:
        logs = v1.read_namespaced_pod_log(
            name=pod.metadata.name,
            namespace=pod.metadata.namespace,
            tail_lines=20
        )

        print(
            f"\n--- {pod.metadata.namespace}/{pod.metadata.name} ---"
        )

        print(logs)

    except Exception as e:
        print(
            f"Could not get logs for "
            f"{pod.metadata.namespace}/{pod.metadata.name}"
        )


# ==================================================
# 11. CONTAINER STATUS
# ==================================================

print("\n========== CONTAINER STATUS ==========")

for pod in pods.items:

    print(
        f"\n--- {pod.metadata.namespace}/{pod.metadata.name} ---"
    )

    if pod.status.container_statuses:

        for container in pod.status.container_statuses:

            print(
                "Container:",
                container.name,
                "| Ready:",
                container.ready,
                "| Restarts:",
                container.restart_count
            )

            if container.state.running:
                print("State: Running")

            elif container.state.waiting:
                print(
                    "State: Waiting",
                    "| Reason:",
                    container.state.waiting.reason
                )

            elif container.state.terminated:
                print(
                    "State: Terminated",
                    "| Reason:",
                    container.state.terminated.reason
                )

    else:
        print("No container status available")
print("\n========== ALL TESTS COMPLETED ==========")