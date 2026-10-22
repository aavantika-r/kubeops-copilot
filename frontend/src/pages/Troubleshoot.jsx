import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "../App.css";

const API = "http://127.0.0.1:8000";
const NAMESPACE = "minishop";
const HISTORY_KEY = "kubeops_fixed_pods";
const AUTO_REFRESH_MS = 10000;
const RCA_TTL_MS = 120000;

const FAILURE_META = {
  CrashLoopBackOff: { severity: "Critical", hint: "Container keeps crashing and restarting" },
  OOMKilled: { severity: "Critical", hint: "Container exceeded its memory limit" },
  ImagePullBackOff: { severity: "High", hint: "Image cannot be pulled from the registry" },
  InvalidImageName: { severity: "High", hint: "Image reference is malformed" },
  ErrImageNeverPull: { severity: "High", hint: "Pull policy is Never but image is missing on node" },
  ConfigurationError: { severity: "High", hint: "ConfigMap / Secret reference is invalid" },
  RunContainerError: { severity: "High", hint: "Container command cannot be executed" },
  InitContainerFailure: { severity: "High", hint: "Init container is failing" },
  LivenessProbeFailure: { severity: "High", hint: "Liveness probe keeps killing the container" },
  VolumeError: { severity: "High", hint: "Volume or PVC cannot be mounted" },
  ServiceUnavailable: { severity: "High", hint: "Service has no healthy endpoints" },
  ReadinessProbeFailure: { severity: "Medium", hint: "Pod is running but not Ready" },
  Pending: { severity: "Medium", hint: "Pod cannot be scheduled" },
  InsufficientResources: { severity: "Medium", hint: "No node has enough CPU / memory" },
  Evicted: { severity: "Medium", hint: "Pod was evicted from the node" },
  StuckTerminating: { severity: "Medium", hint: "Pod is stuck in Terminating" },
};

const STATUS_ALIAS = {
  ErrImagePull: "ImagePullBackOff",
  Error: "CrashLoopBackOff",
  ContainerCreating: "Pending",
  Terminating: "StuckTerminating",
  CreateContainerConfigError: "ConfigurationError",
  CreateContainerError: "ConfigurationError",
  NotReady: "ReadinessProbeFailure",
};

const metaFor = (status = "") => {
  const key = status.startsWith("Init:") ? "InitContainerFailure" : STATUS_ALIAS[status] || status;
  return FAILURE_META[key] || { severity: "Medium", hint: "Requires investigation" };
};

const FIX_META = {
  remove_command: { label: "Remove command override", icon: "⌫", risk: "Low" },
  image: { label: "Replace container image", icon: "▣", risk: "Medium" },
  pull_policy: { label: "Change image pull policy", icon: "⇩", risk: "Low" },
  memory: { label: "Increase memory limit", icon: "▤", risk: "Low" },
  resources: { label: "Reduce resource requests", icon: "▥", risk: "Medium" },
  readiness_probe: { label: "Remove readiness probe", icon: "◌", risk: "Medium" },
  liveness_probe: { label: "Remove liveness probe", icon: "♡", risk: "Medium" },
  scheduling: { label: "Relax scheduling rules", icon: "⊞", risk: "Medium" },
  rollback: { label: "Roll back deployment", icon: "↶", risk: "Medium" },
  delete_pod: { label: "Recreate pod", icon: "⟳", risk: "Low" },
  service_repair: { label: "Repair Service", icon: "⇄", risk: "Medium" },
  service_restart: { label: "Restart workload", icon: "↻", risk: "Low" },
  restart: { label: "Restart workload", icon: "↻", risk: "Low" },
  manual: { label: "Manual action required", icon: "✋", risk: "None" },
};

const fixMetaFor = (type) =>
  FIX_META[type] || { label: type || "Controlled fix", icon: "🔧", risk: "Medium" };

const TONE = {
  Critical: { bg: "#fff1f2", fg: "#dc2626", border: "#fecaca" },
  High: { bg: "#fff7ed", fg: "#ea580c", border: "#fed7aa" },
  Medium: { bg: "#fffbeb", fg: "#d97706", border: "#fde68a" },
  Low: { bg: "#eff6ff", fg: "#2563eb", border: "#bfdbfe" },
  None: { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0" },
  Success: { bg: "#f0fdf4", fg: "#166534", border: "#bbf7d0" },
};

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const toneFromText = (text = "") => {
  const t = text.toLowerCase();
  if (t.includes("critical")) return "Critical";
  if (t.includes("high")) return "High";
  if (t.includes("medium") || t.includes("moderate")) return "Medium";
  if (t.includes("low")) return "Low";
  return "Medium";
};

const isUnhealthy = (pod) =>
  (pod.status !== "Running" && pod.status !== "Succeeded") || pod.ready === false;

const fmt = (value) => {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const readHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) throw new Error(data.detail || data.error || `Request failed (${response.status})`);
  if (data.success === false) throw new Error(data.error || data.message || "Request failed");

  return data;
};

const downloadText = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const RCA_HEADINGS = ["Root Cause", "Why it happened", "Impact", "Severity", "Recommended Solution"];

const RCA_ICON = {
  "Root Cause": "🎯",
  "Why it happened": "🔎",
  Impact: "📉",
  Severity: "🚨",
  "Recommended Solution": "💡",
};

const parseRca = (text) => {
  if (!text) return [];

  const headingRegex = new RegExp(
    `^\\s*[#>*\\-\\d.\\s]*(${RCA_HEADINGS.join("|")})\\s*:\\s*(.*)$`,
    "i"
  );

  const sections = [];
  let current = null;

  text.split("\n").forEach((line) => {
    const match = line.match(headingRegex);

    if (match) {
      const title = RCA_HEADINGS.find((h) => h.toLowerCase() === match[1].toLowerCase());
      current = { title, body: match[2].trim() };
      sections.push(current);
    } else if (current && line.trim()) {
      current.body += (current.body ? "\n" : "") + line.trim();
    }
  });

  if (sections.length === 0 && text.trim()) return [{ title: "Analysis", body: text.trim() }];

  return sections;
};

