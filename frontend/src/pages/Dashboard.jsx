import { useEffect, useState } from "react";
import "../App.css";

function Dashboard() {
  const [pods, setPods] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedPod, setSelectedPod] = useState("");

  const [rca, setRca] = useState("");
  const [proposal, setProposal] = useState(null);

  const [proposalLoading, setProposalLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixMessage, setFixMessage] = useState("");


  // ==================================================
  // GET PODS
  // ==================================================

  const getPods = async () => {
    try {
      const res = await fetch(
        "http://127.0.0.1:8000/pods"
      );

      if (!res.ok) {
        throw new Error("Failed to fetch pods");
      }

      const data = await res.json();

      setPods(data);
    } catch (err) {
      console.error("Error fetching pods:", err);
    }
  };


  useEffect(() => {
    getPods();
  }, []);


  // ==================================================
  // SELECT POD
  // ==================================================

  const selectPod = async (podName, status) => {

    setSelectedPod(podName);
    setSelectedStatus(status);

    setRca("");
    setProposal(null);
    setFixMessage("");

    // Healthy pod
    if (status === "Running") {
      return;
    }


    // ==================================================
    // GET RCA
    // ==================================================

    try {

      const res = await fetch(
        `http://127.0.0.1:8000/rca/${podName}`
      );

      if (!res.ok) {
        throw new Error("Failed to fetch RCA");
      }

      const data = await res.json();

      setRca(
        data.rca.replaceAll("**", "")
      );

    } catch (err) {

      console.error("RCA error:", err);

      setRca(
        "Failed to fetch AI Root Cause Analysis."
      );
    }


    // ==================================================
    // GET AUTO-FIX PROPOSAL
    // ==================================================

    setProposalLoading(true);

    try {

      const res = await fetch(
        `http://127.0.0.1:8000/auto-fix/${podName}`
      );

      if (!res.ok) {
        throw new Error(
          "Failed to fetch Auto-Fix proposal"
        );
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(
          data.error || "Proposal failed"
        );
      }

      setProposal(data.proposal);

    } catch (err) {

      console.error(
        "Auto-Fix proposal error:",
        err
      );

      setProposal({
        error: err.message
      });

    } finally {

      setProposalLoading(false);
    }
  };


  // ==================================================
  // APPLY AUTO-FIX
  // ==================================================

  const applyFix = async () => {

    if (!selectedPod || !proposal) {
      return;
    }

    setFixing(true);
    setFixMessage("");

    try {

      const res = await fetch(
        `http://127.0.0.1:8000/apply-fix/${selectedPod}`,
        {
          method: "POST"
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Auto-Fix failed"
        );
      }

      setFixMessage(
        "Auto-Fix applied successfully. Kubernetes is recovering the Pod."
      );

      await getPods();

    } catch (err) {

      console.error(
        "Auto-Fix error:",
        err
      );

      setFixMessage(
        `Auto-Fix failed: ${err.message}`
      );

    } finally {

      setFixing(false);
    }
  };


  // ==================================================
  // STATISTICS
  // ==================================================

  const healthy = pods.filter(
    (pod) => pod.status === "Running"
  ).length;

  const unhealthy =
    pods.length - healthy;

  const score =
    pods.length === 0
      ? 0
      : Math.round(
          (healthy / pods.length) * 100
        );


  // ==================================================
  // RISK
  // ==================================================

  let risk = "Low";

  if (unhealthy >= 2) {
    risk = "Critical";
  } else if (unhealthy === 1) {
    risk = "High";
  }


  // ==================================================
  // UI
  // ==================================================

  return (
    <div className="dashboard">


      {/* ==================================================
          HEADER
      ================================================== */}

      <header className="dashboard-header">

        <div className="brand">

          <div className="brand-icon">
            ☸
          </div>

          <div>
            <h1>
              KubeOps Copilot
            </h1>

            <p>
              AI-Powered Kubernetes Troubleshooting Platform
            </p>
          </div>

        </div>

      </header>


      {/* ==================================================
          STATISTICS
      ================================================== */}

      <section className="stats-grid">

        <div className="stat-card">

          <span className="stat-label">
            Healthy Pods
          </span>

          <strong className="stat-value healthy">
            {healthy}
          </strong>

        </div>


        <div className="stat-card">

          <span className="stat-label">
            Unhealthy Pods
          </span>

          <strong className="stat-value unhealthy">
            {unhealthy}
          </strong>

        </div>


        <div className="stat-card">

          <span className="stat-label">
            Health Score
          </span>

          <strong className="stat-value score">
            {score}%
          </strong>

        </div>


        <div className="stat-card">

          <span className="stat-label">
            Risk Level
          </span>

          <strong
            className={`stat-value ${
              risk === "Low"
                ? "risk-low"
                : risk === "High"
                ? "risk-high"
                : "risk-critical"
            }`}
          >
            {risk}
          </strong>

        </div>

      </section>


      {/* ==================================================
          CLUSTER PODS
      ================================================== */}

      <section className="panel">

        <div className="panel-header">

          <div>

            <h2>
              Cluster Pods
            </h2>

            <p>
              Kubernetes workload health overview
            </p>

          </div>

          <span className="pod-count">
            {pods.length} Pods
          </span>

        </div>


        <div className="table-wrapper">

          <table className="pod-table">

            <thead>

              <tr>

                <th>
                  Pod Name
                </th>

                <th>
                  Namespace
                </th>

                <th>
                  Status
                </th>

              </tr>

            </thead>


            <tbody>

              {pods.map((pod) => (

                <tr
                  key={pod.name}
                  onClick={() =>
                    selectPod(
                      pod.name,
                      pod.status
                    )
                  }
                  className={
                    selectedPod === pod.name
                      ? "selected-row"
                      : ""
                  }
                >

                  <td className="pod-name">
                    {pod.name}
                  </td>

                  <td>
                    {pod.namespace}
                  </td>

                  <td>

                    <span
                      className={`status-badge ${
                        pod.status === "Running"
                          ? "status-running"
                          : "status-failed"
                      }`}
                    >

                      <span className="status-dot"></span>

                      {pod.status}

                    </span>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </section>


      {/* ==================================================
          ANALYSIS
      ================================================== */}

      <section className="analysis-section">

        <div className="analysis-title">

          <div>

            <h2>
              AI Troubleshooting
            </h2>

            <p>
              Root cause analysis and safe remediation
            </p>

          </div>

          {selectedPod && (
            <span className="selected-pod">
              {selectedPod}
            </span>
          )}

        </div>


        {/* No Pod */}
        {selectedStatus === "" && (

          <div className="empty-state">

            <div className="empty-icon">
              ☸
            </div>

            <h3>
              Select a Pod
            </h3>

            <p>
              Select a Pod from the table above
              to start AI-powered troubleshooting.
            </p>

          </div>

        )}


        {/* Healthy */}
        {selectedStatus === "Running" && (

          <div className="healthy-state">

            <div className="healthy-icon">
              ✓
            </div>

            <div>

              <h3>
                Pod is Healthy
              </h3>

              <p>
                This Pod is running normally.
                No troubleshooting or Auto-Fix is required.
              </p>

            </div>

          </div>

        )}


        {/* Unhealthy */}
        {selectedStatus !== "" &&
          selectedStatus !== "Running" && (

          <div className="troubleshooting-grid">


            {/* ==================================================
                RCA
            ================================================== */}

            <div className="rca-panel">

              <div className="section-heading">

                <span className="section-icon">
                  🤖
                </span>

                <div>

                  <h3>
                    AI Root Cause Analysis
                  </h3>

                  <p>
                    Groq-powered diagnosis
                  </p>

                </div>

              </div>


              {!rca && (

                <div className="loading-state">
                  <div className="spinner"></div>
                  <span>
                    Analyzing Pod...
                  </span>
                </div>

              )}


              {rca && (

                <div className="rca-list">

                  {rca
                    .split("\n\n")
                    .map(
                      (block, index) => {

                        const lines =
                          block.split("\n");

                        const title =
                          lines[0];

                        const body =
                          lines
                            .slice(1)
                            .join("\n");

                        return (

                          <div
                            className="rca-card"
                            key={index}
                          >

                            <h4>
                              {title}
                            </h4>

                            <p>
                              {body}
                            </p>

                          </div>

                        );
                      }
                    )}

                </div>

              )}

            </div>


            {/* ==================================================
                AUTO-FIX
            ================================================== */}

            <div className="fix-panel">

              <div className="section-heading">

                <span className="section-icon">
                  🔧
                </span>

                <div>

                  <h3>
                    Auto-Fix Recommendation
                  </h3>

                  <p>
                    Review before applying
                  </p>

                </div>

              </div>


              {proposalLoading && (

                <div className="loading-state">

                  <div className="spinner"></div>

                  <span>
                    Preparing safe fix...
                  </span>

                </div>

              )}


              {!proposalLoading &&
                proposal?.error && (

                <div className="error-state">

                  <strong>
                    Unable to prepare fix
                  </strong>

                  <p>
                    {proposal.error}
                  </p>

                </div>

              )}


              {!proposalLoading &&
                proposal &&
                !proposal.error && (

                <div className="fix-content">


                  {/* Problem */}

                  <div className="fix-block">

                    <span className="fix-label">
                      Problem Detected
                    </span>

                    <p>
                      {proposal.problem}
                    </p>

                  </div>


                  {/* Image Change */}

                  <div className="change-box">

                    <span className="fix-label">
                      Container Image
                    </span>

                    <div className="change-row">

                      <div>

                        <small>
                          Current
                        </small>

                        <code>
                          {proposal.current_image}
                        </code>

                      </div>

                      <span className="arrow">
                        →
                      </span>

                      <div>

                        <small>
                          Proposed
                        </small>

                        <code className="proposed">
                          {proposal.new_image ||
                            "Not identified"}
                        </code>

                      </div>

                    </div>

                  </div>


                  {/* Pull Policy */}

                  <div className="change-box">

                    <span className="fix-label">
                      Image Pull Policy
                    </span>

                    <div className="change-row">

                      <div>

                        <small>
                          Current
                        </small>

                        <code>
                          {proposal.current_image_pull_policy}
                        </code>

                      </div>

                      <span className="arrow">
                        →
                      </span>

                      <div>

                        <small>
                          Proposed
                        </small>

                        <code className="proposed">
                          {proposal.new_image_pull_policy ||
                            "No change"}
                        </code>

                      </div>

                    </div>

                  </div>


                  {/* Recommended Action */}

                  <div className="fix-block">

                    <span className="fix-label">
                      Recommended Action
                    </span>

                    <p>
                      {proposal.recommended_fix}
                    </p>

                  </div>


                  {/* Apply */}

                  <button
                    className="apply-fix-button"
                    onClick={applyFix}
                    disabled={
                      fixing ||
                      !proposal.new_image
                    }
                  >

                    {fixing
                      ? "Applying Fix..."
                      : "🔧 Apply Auto-Fix"}

                  </button>


                  <p className="review-note">
                    Review the proposed changes
                    before applying them to Kubernetes.
                  </p>

                </div>

              )}

            </div>

          </div>

        )}


        {/* ==================================================
            FIX MESSAGE
        ================================================== */}

        {fixMessage && (

          <div
            className={
              fixMessage.startsWith(
                "Auto-Fix applied"
              )
                ? "success-message"
                : "error-message"
            }
          >

            {fixMessage.startsWith(
              "Auto-Fix applied"
            )
              ? "✓ "
              : "✕ "}

            {fixMessage}

          </div>

        )}

      </section>

    </div>
  );
}

export default Dashboard;