import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/design-system.css'
import './styles/modal.css'
import './styles/paid.css'
import App from './App.jsx'
import { ToastProvider } from './context/ToastContext'
import { CelebrationProvider } from './context/CelebrationContext'

// Apply persisted settings on load. PayPulse defaults to dark mode —
// the design system is tuned for it.
const root = document.documentElement;
const savedTheme = localStorage.getItem("theme");
const savedFontScale = localStorage.getItem("fontScale");

if (savedTheme === "dark" || savedTheme === "light") {
  root.setAttribute("data-theme", savedTheme);
} else {
  root.setAttribute("data-theme", "dark");
}
if (savedFontScale && savedFontScale !== "md") {
  root.setAttribute("data-font-scale", savedFontScale);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <CelebrationProvider>
        <App />
      </CelebrationProvider>
    </ToastProvider>
  </StrictMode>,
)