const buildChanges = (p) => {
  if (!p) return [];

  const rows = [];

  if (p.new_image) rows.push(["Container image", fmt(p.current_image) || "Not available", p.new_image]);

  if (p.new_image_pull_policy) {
    rows.push(["Image pull policy", fmt(p.current_image_pull_policy) || "Default", p.new_image_pull_policy]);
  }

  if (p.fix_type === "remove_command") {
    rows.push([
      "Container command",
      fmt(p.current_command) || "Custom command",
      fmt(p.new_command) || "Image default command",
    ]);
  }

  if (p.new_memory) rows.push(["Memory limit", fmt(p.current_memory) || "Not configured", p.new_memory]);

  if (p.fix_type === "resources") {
    rows.push(["Resource requests", fmt(p.current_requests) || "Configured", "cpu 50m · memory 64Mi"]);
  }

  if (p.fix_type === "readiness_probe" || p.fix_type === "liveness_probe") {
    rows.push(["Probe", fmt(p.current_probe) || "Configured", fmt(p.new_probe) || "Removed"]);
  }

  if (p.fix_type === "scheduling") {
    rows.push(["Scheduling rules", "nodeSelector / affinity / tolerations", "Removed"]);
  }

  if (p.fix_type === "rollback") {
    rows.push(["Deployment revision", "Current (failing)", "Previous working revision"]);
  }

  if (p.fix_type === "delete_pod") {
    rows.push(["Pod", p.pod_name, p.force ? "Force deleted, then recreated" : "Deleted, then recreated"]);
  }

  if (p.fix_type === "service_repair") {
    rows.push(["Service", p.service || "—", "Selector and targetPort match the Deployment"]);
  } else if (p.service) {
    rows.push(["Service", p.service, "Restart workload"]);
  }

  return rows;
};

// Describes the exact Deployment manifest field(s) an auto-fix touches,
// as diff lines: "-" removed, "+" added, " " unchanged.
const YAML_BASE = "spec.template.spec.containers[0]";

const shorten = (text, max = 90) => (text.length > max ? `${text.slice(0, max)}…` : text);

const buildCodeDiff = (p) => {
  if (!p) return [];

  const blocks = [];
  const add = (path, lines) => blocks.push({ path, lines });

  if (p.new_image) {
    add(`${YAML_BASE}.image`, [
      { type: "-", text: `image: ${fmt(p.current_image) || "(not set)"}` },
      { type: "+", text: `image: ${p.new_image}` },
    ]);
  }

  if (p.new_image_pull_policy) {
    const before = fmt(p.current_image_pull_policy) || "default";
    const same = before === p.new_image_pull_policy;

    add(
      `${YAML_BASE}.imagePullPolicy`,
      same
        ? [{ type: " ", text: `imagePullPolicy: ${before}   # unchanged` }]
        : [
            { type: "-", text: `imagePullPolicy: ${before}` },
            { type: "+", text: `imagePullPolicy: ${p.new_image_pull_policy}` },
          ]
    );
  }

  if (p.fix_type === "remove_command") {
    add(`${YAML_BASE}.command / .args`, [
      { type: "-", text: shorten(`command: ${fmt(p.current_command) || "(custom command)"}`) },
      { type: " ", text: "# image default command is used instead" },
    ]);
  }

  if (p.new_memory) {
    add(`${YAML_BASE}.resources.limits.memory`, [
      { type: "-", text: `memory: ${fmt(p.current_memory) || "(not set)"}` },
      { type: "+", text: `memory: ${p.new_memory}` },
    ]);
  }

  if (p.fix_type === "resources") {
    add(`${YAML_BASE}.resources.requests`, [
      { type: "-", text: shorten(`requests: ${fmt(p.current_requests) || "(configured)"}`) },
      { type: "+", text: "requests: cpu 50m, memory 64Mi" },
    ]);
  }

  if (p.fix_type === "readiness_probe" || p.fix_type === "liveness_probe") {
    const key = p.fix_type === "readiness_probe" ? "readinessProbe" : "livenessProbe";
    add(`${YAML_BASE}.${key}`, [{ type: "-", text: shorten(`${key}: ${fmt(p.current_probe) || "(configured)"}`) }]);
  }

  if (p.fix_type === "scheduling") {
    add("spec.template.spec", [
      { type: "-", text: "nodeSelector: …" },
      { type: "-", text: "affinity: …" },
      { type: "-", text: "tolerations: …" },
    ]);
  }

  if (p.fix_type === "restart" || p.fix_type === "service_restart") {
    add("spec.template.metadata.annotations", [
      { type: "+", text: "kubectl.kubernetes.io/restartedAt: <timestamp when applied>" },
    ]);
  }

  return blocks;
};

const buildCommands = (pod, deployment) =>
  [
    ["Describe pod", `kubectl describe pod ${pod} -n ${NAMESPACE}`],
    ["Current logs", `kubectl logs ${pod} -n ${NAMESPACE} --tail=100`],
    ["Previous container logs", `kubectl logs ${pod} -n ${NAMESPACE} --previous --tail=100`],
    ["Recent events", `kubectl get events -n ${NAMESPACE} --sort-by=.lastTimestamp`],
    deployment && ["Rollout status", `kubectl rollout status deployment/${deployment} -n ${NAMESPACE}`],
    deployment && ["Rollout history", `kubectl rollout history deployment/${deployment} -n ${NAMESPACE}`],
  ].filter(Boolean);

