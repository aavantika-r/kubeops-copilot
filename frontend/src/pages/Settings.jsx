import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function Settings() {
  const navigate = useNavigate();

  const [clusterInfo, setClusterInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const [profile, setProfile] = useState({
    name: "User",
    email: "",
  });

  const [namespace, setNamespace] = useState(
    localStorage.getItem("kubeops_namespace") || "minishop"
  );

  const [refreshInterval, setRefreshInterval] = useState(
    localStorage.getItem("kubeops_refresh_interval") || "10"
  );

  const [autoFixApproval, setAutoFixApproval] = useState(
    localStorage.getItem("kubeops_auto_fix_approval") !== "false"
  );

  const [verifyRecovery, setVerifyRecovery] = useState(
    localStorage.getItem("kubeops_verify_recovery") !== "false"
  );

  const [theme, setTheme] = useState(
    localStorage.getItem("kubeops_theme") || "Light"
  );

  const [saved, setSaved] = useState(false);

  /* ================= PROFILE ================= */

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setProfile({
          name:
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "User",
          email: user.email || "",
        });
      }
    };

    loadProfile();
  }, []);

  /* ================= THEME ================= */

  useEffect(() => {
    localStorage.setItem("kubeops_theme", theme);
  }, [theme]);

  /* ================= CLUSTER INFO ================= */

  const getClusterInfo = async () => {
    try {
      setError("");

      const response = await fetch(
        "http://127.0.0.1:8000/cluster-info"
      );

      if (!response.ok) {
        throw new Error("Backend API unavailable");
      }

      const data = await response.json();

      setClusterInfo(data);
      setBackendConnected(true);
      setLastSync(new Date());
    } catch (err) {
      console.error("Cluster information error:", err);
      setBackendConnected(false);
      setError("Unable to connect to KubeOps backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getClusterInfo();
  }, []);

  /* ================= AUTO REFRESH ================= */

  useEffect(() => {
    const seconds = Number(refreshInterval);

    if (!seconds || seconds <= 0) {
      return;
    }

    const timer = setInterval(() => {
      getClusterInfo();
    }, seconds * 1000);

    return () => clearInterval(timer);
  }, [refreshInterval]);

  /* ================= LIVE DATA ================= */

  const kubernetesConnected =
    clusterInfo?.connected === true;

  const context =
    clusterInfo?.context || "Unavailable";

  const kubernetesVersion =
    clusterInfo?.kubernetes_version || "Unavailable";

  const totalNodes =
    clusterInfo?.nodes?.total || 0;

  const readyNodes =
    clusterInfo?.nodes?.ready || 0;

  const totalPods =
    clusterInfo?.pods?.total || 0;

  const runningPods =
    clusterInfo?.pods?.running || 0;

  const pendingPods =
    clusterInfo?.pods?.pending || 0;

  const failedPods =
    clusterInfo?.pods?.failed || 0;

  const namespaces =
    clusterInfo?.namespaces || [];

  /* ================= ACTIONS ================= */

  const savePreferences = () => {
    localStorage.setItem(
      "kubeops_namespace",
      namespace
    );

    localStorage.setItem(
      "kubeops_refresh_interval",
      refreshInterval
    );

    localStorage.setItem(
      "kubeops_auto_fix_approval",
      String(autoFixApproval)
    );

    localStorage.setItem(
      "kubeops_verify_recovery",
      String(verifyRecovery)
    );

    localStorage.setItem(
      "kubeops_theme",
      theme
    );

    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  const resetPreferences = () => {
    const defaultNamespace =
      namespaces.includes("minishop")
        ? "minishop"
        : namespaces[0] || "default";

    setNamespace(defaultNamespace);
    setRefreshInterval("10");
    setAutoFixApproval(true);
    setVerifyRecovery(true);
    setTheme("Light");

    localStorage.setItem(
      "kubeops_namespace",
      defaultNamespace
    );

    localStorage.setItem(
      "kubeops_refresh_interval",
      "10"
    );

    localStorage.setItem(
      "kubeops_auto_fix_approval",
      "true"
    );

    localStorage.setItem(
      "kubeops_verify_recovery",
      "true"
    );

    localStorage.setItem(
      "kubeops_theme",
      "Light"
    );
  };

  const formatLastSync = () => {
    if (!lastSync) {
      return "Waiting for synchronization...";
    }

    return lastSync.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div
      className={`settings-shell ${
        theme === "Dark" ? "dark-mode" : ""
      }`}
    >

      {/* ================= SIDEBAR ================= */}

      <aside className="settings-sidebar">

        <div className="settings-brand">

          <div className="settings-brand-icon">
            ◈
          </div>

          <div>
            <div className="settings-brand-name">
              KubeOps
            </div>

            <div className="settings-brand-subtitle">
              AI-Powered K8s Copilot
            </div>
          </div>

        </div>

        <nav className="settings-nav">

          <button
            className="settings-nav-item"
            onClick={() => navigate("/")}
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            className="settings-nav-item"
            onClick={() => navigate("/troubleshoot")}
          >
            <span>⌕</span>
            Troubleshoot
          </button>

          <button
            className="settings-nav-item"
            onClick={() => navigate("/auto-fixes")}
          >
            <span>ϟ</span>
            Auto-Fixes
          </button>

          <button
            className="settings-nav-item"
            onClick={() => navigate("/history")}
          >
            <span>◷</span>
            History
          </button>

          <button className="settings-nav-item active">
            <span>⚙</span>
            Settings
          </button>

        </nav>

        <div className="settings-sidebar-bottom">

          <div className="sidebar-kubernetes">

            <div className="sidebar-k8s-title">
              Kubernetes
            </div>

            <div className="sidebar-k8s-status">

              <span
                className={
                  kubernetesConnected
                    ? "status-dot online"
                    : "status-dot offline"
                }
              />

              {kubernetesConnected
                ? "Connected"
                : "Disconnected"}

            </div>

          </div>

          <div className="sidebar-version">
            KubeOps v1.0
          </div>

        </div>

      </aside>

      {/* ================= MAIN ================= */}

      <main className="settings-main">

        {/* ================= HEADER ================= */}

        <header className="settings-header">

          <div className="settings-title-area">

            <div className="settings-page-icon">
              ⚙
            </div>

            <div>

              <h1>
                Settings
              </h1>

              <p>
                Configure KubeOps behavior and preferences
              </p>

            </div>

          </div>

          <div className="settings-header-actions">

            <div className="header-info-box">

              <span>
                Namespace
              </span>

              <strong>
                {namespace || "Unavailable"}
              </strong>

            </div>

            <div className="header-info-box cluster-box">

              <span>
                Cluster
              </span>

              <strong>

                <span
                  className={
                    kubernetesConnected
                      ? "status-dot online"
                      : "status-dot offline"
                  }
                />

                {context}

              </strong>

            </div>

            <button
              className="notification-button"
              onClick={() => navigate("/auto-fixes")}
              title="Auto-Fix notifications"
            >

              ♧

              {failedPods > 0 && (
                <span className="notification-count">
                  {failedPods}
                </span>
              )}

            </button>

            <button
              className="profile-button"
              onClick={() => navigate("/profile")}
            >

              <div className="profile-avatar">
                {profile.name
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="profile-details">

                <strong>
                  {profile.name}
                </strong>

                <span>
                  {profile.email}
                </span>

              </div>

              <span className="profile-arrow">
                ▾
              </span>

            </button>

          </div>

        </header>

        {/* ================= CONTENT ================= */}

        <section className="settings-content">

          {error && (
            <div className="settings-error">
              <span>⚠</span>
              {error}
            </div>
          )}

          {/* ================= KUBERNETES ================= */}

          <section className="settings-section">

            <div className="section-heading">

              <div className="section-icon blue">
                ☸
              </div>

              <div>

                <h2>
                  Kubernetes Connection
                </h2>

                <p>
                  Live cluster connection and runtime information
                </p>

              </div>

              <div
                className={
                  kubernetesConnected
                    ? "connection-pill connected"
                    : "connection-pill disconnected"
                }
              >

                <span
                  className={
                    kubernetesConnected
                      ? "status-dot online"
                      : "status-dot offline"
                  }
                />

                {loading
                  ? "Checking..."
                  : kubernetesConnected
                  ? "Connected"
                  : "Disconnected"}

              </div>

            </div>

            <div className="connection-grid">

              <div className="connection-card">

                <span>
                  Current Context
                </span>

                <strong>
                  {context}
                </strong>

                <small>
                  Active Kubernetes context
                </small>

              </div>

              <div className="connection-card">

                <span>
                  Kubernetes Version
                </span>

                <strong>
                  {kubernetesVersion}
                </strong>

                <small>
                  Running cluster version
                </small>

              </div>

              <div className="connection-card">

                <span>
                  Nodes
                </span>

                <strong>
                  {readyNodes} / {totalNodes}
                </strong>

                <small>
                  Ready nodes
                </small>

              </div>

            </div>

            <div className="sync-bar">

              <span>
                ● Live cluster data
              </span>

              <span>
                Last synchronized: {formatLastSync()}
              </span>

            </div>

          </section>

          {/* ================= AUTO FIX ================= */}

          <section className="settings-section">

            <div className="section-heading">

              <div className="section-icon purple">
                ϟ
              </div>

              <div>

                <h2>
                  Auto-Fix Configuration
                </h2>

                <p>
                  Control how Kubernetes remediation is handled
                </p>

              </div>

            </div>

            <div className="preference-list">

              <div className="preference-row">

                <div className="preference-text">

                  <strong>
                    Require approval before applying fixes
                  </strong>

                  <span>
                    Review the AI-generated remediation before
                    changing the cluster.
                  </span>

                </div>

                <button
                  className={
                    autoFixApproval
                      ? "toggle active"
                      : "toggle"
                  }
                  onClick={() =>
                    setAutoFixApproval(
                      !autoFixApproval
                    )
                  }
                >
                  <span />
                </button>

              </div>

              <div className="preference-row">

                <div className="preference-text">

                  <strong>
                    Verify recovery after a fix
                  </strong>

                  <span>
                    Verify rollout and workload health after
                    remediation.
                  </span>

                </div>

                <button
                  className={
                    verifyRecovery
                      ? "toggle active"
                      : "toggle"
                  }
                  onClick={() =>
                    setVerifyRecovery(
                      !verifyRecovery
                    )
                  }
                >
                  <span />
                </button>

              </div>

              <div className="info-note">

                <span>
                  ⓘ
                </span>

                <div>

                  <strong>
                    Controlled remediation
                  </strong>

                  <p>
                    KubeOps follows an approval-based workflow.
                    AI recommendations are reviewed before
                    Kubernetes changes are applied.
                  </p>

                </div>

              </div>

            </div>

          </section>

          {/* ================= DASHBOARD ================= */}

          <section className="settings-section">

            <div className="section-heading">

              <div className="section-icon green">
                ◫
              </div>

              <div>

                <h2>
                  Dashboard Preferences
                </h2>

                <p>
                  Configure how KubeOps displays and refreshes
                  information
                </p>

              </div>

            </div>

            <div className="preference-grid">

              <div className="field-group">

                <label>
                  Working Namespace
                </label>

                <select
                  value={namespace}
                  onChange={(e) =>
                    setNamespace(e.target.value)
                  }
                >

                  {namespaces.length > 0 ? (

                    namespaces.map((item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    ))

                  ) : (

                    <option value="">
                      No namespaces available
                    </option>

                  )}

                </select>

                <small>
                  {namespaces.length} namespaces discovered
                  from Kubernetes.
                </small>

              </div>

              <div className="field-group">

                <label>
                  Cluster Refresh Interval
                </label>

                <select
                  value={refreshInterval}
                  onChange={(e) =>
                    setRefreshInterval(
                      e.target.value
                    )
                  }
                >

                  <option value="5">
                    Every 5 seconds
                  </option>

                  <option value="10">
                    Every 10 seconds
                  </option>

                  <option value="30">
                    Every 30 seconds
                  </option>

                  <option value="60">
                    Every 60 seconds
                  </option>

                </select>

                <small>
                  Current setting: every{" "}
                  {refreshInterval} seconds.
                </small>

              </div>

              <div className="field-group">

                <label>
                  Interface Theme
                </label>

                <select
                  value={theme}
                  onChange={(e) =>
                    setTheme(e.target.value)
                  }
                >

                  <option value="Light">
                    Light
                  </option>

                  <option value="Dark">
                    Dark
                  </option>

                </select>

                <small>
                  Theme changes are applied immediately.
                </small>

              </div>

            </div>

          </section>

          {/* ================= WORKLOAD ================= */}

          <section className="settings-section">

            <div className="section-heading">

              <div className="section-icon orange">
                ▦
              </div>

              <div>

                <h2>
                  Cluster Workload Snapshot
                </h2>

                <p>
                  Current workload status across the Kubernetes
                  cluster
                </p>

              </div>

            </div>

            <div className="workload-grid">

              <div className="workload-card">

                <span>
                  Running
                </span>

                <strong>
                  {runningPods}
                </strong>

                <small className="success-text">
                  Active workloads
                </small>

              </div>

              <div className="workload-card">

                <span>
                  Pending
                </span>

                <strong>
                  {pendingPods}
                </strong>

                <small className="warning-text">
                  Awaiting scheduling
                </small>

              </div>

              <div className="workload-card">

                <span>
                  Failed
                </span>

                <strong>
                  {failedPods}
                </strong>

                <small
                  className={
                    failedPods > 0
                      ? "danger-text"
                      : "success-text"
                  }
                >
                  {failedPods > 0
                    ? "Attention required"
                    : "No failures detected"}
                </small>

              </div>

              <div className="workload-card">

                <span>
                  Total Pods
                </span>

                <strong>
                  {totalPods}
                </strong>

                <small>
                  Cluster workloads
                </small>

              </div>

            </div>

          </section>

          {/* ================= CONNECTION ================= */}

          <section className="settings-section">

            <div className="section-heading">

              <div className="section-icon cyan">
                ⛓
              </div>

              <div>

                <h2>
                  KubeOps Connection
                </h2>

                <p>
                  Application component availability
                </p>

              </div>

            </div>

            <div className="service-grid">

              <div className="service-card">

                <div className="service-top">

                  <span className="service-icon">
                    ◈
                  </span>

                  <span className="service-status connected">
                    Active
                  </span>

                </div>

                <strong>
                  Frontend
                </strong>

                <span>
                  React + Vite
                </span>

              </div>

              <div className="service-card">

                <div className="service-top">

                  <span className="service-icon">
                    ◉
                  </span>

                  <span
                    className={
                      backendConnected
                        ? "service-status connected"
                        : "service-status disconnected"
                    }
                  >
                    {backendConnected
                      ? "Connected"
                      : "Disconnected"}
                  </span>

                </div>

                <strong>
                  Backend API
                </strong>

                <span>
                  FastAPI · Port 8000
                </span>

              </div>

              <div className="service-card">

                <div className="service-top">

                  <span className="service-icon">
                    ☸
                  </span>

                  <span
                    className={
                      kubernetesConnected
                        ? "service-status connected"
                        : "service-status disconnected"
                    }
                  >
                    {kubernetesConnected
                      ? "Connected"
                      : "Disconnected"}
                  </span>

                </div>

                <strong>
                  Kubernetes API
                </strong>

                <span>
                  {context}
                </span>

              </div>

            </div>

          </section>

          {/* ================= ACTIONS ================= */}

          <div className="settings-actions">

            <div className="save-message">

              {saved && (
                <>
                  <span>✓</span>
                  Preferences saved successfully
                </>
              )}

            </div>

            <div className="action-buttons">

              <button
                className="reset-button"
                onClick={resetPreferences}
              >
                Reset Defaults
              </button>

              <button
                className="save-button"
                onClick={savePreferences}
              >
                Save Preferences
              </button>

            </div>

          </div>

        </section>

      </main>

      {/* ================= CSS ================= */}

      <style>{`

        * {
          box-sizing: border-box;
        }

        .settings-shell {
          --bg: #f5f7fb;
          --card: #ffffff;
          --card-soft: #fbfcfe;
          --text: #172033;
          --muted: #8491a6;
          --border: #e2e8f0;
          --blue: #2476e9;
          --sidebar: #081b31;

          min-height: 100vh;
          display: flex;
          background: var(--bg);
          color: var(--text);
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;

          transition:
            background 0.25s ease,
            color 0.25s ease;
        }

        /* ================= DARK MODE ================= */

        .settings-shell.dark-mode {
          --bg: #08111f;
          --card: #111d2d;
          --card-soft: #152337;
          --text: #edf4ff;
          --muted: #8fa1b9;
          --border: #26364b;
          --blue: #3986f6;
          --sidebar: #050e1b;
        }

        /* ================= SIDEBAR ================= */

        .settings-sidebar {
          width: 230px;
          min-height: 100vh;
          background: var(--sidebar);
          color: white;
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          z-index: 10;
        }

        .settings-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 8px 30px;
        }

        .settings-brand-icon {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          background: #2476e9;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 21px;
          box-shadow:
            0 8px 22px rgba(36,118,233,0.35);
        }

        .settings-brand-name {
          font-size: 17px;
          font-weight: 800;
        }

        .settings-brand-subtitle {
          margin-top: 4px;
          font-size: 8px;
          color: #8fa6c5;
        }

        .settings-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .settings-nav-item {
          height: 43px;
          border: 0;
          background: transparent;
          color: #a9bad0;
          border-radius: 9px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 13px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          text-align: left;
        }

        .settings-nav-item span {
          width: 18px;
          text-align: center;
          font-size: 15px;
        }

        .settings-nav-item:hover {
          background: rgba(255,255,255,0.07);
          color: white;
        }

        .settings-nav-item.active {
          background: #2476e9;
          color: white;
          box-shadow:
            0 8px 20px rgba(36,118,233,0.25);
        }

        .settings-sidebar-bottom {
          margin-top: auto;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 20px 8px 0;
        }

        .sidebar-k8s-title {
          font-size: 8px;
          color: #7187a4;
          margin-bottom: 8px;
        }

        .sidebar-k8s-status {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 700;
        }

        .sidebar-version {
          color: #627793;
          font-size: 8px;
          text-align: center;
          margin-top: 22px;
        }

        /* ================= STATUS ================= */

        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }

        .status-dot.online {
          background: #20c878;
          box-shadow:
            0 0 0 3px rgba(32,200,120,0.12);
        }

        .status-dot.offline {
          background: #ef5b68;
          box-shadow:
            0 0 0 3px rgba(239,91,104,0.12);
        }

        /* ================= MAIN ================= */

        .settings-main {
          margin-left: 230px;
          width: calc(100% - 230px);
          min-height: 100vh;
        }

        /* ================= HEADER ================= */

        .settings-header {
          min-height: 76px;
          padding: 0 30px 0 34px;
          background: var(--card);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .settings-title-area {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }

        .settings-page-icon {
          width: 44px;
          height: 44px;
          border-radius: 13px;
          background: #edf4ff;
          color: #2476e9;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }

        .settings-title-area h1 {
          margin: 0;
          font-size: 21px;
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .settings-title-area p {
          margin: 5px 0 0;
          color: var(--muted);
          font-size: 10px;
          line-height: 1.3;
        }

        .settings-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .header-info-box {
          min-width: 108px;
          height: 55px;
          padding: 9px 13px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--card-soft);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .header-info-box span {
          display: block;
          font-size: 7px;
          line-height: 1;
          color: var(--muted);
          margin-bottom: 6px;
          font-weight: 600;
        }

        .header-info-box strong {
          font-size: 9px;
          line-height: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .cluster-box {
          min-width: 128px;
        }

        .notification-button {
          position: relative;
          width: 40px;
          height: 40px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--card);
          color: var(--muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.2s ease;
        }

        .notification-button:hover {
          border-color: #2476e9;
          color: #2476e9;
          background: #f5f8ff;
        }

        .notification-count {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 15px;
          height: 15px;
          padding: 0 4px;
          border-radius: 20px;
          background: #ed5362;
          color: white;
          font-size: 8px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--card);
        }

        .profile-button {
          height: 55px;
          min-width: 195px;
          display: flex;
          align-items: center;
          gap: 9px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          border-radius: 10px;
          padding: 6px 11px;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .profile-button:hover {
          border-color: #cbd7e8;
          background: var(--card-soft);
        }

        .profile-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #5277ed;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          flex-shrink: 0;
        }

        .profile-details {
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
          flex: 1;
        }

        .profile-details strong {
          font-size: 10px;
          line-height: 1;
        }

        .profile-details span {
          font-size: 7px;
          color: var(--muted);
          max-width: 125px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-arrow {
          font-size: 9px;
          color: var(--muted);
        }

        /* ================= CONTENT ================= */

        .settings-content {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 34px 50px;
        }

        .settings-error {
          background: #fff1f2;
          border: 1px solid #ffd1d5;
          color: #c63746;
          border-radius: 10px;
          padding: 12px 15px;
          font-size: 11px;
          margin-bottom: 18px;
        }

        .settings-section {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 13px;
          margin-bottom: 18px;
          overflow: hidden;
          box-shadow:
            0 3px 12px rgba(20,40,70,0.035);
        }

        .dark-mode .settings-section {
          box-shadow:
            0 8px 25px rgba(0,0,0,0.18);
        }

        .section-heading {
          min-height: 82px;
          padding: 18px 22px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .section-heading h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 800;
        }

        .section-heading p {
          margin: 4px 0 0;
          color: var(--muted);
          font-size: 9px;
        }

        .section-icon {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          flex-shrink: 0;
        }

        .section-icon.blue {
          background: #edf4ff;
          color: #2774e7;
        }

        .section-icon.purple {
          background: #f3edff;
          color: #7c4ce0;
        }

        .section-icon.green {
          background: #eafaf2;
          color: #18a765;
        }

        .section-icon.orange {
          background: #fff4e7;
          color: #df7c18;
        }

        .section-icon.cyan {
          background: #e9f9fb;
          color: #1a9cad;
        }

        .connection-pill {
          margin-left: auto;
          border-radius: 20px;
          padding: 7px 11px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 9px;
          font-weight: 700;
        }

        .connection-pill.connected {
          background: #e9fbf1;
          color: #15945b;
        }

        .connection-pill.disconnected {
          background: #fff0f1;
          color: #d53d4c;
        }

        /* ================= CONNECTION ================= */

        .connection-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 18px 22px 14px;
        }

        .connection-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          background: var(--card-soft);
        }

        .connection-card span {
          display: block;
          color: var(--muted);
          font-size: 9px;
          margin-bottom: 8px;
        }

        .connection-card strong {
          display: block;
          font-size: 14px;
          margin-bottom: 6px;
        }

        .connection-card small {
          color: var(--muted);
          font-size: 8px;
        }

        .sync-bar {
          padding: 0 22px 18px;
          display: flex;
          justify-content: space-between;
          color: var(--muted);
          font-size: 8px;
        }

        .sync-bar span:first-child {
          color: #15945b;
          font-weight: 700;
        }

        /* ================= AUTO FIX ================= */

        .preference-list {
          padding: 5px 22px 22px;
        }

        .preference-row {
          min-height: 78px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .preference-text strong {
          display: block;
          font-size: 11px;
          margin-bottom: 5px;
        }

        .preference-text span {
          color: var(--muted);
          font-size: 9px;
        }

        .toggle {
          width: 43px;
          height: 24px;
          border: 0;
          border-radius: 20px;
          background: #9aa7b8;
          padding: 3px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .toggle span {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          display: block;
          transition: 0.2s;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.18);
        }

        .toggle.active {
          background: #2476e9;
        }

        .toggle.active span {
          transform: translateX(19px);
        }

        .info-note {
          margin-top: 16px;
          padding: 13px 15px;
          background: #f5f8ff;
          border: 1px solid #dfe9ff;
          border-radius: 9px;
          display: flex;
          gap: 10px;
          color: #45608a;
        }

        .dark-mode .info-note {
          background: #14243b;
          border-color: #284a73;
          color: #a9c5ea;
        }

        .info-note strong {
          font-size: 9px;
        }

        .info-note p {
          margin: 4px 0 0;
          font-size: 8px;
          line-height: 1.5;
        }

        /* ================= FIELDS ================= */

        .preference-grid {
          padding: 20px 22px 23px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .field-group label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .field-group select {
          width: 100%;
          height: 39px;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0 11px;
          background: var(--card);
          color: var(--text);
          font-size: 10px;
          outline: none;
        }

        .field-group select:focus {
          border-color: #4d8ef0;
          box-shadow:
            0 0 0 3px rgba(77,142,240,0.08);
        }

        .field-group small {
          display: block;
          margin-top: 7px;
          color: var(--muted);
          font-size: 8px;
        }

        /* ================= WORKLOAD ================= */

        .workload-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          padding: 20px 22px 23px;
        }

        .workload-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 17px;
          background: var(--card-soft);
        }

        .workload-card span {
          color: var(--muted);
          font-size: 9px;
        }

        .workload-card strong {
          display: block;
          font-size: 23px;
          margin: 8px 0 5px;
        }

        .workload-card small {
          font-size: 8px;
        }

        .success-text {
          color: #15945b;
        }

        .warning-text {
          color: #bd8112;
        }

        .danger-text {
          color: #d53d4c;
        }

        /* ================= SERVICES ================= */

        .service-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 20px 22px 23px;
        }

        .service-card {
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          background: var(--card-soft);
        }

        .service-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .service-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #edf4ff;
          color: #2774e7;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .service-card strong {
          display: block;
          font-size: 11px;
          margin-bottom: 5px;
        }

        .service-card > span:last-child {
          color: var(--muted);
          font-size: 8px;
        }

        .service-status {
          font-size: 8px;
          font-weight: 700;
          padding: 5px 8px;
          border-radius: 15px;
        }

        .service-status.connected {
          color: #15945b;
          background: #e9fbf1;
        }

        .service-status.disconnected {
          color: #d53d4c;
          background: #fff0f1;
        }

        /* ================= ACTIONS ================= */

        .settings-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 0 15px;
        }

        .save-message {
          color: #15945b;
          font-size: 10px;
          font-weight: 700;
        }

        .action-buttons {
          display: flex;
          gap: 9px;
        }

        .reset-button,
        .save-button {
          height: 38px;
          padding: 0 17px;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .reset-button {
          background: var(--card);
          border: 1px solid var(--border);
          color: var(--muted);
        }

        .save-button {
          background: #2476e9;
          border: 1px solid #2476e9;
          color: white;
          box-shadow:
            0 5px 12px rgba(36,118,233,0.18);
        }

        .save-button:hover {
          background: #1d67d2;
        }

        /* ================= RESPONSIVE ================= */

        @media (max-width: 1100px) {

          .header-info-box {
            display: none;
          }

          .connection-grid,
          .preference-grid,
          .service-grid {
            grid-template-columns: 1fr;
          }

          .workload-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 760px) {

          .settings-sidebar {
            width: 70px;
            padding: 18px 10px;
          }

          .settings-brand > div:last-child {
            display: none;
          }

          .settings-nav-item {
            justify-content: center;
            padding: 0;
            font-size: 0;
          }

          .settings-nav-item span {
            font-size: 16px;
          }

          .settings-sidebar-bottom {
            display: none;
          }

          .settings-main {
            margin-left: 70px;
            width: calc(100% - 70px);
          }

          .settings-header {
            padding: 0 16px;
          }

          .profile-details {
            display: none;
          }

          .settings-content {
            padding: 20px 15px;
          }

          .workload-grid {
            grid-template-columns: 1fr;
          }

          .settings-actions {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .action-buttons {
            justify-content: flex-end;
          }

          .sync-bar {
            flex-direction: column;
            gap: 6px;
          }
        }

      `}</style>

    </div>
  );
}

export default Settings;