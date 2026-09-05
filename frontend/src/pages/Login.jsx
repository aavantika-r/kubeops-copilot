import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();

    // Backend authentication will be added later
    navigate("/cluster");
  };

  return (
    <div className="login-page">
      <div className="login-card">

        <div className="logo">
          <span className="icon">☸</span>
          <h1>KubeOps Copilot</h1>
        </div>

        <p className="login-subtitle">
          AI-Powered Kubernetes Troubleshooting Platform
        </p>

        <form onSubmit={handleLogin}>

          <input
            type="email"
            placeholder="Enter Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit">Sign In</button>

        </form>

      </div>
    </div>
  );
}

export default Login;