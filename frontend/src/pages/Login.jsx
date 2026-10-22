import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "../App.css";

function Login() {
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      // ==========================================
      // CREATE ACCOUNT
      // ==========================================

      if (isSignUp) {
        const { data, error } =
          await supabase.auth.signUp({
            email: email.trim(),
            password: password,
            options: {
              data: {
                name: name.trim(),
              },
            },
          });

        if (error) {
          throw error;
        }

        if (data.user) {
          setMessage(
            "Account created successfully. You can now sign in."
          );

          setIsSignUp(false);
          setPassword("");
        }

        return;
      }

      // ==========================================
      // SIGN IN
      // ==========================================

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

      if (error) {
        throw error;
      }

      if (data.user) {
        navigate("/cluster");
      }
    } catch (error) {
      console.error("Authentication error:", error);

      setError(
        error.message ||
          "Authentication failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* LOGO */}

        <div className="logo">
          <span className="icon">
            ☸
          </span>

          <h1>
            KubeOps Copilot
          </h1>
        </div>

        <p className="login-subtitle">
          AI-Powered Kubernetes Troubleshooting Platform
        </p>

        {/* TITLE */}

        <h2>
          {isSignUp
            ? "Create Account"
            : "Welcome Back"}
        </h2>

        <p className="login-description">
          {isSignUp
            ? "Create your KubeOps account"
            : "Sign in to access your Kubernetes dashboard"}
        </p>

        {/* ERROR */}

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        {/* SUCCESS */}

        {message && (
          <div className="login-success">
            {message}
          </div>
        )}

        {/* FORM */}

        <form onSubmit={handleSubmit}>

          {/* NAME */}

          {isSignUp && (
            <input
              type="text"
              placeholder="Enter Your Name"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              required
            />
          )}

          {/* EMAIL */}

          <input
            type="email"
            placeholder="Enter Email Address"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            required
          />

          {/* PASSWORD */}

          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            minLength={6}
            required
          />

          {/* SUBMIT */}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : isSignUp
              ? "Create Account"
              : "Sign In"}
          </button>

        </form>

        {/* SWITCH */}

        <div className="auth-switch">

          {isSignUp ? (
            <p>
              Already have an account?{" "}

              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setName("");
                  setPassword("");
                  setError("");
                  setMessage("");
                }}
              >
                Sign In
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{" "}

              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setPassword("");
                  setError("");
                  setMessage("");
                }}
              >
                Create Account
              </button>
            </p>
          )}

        </div>

      </div>
    </div>
  );
}

export default Login;