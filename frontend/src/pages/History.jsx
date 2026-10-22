import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "../App.css";

const TONE = {
  Medium: { bg: "#fffbeb", fg: "#d97706", border: "#fde68a" },
  Low: { bg: "#eff6ff", fg: "#2563eb", border: "#bfdbfe" },
  None: { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0" },
  Success: { bg: "#f0fdf4", fg: "#166534", border: "#bbf7d0" },
};

// small pill used for fix details
function Chip({ tone = "None", children }) {
  const t = TONE[tone] || TONE.None;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 9px",
        borderRadius: "999px",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontSize: "11px",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// item.id is the timestamp (ms) when the fix was saved
const timeAgo = (id) => {
  if (typeof id !== "number") return "";
  const s = Math.max(0, Math.round((Date.now() - id) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const isPending = (item) => String(item.status || "").includes("Pending");

function History() {
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

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
  // GET AUTO-FIX HISTORY
  // ==================================================

  useEffect(() => {
    const loadHistory = () => {
      const savedHistory =
        JSON.parse(
          localStorage.getItem(
            "kubeops_fixed_pods"
          )
        ) || [];

      setHistory(savedHistory);
    };

    loadHistory();
  }, []);

  // ==================================================
  // SUMMARY COUNTS
  // ==================================================

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const pendingCount = history.filter(isPending).length;
  const verifiedCount = history.filter(
    (item) => !isPending(item) && (item.status || "Fixed") === "Fixed"
  ).length;
  const todayCount = history.filter(
    (item) => item.id >= startOfDay.getTime()
  ).length;

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
              Auto-Fix History
            </h1>

            <p>
              Previously applied Kubernetes
              remediations
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
              0
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
              HISTORY HEADER
          ================================================== */}

          <section className="panel">

            <div className="panel-header">

              <div className="panel-title">

                <div className="panel-icon">
                  ◷
                </div>

                <div>

                  <h2>
                    Auto-Fix History
                  </h2>

                  <p>
                    Previously applied Kubernetes
                    fixes and recovery actions
                  </p>

                </div>

              </div>

              <span className="history-count">
                {history.length}{" "}
                {history.length === 1
                  ? "Fix"
                  : "Fixes"}
              </span>

            </div>

          </section>

          {/* ==================================================
              NO HISTORY
          ================================================== */}

          {history.length === 0 && (

            <section className="panel">

              <div className="empty-state">

                <div className="empty-icon">
                  ◷
                </div>

                <h3>
                  No Auto-Fixes Recorded Yet
                </h3>

                <p>
                  KubeOps will record successful
                  Kubernetes remediation actions
                  here.
                </p>

                

              </div>

            </section>

          )}

          {/* ==================================================
              HISTORY LIST
          ================================================== */}

          {history.length > 0 && (

            <section className="panel">

              <div className="panel-header">

                <div className="panel-title">

                  <div className="panel-icon">
                    ✓
                  </div>

                  <div>

                    <h2>
                      Applied Fixes
                    </h2>

                    <p>
                      Successfully executed
                      remediation actions
                    </p>

                  </div>

                </div>

                {/* quick summary */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                  }}
                >
                  <Chip tone="Success">
                    ✓ {verifiedCount} verified
                  </Chip>

                  {pendingCount > 0 && (
                    <Chip tone="Medium">
                      ◷ {pendingCount} pending
                    </Chip>
                  )}

                  {todayCount > 0 && (
                    <Chip tone="Low">
                      ϟ {todayCount} today
                    </Chip>
                  )}
                </div>

              </div>

              <div className="history-list">

                {history.map((item) => {
                  const pending = isPending(item);
                  const ago = timeAgo(item.id);

                  return (

                  <div
                    key={item.id}
                    className="history-item"
                  >

                    <div style={{ textAlign: "left" }}>

                      <strong>
                        {item.pod_name}
                      </strong>

                      <span>
                        Problem:{" "}
                        {item.problem ||
                          "Kubernetes workload issue"}
                      </span>

                      <span>
                        Applied:{" "}
                        {item.time}
                        {ago && ` · ${ago}`}
                      </span>

                      {(item.failure_type ||
                        item.fix_type ||
                        item.risk) && (

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            marginTop: "8px",
                          }}
                        >
                          {item.failure_type && (
                            <Chip>
                              {item.failure_type}
                            </Chip>
                          )}

                          {item.fix_type && (
                            <Chip tone="Low">
                              {item.fix_type}
                            </Chip>
                          )}

                          {item.risk && (
                            <Chip
                              tone={
                                item.risk === "Medium"
                                  ? "Medium"
                                  : "Low"
                              }
                            >
                              Risk: {item.risk}
                            </Chip>
                          )}
                        </div>

                      )}

                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: "8px",
                        textAlign: "right",
                      }}
                    >

                      <span
                        className="history-fixed"
                        style={
                          pending
                            ? {
                                background: TONE.Medium.bg,
                                color: TONE.Medium.fg,
                                border: `1px solid ${TONE.Medium.border}`,
                              }
                            : undefined
                        }
                      >
                        {pending ? "◷" : "✓"}{" "}
                        {item.status || "Fixed"}
                      </span>

                      {item.old_image &&
                        item.new_image && (

                        <span
                          style={{
                            fontSize: "11px",
                            color: "#475569",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            borderRadius: "8px",
                            padding: "3px 8px",
                          }}
                        >
                          {item.old_image}
                          {" → "}
                          {item.new_image}
                        </span>

                      )}

                    </div>

                  </div>

                  );
                })}

              </div>

            </section>

          )}

        </div>

      </main>

    </div>
  );
}

export default History;