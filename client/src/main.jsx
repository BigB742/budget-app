import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Apply persisted settings on load
const root = document.documentElement;
const savedTheme = localStorage.getItem("theme");
const savedFontScale = localStorage.getItem("fontScale");

if (savedTheme === "dark" || savedTheme === "light") {
  root.setAttribute("data-theme", savedTheme);
} else {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", prefersDark ? "dark" : "light");
}
if (savedFontScale && savedFontScale !== "md") {
  root.setAttribute("data-font-scale", savedFontScale);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
