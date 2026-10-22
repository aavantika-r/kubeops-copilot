import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "../App.css";

const API = "http://127.0.0.1:8000";
const NAMESPACE = "minishop";
const HISTORY_KEY = "kubeops_fixed_pods";
const AUTO_REFRESH_MS = 10000;

const SEVERITY_BY_STATUS = {
  CrashLoopBackOff: "Critical",
  OOMKilled: "Critical",
  Error: "Critical",
  ImagePullBackOff: "High",
  ErrImagePull: "High",
  InvalidImageName: "High",
  ErrImageNeverPull: "High",
  CreateContainerConfigError: "High",
  RunContainerError: "High",
  Pending: "Medium",
  ContainerCreating: "Medium",
  Terminating: "Medium",
  Evicted: "Medium",
  NotReady: "Medium",
};

const severityFor = (status = "") =>
  status.startsWith("Init:")
    ? "High"
    : SEVERITY_BY_STATUS[status] || "Medium";

const TONE = {
  Critical: {
    bg: "#fff1f2",
    fg: "#dc2626",
    border: "#fecaca",
  },

  High: {
    bg: "#fff7ed",
    fg: "#ea580c",
    border: "#fed7aa",
  },

  Medium: {
    bg: "#fffbeb",
    fg: "#d97706",
    border: "#fde68a",
  },

  Low: {
    bg: "#eff6ff",
    fg: "#2563eb",
    border: "#bfdbfe",
  },

  None: {
    bg: "#f1f5f9",
    fg: "#475569",
    border: "#e2e8f0",
  },

  Success: {
    bg: "#f0fdf4",
    fg: "#166534",
    border: "#bbf7d0",
  },
};

const SEVERITY_ORDER = {
  Critical: 0,
  High: 1,
  Medium: 2,
};

const isUnhealthy = (pod) =>
  (pod.status !== "Running" &&
    pod.status !== "Succeeded") ||
  pod.ready === false;

// A pod can be Running but not Ready
const displayStatus = (pod) =>
  isUnhealthy(pod) && pod.status === "Running"
    ? "NotReady"
    : pod.status;

const readHistory = () => {
  try {
    return (
      JSON.parse(
        localStorage.getItem(HISTORY_KEY)
      ) || []
    );
  } catch {
    return [];
  }
};

const ghostButton = {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  borderRadius: "8px",
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: 700,
  color: "#334155",
  cursor: "pointer",
};

const ellipsis = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
};

