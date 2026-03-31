import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import ExpenseHistory from "./pages/ExpenseHistory";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
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
        <Route path="/register" element={<Signup />} />

        {/* Onboarding wizard */}
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        {/* Legacy onboarding routes redirect */}
        <Route path="/onboarding/income" element={<Navigate to="/onboarding" replace />} />
        <Route path="/onboarding/bills" element={<Navigate to="/onboarding" replace />} />
        {/* Manage income — standalone page */}
        <Route path="/settings/income" element={<ProtectedRoute><OnboardingIncome /></ProtectedRoute>} />

        {/* Main app routes inside AppShell */}
        <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="history" element={<ExpenseHistory />} />
          <Route path="bills" element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
