from kubernetes import client, config
def get_kubernetes_client():
    config.load_kube_config()
    return client.CoreV1Api()