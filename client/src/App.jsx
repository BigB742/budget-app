import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import OnboardingBills from "./pages/OnboardingBills";
import OnboardingIncome from "./pages/OnboardingIncome";

const RootRedirect = () => {
  const token = localStorage.getItem("token");
  return <Navigate to={token ? "/app" : "/login"} replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/onboarding/income"
          element={
            <ProtectedRoute>
              <OnboardingIncome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onboarding/bills"
          element={
            <ProtectedRoute>
              <OnboardingBills />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/income"
          element={
            <ProtectedRoute>
              <OnboardingIncome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
