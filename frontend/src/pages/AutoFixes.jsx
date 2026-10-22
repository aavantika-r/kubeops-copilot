import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "../App.css";

function AutoFixes() {
  const navigate = useNavigate();

  // ==================================================
  // STATE
  // ==================================================

  const [pods, setPods] = useState([]);
  const [selectedPod, setSelectedPod] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [proposal, setProposal] = useState(null);

  const [loading, setLoading] = useState(true);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [fixing, setFixing] = useState(false);

  const [fixMessage, setFixMessage] = useState("");
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");

  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState(null);

  // ==================================================
  // GET USER
  // ==================================================

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUser(user);
    };

    getUser();
  }, []);

  // ==================================================
  // GET ALL PODS
  // ==================================================

  const getPods = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/pods"
      );

      if (!response.ok) {
        throw new Error(
          "Failed to fetch Kubernetes pods"
        );
      }

      const data = await response.json();

      setPods(
        Array.isArray(data)
          ? data
          : []
      );

    } catch (error) {
      console.error(
        "Pod fetch error:",
        error
      );

      setPods([]);

      setError(
        "Unable to connect to KubeOps backend."
      );

    } finally {
      setLoading(false);
    }
  };

  // ==================================================
  // INITIAL LOAD
  // ==================================================

  useEffect(() => {
    getPods();
  }, []);

  // ==================================================
  // UNHEALTHY PODS ONLY
  // ==================================================

  const unhealthyPods = useMemo(() => {
    return pods.filter(
      (pod) =>
        pod.status !== "Running" &&
        pod.status !== "Succeeded"
    );
  }, [pods]);

  // ==================================================
  // SEARCH
  // ==================================================

  const filteredPods = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase();

    if (!query) {
      return unhealthyPods;
    }

    return unhealthyPods.filter(
      (pod) =>
        pod.name
          .toLowerCase()
          .includes(query)
    );
  }, [unhealthyPods, search]);

  // ==================================================
  // SELECT POD
  // ==================================================

  const selectPod = async (
    podName,
    status
  ) => {
    setSelectedPod(podName);
    setSelectedStatus(status);

    setProposal(null);
    setFixMessage("");
    setError("");

    setProposalLoading(true);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/auto-fix/${encodeURIComponent(
          podName
        )}`
      );

      const data = await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          "Failed to prepare Auto-Fix proposal"
        );
      }

      setProposal(
        data.proposal || null
      );

    } catch (error) {
      console.error(
        "Auto-Fix proposal error:",
        error
      );

      setProposal({
        error: error.message,
      });

    } finally {
      setProposalLoading(false);
    }
  };

  // ==================================================
  // APPLY AUTO-FIX
  // ==================================================

  const applyFix = async () => {

    /*
      IMPORTANT:

      Do NOT check new_image here.

      A remediation may be:

      remove_command
      image
      rollback
      memory
      service_restart

      Therefore the frontend sends every proposal
      to the backend.
    */

    if (
      !selectedPod ||
      !proposal ||
      proposal.error
    ) {
      return;
    }

    setFixing(true);
    setFixMessage("");
    setError("");

    try {

      // ==================================================
      // APPLY KUBERNETES FIX
      // ==================================================

      const response = await fetch(
        `http://127.0.0.1:8000/apply-fix/${encodeURIComponent(
          selectedPod
        )}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
        }
      );

      const data =
        await response.json();

      console.log(
        "KubeOps Auto-Fix response:",
        data
      );

      // ==================================================
      // HANDLE BACKEND ERROR
      // ==================================================

      if (!response.ok) {

        throw new Error(
          data.detail ||
          data.error ||
          data.message ||
          "Auto-Fix failed."
        );
      }

      if (
        data.success === false
      ) {

        throw new Error(
          data.error ||
          data.message ||
          "Auto-Fix failed."
        );
      }

      // ==================================================
      // SUPPORT BOTH RESPONSE FORMATS
      // ==================================================

      const result =
        data.result ||
        data;

      const finalStatus =
        result.status ||
        "Fixed";

      const failureType =
        result.failure_type ||
        proposal.failure_type ||
        "Unknown";

      const fixType =
        result.fix_type ||
        proposal.fix_type ||
        "Unknown";

      // ==================================================
      // SAVE HISTORY
      // ==================================================

      const existingHistory =
        JSON.parse(
          localStorage.getItem(
            "kubeops_fixed_pods"
          )
        ) || [];

      const historyItem = {

        id:
          Date.now(),

        pod_name:
          selectedPod,

        status:
          finalStatus,

        failure_type:
          failureType,

        fix_type:
          fixType,

        problem:
          result.problem ||
          proposal.problem ||
          "",

        recommended_fix:
          result.recommended_fix ||
          proposal.recommended_fix ||
          "",

        old_image:
          result.old_image ||
          proposal.current_image ||
          "",

        new_image:
          result.new_image ||
          proposal.new_image ||
          "",

        old_policy:
          result.old_image_pull_policy ||
          proposal.current_image_pull_policy ||
          "",

        new_policy:
          result.new_image_pull_policy ||
          proposal.new_image_pull_policy ||
          "",

        service:
          result.service ||
          proposal.service ||
          "",

        old_memory:
          result.old_memory ||
          proposal.current_memory ||
          "",

        new_memory:
          result.new_memory ||
          proposal.new_memory ||
          "",

        current_command:
          result.current_command ||
          proposal.current_command ||
          "",

        new_command:
          result.new_command ||
          proposal.new_command ||
          "",

        replicas:
          result.replicas ??
          0,

        ready_replicas:
          result.ready_replicas ??
          0,

        available_replicas:
          result.available_replicas ??
          0,

        healthy_pods:
          result.healthy_pods ??
          0,

        time:
          new Date().toLocaleString(),
      };

      const updatedHistory = [
        historyItem,
        ...existingHistory,
      ];

      localStorage.setItem(
        "kubeops_fixed_pods",
        JSON.stringify(
          updatedHistory
        )
      );

      // ==================================================
      // SHOW RESULT
      // ==================================================

      if (
        finalStatus === "Fixed"
      ) {

        setFixMessage(
          `Auto-Fix applied successfully. ${failureType} was remediated and Kubernetes workload recovery was verified.`
        );

      } else {

        setFixMessage(
          `Auto-Fix applied. Kubernetes is completing recovery.`
        );
      }

      // ==================================================
      // CLEAR SELECTION
      // ==================================================

      setSelectedPod("");
      setSelectedStatus("");
      setProposal(null);

      // ==================================================
      // REFRESH PODS
      // ==================================================

      await getPods();

    } catch (error) {

      console.error(
        "Auto-Fix error:",
        error
      );

      setFixMessage(
        `Auto-Fix failed: ${
          error.message ||
          "Unknown error"
        }`
      );

    } finally {

      setFixing(false);
    }
  };

  // ==================================================
  // USER DETAILS
  // ==================================================

  const userName =
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  const userEmail =
    user?.email || "";

  const userInitial =
    userName
      .charAt(0)
      .toUpperCase();

  // ==================================================
  // SIDEBAR
  // ==================================================

  const Sidebar = () => {
    return (
      <aside className="sidebar">

        <div className="sidebar-brand">

          <div className="sidebar-brand-icon">
            ◇
          </div>

          <div>
            <h1>KubeOps</h1>

            <p>
              AI-Powered K8s Copilot
            </p>
          </div>

        </div>

        <nav className="sidebar-nav">

          <button
            className="nav-item"
            onClick={() =>
              navigate("/dashboard")
            }
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className="nav-item"
            onClick={() =>
              navigate("/troubleshoot")
            }
          >
            <span>⌕</span>
            Troubleshoot
          </button>

          <button
            className="nav-item active"
            onClick={() =>
              navigate("/auto-fixes")
            }
          >
            <span>ϟ</span>
            Auto-Fixes
          </button>

          <button
            className="nav-item"
            onClick={() =>
              navigate("/history")
            }
          >
            <span>◷</span>
            History
          </button>

          <button
            className="nav-item"
            onClick={() =>
              navigate("/settings")
            }
          >
            <span>⚙</span>
            Settings
          </button>

        </nav>

        <div className="sidebar-footer">

          <p className="connection-title">
            Connected to
          </p>

          <div className="connection-status">

            <span className="connection-dot" />

            <span>
              minishop cluster
            </span>

          </div>

          <div className="sidebar-version">
            v1.0.0 | KubeOps v1.0
          </div>

        </div>

      </aside>
    );
  };

  // ==================================================
  // HEADER
  // ==================================================

  const Header = () => {
    return (
      <header className="top-header">

        <div className="top-brand">

          <div className="top-brand-icon">
            ◇
          </div>

          <div>

            <h1>
              Kubernetes Auto-Fixes
            </h1>

            <p>
              Review and apply Kubernetes
              remediation
            </p>

          </div>

        </div>

        <div className="header-actions">

          <div className="header-selector">

            <span>
              Namespace
            </span>

            <strong>
              minishop
            </strong>

          </div>

          <div className="header-selector cluster-selector">

            <span>
              Cluster
            </span>

            <strong>
              <i className="green-dot" />
              Docker Desktop · 1 node
            </strong>

          </div>

          <button className="notification-button">
            ♧
            <b>
              {unhealthyPods.length}
            </b>
          </button>

          <div className="profile-wrapper">

            <button
              className="profile-button"
              onClick={() =>
                setProfileOpen(
                  !profileOpen
                )
              }
            >

              <span className="profile-avatar">
                {userInitial}
              </span>

              <span>
                {userName}
              </span>

              <span>
                ▾
              </span>

            </button>

            {profileOpen && (

              <div className="profile-menu">

                <div className="profile-menu-user">

                  <div className="profile-avatar large">
                    {userInitial}
                  </div>

                  <div>

                    <strong>
                      {userName}
                    </strong>

                    <small>
                      {userEmail}
                    </small>

                    <em>
                      Administrator
                    </em>

                  </div>

                </div>

                <button
                  onClick={() =>
                    navigate("/profile")
                  }
                >
                  <span>♙</span>
                  Profile
                </button>

                <button
                  onClick={() =>
                    navigate("/settings")
                  }
                >
                  <span>⚙</span>
                  Settings
                </button>

                <button
                  className="logout-button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate("/login");
                  }}
                >
                  <span>⇥</span>
                  Logout
                </button>

              </div>

            )}

          </div>

        </div>

      </header>
    );
  };

  // ==================================================
  // MAIN UI
  // ==================================================

  return (
    <div className="app-shell">

      <Sidebar />

      <main className="dashboard-main">

        <Header />

        <div className="dashboard">

          {/* ==================================================
              HEADER
          ================================================== */}

          <section className="panel">

            <div className="panel-header">

              <div className="panel-title">

                <div className="panel-icon">
                  🔧
                </div>

                <div>

                  <h2>
                    Auto-Fix Center
                  </h2>

                  <p>
                    Review and apply Kubernetes
                    remediation proposals
                  </p>

                </div>

              </div>

              <button
                className="refresh-button"
                onClick={getPods}
                disabled={loading}
              >
                {loading
                  ? "Refreshing..."
                  : "⟳ Refresh Cluster"}
              </button>

            </div>

          </section>

          {/* ==================================================
              SEARCH
          ================================================== */}

          <section className="panel">

            <div
              className="search-container"
              style={{
                position: "relative",
              }}
            >

              <span
                style={{
                  position: "absolute",
                  left: "18px",
                  top: "50%",
                  transform:
                    "translateY(-50%)",
                  fontSize: "18px",
                  pointerEvents: "none",
                }}
              >
                🔍
              </span>

              <input
                className="search-input"
                type="text"
                placeholder="Search unhealthy pod..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                style={{
                  paddingLeft: "48px",
                }}
              />

              {search && (

                <button
                  type="button"
                  onClick={() =>
                    setSearch("")
                  }
                  style={{
                    position:
                      "absolute",
                    right: "18px",
                    top: "50%",
                    transform:
                      "translateY(-50%)",
                    border: "none",
                    background:
                      "transparent",
                    cursor:
                      "pointer",
                    fontSize:
                      "20px",
                  }}
                >
                  ×
                </button>

              )}

            </div>

          </section>

          {/* ==================================================
              ERROR
          ================================================== */}

          {error && (

            <div className="error-message">
              ✕ {error}
            </div>

          )}

          {/* ==================================================
              LOADING
          ================================================== */}

          {loading && (

            <section className="panel">

              <div className="loading-state">

                <div className="spinner" />

                Checking Kubernetes Pods...

              </div>

            </section>

          )}

          {/* ==================================================
              UNHEALTHY PODS
          ================================================== */}

          {!loading &&
            !error &&
            unhealthyPods.length > 0 &&
            filteredPods.length > 0 && (

              <section className="panel">

                <div className="panel-header">

                  <div className="panel-title">

                    <div className="panel-icon">
                      ⚠
                    </div>

                    <div>

                      <h2>
                        Pods Requiring Attention
                      </h2>

                      <p>
                        Select a Pod to generate
                        its Auto-Fix
                      </p>

                    </div>

                  </div>

                  <span className="history-count">
                    {filteredPods.length}{" "}
                    {filteredPods.length === 1
                      ? "Pod"
                      : "Pods"}
                  </span>

                </div>

                <div className="history-list">

                  {filteredPods.map(
                    (pod) => (

                      <button
                        key={pod.name}
                        className="history-item"
                        onClick={() =>
                          selectPod(
                            pod.name,
                            pod.status
                          )
                        }
                        style={{
                          width: "100%",
                          cursor:
                            "pointer",
                          textAlign:
                            "left",
                          border:
                            selectedPod ===
                            pod.name
                              ? "2px solid #2563eb"
                              : undefined,
                          background:
                            selectedPod ===
                            pod.name
                              ? "#f8fbff"
                              : undefined,
                        }}
                      >

                        <div>

                          <strong>
                            {pod.name}
                          </strong>

                          <span>
                            Status:{" "}
                            {pod.status}
                          </span>

                        </div>

                        <span className="history-fixed">
                          Review Fix →
                        </span>

                      </button>

                    )
                  )}

                </div>

              </section>

            )}

          {/* ==================================================
              ALL HEALTHY
          ================================================== */}

          {!loading &&
            !error &&
            search.trim() === "" &&
            pods.length > 0 &&
            unhealthyPods.length === 0 && (

              <section className="panel">

                <div className="healthy-state">

                  <div className="healthy-icon">
                    ✓
                  </div>

                  <div>

                    <h3>
                      No Auto-Fixes Required
                    </h3>

                    <p>
                      All Kubernetes Pods in the
                      minishop namespace are
                      currently running normally.
                    </p>

                  </div>

                </div>

              </section>

            )}

          {/* ==================================================
              SEARCH RESULT
          ================================================== */}

          {!loading &&
            !error &&
            search.trim() !== "" &&
            unhealthyPods.length === 0 && (

              <section className="panel">

                <div className="empty-state">

                  <div className="empty-icon">
                    ✓
                  </div>

                  <h3>
                    No Unhealthy Pods
                  </h3>

                  <p>
                    All Kubernetes Pods are
                    currently running normally.
                  </p>

                </div>

              </section>

            )}

          {!loading &&
            !error &&
            search.trim() !== "" &&
            unhealthyPods.length > 0 &&
            filteredPods.length === 0 && (

              <section className="panel">

                <div className="empty-state">

                  <div className="empty-icon">
                    🔍
                  </div>

                  <h3>
                    No Pod Found
                  </h3>

                  <p>
                    No unhealthy Kubernetes Pod
                    matches "{search}".
                  </p>

                </div>

              </section>

            )}

          {/* ==================================================
              SELECTED POD
          ================================================== */}

          {selectedPod &&
            selectedStatus !== "Running" && (

              <section className="analysis-section">

                <div className="analysis-title">

                  <div>

                    <h2>
                      🔧 Auto-Fix Proposal
                    </h2>

                    <p>
                      Review the proposed
                      Kubernetes remediation
                    </p>

                  </div>

                  <span className="selected-pod">
                    {selectedPod}
                  </span>

                </div>

                <div className="troubleshooting-grid">

                  {/* ==================================================
                      PROPOSAL
                  ================================================== */}

                  <div className="fix-panel">

                    <div className="section-heading">

                      <span className="section-icon">
                        🔧
                      </span>

                      <div>

                        <h3>
                          Recommended Fix
                        </h3>

                        <p>
                          Kubernetes remediation
                        </p>

                      </div>

                    </div>

                    {proposalLoading ? (

                      <div className="loading-state">

                        <div className="spinner" />

                        Preparing Auto-Fix...

                      </div>

                    ) : proposal?.error ? (

                      <div className="error-state">

                        <strong>
                          Unable to prepare fix
                        </strong>

                        <p>
                          {proposal.error}
                        </p>

                      </div>

                    ) : proposal ? (

                      <div className="fix-content">

                        {/* FAILURE TYPE */}

                        <div className="fix-block">

                          <span className="fix-label">
                            Failure Type
                          </span>

                          <p>
                            {proposal.failure_type ||
                              proposal.fix_type ||
                              "Unknown"}
                          </p>

                        </div>

                        {/* PROBLEM */}

                        <div className="fix-block">

                          <span className="fix-label">
                            Problem Detected
                          </span>

                          <p>
                            {proposal.problem}
                          </p>

                        </div>

                        {/* IMAGE */}

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
                                {
                                  proposal.current_image ||
                                  "Not available"
                                }
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
                                  "No image change"}
                              </code>

                            </div>

                          </div>

                        </div>

                        {/* IMAGE POLICY */}

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
                                {
                                  proposal.current_image_pull_policy ||
                                  "Default"
                                }
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
                                {
                                  proposal.new_image_pull_policy ||
                                  "No change"
                                }
                              </code>

                            </div>

                          </div>

                        </div>

                        {/* COMMAND */}

                        {proposal.current_command && (

                          <div className="change-box">

                            <span className="fix-label">
                              Container Command
                            </span>

                            <div className="change-row">

                              <div>

                                <small>
                                  Current
                                </small>

                                <code>
                                  {Array.isArray(
                                    proposal.current_command
                                  )
                                    ? proposal.current_command.join(
                                        " "
                                      )
                                    : String(
                                        proposal.current_command
                                      )}
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
                                  {
                                    proposal.new_command ||
                                    "Image default command"
                                  }
                                </code>

                              </div>

                            </div>

                          </div>

                        )}

                        {/* MEMORY */}

                        {(proposal.current_memory ||
                          proposal.new_memory) && (

                          <div className="change-box">

                            <span className="fix-label">
                              Memory
                            </span>

                            <div className="change-row">

                              <div>

                                <small>
                                  Current
                                </small>

                                <code>
                                  {
                                    proposal.current_memory ||
                                    "Not configured"
                                  }
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
                                  {
                                    proposal.new_memory ||
                                    "No change"
                                  }
                                </code>

                              </div>

                            </div>

                          </div>

                        )}

                        {/* SERVICE */}

                        {proposal.service && (

                          <div className="change-box">

                            <span className="fix-label">
                              Kubernetes Service
                            </span>

                            <div className="change-row">

                              <div>

                                <small>
                                  Service
                                </small>

                                <code>
                                  {proposal.service}
                                </code>

                              </div>

                              <span className="arrow">
                                →
                              </span>

                              <div>

                                <small>
                                  Action
                                </small>

                                <code className="proposed">
                                  Restart Workload
                                </code>

                              </div>

                            </div>

                          </div>

                        )}

                        {/* RECOMMENDED ACTION */}

                        <div className="fix-block">

                          <span className="fix-label">
                            Recommended Action
                          </span>

                          <p>
                            {
                              proposal.recommended_fix
                            }
                          </p>

                        </div>

                        {/* FIX TYPE */}

                        <div className="fix-block">

                          <span className="fix-label">
                            Remediation Type
                          </span>

                          <p>
                            {
                              proposal.fix_type ||
                              "Unknown"
                            }
                          </p>

                        </div>

                        {/* APPLY */}

                        <button
                          className="apply-fix-button"
                          onClick={applyFix}
                          disabled={fixing}
                        >
                          {fixing
                            ? "Applying Fix..."
                            : "🔧 Apply Auto-Fix"}
                        </button>

                        <p className="review-note">
                          Apply the generated
                          Kubernetes remediation.
                        </p>

                      </div>

                    ) : (

                      <div className="empty-state">

                        <div className="empty-icon">
                          🔧
                        </div>

                        <h3>
                          No Proposal
                        </h3>

                        <p>
                          Select an unhealthy Pod
                          to generate its
                          remediation proposal.
                        </p>

                      </div>

                    )}

                  </div>

                  {/* ==================================================
                      EXECUTION FLOW
                  ================================================== */}

                  <div className="rca-panel">

                    <div className="section-heading">

                      <span className="section-icon">
                        ⚡
                      </span>

                      <div>

                        <h3>
                          Auto-Fix Execution
                        </h3>

                        <p>
                          KubeOps applies the
                          generated remediation
                        </p>

                      </div>

                    </div>

                    <div className="rca-list">

                      <div className="rca-card">

                        <h4>
                          1. Detect
                        </h4>

                        <p>
                          KubeOps identifies the
                          Kubernetes failure.
                        </p>

                      </div>

                      <div className="rca-card">

                        <h4>
                          2. Diagnose
                        </h4>

                        <p>
                          Pod status, events, logs
                          and configuration are
                          analyzed.
                        </p>

                      </div>

                      <div className="rca-card">

                        <h4>
                          3. Apply
                        </h4>

                        <p>
                          The selected remediation
                          is sent to Kubernetes.
                        </p>

                      </div>

                      <div className="rca-card">

                        <h4>
                          4. Verify
                        </h4>

                        <p>
                          KubeOps checks whether the
                          workload recovered.
                        </p>

                      </div>

                    </div>

                  </div>

                </div>

              </section>

            )}

          {/* ==================================================
              FIX RESULT
          ================================================== */}

          {fixMessage && (

            <div
              className={
                fixMessage.startsWith(
                  "Auto-Fix applied successfully"
                )
                  ? "success-message"
                  : "error-message"
              }
            >

              {fixMessage.startsWith(
                "Auto-Fix applied successfully"
              )
                ? "✓ "
                : "✕ "}

              {fixMessage}

            </div>

          )}

        </div>

      </main>

    </div>
  );
}

export default AutoFixes;