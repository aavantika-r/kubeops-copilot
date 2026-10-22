import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cluster from "./pages/Cluster";
import Profile from "./pages/Profile";
import Troubleshoot from "./pages/Troubleshoot";
import History from "./pages/History";
import Settings from "./pages/Settings";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/"
          element={<Dashboard />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/cluster"
          element={<Cluster />}
        />

        <Route
          path="/troubleshoot"
          element={<Troubleshoot />}
        />


        <Route
          path="/history"
          element={<History />}
        />

        <Route
          path="/settings"
          element={<Settings />}
        />

        <Route
          path="/profile"
          element={<Profile />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;