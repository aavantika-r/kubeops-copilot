import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function Profile() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [editName, setEditName] = useState("");
  const [email, setEmail] = useState("");
  const [joinedDate, setJoinedDate] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [namespace, setNamespace] = useState(
    localStorage.getItem("kubeops_namespace") || ""
  );

  const [namespaces, setNamespaces] = useState([]);

  const [theme, setTheme] = useState(
    localStorage.getItem("kubeops_theme") || "Light"
  );

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /* ================= LOAD ================= */

  useEffect(() => {
    loadUser();
    loadNamespaces();
  }, []);

  /* ================= APPLY THEME ================= */

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-kubeops-theme",
      theme.toLowerCase()
    );

    localStorage.setItem("kubeops_theme", theme);
  }, [theme]);

  /* ================= USER ================= */

  const loadUser = async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      navigate("/login");
      return;
    }

    setUser(user);

    const userName =
      user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "User";

    setName(userName);
    setEditName(userName);
    setEmail(user.email || "");

    if (user.created_at) {
      setJoinedDate(
        new Date(user.created_at).toLocaleDateString(
          "en-IN",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }
        )
      );
    }
  };

  /* ================= NAMESPACES ================= */

  const loadNamespaces = async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/cluster-info"
      );

      if (!response.ok) return;

      const data = await response.json();

      const available = data.namespaces || [];

      setNamespaces(available);

      const saved =
        localStorage.getItem("kubeops_namespace");

      if (saved && available.includes(saved)) {
        setNamespace(saved);
      } else if (available.includes("minishop")) {
        setNamespace("minishop");
      } else if (available.length > 0) {
        setNamespace(available[0]);
      }
    } catch (err) {
      console.error(
        "Namespace loading failed:",
        err
      );
    }
  };

  /* ================= EDIT PROFILE ================= */

  const saveProfile = async () => {
    const value = editName.trim();

    if (!value) {
      setError("Display name cannot be empty.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const { data, error } =
        await supabase.auth.updateUser({
          data: {
            name: value,
          },
        });

      if (error) throw error;

      setUser(data.user);
      setName(value);
      setEditName(value);
      setEditing(false);

      setMessage(
        "Profile updated successfully."
      );

      setTimeout(() => {
        setMessage("");
      }, 2500);
    } catch (err) {
      setError(
        err.message ||
          "Unable to update profile."
      );
    } finally {
      setSaving(false);
    }
  };

  /* ================= PREFERENCES ================= */

  const handleNamespace = (value) => {
    setNamespace(value);

    localStorage.setItem(
      "kubeops_namespace",
      value
    );

    setMessage(
      "Namespace preference saved."
    );

    setTimeout(() => {
      setMessage("");
    }, 1800);
  };

  const handleTheme = (value) => {
    setTheme(value);

    localStorage.setItem(
      "kubeops_theme",
      value
    );

    setMessage(
      `${value} theme enabled.`
    );

    setTimeout(() => {
      setMessage("");
    }, 1800);
  };

  /* ================= LOGOUT ================= */

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const initials =
    name?.trim()?.charAt(0)?.toUpperCase() ||
    "U";

  return (
    <div className="profile-page-shell">

      {/* ================= SIDEBAR ================= */}

      <aside className="profile-sidebar">

        <div className="profile-brand">

          <div className="brand-logo">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M12 3L20 8V16L12 21L4 16V8L12 3Z"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />

              <path
                d="M12 8L16 10.5V15L12 17.5L8 15V10.5L12 8Z"
                fill="white"
              />
            </svg>
          </div>

          <div>
            <h2>KubeOps</h2>
            <p>AI-Powered K8s Copilot</p>
          </div>

        </div>

        <nav className="profile-nav">

          <button
            onClick={() =>
              navigate("/dashboard")
            }
          >
            <span>⌂</span>
            Dashboard
          </button>

          <button
            onClick={() =>
              navigate("/troubleshoot")
            }
          >
            <span>⌕</span>
            Troubleshoot
          </button>

          <button
            onClick={() =>
              navigate("/auto-fixes")
            }
          >
            <span>ϟ</span>
            Auto-Fixes
          </button>

          <button
            onClick={() =>
              navigate("/history")
            }
          >
            <span>◷</span>
            History
          </button>

          <button
            onClick={() =>
              navigate("/settings")
            }
          >
            <span>⚙</span>
            Settings
          </button>

        </nav>

        <div className="sidebar-bottom">

          <span>Kubernetes</span>

          <strong>
            <i />
            Connected
          </strong>

          <small>KubeOps v1.0</small>

        </div>

      </aside>

      {/* ================= MAIN ================= */}

      <main className="profile-main">

        {/* ================= HEADER ================= */}

        <header className="profile-header">

          <div className="header-title">

            <div className="header-icon">

              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="8"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />

                <path
                  d="M4.5 21C5.2 16.8 7.7 14.5 12 14.5C16.3 14.5 18.8 16.8 19.5 21"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>

            </div>

            <div>
              <h1>Profile</h1>

              <p>
                Manage your KubeOps account and preferences
              </p>
            </div>

          </div>

          <div className="header-user">

            <div className="header-avatar">
              {initials}
            </div>

            <div className="header-user-text">

              <strong>{name}</strong>

              <span>{email}</span>

            </div>

            <span className="header-chevron">
              ▾
            </span>

          </div>

        </header>

        {/* ================= CONTENT ================= */}

        <div className="profile-content">

          <button
            className="back-link"
            onClick={() =>
              navigate("/dashboard")
            }
          >
            ← Back to Dashboard
          </button>

          {message && (
            <div className="message success">
              ✓ {message}
            </div>
          )}

          {error && (
            <div className="message error">
              ⚠ {error}
            </div>
          )}

          {/* ================= PROFILE HERO ================= */}

          <section className="profile-hero">

            <div className="hero-avatar">
              {initials}
            </div>

            <div className="hero-info">

              <div className="hero-name">

                <h2>{name}</h2>

                <span>
                  ✓ Authenticated
                </span>

              </div>

              <p>{email}</p>

              <small>
                KubeOps account member
              </small>

            </div>

            {!editing && (
              <button
                className="edit-button"
                onClick={() => {
                  setEditName(name);
                  setEditing(true);
                  setError("");
                }}
              >
                Edit Profile
              </button>
            )}

          </section>

          {/* ================= ACCOUNT ================= */}

          <section className="profile-card">

            <div className="card-header">

              <div className="card-icon blue">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="8"
                    r="3.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />

                  <path
                    d="M5 20C5.7 16.3 8 14.5 12 14.5C16 14.5 18.3 16.3 19 20"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div>
                <h2>Account Information</h2>

                <p>
                  Your KubeOps account details
                </p>
              </div>

            </div>

            {editing ? (

              <div className="edit-area">

                <label>
                  Display Name
                </label>

                <input
                  value={editName}
                  onChange={(e) =>
                    setEditName(e.target.value)
                  }
                  placeholder="Enter your name"
                />

                <div className="edit-actions">

                  <button
                    className="cancel-button"
                    onClick={() => {
                      setEditing(false);
                      setEditName(name);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    className="save-button"
                    onClick={saveProfile}
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : "Save Changes"}
                  </button>

                </div>

              </div>

            ) : (

              <div className="account-grid">

                <div>
                  <span>Display Name</span>
                  <strong>{name}</strong>
                </div>

                <div>
                  <span>Email Address</span>
                  <strong>{email}</strong>
                </div>

                <div>
                  <span>Account Status</span>
                  <strong className="active">
                    Active
                  </strong>
                </div>

                <div>
                  <span>Joined On</span>
                  <strong>
                    {joinedDate || "Unavailable"}
                  </strong>
                </div>

              </div>

            )}

          </section>

          {/* ================= PREFERENCES ================= */}

          <section className="profile-card">

            <div className="card-header">

              <div className="card-icon green">
                ⚙
              </div>

              <div>
                <h2>Preferences</h2>

                <p>
                  Personalize your KubeOps workspace
                </p>
              </div>

            </div>

            <div className="preferences">

              <div className="preference-row">

                <div className="preference-icon namespace">
                  ▦
                </div>

                <div className="preference-text">

                  <strong>
                    Default Namespace
                  </strong>

                  <p>
                    Namespace used for workload analysis
                    and auto-fix operations.
                  </p>

                </div>

                <select
                  value={namespace}
                  onChange={(e) =>
                    handleNamespace(
                      e.target.value
                    )
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

              </div>

              <div className="preference-row">

                <div className="preference-icon theme">
                  ◐
                </div>

                <div className="preference-text">

                  <strong>
                    Interface Theme
                  </strong>

                  <p>
                    Choose how the KubeOps interface appears.
                  </p>

                </div>

                <select
                  value={theme}
                  onChange={(e) =>
                    handleTheme(
                      e.target.value
                    )
                  }
                >

                  <option value="Light">
                    Light
                  </option>

                  <option value="Dark">
                    Dark
                  </option>

                </select>

              </div>

            </div>

          </section>

          {/* ================= ACCOUNT STATUS ================= */}

          <section className="account-meta">

            <div className="meta-item">

              <div className="meta-icon">
                ✓
              </div>

              <div>
                <strong>
                  Account Verified
                </strong>

                <span>
                  Your KubeOps account is active
                </span>
              </div>

            </div>

            <div className="meta-divider" />

            <div className="meta-item">

              <div className="meta-icon">
                ◉
              </div>

              <div>
                <strong>
                  Member Since
                </strong>

                <span>
                  {joinedDate || "Unavailable"}
                </span>
              </div>

            </div>

          </section>

          {/* ================= SIGN OUT ================= */}

          <section className="logout-card">

            <div>

              <strong>
                Sign out of KubeOps
              </strong>

              <p>
                End your current authenticated session.
              </p>

            </div>

            <button
              onClick={handleLogout}
            >
              Sign Out
            </button>

          </section>

        </div>

      </main>

      {/* ================= STYLES ================= */}

      <style>{`

        * {
          box-sizing: border-box;
        }

        /* =====================================================
           LIGHT THEME
        ===================================================== */

        .profile-page-shell {
          min-height: 100vh;

          background: #f5f7fb;

          color: #152033;

          display: flex;

          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;

          transition:
            background .25s ease,
            color .25s ease;
        }

        /* =====================================================
           DARK THEME
        ===================================================== */

        html[data-kubeops-theme="dark"]
        .profile-page-shell {
          background: #0b1220;

          color: #e8eef8;
        }

        html[data-kubeops-theme="dark"]
        .profile-header {
          background: #111a2b;

          border-color: #243249;
        }

        html[data-kubeops-theme="dark"]
        .header-icon {
          background: #172742;

          color: #63a0ff;
        }

        html[data-kubeops-theme="dark"]
        .header-title p,
        html[data-kubeops-theme="dark"]
        .hero-info p,
        html[data-kubeops-theme="dark"]
        .hero-info small,
        html[data-kubeops-theme="dark"]
        .card-header p,
        html[data-kubeops-theme="dark"]
        .preference-text p,
        html[data-kubeops-theme="dark"]
        .meta-item span,
        html[data-kubeops-theme="dark"]
        .logout-card p {
          color: #8fa1bc;
        }

        html[data-kubeops-theme="dark"]
        .header-user {
          background: #151f32;

          border-color: #2a3951;
        }

        html[data-kubeops-theme="dark"]
        .header-user-text span,
        html[data-kubeops-theme="dark"]
        .header-chevron {
          color: #8495af;
        }

        html[data-kubeops-theme="dark"]
        .profile-hero {
          background:
            linear-gradient(
              135deg,
              #121c2e,
              #101a2a
            );

          border-color: #293950;

          box-shadow:
            0 8px 28px
            rgba(0,0,0,.18);
        }

        html[data-kubeops-theme="dark"]
        .profile-card,
        html[data-kubeops-theme="dark"]
        .account-meta,
        html[data-kubeops-theme="dark"]
        .logout-card {
          background: #111a2b;

          border-color: #293950;
        }

        html[data-kubeops-theme="dark"]
        .card-header {
          border-color: #293950;
        }

        html[data-kubeops-theme="dark"]
        .account-grid > div {
          border-color: #293950;
        }

        html[data-kubeops-theme="dark"]
        .account-grid span {
          color: #8495af;
        }

        html[data-kubeops-theme="dark"]
        .preference-row {
          border-color: #293950;
        }

        html[data-kubeops-theme="dark"]
        .preference-row select {
          background: #172235;

          border-color: #33445e;

          color: #e8eef8;
        }

        html[data-kubeops-theme="dark"]
        .edit-area input {
          background: #172235;

          border-color: #33445e;

          color: #e8eef8;
        }

        html[data-kubeops-theme="dark"]
        .edit-area input::placeholder {
          color: #73839b;
        }

        html[data-kubeops-theme="dark"]
        .cancel-button {
          background: #172235;

          border-color: #33445e;

          color: #a7b5c9;
        }

        html[data-kubeops-theme="dark"]
        .meta-divider {
          background: #293950;
        }

        html[data-kubeops-theme="dark"]
        .logout-card {
          background: #111a2b;
        }

        html[data-kubeops-theme="dark"]
        .logout-card button {
          background: #28191d;

          border-color: #66323a;

          color: #ff7e89;
        }

        html[data-kubeops-theme="dark"]
        .back-link {
          color: #6ca7ff;
        }

        html[data-kubeops-theme="dark"]
        .edit-button {
          background: #172235;

          border-color: #33445e;

          color: #6ca7ff;
        }

        html[data-kubeops-theme="dark"]
        .edit-button:hover {
          background: #1c2b45;
        }

        /* =====================================================
           SIDEBAR
        ===================================================== */

        .profile-sidebar {
          position: fixed;

          top: 0;
          left: 0;
          bottom: 0;

          width: 230px;

          background: #081b31;

          color: white;

          padding: 24px 16px;

          display: flex;
          flex-direction: column;

          z-index: 10;
        }

        .profile-brand {
          display: flex;

          align-items: center;

          gap: 12px;

          padding:
            0 8px 30px;
        }

        .brand-logo {
          width: 42px;
          height: 42px;

          border-radius: 12px;

          background:
            linear-gradient(
              135deg,
              #287af0,
              #4d5fe8
            );

          display: flex;

          align-items: center;
          justify-content: center;

          box-shadow:
            0 8px 22px
            rgba(40,122,240,.28);
        }

        .profile-brand h2 {
          margin: 0;

          font-size: 17px;

          font-weight: 800;
        }

        .profile-brand p {
          margin: 4px 0 0;

          color: #8fa6c5;

          font-size: 8px;
        }

        .profile-nav {
          display: flex;

          flex-direction: column;

          gap: 6px;
        }

        .profile-nav button {
          height: 43px;

          border: 0;

          border-radius: 9px;

          background: transparent;

          color: #a7b9cf;

          display: flex;

          align-items: center;

          gap: 12px;

          padding: 0 13px;

          font-size: 12px;

          font-weight: 600;

          cursor: pointer;

          text-align: left;

          transition: .2s;
        }

        .profile-nav button:hover {
          color: white;

          background:
            rgba(255,255,255,.07);
        }

        .profile-nav button span {
          width: 18px;

          text-align: center;

          font-size: 15px;
        }

        .sidebar-bottom {
          margin-top: auto;

          border-top:
            1px solid
            rgba(255,255,255,.08);

          padding:
            20px 8px 0;
        }

        .sidebar-bottom > span {
          display: block;

          color: #7187a4;

          font-size: 8px;

          margin-bottom: 8px;
        }

        .sidebar-bottom strong {
          display: flex;

          align-items: center;

          gap: 7px;

          font-size: 10px;
        }

        .sidebar-bottom i {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #20c878;

          box-shadow:
            0 0 0 3px
            rgba(32,200,120,.12);
        }

        .sidebar-bottom small {
          display: block;

          text-align: center;

          color: #627793;

          font-size: 8px;

          margin-top: 22px;
        }

        /* =====================================================
           MAIN
        ===================================================== */

        .profile-main {
          margin-left: 230px;

          width:
            calc(100% - 230px);

          min-height: 100vh;
        }

        /* =====================================================
           HEADER
        ===================================================== */

        .profile-header {
          min-height: 78px;

          padding: 0 32px;

          background: white;

          border-bottom:
            1px solid #e0e7f0;

          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 20px;
        }

        .header-title {
          display: flex;

          align-items: center;

          gap: 13px;
        }

        .header-icon {
          width: 45px;
          height: 45px;

          border-radius: 14px;

          background: #edf4ff;

          color: #2476e9;

          display: flex;

          align-items: center;
          justify-content: center;
        }

        .header-title h1 {
          margin: 0;

          font-size: 21px;

          font-weight: 800;
        }

        .header-title p {
          margin: 4px 0 0;

          color: #8290a6;

          font-size: 9px;
        }

        .header-user {
          min-width: 185px;

          height: 55px;

          border:
            1px solid #dfe7f0;

          border-radius: 10px;

          padding: 6px 10px;

          display: flex;

          align-items: center;

          gap: 9px;
        }

        .header-avatar {
          width: 34px;
          height: 34px;

          border-radius: 50%;

          background: #5277ed;

          color: white;

          display: flex;

          align-items: center;
          justify-content: center;

          font-size: 12px;

          font-weight: 800;
        }

        .header-user-text {
          flex: 1;

          min-width: 0;
        }

        .header-user-text strong {
          display: block;

          font-size: 10px;

          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;
        }

        .header-user-text span {
          display: block;

          color: #8a97aa;

          font-size: 7px;

          margin-top: 2px;

          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;
        }

        .header-chevron {
          color: #8b98aa;

          font-size: 9px;
        }

        /* =====================================================
           CONTENT
        ===================================================== */

        .profile-content {
          max-width: 1040px;

          margin: 0 auto;

          padding:
            27px 30px 50px;
        }

        .back-link {
          border: 0;

          background: transparent;

          color: #2476e9;

          font-size: 10px;

          font-weight: 700;

          cursor: pointer;

          padding: 0;

          margin-bottom: 17px;
        }

        .message {
          padding: 10px 13px;

          border-radius: 8px;

          font-size: 9px;

          margin-bottom: 15px;
        }

        .message.success {
          color: #15945b;

          background: #eafaf2;

          border:
            1px solid #c8eed9;
        }

        .message.error {
          color: #d44250;

          background: #fff0f2;

          border:
            1px solid #ffd1d7;
        }

        /* =====================================================
           HERO
        ===================================================== */

        .profile-hero {
          min-height: 145px;

          padding: 24px;

          background:
            linear-gradient(
              135deg,
              #ffffff,
              #f7faff
            );

          border:
            1px solid #dfe7f0;

          border-radius: 14px;

          display: flex;

          align-items: center;

          gap: 17px;

          margin-bottom: 17px;

          box-shadow:
            0 5px 20px
            rgba(30,60,100,.035);
        }

        .hero-avatar {
          width: 76px;
          height: 76px;

          border-radius: 20px;

          flex-shrink: 0;

          background:
            linear-gradient(
              135deg,
              #5277ed,
              #3478e9
            );

          color: white;

          display: flex;

          align-items: center;
          justify-content: center;

          font-size: 28px;

          font-weight: 800;

          box-shadow:
            0 10px 25px
            rgba(55,111,230,.22);
        }

        .hero-info {
          flex: 1;
        }

        .hero-name {
          display: flex;

          align-items: center;

          gap: 9px;
        }

        .hero-name h2 {
          margin: 0;

          font-size: 20px;

          font-weight: 800;
        }

        .hero-name span {
          padding: 5px 8px;

          border-radius: 12px;

          background: #eafaf2;

          color: #15945b;

          font-size: 7px;

          font-weight: 700;
        }

        .hero-info p {
          margin: 6px 0 4px;

          color: #687991;

          font-size: 9px;
        }

        .hero-info small {
          color: #99a5b5;

          font-size: 8px;
        }

        .edit-button {
          height: 37px;

          padding: 0 15px;

          border:
            1px solid #d5e2f3;

          border-radius: 8px;

          background: white;

          color: #2476e9;

          font-size: 9px;

          font-weight: 700;

          cursor: pointer;
        }

        /* =====================================================
           CARDS
        ===================================================== */

        .profile-card {
          background: white;

          border:
            1px solid #dfe7f0;

          border-radius: 14px;

          margin-bottom: 17px;

          overflow: hidden;

          box-shadow:
            0 4px 16px
            rgba(25,55,95,.025);
        }

        .card-header {
          min-height: 70px;

          padding: 15px 21px;

          border-bottom:
            1px solid #e5ebf2;

          display: flex;

          align-items: center;

          gap: 11px;
        }

        .card-icon {
          width: 36px;
          height: 36px;

          border-radius: 9px;

          display: flex;

          align-items: center;
          justify-content: center;
        }

        .card-icon.blue {
          background: #edf4ff;

          color: #2476e9;
        }

        .card-icon.green {
          background: #eafaf2;

          color: #18a765;
        }

        .card-header h2 {
          margin: 0;

          font-size: 13px;

          font-weight: 800;
        }

        .card-header p {
          margin: 4px 0 0;

          color: #8290a6;

          font-size: 8px;
        }

        /* =====================================================
           ACCOUNT
        ===================================================== */

        .account-grid {
          display: grid;

          grid-template-columns:
            repeat(4, 1fr);
        }

        .account-grid > div {
          padding: 19px 21px;

          border-right:
            1px solid #e4eaf2;
        }

        .account-grid > div:last-child {
          border-right: 0;
        }

        .account-grid span {
          display: block;

          color: #8794a7;

          font-size: 8px;

          margin-bottom: 7px;
        }

        .account-grid strong {
          display: block;

          font-size: 10px;

          overflow: hidden;

          text-overflow: ellipsis;

          white-space: nowrap;
        }

        .active {
          color: #15945b !important;
        }

        /* =====================================================
           EDIT
        ===================================================== */

        .edit-area {
          padding: 22px;
        }

        .edit-area label {
          display: block;

          font-size: 9px;

          font-weight: 700;

          margin-bottom: 7px;
        }

        .edit-area input {
          width: 100%;

          max-width: 450px;

          height: 39px;

          border:
            1px solid #dce5ef;

          border-radius: 8px;

          padding: 0 11px;

          font-size: 10px;

          outline: none;
        }

        .edit-actions {
          display: flex;

          gap: 8px;

          margin-top: 10px;
        }

        .cancel-button,
        .save-button {
          height: 34px;

          padding: 0 13px;

          border-radius: 8px;

          font-size: 9px;

          font-weight: 700;

          cursor: pointer;
        }

        .cancel-button {
          background: white;

          color: #718096;

          border:
            1px solid #dce5ef;
        }

        .save-button {
          background: #2476e9;

          color: white;

          border:
            1px solid #2476e9;
        }

        /* =====================================================
           PREFERENCES
        ===================================================== */

        .preferences {
          padding: 3px 21px 8px;
        }

        .preference-row {
          min-height: 78px;

          display: flex;

          align-items: center;

          gap: 12px;

          border-bottom:
            1px solid #e4eaf2;
        }

        .preference-row:last-child {
          border-bottom: 0;
        }

        .preference-icon {
          width: 35px;
          height: 35px;

          border-radius: 9px;

          display: flex;

          align-items: center;
          justify-content: center;

          flex-shrink: 0;
        }

        .preference-icon.namespace {
          background: #edf4ff;

          color: #2476e9;
        }

        .preference-icon.theme {
          background: #f3edff;

          color: #7c4ce0;
        }

        .preference-text {
          flex: 1;
        }

        .preference-text strong {
          display: block;

          font-size: 10px;

          margin-bottom: 5px;
        }

        .preference-text p {
          margin: 0;

          color: #8794a7;

          font-size: 8px;
        }

        .preference-row select {
          width: 150px;

          height: 37px;

          border:
            1px solid #dce5ef;

          border-radius: 8px;

          background: white;

          color: #26364d;

          padding: 0 10px;

          font-size: 9px;

          outline: none;

          cursor: pointer;
        }

        /* =====================================================
           META
        ===================================================== */

        .account-meta {
          min-height: 78px;

          background: white;

          border:
            1px solid #dfe7f0;

          border-radius: 13px;

          display: flex;

          align-items: center;

          margin-bottom: 17px;

          padding: 0 21px;
        }

        .meta-item {
          flex: 1;

          display: flex;

          align-items: center;

          gap: 10px;
        }

        .meta-icon {
          width: 34px;
          height: 34px;

          border-radius: 9px;

          background: #eafaf2;

          color: #15945b;

          display: flex;

          align-items: center;
          justify-content: center;

          font-size: 11px;
        }

        .meta-item strong {
          display: block;

          font-size: 9px;

          margin-bottom: 3px;
        }

        .meta-item span {
          display: block;

          color: #8794a7;

          font-size: 8px;
        }

        .meta-divider {
          width: 1px;

          height: 35px;

          background: #e4eaf2;

          margin: 0 25px;
        }

        /* =====================================================
           LOGOUT
        ===================================================== */

        .logout-card {
          min-height: 74px;

          background: white;

          border:
            1px solid #dfe7f0;

          border-radius: 13px;

          padding: 14px 18px;

          display: flex;

          align-items: center;

          justify-content: space-between;
        }

        .logout-card strong {
          display: block;

          font-size: 10px;
        }

        .logout-card p {
          margin: 4px 0 0;

          color: #8996a9;

          font-size: 8px;
        }

        .logout-card button {
          height: 35px;

          padding: 0 15px;

          border-radius: 8px;

          border:
            1px solid #ffd0d5;

          background: #fff3f4;

          color: #d44250;

          font-size: 9px;

          font-weight: 700;

          cursor: pointer;
        }

        /* =====================================================
           RESPONSIVE
        ===================================================== */

        @media (max-width: 900px) {

          .account-grid {
            grid-template-columns:
              repeat(2, 1fr);
          }

          .account-grid > div:nth-child(2) {
            border-right: 0;
          }
        }

        @media (max-width: 700px) {

          .profile-sidebar {
            width: 70px;

            padding: 18px 10px;
          }

          .profile-brand > div:last-child {
            display: none;
          }

          .profile-nav button {
            justify-content: center;

            padding: 0;

            font-size: 0;
          }

          .profile-nav button span {
            font-size: 16px;
          }

          .sidebar-bottom {
            display: none;
          }

          .profile-main {
            margin-left: 70px;

            width:
              calc(100% - 70px);
          }

          .profile-header {
            padding: 0 15px;
          }

          .profile-content {
            padding:
              20px 14px 40px;
          }

          .profile-hero {
            flex-wrap: wrap;
          }

          .account-grid {
            grid-template-columns: 1fr;
          }

          .account-grid > div {
            border-right: 0;

            border-bottom:
              1px solid #e4eaf2;
          }

          .preference-row {
            flex-wrap: wrap;

            padding: 14px 0;
          }

          .preference-row select {
            width: 100%;

            margin-left: 47px;
          }

          .account-meta {
            flex-direction: column;

            align-items: stretch;

            gap: 12px;

            padding: 15px 18px;
          }

          .meta-divider {
            width: 100%;

            height: 1px;

            margin: 0;
          }
        }

      `}</style>

    </div>
  );
}

export default Profile;