function Pill({
  tone = "None",
  children,
}) {
  const t = TONE[tone] || TONE.None;

  return (
    <span
      style={{
        padding: "5px 10px",
        borderRadius: "999px",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontSize: "12px",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// Small pill used inside card footers
function Chip({
  tone = "None",
  children,
}) {
  const t = TONE[tone] || TONE.None;

  return (
    <span
      style={{
        padding: "2px 8px",
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

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "None",
  progress,
  footer,
}) {
  const t = TONE[tone] || TONE.None;

  return (
    <div
      style={{
        padding: "18px 20px",
        border: "1px solid #e2e8f0",
        borderTop: `3px solid ${t.fg}`,
        borderRadius: "14px",
        background: `linear-gradient(
          180deg,
          ${t.bg} 0%,
          #ffffff 60%
        )`,
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "#475569",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          {label}
        </span>

        <span
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            color: t.fg,
            border: `1px solid ${t.border}`,
            fontSize: "16px",
            fontWeight: 800,
          }}
        >
          {icon}
        </span>
      </div>

      <strong
        style={{
          display: "block",
          margin: "14px 0 4px",
          fontSize: "32px",
          lineHeight: 1,
          color: t.fg,
        }}
      >
        {value}
      </strong>

      <span
        style={{
          display: "block",
          color: "#64748b",
          fontSize: "12px",
          minHeight: "16px",
        }}
      >
        {sub}
      </span>

      {progress !== undefined && (
        <div
          style={{
            height: "6px",
            borderRadius: "999px",
            background: "#f1f5f9",
            marginTop: "14px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.min(
                100,
                Math.max(0, progress)
              )}%`,
              height: "100%",
              borderRadius: "999px",
              background: t.fg,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      )}

      {footer && (
        <div
          style={{
            marginTop: "auto",
            paddingTop: "14px",
          }}
        >
          <div
            style={{
              paddingTop: "10px",
              borderTop:
                "1px dashed #e2e8f0",
              fontSize: "11px",
              color: "#64748b",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              minHeight: "34px",
            }}
          >
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ navigate }) {
  const items = [
    ["/dashboard", "⌂", "Dashboard"],
    ["/troubleshoot", "⌕", "Troubleshoot"],
    ["/history", "◷", "History"],
    ["/settings", "⚙", "Settings"],
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          ◇
        </div>

        <div>
          <h1>KubeOps</h1>
          <p>AI-Powered K8s Copilot</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map(
          ([path, icon, label]) => (
            <button
              key={path}
              className={`nav-item ${
                path === "/dashboard"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigate(path)
              }
            >
              <span>{icon}</span>
              {label}
            </button>
          )
        )}
      </nav>

      <div className="sidebar-footer">
        <p className="connection-title">
          Connected to
        </p>

        <div className="connection-status">
          <span className="connection-dot" />

          <span>
            {NAMESPACE} cluster
          </span>
        </div>

        <div className="sidebar-version">
          v1.0.0 | KubeOps v1.0
        </div>
      </div>
    </aside>
  );
}

function Header({
  navigate,
  user,
  unhealthyCount,
}) {
  const [profileOpen, setProfileOpen] =
    useState(false);

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

  return (
    <header className="top-header">
      <div className="top-brand">
        <div className="top-brand-icon">
          ◇
        </div>

        <div>
          <h1>
            Kubernetes Dashboard
          </h1>

          <p>
            Monitor Kubernetes workload
            health and cluster activity
          </p>
        </div>
      </div>

      <div className="header-actions">
        <div className="header-selector">
          <span>Namespace</span>
          <strong>{NAMESPACE}</strong>
        </div>

        <div className="header-selector cluster-selector">
          <span>Cluster</span>

          <strong>
            <i className="green-dot" />
            Docker Desktop · 1 node
          </strong>
        </div>

        <button
          className="notification-button"
          onClick={() =>
            navigate("/troubleshoot")
          }
          title="View unhealthy pods"
          aria-label={`${unhealthyCount} pods need attention`}
        >
          ♧
          <b>{unhealthyCount}</b>
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

            <span>{userName}</span>

            <span>▾</span>
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
}

function Dashboard() {
  const navigate = useNavigate();

  const [pods, setPods] = useState([]);
  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [sortBy, setSortBy] =
    useState("severity");

  const [autoRefresh, setAutoRefresh] =
    useState(true);

  const [fixedPods, setFixedPods] =
    useState(readHistory);

  const searchRef =
    useRef(null);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(
        ({
          data: { user },
        }) => setUser(user)
      );
  }, []);

  const getPods = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      try {
        const response =
          await fetch(
            `${API}/pods`
          );

        if (!response.ok) {
          throw new Error(
            "Failed to fetch pods"
          );
        }

        const data =
          await response.json();

        setPods(
          Array.isArray(data)
            ? data
            : []
        );

        setError("");

        setLastUpdated(
          new Date()
        );
      } catch (err) {
        console.error(
          "Pod fetch error:",
          err
        );

        setError(
          "Unable to connect to KubeOps backend. Check that it is running on port 8000."
        );

        if (!silent) {
          setPods([]);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    getPods();
  }, [getPods]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const timer =
      setInterval(
        () =>
          getPods(true),
        AUTO_REFRESH_MS
      );

    return () =>
      clearInterval(timer);
  }, [
    autoRefresh,
    getPods,
  ]);

  useEffect(() => {
    const refresh = () =>
      setFixedPods(
        readHistory()
      );

    window.addEventListener(
      "storage",
      refresh
    );

    const interval =
      setInterval(
        refresh,
        2000
      );

    return () => {
      window.removeEventListener(
        "storage",
        refresh
      );

      clearInterval(interval);
    };
  }, []);

  const unhealthyPods =
    useMemo(
      () =>
        pods.filter(
          isUnhealthy
        ),
      [pods]
    );

  const healthyCount =
    pods.length -
    unhealthyPods.length;

  const healthScore =
    pods.length
      ? Math.round(
          (healthyCount /
            pods.length) *
            100
        )
      : 0;

  useEffect(() => {
    document.title =
      unhealthyPods.length
        ? `(${unhealthyPods.length}) KubeOps`
        : "KubeOps";
  }, [
    unhealthyPods.length,
  ]);

  const severityCounts =
    useMemo(() => {
      const counts = {
        Critical: 0,
        High: 0,
        Medium: 0,
      };

      unhealthyPods.forEach(
        (pod) => {
          counts[
            severityFor(
              pod.status
            )
          ] += 1;
        }
      );

      return counts;
    }, [unhealthyPods]);

  const risk =
    severityCounts.Critical >
    0
      ? "Critical"
      : severityCounts.High >
        0
      ? "High"
      : unhealthyPods.length
      ? "Medium"
      : "Low";

  const riskTone =
    risk === "Low"
      ? "Success"
      : risk;

  const worstPod =
    useMemo(
      () =>
        [...unhealthyPods].sort(
          (a, b) =>
            (
              SEVERITY_ORDER[
                severityFor(
                  a.status
                )
              ] ?? 2
            ) -
              (
                SEVERITY_ORDER[
                  severityFor(
                    b.status
                  )
                ] ?? 2
              ) ||
            a.name.localeCompare(
              b.name
            )
        )[0],
      [unhealthyPods]
    );

  const statusCounts =
    useMemo(() => {
      const counts = {};

      pods.forEach(
        (pod) => {
          const key =
            displayStatus(
              pod
            );

          counts[key] =
            (counts[key] || 0) +
            1;
        }
      );

      return counts;
    }, [pods]);

  const fixesToday =
    useMemo(() => {
      const start =
        new Date();

      start.setHours(
        0,
        0,
        0,
        0
      );

      return fixedPods.filter(
        (item) =>
          item.id >=
          start.getTime()
      ).length;
    }, [fixedPods]);

  const recoveredCount =
    fixedPods.filter(
      (item) =>
        item.status ===
        "Fixed"
    ).length;

  const successRate =
    fixedPods.length
      ? Math.round(
          (recoveredCount /
            fixedPods.length) *
            100
        )
      : 0;

  const lastFix =
    fixedPods[0];

  const filteredPods =
    useMemo(() => {
      const query =
        search
          .trim()
          .toLowerCase();

      return pods
        .filter((pod) => {
          if (
            statusFilter ===
            "All"
          ) {
            return true;
          }

          if (
            statusFilter ===
            "Unhealthy"
          ) {
            return isUnhealthy(
              pod
            );
          }

          return (
            pod.status ===
            statusFilter
          );
        })
        .filter(
          (pod) =>
            !query ||
            pod.name
              .toLowerCase()
              .includes(query)
        )
        .sort(
          (a, b) => {
            if (
              sortBy ===
              "name"
            ) {
              return a.name.localeCompare(
                b.name
              );
            }

            const sa =
              isUnhealthy(a)
                ? SEVERITY_ORDER[
                    severityFor(
                      a.status
                    )
                  ] ?? 2
                : 9;

            const sb =
              isUnhealthy(b)
                ? SEVERITY_ORDER[
                    severityFor(
                      b.status
                    )
                  ] ?? 2
                : 9;

            return (
              sa - sb ||
              a.name.localeCompare(
                b.name
              )
            );
          }
        );
    }, [
      pods,
      search,
      statusFilter,
      sortBy,
    ]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = [
        "INPUT",
        "TEXTAREA",
        "SELECT",
      ].includes(
        e.target.tagName
      );

      if (
        e.key === "Escape" &&
        typing
      ) {
        e.target.blur();
        return;
      }

      if (
        typing ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      if (e.key === "/") {
        e.preventDefault();

        searchRef.current?.focus();
      } else if (
        e.key === "r"
      ) {
        getPods();
      }
    };

    window.addEventListener(
      "keydown",
      onKey
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKey
      );
  }, [getPods]);

  const filterOptions = [
    "All",
    ...(unhealthyPods.length
      ? ["Unhealthy"]
      : []),
    ...Object.keys(
      statusCounts
    ),
  ];

  return (
    <div className="app-shell">
      <Sidebar
        navigate={navigate}
      />

      <main className="dashboard-main">
        <Header
          navigate={navigate}
          user={user}
          unhealthyCount={
            unhealthyPods.length
          }
        />

        <div
          className="dashboard"
          style={{
            paddingBottom:
              "60px",
          }}
        >
          {/* OVERVIEW BANNER */}

          <section
            className="panel"
            style={{
              marginBottom:
                "20px",

              padding:
                "18px 22px",

              border: `1px solid ${
                unhealthyPods.length
                  ? TONE[risk]
                      .border
                  : TONE.Success
                      .border
              }`,

              background:
                unhealthyPods.length
                  ? TONE[risk].bg
                  : TONE.Success.bg,
            }}
          >
            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                gap: "20px",

                flexWrap:
                  "wrap",
              }}
            >
              <div
                style={{
                  textAlign:
                    "left",
                }}
              >
                <span
                  style={{
                    display:
                      "block",

                    color:
                      unhealthyPods.length
                        ? TONE[risk]
                            .fg
                        : TONE
                            .Success
                            .fg,

                    fontSize:
                      "11px",

                    fontWeight:
                      800,
                  }}
                >
                  {unhealthyPods.length
                    ? "ATTENTION NEEDED"
                    : "ALL SYSTEMS HEALTHY"}
                </span>

                <h2
                  style={{
                    margin:
                      "6px 0",

                    color:
                      "#0f172a",
                  }}
                >
                  {unhealthyPods.length
                    ? `${unhealthyPods.length} of ${pods.length} pods need attention`
                    : pods.length
                    ? `All ${pods.length} pods are running normally`
                    : "No pods found in this namespace"}
                </h2>

                <p
                  style={{
                    margin: 0,
                    color:
                      "#64748b",
                    fontSize:
                      "13px",
                  }}
                >
                  {lastUpdated
                    ? `Updated ${lastUpdated.toLocaleTimeString()}`
                    : "Waiting for first update"}

                  {autoRefresh &&
                    ` · refreshing every ${
                      AUTO_REFRESH_MS /
                      1000
                    }s`}
                </p>
              </div>

              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap: "12px",

                  flexWrap:
                    "wrap",
                }}
              >
                <label
                  style={{
                    display:
                      "flex",

                    alignItems:
                      "center",

                    gap: "8px",

                    fontSize:
                      "13px",

                    color:
                      "#475569",

                    cursor:
                      "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      autoRefresh
                    }
                    onChange={(
                      e
                    ) =>
                      setAutoRefresh(
                        e.target
                          .checked
                      )
                    }
                  />

                  Auto-refresh
                </label>

                {unhealthyPods.length >
                  0 && (
                  <button
                    className="refresh-button"
                    onClick={() =>
                      navigate(
                        "/troubleshoot"
                      )
                    }
                  >
                    Investigate
                    issues →
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* STATS */}

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit,minmax(190px,1fr))",

              gap: "14px",

              marginBottom:
                "20px",
            }}
          >
            <StatCard
              icon="✓"
              label="Healthy pods"
              value={
                healthyCount
              }
              tone="Success"
              sub={`of ${pods.length} total`}
              progress={
                healthScore
              }
              footer={
                <span>
                  {unhealthyPods.length
                    ? `${unhealthyPods.length} not ready`
                    : "All pods ready"}
                </span>
              }
            />

            <StatCard
              icon="!"
              label="Unhealthy pods"
              value={
                unhealthyPods.length
              }
              tone={
                unhealthyPods.length
                  ? "Critical"
                  : "Success"
              }
              sub={
                unhealthyPods.length
                  ? `${severityCounts.Critical} critical · ${severityCounts.High} high · ${severityCounts.Medium} medium`
                  : "No issues detected"
              }
              progress={
                pods.length
                  ? 100 -
                    healthScore
                  : 0
              }
              footer={
                worstPod ? (
                  <>
                    <span
                      style={{
                        fontWeight:
                          700,
                        color:
                          "#334155",
                        ...ellipsis,
                      }}
                      title={
                        worstPod.name
                      }
                    >
                      {
                        worstPod.name
                      }
                    </span>

                    <span>
                      <Chip
                        tone={severityFor(
                          worstPod.status
                        )}
                      >
                        {displayStatus(
                          worstPod
                        )}
                      </Chip>
                    </span>
                  </>
                ) : (
                  <span>
                    No failing pods
                  </span>
                )
              }
            />

            <StatCard
              icon="≋"
              label="Cluster health"
              value={`${healthScore}%`}
              tone={
                healthScore ===
                100
                  ? "Success"
                  : healthScore >=
                    80
                  ? "Medium"
                  : "Critical"
              }
              sub={
                healthScore ===
                100
                  ? "Excellent"
                  : healthScore >=
                    80
                  ? "Mostly healthy"
                  : "Needs attention"
              }
              progress={
                healthScore
              }
              footer={
                <span>
                  {healthyCount}{" "}
                  healthy ·{" "}
                  {
                    unhealthyPods.length
                  }{" "}
                  unhealthy
                </span>
              }
            />

            <StatCard
              icon="◇"
              label="Risk level"
              value={risk}
              tone={riskTone}
              sub={
                risk === "Low"
                  ? "Cluster is stable"
                  : "Based on worst active failure"
              }
              footer={
                <span>
                  {unhealthyPods.length
                    ? `${unhealthyPods.length} pod${
                        unhealthyPods.length ===
                        1
                          ? ""
                          : "s"
                      } to investigate`
                    : "No action needed"}
                </span>
              }
            />

            <StatCard
              icon="ϟ"
              label="Fixes applied"
              value={
                fixedPods.length
              }
              tone="Low"
              sub={
                fixedPods.length
                  ? `${fixesToday} today · ${successRate}% verified`
                  : "No fixes yet"
              }
              progress={
                fixedPods.length
                  ? successRate
                  : undefined
              }
              footer={
                lastFix ? (
                  <>
                    <span
                      style={{
                        fontWeight:
                          700,
                        color:
                          "#334155",
                        ...ellipsis,
                      }}
                      title={
                        lastFix.pod_name
                      }
                    >
                      {
                        lastFix.pod_name
                      }
                    </span>

                    {lastFix.time && (
                      <span
                        style={
                          ellipsis
                        }
                      >
                        {
                          lastFix.time
                        }
                      </span>
                    )}
                  </>
                ) : (
                  <span>
                    No fixes applied yet
                  </span>
                )
              }
            />
          </div>

          {/* STATUS DISTRIBUTION */}

          {pods.length > 0 && (
            <section
              className="panel"
              style={{
                marginBottom:
                  "20px",
                padding:
                  "18px 22px",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  marginBottom:
                    "12px",
                  flexWrap:
                    "wrap",
                  gap: "8px",
                }}
              >
                <strong
                  style={{
                    color:
                      "#0f172a",
                    fontSize:
                      "14px",
                  }}
                >
                  Status
                  distribution
                </strong>

                <span
                  style={{
                    color:
                      "#64748b",
                    fontSize:
                      "12px",
                  }}
                >
                  {pods.length}{" "}
                  pods
                </span>
              </div>

              <div
                style={{
                  display:
                    "flex",
                  height: "10px",
                  borderRadius:
                    "999px",
                  overflow:
                    "hidden",
                  background:
                    "#f1f5f9",
                }}
              >
                {Object.entries(
                  statusCounts
                ).map(
                  ([
                    status,
                    count,
                  ]) => {
                    const tone =
                      status ===
                        "Running" ||
                      status ===
                        "Succeeded"
                        ? TONE.Success
                        : TONE[
                            severityFor(
                              status
                            )
                          ];

                    return (
                      <div
                        key={
                          status
                        }
                        title={`${status}: ${count}`}
                        style={{
                          width: `${
                            (count /
                              pods.length) *
                            100
                          }%`,
                          background:
                            tone.fg,
                          transition:
                            "width 0.4s ease",
                        }}
                      />
                    );
                  }
                )}
              </div>

              <div
                style={{
                  display:
                    "flex",
                  flexWrap:
                    "wrap",
                  gap: "14px",
                  marginTop:
                    "12px",
                }}
              >
                {Object.entries(
                  statusCounts
                ).map(
                  ([
                    status,
                    count,
                  ]) => {
                    const tone =
                      status ===
                        "Running" ||
                      status ===
                        "Succeeded"
                        ? TONE.Success
                        : TONE[
                            severityFor(
                              status
                            )
                          ];

                    return (
                      <span
                        key={
                          status
                        }
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap: "6px",
                          fontSize:
                            "12px",
                          color:
                            "#475569",
                        }}
                      >
                        <i
                          style={{
                            width:
                              "8px",
                            height:
                              "8px",
                            borderRadius:
                              "50%",
                            background:
                              tone.fg,
                            display:
                              "inline-block",
                          }}
                        />

                        {status} ·{" "}
                        {count}
                      </span>
                    );
                  }
                )}
              </div>
            </section>
          )}

          {error && (
            <div
              className="error-message"
              style={{
                marginBottom:
                  "20px",
                display:
                  "flex",
                justifyContent:
                  "space-between",
                gap: "12px",
                alignItems:
                  "center",
              }}
            >
              <span>
                ✕ {error}
              </span>

              <button
                onClick={() =>
                  getPods()
                }
                style={
                  ghostButton
                }
              >
                Retry
              </button>
            </div>
          )}

          {/* POD TABLE */}

          <section className="panel pods-panel">
            <div className="panel-header">
              <div className="panel-title">
                <div className="panel-icon">
                  ◇
                </div>

                <div>
                  <h2>
                    Pods ({NAMESPACE})
                  </h2>

                  <p>
                    Live Kubernetes
                    workload health
                    overview
                  </p>
                </div>
              </div>

              <button
                className="refresh-button"
                onClick={() =>
                  getPods()
                }
                disabled={
                  loading
                }
              >
                {loading
                  ? "Refreshing..."
                  : "⟳ Refresh Cluster"}
              </button>
            </div>

            <div className="search-container">
              <input
                ref={searchRef}
                className="search-input"
                placeholder="⌕  Search pods...  (press / to focus)"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                gap: "12px",
                flexWrap:
                  "wrap",
                margin:
                  "14px 0",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  flexWrap:
                    "wrap",
                  gap: "8px",
                }}
              >
                {filterOptions.map(
                  (status) => {
                    const active =
                      statusFilter ===
                      status;

                    const count =
                      status ===
                      "All"
                        ? pods.length
                        : status ===
                          "Unhealthy"
                        ? unhealthyPods.length
                        : statusCounts[
                            status
                          ];

                    return (
                      <button
                        key={
                          status
                        }
                        onClick={() =>
                          setStatusFilter(
                            status
                          )
                        }
                        style={{
                          padding:
                            "7px 13px",
                          borderRadius:
                            "999px",
                          border:
                            active
                              ? "1px solid #2563eb"
                              : "1px solid #e2e8f0",
                          background:
                            active
                              ? "#eff6ff"
                              : "#ffffff",
                          color:
                            active
                              ? "#2563eb"
                              : "#475569",
                          fontSize:
                            "12px",
                          fontWeight:
                            700,
                          cursor:
                            "pointer",
                        }}
                      >
                        {status} ·{" "}
                        {count}
                      </button>
                    );
                  }
                )}
              </div>

              <label
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: "8px",
                  fontSize:
                    "12px",
                  color:
                    "#64748b",
                }}
              >
                Sort by

                <select
                  value={
                    sortBy
                  }
                  onChange={(e) =>
                    setSortBy(
                      e.target
                        .value
                    )
                  }
                  style={{
                    padding:
                      "6px 10px",
                    borderRadius:
                      "8px",
                    border:
                      "1px solid #cbd5e1",
                    background:
                      "#ffffff",
                  }}
                >
                  <option value="severity">
                    Severity
                  </option>

                  <option value="name">
                    Name
                  </option>
                </select>
              </label>
            </div>

            <div className="table-wrapper">
              <table className="pod-table">
                <thead>
                  <tr>
                    <th>
                      Name
                    </th>

                    <th>
                      Ready
                    </th>

                    <th>
                      Status
                    </th>

                    <th>
                      Severity
                    </th>

                    <th>
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPods.map(
                    (pod) => {
                      const bad =
                        isUnhealthy(
                          pod
                        );

                      const severity =
                        severityFor(
                          pod.status
                        );

                      return (
                        <tr
                          key={
                            pod.name
                          }
                        >
                          <td className="pod-name">
                            {
                              pod.name
                            }
                          </td>

                          <td>
                            {pod.ready ===
                              false ||
                            (pod.ready ===
                              undefined &&
                              bad)
                              ? "0/1"
                              : "1/1"}
                          </td>

                          <td>
                            <span
                              className={`status-badge ${
                                bad
                                  ? "status-failed"
                                  : "status-running"
                              }`}
                            >
                              <span className="status-dot" />

                              {
                                pod.status
                              }
                            </span>
                          </td>

                          <td>
                            {bad ? (
                              <Pill
                                tone={
                                  severity
                                }
                              >
                                {
                                  severity
                                }
                              </Pill>
                            ) : (
                              <Pill
                                tone="Success"
                              >
                                Healthy
                              </Pill>
                            )}
                          </td>

                          <td>
                            {bad ? (
                              <button
                                className="history-fixed"
                                onClick={() =>
                                  navigate(
                                    "/troubleshoot"
                                  )
                                }
                                style={{
                                  border:
                                    "none",
                                  background:
                                    "transparent",
                                  cursor:
                                    "pointer",
                                }}
                              >
                                Investigate
                                →
                              </button>
                            ) : (
                              <span
                                style={{
                                  color:
                                    "#16a34a",
                                  fontWeight:
                                    600,
                                }}
                              >
                                No action
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}

                  {loading && (
                    <tr>
                      <td
                        colSpan="5"
                        className="no-pods"
                      >
                        Checking
                        Kubernetes
                        workloads...
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filteredPods.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan="5"
                          className="no-pods"
                        >
                          {pods.length
                            ? "No pods match your filters."
                            : "No pods found"}{" "}

                          {pods.length >
                            0 && (
                            <button
                              onClick={() => {
                                setSearch(
                                  ""
                                );

                                setStatusFilter(
                                  "All"
                                );
                              }}
                              style={{
                                border:
                                  "none",
                                background:
                                  "none",
                                color:
                                  "#2563eb",
                                cursor:
                                  "pointer",
                                fontWeight:
                                  700,
                              }}
                            >
                              Clear filters
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;