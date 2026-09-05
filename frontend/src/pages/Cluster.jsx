import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

function Cluster() {
  const navigate = useNavigate();

  const [clusterName, setClusterName] = useState("");
  const [apiServer, setApiServer] = useState("");
  const [namespace, setNamespace] = useState("default");

  const handleConnect = (e) => {
    e.preventDefault();

    // Backend cluster save comes next
    navigate("/dashboard");
  };

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="logo">
          <span className="icon">☸</span>
          <h1>Add Cluster</h1>
        </div>

        <p className="login-subtitle">
          Connect your Kubernetes cluster to KubeOps Copilot
        </p>

        <form onSubmit={handleConnect}>

          <input
            type="text"
            placeholder="Cluster Name"
            value={clusterName}
            onChange={(e) => setClusterName(e.target.value)}
            required
          />

          <input
            type="text"
            placeholder="API Server URL"
            value={apiServer}
            onChange={(e) => setApiServer(e.target.value)}
            required
          />

          <input
            type="text"
            placeholder="Namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            required
          />

          <button type="submit">Connect Cluster</button>

        </form>

      </div>
    </div>
  );
}

export default Cluster;