import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'

// Apply persisted settings on load
const root = document.documentElement;
const savedTheme = localStorage.getItem("theme");
const savedTextSize = localStorage.getItem("textSize");
const savedAccent = localStorage.getItem("accent");

if (savedTheme === "dark" || savedTheme === "light") {
  root.setAttribute("data-theme", savedTheme);
} else if (savedTheme === "system" || !savedTheme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", prefersDark ? "dark" : "light");
}
if (savedTextSize) root.setAttribute("data-text-size", savedTextSize);
if (savedAccent) root.setAttribute("data-accent", savedAccent);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