const buildReport = ({ pod, status, failureType, severity, sections, proposal, changes, fix }) => {
  const lines = [
    `# Incident report: ${pod}`,
    "",
    `- **Time:** ${new Date().toLocaleString()}`,
    `- **Namespace:** ${NAMESPACE}`,
    `- **Pod status:** ${status}`,
    `- **Failure type:** ${failureType}`,
    `- **Severity:** ${severity}`,
    "",
  ];

  sections.forEach((s) => lines.push(`## ${s.title}`, s.body, ""));

  if (proposal && !proposal.error) {
    lines.push("## Proposed remediation", `- **Action:** ${fix.label}`, `- **Risk:** ${fix.risk}`);
    changes.forEach(([label, from, to]) => lines.push(`- **${label}:** \`${from}\` → \`${to}\``));
    if (proposal.recommended_fix) lines.push("", proposal.recommended_fix);
  }

  return lines.join("\n");
};

function useElapsed(running) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!running) {
      setSeconds(0);
      return undefined;
    }

    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return seconds;
}

function Pill({ tone = "None", children, style }) {
  const t = TONE[tone] || TONE.None;

  return (
    <span
      style={{
        padding: "6px 11px",
        borderRadius: "999px",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontSize: "12px",
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

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

function ChangeRow({ label, from, to }) {
  return (
    <div className="change-box">
      <span className="fix-label">{label}</span>

      <div className="change-row">
        <div>
          <small>Current</small>
          <code>{from}</code>
        </div>

        <span className="arrow">→</span>

        <div>
          <small>Proposed</small>
          <code className="proposed">{to}</code>
        </div>
      </div>
    </div>
  );
}

function WorkflowStepper({ steps }) {
  return (
    <div className="panel" style={{ marginBottom: "22px", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {steps.map((step, index) => {
          const done = step.state === "done";
          const active = step.state === "active";

          return (
            <div
              key={step.name}
              style={{ display: "flex", alignItems: "center", flex: index < steps.length - 1 ? 1 : "unset" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                <span
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: done ? "#dcfce7" : active ? "#dbeafe" : "#f1f5f9",
                    color: done ? "#16a34a" : active ? "#2563eb" : "#94a3b8",
                    fontWeight: 800,
                    fontSize: "12px",
                  }}
                >
                  {done ? "✓" : index + 1}
                </span>

                <span style={{ color: done || active ? "#334155" : "#94a3b8", fontSize: "12px", fontWeight: 700 }}>
                  {step.name}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div style={{ height: "1px", background: done ? "#86efac" : "#e2e8f0", flex: 1, margin: "0 12px" }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Toasts({ toasts }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: "20px",
        bottom: "20px",
        display: "grid",
        gap: "8px",
        zIndex: 1100,
      }}
    >
      {toasts.map((toast) => {
        const tone = toast.type === "success" ? TONE.Success : toast.type === "error" ? TONE.Critical : TONE.None;

        return (
          <div
            key={toast.id}
            style={{
              padding: "11px 16px",
              borderRadius: "10px",
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
              fontSize: "13px",
              fontWeight: 600,
              boxShadow: "0 10px 25px rgba(15,23,42,0.12)",
            }}
          >
            {toast.message}
          </div>
        );
      })}
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
        <div className="sidebar-brand-icon">◇</div>
        <div>
          <h1>KubeOps</h1>
          <p>AI-Powered K8s Copilot</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map(([path, icon, label]) => (
          <button
            key={path}
            className={`nav-item ${path === "/troubleshoot" ? "active" : ""}`}
            onClick={() => navigate(path)}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p className="connection-title">Connected to</p>

        <div className="connection-status">
          <span className="connection-dot" />
          <span>{NAMESPACE} cluster</span>
        </div>

        <div className="sidebar-version">v1.0.0 | KubeOps v1.0</div>
      </div>
    </aside>
  );
}

function Header({ navigate, user, unhealthyCount }) {
  const [profileOpen, setProfileOpen] = useState(false);

  const userName = user?.user_metadata?.name || user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="top-header">
      <div className="top-brand">
        <div className="top-brand-icon">◇</div>

        <div>
          <h1>Kubernetes Troubleshooting</h1>
          <p>Detect, diagnose and safely remediate Kubernetes failures</p>
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
          <small>Cluster ID: docker-desktop</small>
        </div>

        <button className="notification-button" aria-label={`${unhealthyCount} pods need attention`}>
          ♧
          <b>{unhealthyCount}</b>
        </button>

        <div className="profile-wrapper">
          <button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}>
            <span className="profile-avatar">{userInitial}</span>
            <span>{userName}</span>
            <span>▾</span>
          </button>

          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-menu-user">
                <div className="profile-avatar large">{userInitial}</div>

                <div>
                  <strong>{userName}</strong>
                  <small>{userEmail}</small>
                  <em>Administrator</em>
                </div>
              </div>

              <button onClick={() => navigate("/profile")}>
                <span>♙</span>
                Profile
              </button>

              <button onClick={() => navigate("/settings")}>
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

const DIFF_STYLE = {
  "-": { bg: "#fef2f2", fg: "#b91c1c" },
  "+": { bg: "#f0fdf4", fg: "#166534" },
  " ": { bg: "transparent", fg: "#64748b" },
};

function CodeDiff({ blocks }) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div style={{ marginBottom: "18px" }}>
      <strong style={{ display: "block", marginBottom: "8px", color: "#0f172a", fontSize: "12px" }}>
        Code change (Deployment manifest)
      </strong>

      <div style={{ display: "grid", gap: "8px" }}>
        {blocks.map((block) => (
          <div key={block.path} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div
              style={{
                padding: "6px 12px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                color: "#475569",
                fontFamily: "monospace",
                fontSize: "11px",
              }}
            >
              {block.path}
            </div>

            {block.lines.map((line, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: "10px",
                  padding: "4px 12px",
                  background: DIFF_STYLE[line.type].bg,
                  color: DIFF_STYLE[line.type].fg,
                  fontFamily: "monospace",
                  fontSize: "12px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                <span style={{ userSelect: "none" }}>{line.type}</span>
                <span>{line.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmModal({ pod, proposal, changes, onCancel, onConfirm }) {
  const [acknowledged, setAcknowledged] = useState(false);

  const fix = fixMetaFor(proposal.fix_type);
  const riskTone = fix.risk === "Medium" ? "Medium" : fix.risk === "Low" ? "Low" : "None";
  const needsAck = fix.risk !== "Low";
  const blocked = needsAck && !acknowledged;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm auto-fix"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: "18px",
          padding: "26px",
          boxShadow: "0 25px 60px rgba(15,23,42,0.3)",
        }}
      >
        <h2 style={{ margin: "0 0 6px", color: "#0f172a" }}>Apply this fix?</h2>

        <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: "13px" }}>
          This changes the live Deployment behind <strong>{pod}</strong> in the {NAMESPACE} namespace.
        </p>

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <Pill tone="Low">
            {fix.icon} {fix.label}
          </Pill>
          <Pill tone={riskTone}>Risk: {fix.risk}</Pill>
        </div>

        <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
          {changes.length === 0 && (
            <p style={{ margin: 0, color: "#475569", fontSize: "13px" }}>{proposal.recommended_fix}</p>
          )}

          {changes.map(([label, from, to]) => (
            <div
              key={label}
              style={{ padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: "10px", fontSize: "12px" }}
            >
              <strong style={{ display: "block", marginBottom: "6px", color: "#0f172a" }}>{label}</strong>
              <code>{from}</code>
              <span style={{ margin: "0 8px" }}>→</span>
              <code className="proposed">{to}</code>
            </div>
          ))}
        </div>

        <CodeDiff blocks={buildCodeDiff(proposal)} />

        {needsAck && (
          <label
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
              padding: "12px 14px",
              marginBottom: "18px",
              borderRadius: "10px",
              background: TONE.Medium.bg,
              border: `1px solid ${TONE.Medium.border}`,
              fontSize: "12px",
              color: "#92400e",
              cursor: "pointer",
            }}
          >
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            <span>I reviewed the change above and understand it modifies the running workload.</span>
          </label>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "11px 18px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Cancel
          </button>

          <button
            className="apply-fix-button"
            disabled={blocked}
            style={{
              width: "auto",
              padding: "11px 20px",
              opacity: blocked ? 0.5 : 1,
              cursor: blocked ? "not-allowed" : "pointer",
            }}
            onClick={onConfirm}
          >
            Apply fix
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, onDismiss }) {
  const manual = result.manual;
  const fixed = result.status === "Fixed";
  const tone = manual ? TONE.High : fixed ? TONE.Success : TONE.Medium;

  const stats = [
    ["Replicas", result.replicas ?? 0],
    ["Ready", result.ready_replicas ?? 0],
    ["Available", result.available_replicas ?? 0],
    ["Healthy pods", result.healthy_pods ?? 0],
    ["Service endpoints", result.service_endpoints ?? 0],
  ];

  const unhealthy = result.unhealthy_pods || [];

  return (
    <section
      className="panel"
      style={{ marginBottom: "22px", border: `1px solid ${tone.border}`, background: tone.bg }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <span style={{ color: tone.fg, fontWeight: 800, fontSize: "12px" }}>
            {manual ? "MANUAL ACTION REQUIRED" : fixed ? "RECOVERY VERIFIED" : "FIX APPLIED · RECOVERY PENDING"}
          </span>

          <h3 style={{ margin: "6px 0", color: "#0f172a" }}>{result.pod_name}</h3>

          <p style={{ margin: 0, color: "#475569", fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {result.message}
          </p>
        </div>

        <button
          onClick={onDismiss}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            fontSize: "22px",
            cursor: "pointer",
            color: "#64748b",
          }}
          aria-label="Dismiss result"
        >
          ×
        </button>
      </div>

      {!manual && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))",
            gap: "10px",
            marginTop: "16px",
          }}
        >
          {stats.map(([label, value]) => (
            <div
              key={label}
              style={{ padding: "12px 14px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px" }}
            >
              <small style={{ color: "#64748b" }}>{label}</small>
              <strong style={{ display: "block", marginTop: "4px", fontSize: "20px" }}>{value}</strong>
            </div>
          ))}
        </div>
      )}

      {unhealthy.length > 0 && (
        <div style={{ marginTop: "14px", fontSize: "12px", color: "#92400e" }}>
          <strong>Still unhealthy:</strong>{" "}
          {unhealthy.map((p) => `${p.name} (${(p.reasons || []).join(", ") || p.phase})`).join(" · ")}
        </div>
      )}
    </section>
  );
}

function CommandList({ commands, onCopy }) {
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      {commands.map(([label, command]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            padding: "12px 14px",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            background: "#ffffff",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <small style={{ color: "#64748b" }}>{label}</small>
            <code style={{ display: "block", marginTop: "4px", overflowWrap: "anywhere", fontSize: "12px" }}>
              {command}
            </code>
          </div>

          <button onClick={() => onCopy(command, `${label} command copied`)} style={ghostButton}>
            Copy
          </button>
        </div>
      ))}
    </div>
  );
}

function Troubleshoot() {
  const navigate = useNavigate();

  const [pods, setPods] = useState([]);
  const [user, setUser] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [selectedPod, setSelectedPod] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [rca, setRca] = useState("");
  const [rcaError, setRcaError] = useState("");
  const [proposal, setProposal] = useState(null);

  const [loading, setLoading] = useState(true);
  const [rcaLoading, setRcaLoading] = useState(false);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [fixing, setFixing] = useState(false);

  const [error, setError] = useState("");
  const [fixError, setFixError] = useState("");
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [, setHistory] = useState(readHistory);
  const [toasts, setToasts] = useState([]);

  const controller = useRef(null);
  const rcaCache = useRef(new Map());
  const searchRef = useRef(null);

  const elapsed = useElapsed(fixing);

  const notify = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const copy = useCallback(
    async (text, message = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        notify(message, "success");
      } catch {
        notify("Clipboard is not available in this browser", "error");
      }
    },
    [notify]
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const getPods = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      const data = await fetchJson(`${API}/pods`);
      setPods(Array.isArray(data) ? data : []);
      setError("");
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Pod fetch error:", err);
      setError("Unable to connect to KubeOps backend. Check that it is running on port 8000.");
      if (!silent) setPods([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getPods();
  }, [getPods]);

  useEffect(() => {
    if (!autoRefresh || fixing) return undefined;

    const timer = setInterval(() => getPods(true), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, fixing, getPods]);

  const unhealthyPods = useMemo(() => pods.filter(isUnhealthy), [pods]);

  useEffect(() => {
    document.title = unhealthyPods.length ? `(${unhealthyPods.length}) KubeOps` : "KubeOps";
  }, [unhealthyPods.length]);

  const filteredPods = useMemo(() => {
    const query = search.trim().toLowerCase();

    return unhealthyPods
      .filter((pod) => !query || pod.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const sa = SEVERITY_ORDER[metaFor(a.status).severity] ?? 9;
        const sb = SEVERITY_ORDER[metaFor(b.status).severity] ?? 9;
        return sa - sb || a.name.localeCompare(b.name);
      });
  }, [unhealthyPods, search]);

  const loadRca = async (name, ctrl, force = false) => {
    const cached = rcaCache.current.get(name);

    if (!force && cached && Date.now() - cached.at < RCA_TTL_MS) {
      setRca(cached.text);
      setRcaError("");
      return;
    }

    setRcaLoading(true);
    setRcaError("");

    try {
      const data = await fetchJson(`${API}/rca/${encodeURIComponent(name)}`, { signal: ctrl.signal });
      const text = (data.rca || "").replaceAll("**", "").trim();
      rcaCache.current.set(name, { text, at: Date.now() });
      setRca(text);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("RCA error:", err);
      setRcaError(err.message || "Unable to generate AI Root Cause Analysis.");
    } finally {
      if (!ctrl.signal.aborted) setRcaLoading(false);
    }
  };

  const loadProposal = async (name, ctrl) => {
    setProposalLoading(true);

    try {
      const data = await fetchJson(`${API}/auto-fix/${encodeURIComponent(name)}`, { signal: ctrl.signal });
      setProposal(data.proposal || null);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Auto-Fix proposal error:", err);
      setProposal({ error: err.message });
    } finally {
      if (!ctrl.signal.aborted) setProposalLoading(false);
    }
  };

  const selectPod = async (pod, { force = false } = {}) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;

    setSelectedPod(pod.name);
    setSelectedStatus(pod.status);
    setRca("");
    setRcaError("");
    setProposal(null);
    setFixError("");
    setError("");

    if (!isUnhealthy(pod)) return;

    await Promise.all([loadRca(pod.name, ctrl, force), loadProposal(pod.name, ctrl)]);
  };

  const clearSelection = useCallback(() => {
    controller.current?.abort();
    setSelectedPod("");
    setSelectedStatus("");
    setProposal(null);
    setRca("");
    setRcaError("");
    setRcaLoading(false);
    setProposalLoading(false);
  }, []);

  const reinvestigate = () => {
    const pod = pods.find((p) => p.name === selectedPod);
    if (pod) selectPod(pod, { force: true });
  };

  const applyFix = async () => {
    setConfirmOpen(false);

    if (!selectedPod || !proposal || proposal.error) return;

    setFixing(true);
    setFixError("");
    setResult(null);

    try {
      const data = await fetchJson(`${API}/apply-fix/${encodeURIComponent(selectedPod)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const fixResult = data.result || data;
      const finalStatus = fixResult.status || "Fixed";

      if (finalStatus === "Manual Action Required") {
        setResult({ ...fixResult, pod_name: selectedPod, manual: true });
        return;
      }

      const failureType = fixResult.failure_type || proposal.failure_type || selectedStatus;
      const fixType = fixResult.fix_type || proposal.fix_type || "Remediation";

      const historyItem = {
        id: Date.now(),
        pod_name: selectedPod,
        status: finalStatus,
        failure_type: failureType,
        fix_type: fixType,
        severity: metaFor(failureType).severity,
        risk: fixMetaFor(fixType).risk,
        problem: fixResult.problem || proposal.problem || "",
        recommended_fix: fixResult.recommended_fix || proposal.recommended_fix || "",
        old_image: fixResult.old_image || proposal.current_image || "",
        new_image: fixResult.new_image || proposal.new_image || "",
        old_policy: fixResult.old_image_pull_policy || proposal.current_image_pull_policy || "",
        new_policy: fixResult.new_image_pull_policy || proposal.new_image_pull_policy || "",
        old_memory: fixResult.old_memory || proposal.current_memory || "",
        new_memory: fixResult.new_memory || proposal.new_memory || "",
        current_command: fixResult.current_command || proposal.current_command || "",
        new_command: fixResult.new_command || proposal.new_command || "",
        service: fixResult.service || proposal.service || "",
        replicas: fixResult.replicas ?? 0,
        ready_replicas: fixResult.ready_replicas ?? 0,
        available_replicas: fixResult.available_replicas ?? 0,
        healthy_pods: fixResult.healthy_pods ?? 0,
        service_endpoints: fixResult.service_endpoints ?? 0,
        time: new Date().toLocaleString(),
      };

      const next = [historyItem, ...readHistory()].slice(0, 200);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      setHistory(next);

      rcaCache.current.delete(selectedPod);
      setResult({ ...fixResult, pod_name: selectedPod, status: finalStatus });

      if (finalStatus === "Fixed") {
        notify(`${selectedPod} recovered`, "success");
      } else {
        notify(`Fix applied, recovery still pending`, "info");
      }

      clearSelection();
      await getPods(true);
    } catch (err) {
      console.error("Auto-Fix error:", err);
      setFixError(err.message || "Unknown error");
    } finally {
      setFixing(false);
    }
  };

  const rcaSections = useMemo(() => parseRca(rca), [rca]);

  const failureType = proposal?.failure_type || selectedStatus || "Kubernetes Failure";
  const failureMeta = metaFor(failureType);

  const rcaSeverity = rcaSections.find((s) => s.title === "Severity")?.body;
  const severityTone = rcaSeverity ? toneFromText(rcaSeverity) : failureMeta.severity;

  const fix = fixMetaFor(proposal?.fix_type);
  const isManual = proposal?.fix_type === "manual";
  const changes = useMemo(() => buildChanges(proposal), [proposal]);

  const commands = useMemo(
    () => (selectedPod ? buildCommands(selectedPod, proposal?.deployment) : []),
    [selectedPod, proposal?.deployment]
  );

  const selectedGone = Boolean(selectedPod) && !loading && !fixing && !pods.some((p) => p.name === selectedPod);

  const report = () =>
    buildReport({
      pod: selectedPod,
      status: selectedStatus,
      failureType,
      severity: severityTone,
      sections: rcaSections,
      proposal,
      changes,
      fix,
    });

  const workflowSteps = [
    { name: "Detect", state: "done" },
    { name: "Diagnose", state: rcaLoading ? "active" : rca ? "done" : "pending" },
    { name: "Review", state: proposalLoading ? "active" : proposal && !proposal.error ? "done" : "pending" },
    { name: "Apply", state: fixing ? "active" : result ? "done" : "pending" },
    { name: "Verify", state: fixing ? "active" : result && !result.manual ? "done" : "pending" },
  ];

  useEffect(() => {
    const onKey = (e) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);

      if (e.key === "Escape") {
        if (confirmOpen) setConfirmOpen(false);
        else if (typing) e.target.blur();
        else if (selectedPod) clearSelection();
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey || confirmOpen) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "r") {
        getPods();
      } else if (e.key === "j" || e.key === "k") {
        if (!filteredPods.length) return;
        const index = filteredPods.findIndex((p) => p.name === selectedPod);
        const step = e.key === "j" ? 1 : -1;
        const next = filteredPods[(index + step + filteredPods.length) % filteredPods.length];
        selectPod(next);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="app-shell">
      <Sidebar navigate={navigate} />

      <main className="dashboard-main">
        <Header navigate={navigate} user={user} unhealthyCount={unhealthyPods.length} />

        <div className="dashboard" style={{ paddingBottom: "60px" }}>
          <section className="panel" style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#eef4ff",
                    color: "#2563eb",
                    fontSize: "20px",
                  }}
                >
                  🔍
                </span>

                <div>
                  <h2 style={{ margin: 0 }}>Incident Troubleshooter</h2>
                  <p style={{ margin: "5px 0 0", color: "#64748b" }}>
                    AI-assisted Kubernetes diagnosis and controlled remediation
                    {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "#475569",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
                  Auto-refresh (10s)
                </label>

                <button className="refresh-button" onClick={() => getPods()} disabled={loading}>
                  {loading ? "Refreshing..." : "⟳ Refresh Cluster"}
                </button>
              </div>
            </div>
          </section>

          {result && <ResultCard result={result} onDismiss={() => setResult(null)} />}

          <section className="panel" style={{ marginBottom: "20px" }}>
            <div className="panel-header">
              <div className="panel-title">
                <div className="panel-icon">⚠</div>

                <div>
                  <h2>Pods Requiring Attention</h2>
                  <p>Select an unhealthy workload to start automated diagnosis</p>
                </div>
              </div>

              <span className="history-count">
                {filteredPods.length} {filteredPods.length === 1 ? "Pod" : "Pods"}
              </span>
            </div>

            <div className="search-container" style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "18px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "18px",
                  pointerEvents: "none",
                }}
              >
                🔍
              </span>

              <input
                ref={searchRef}
                className="search-input"
                type="text"
                placeholder="Search unhealthy pod..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: "48px" }}
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  style={{
                    position: "absolute",
                    right: "18px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "20px",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </section>

          {error && (
            <div
              className="error-message"
              style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}
            >
              <span>✕ {error}</span>
              <button onClick={() => getPods()} style={ghostButton}>
                Retry
              </button>
            </div>
          )}

          {loading && (
            <section className="panel">
              <div className="loading-state">
                <div className="spinner" />
                Checking Kubernetes workloads...
              </div>
            </section>
          )}

          {!loading && filteredPods.length > 0 && (
            <section className="panel" style={{ marginBottom: "24px" }}>
              <div style={{ display: "grid", gap: "10px" }}>
                {filteredPods.map((pod) => {
                  const selected = selectedPod === pod.name;
                  const meta = metaFor(pod.status);
                  const tone = TONE[meta.severity];

                  return (
                    <button
                      key={pod.name}
                      onClick={() => selectPod(pod)}
                      style={{
                        width: "100%",
                        border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                        background: selected ? "#f5f9ff" : "#ffffff",
                        borderRadius: "14px",
                        padding: "16px 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "20px",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <div
                          style={{
                            width: "42px",
                            height: "42px",
                            borderRadius: "12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: tone.bg,
                            color: tone.fg,
                            fontSize: "19px",
                            fontWeight: 800,
                          }}
                        >
                          !
                        </div>

                        <div>
                          <strong style={{ display: "block", color: "#0f172a", fontSize: "14px" }}>{pod.name}</strong>

                          <span style={{ display: "block", marginTop: "4px", color: "#64748b", fontSize: "12px" }}>
                            {meta.hint}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <Pill tone={meta.severity}>{meta.severity}</Pill>
                        <Pill tone={meta.severity}>● {pod.status}</Pill>
                        <span style={{ color: "#2563eb", fontSize: "13px", fontWeight: 700 }}>Investigate →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {!loading && unhealthyPods.length > 0 && filteredPods.length === 0 && (
            <section className="panel" style={{ marginBottom: "24px" }}>
              <p style={{ margin: 0, color: "#64748b" }}>
                No pods match your search.{" "}
                <button
                  onClick={() => setSearch("")}
                  style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontWeight: 700 }}
                >
                  Clear search
                </button>
              </p>
            </section>
          )}

          {!loading && !error && unhealthyPods.length === 0 && (
            <section className="panel" style={{ marginBottom: "24px" }}>
              <div className="healthy-state">
                <div className="healthy-icon">✓</div>

                <div>
                  <h3>No Unhealthy Pods</h3>
                  <p>All Kubernetes Pods are currently running normally.</p>
                </div>
              </div>
            </section>
          )}

          {selectedPod && (
            <>
              {selectedGone && (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    background: TONE.Medium.bg,
                    border: `1px solid ${TONE.Medium.border}`,
                    color: "#92400e",
                    fontSize: "13px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <span>This pod is no longer in the cluster. It may have recovered or been recreated.</span>
                  <button onClick={clearSelection} style={ghostButton}>
                    Close incident
                  </button>
                </div>
              )}

              <section
                className="panel"
                style={{
                  marginBottom: "22px",
                  padding: "22px",
                  border: `1px solid ${TONE[severityTone].border}`,
                  background: TONE[severityTone].bg,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "20px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <span style={{ color: TONE[severityTone].fg, fontSize: "11px", fontWeight: 800 }}>
                      INCIDENT DETECTED
                    </span>

                    <h2 style={{ margin: "6px 0", color: "#0f172a" }}>{selectedPod}</h2>

                    <p style={{ margin: 0, color: "#64748b" }}>{failureMeta.hint}</p>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <Pill tone={severityTone}>{selectedStatus}</Pill>
                    <Pill tone="Low">{failureType}</Pill>
                    <Pill tone={severityTone}>Severity: {severityTone}</Pill>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
                  <button style={ghostButton} onClick={() => copy(report(), "Incident report copied")}>
                    Copy report
                  </button>
                  <button
                    style={ghostButton}
                    onClick={() => downloadText(`incident-${selectedPod}.md`, report())}
                  >
                    Download .md
                  </button>
                  <button style={ghostButton} onClick={reinvestigate} disabled={rcaLoading || proposalLoading}>
                    Re-run analysis
                  </button>
                  <button style={ghostButton} onClick={clearSelection}>
                    Close
                  </button>
                </div>
              </section>

              <WorkflowStepper steps={workflowSteps} />

              <div className="troubleshooting-grid">
                <div
                  className="rca-panel"
                  style={{
                    border: "1px solid #dbeafe",
                    borderRadius: "16px",
                    background: "#f8fbff",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "22px", borderBottom: "1px solid #dbeafe", background: "#f3f8ff" }}>
                    <div className="section-heading">
                      <span className="section-icon">🤖</span>

                      <div>
                        <h3>AI Root Cause Analysis</h3>
                        <p>Groq-powered Kubernetes diagnosis</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "16px" }}>
                    {rcaLoading && (
                      <div className="loading-state" style={{ minHeight: "280px" }}>
                        <div className="spinner" />
                        <span>Analyzing Pod status, events, logs and configuration...</span>
                      </div>
                    )}

                    {!rcaLoading && rcaError && (
                      <div className="error-state">
                        <strong>Unable to generate analysis</strong>
                        <p>{rcaError}</p>
                        <button style={ghostButton} onClick={() => loadRca(selectedPod, controller.current, true)}>
                          Try again
                        </button>
                      </div>
                    )}

                    {!rcaLoading && !rcaError && rcaSections.length > 0 && (
                      <div style={{ display: "grid", gap: "12px" }}>
                        {rcaSections.map((section) => (
                          <div
                            key={section.title}
                            style={{
                              padding: "17px",
                              border: "1px solid #dbeafe",
                              borderRadius: "12px",
                              background: "#ffffff",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "9px" }}>
                              <span>{RCA_ICON[section.title] || "◈"}</span>

                              <h4 style={{ margin: 0, color: "#2563eb", fontSize: "13px" }}>{section.title}</h4>
                            </div>

                            <p
                              style={{
                                margin: 0,
                                color: "#475569",
                                fontSize: "13px",
                                lineHeight: 1.7,
                                whiteSpace: "pre-line",
                              }}
                            >
                              {section.body || "Evidence was collected for this section."}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!rcaLoading && !rcaError && !rca && (
                      <div className="empty-state">
                        <div className="empty-icon">🤖</div>
                        <h3>Waiting for Analysis</h3>
                        <p>KubeOps is collecting Kubernetes evidence.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="fix-panel"
                  style={{
                    border: "1px solid #fed7aa",
                    borderRadius: "16px",
                    background: "#fffaf5",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "22px", borderBottom: "1px solid #fed7aa", background: "#fff7ed" }}>
                    <div className="section-heading">
                      <span className="section-icon">🔧</span>

                      <div>
                        <h3>Auto-Fix Recommendation</h3>
                        <p>Controlled Kubernetes remediation</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: "16px" }}>
                    {proposalLoading && (
                      <div className="loading-state" style={{ minHeight: "280px" }}>
                        <div className="spinner" />
                        <span>Preparing safe remediation...</span>
                      </div>
                    )}

                    {!proposalLoading && proposal?.error && (
                      <div className="error-state">
                        <strong>Unable to prepare fix</strong>
                        <p>{proposal.error}</p>
                        <button style={ghostButton} onClick={() => loadProposal(selectedPod, controller.current)}>
                          Try again
                        </button>
                      </div>
                    )}

                    {!proposalLoading && proposal && !proposal.error && (
                      <div style={{ display: "grid", gap: "13px" }}>
                        <div
                          style={{
                            padding: "17px",
                            border: "1px solid #fed7aa",
                            borderRadius: "12px",
                            background: "#ffffff",
                          }}
                        >
                          <span
                            style={{ display: "block", color: "#b45309", fontSize: "10px", fontWeight: 800, marginBottom: "8px" }}
                          >
                            PROBLEM DETECTED
                          </span>

                          <p style={{ margin: 0, color: "#475569", fontSize: "13px", lineHeight: 1.6 }}>
                            {proposal.problem || "Kubernetes workload requires remediation."}
                          </p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                          {[
                            ["Failure type", failureType, "#0f172a"],
                            ["Remediation", `${fix.icon} ${fix.label}`, "#2563eb"],
                            ["Risk", fix.risk, TONE[fix.risk].fg],
                          ].map(([label, value, color]) => (
                            <div
                              key={label}
                              style={{
                                padding: "14px",
                                border: "1px solid #e2e8f0",
                                borderRadius: "12px",
                                background: "#ffffff",
                              }}
                            >
                              <small>{label}</small>
                              <strong style={{ display: "block", marginTop: "6px", color, fontSize: "13px" }}>
                                {value}
                              </strong>
                            </div>
                          ))}
                        </div>

                        {changes.map(([label, from, to]) => (
                          <ChangeRow key={label} label={label} from={from} to={to} />
                        ))}

                        <div
                          style={{
                            padding: "17px",
                            border: `1px solid ${isManual ? "#fecaca" : "#fed7aa"}`,
                            borderRadius: "12px",
                            background: isManual ? "#fff7f7" : "#fff7ed",
                          }}
                        >
                          <div
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}
                          >
                            <span style={{ color: "#b45309", fontSize: "10px", fontWeight: 800 }}>
                              {isManual ? "MANUAL STEPS" : "RECOMMENDED ACTION"}
                            </span>

                            {isManual && (
                              <button
                                onClick={() => copy(proposal.recommended_fix || "", "Manual steps copied")}
                                style={{ ...ghostButton, borderColor: "#fecaca", padding: "4px 10px", fontSize: "11px" }}
                              >
                                Copy
                              </button>
                            )}
                          </div>

                          <p
                            style={{
                              margin: 0,
                              color: "#475569",
                              fontSize: "13px",
                              lineHeight: 1.7,
                              whiteSpace: "pre-line",
                            }}
                          >
                            {proposal.recommended_fix || "Apply the validated remediation."}
                          </p>
                        </div>

                        {!isManual && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "10px",
                              padding: "13px",
                              borderRadius: "10px",
                              background: "#f0fdf4",
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            <span>🛡️</span>

                            <div>
                              <strong style={{ display: "block", color: "#166534", fontSize: "12px" }}>
                                Controlled remediation
                              </strong>

                              <p style={{ margin: "4px 0 0", color: "#4d7c0f", fontSize: "11px", lineHeight: 1.5 }}>
                                You confirm the change first. KubeOps then waits for the Deployment, pods and Service
                                endpoints to recover before marking it fixed.
                              </p>
                            </div>
                          </div>
                        )}

                        {isManual ? (
                          <p className="review-note">
                            This failure cannot be fixed safely without your input, so no automatic change is offered.
                          </p>
                        ) : (
                          <>
                            <button
                              className="apply-fix-button"
                              onClick={() => setConfirmOpen(true)}
                              disabled={fixing || selectedGone}
                              style={{ marginTop: "4px" }}
                            >
                              {fixing
                                ? `Applying fix and verifying recovery... ${elapsed}s`
                                : "🔧 Review & apply auto-fix"}
                            </button>

                            <p className="review-note">You will see the exact change before anything is applied.</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <section className="panel" style={{ marginTop: "22px" }}>
                <div className="panel-header">
                  <div className="panel-title">
                    <div className="panel-icon">🔍</div>

                    <div>
                      <h2>Kubernetes Evidence</h2>
                      <p>Runtime information used by KubeOps during diagnosis</p>
                    </div>
                  </div>

                  <Pill tone="Low">Live evidence</Pill>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
                    gap: "12px",
                  }}
                >
                  {[
                    ["Pod state", selectedStatus, TONE[failureMeta.severity].fg],
                    ["Failure type", failureType, "#0f172a"],
                    ["Deployment", proposal?.deployment || "—", "#0f172a"],
                    ["Severity", rcaSeverity || failureMeta.severity, TONE[severityTone].fg],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                      <small>{label}</small>
                      <strong style={{ display: "block", marginTop: "7px", color, overflowWrap: "anywhere" }}>
                        {value}
                      </strong>
                    </div>
                  ))}

                  <div style={{ padding: "16px", border: "1px solid #e2e8f0", borderRadius: "12px" }}>
                    <small>Current image</small>
                    <code style={{ display: "block", marginTop: "7px", overflowWrap: "anywhere" }}>
                      {proposal?.current_image || "Not available"}
                    </code>
                  </div>
                </div>
              </section>

              <section className="panel" style={{ marginTop: "22px" }}>
                <div className="panel-header">
                  <div className="panel-title">
                    <div className="panel-icon">⌨</div>

                    <div>
                      <h2>Investigate Manually</h2>
                      <p>kubectl commands for this incident, ready to copy</p>
                    </div>
                  </div>
                </div>

                <CommandList commands={commands} onCopy={copy} />
              </section>
            </>
          )}

          {fixError && (
            <div className="error-message" style={{ marginTop: "20px", fontWeight: 600 }}>
              ✕ Auto-Fix failed: {fixError}
            </div>
          )}
        </div>
      </main>

      {confirmOpen && proposal && (
        <ConfirmModal
          pod={selectedPod}
          proposal={proposal}
          changes={changes}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={applyFix}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

export default Troubleshoot;