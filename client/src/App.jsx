import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Settings from "./pages/Settings";
import ExpenseHistory from "./pages/ExpenseHistory";
import BillsIncome from "./pages/BillsIncome";
import Onboarding from "./pages/Onboarding";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyEmail from "./pages/VerifyEmail";
import CheckEmail from "./pages/CheckEmail";
import OnboardingIncome from "./pages/OnboardingIncome";
import ManageIncome from "./pages/ManageIncome";

const RootRedirect = () => {
  const token = localStorage.getItem("token");
  return token ? <Navigate to="/app" replace /> : <Landing />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/register" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/check-email" element={<CheckEmail />} />

        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/onboarding/income" element={<Navigate to="/onboarding" replace />} />
        <Route path="/onboarding/bills" element={<Navigate to="/onboarding" replace />} />
        <Route path="/settings/income" element={<ProtectedRoute><OnboardingIncome /></ProtectedRoute>} />


        <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="history" element={<ExpenseHistory />} />
          <Route path="bills" element={<BillsIncome />} />
          <Route path="settings" element={<Settings />} />
          <Route path="income" element={<ManageIncome />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
