import React from "react";
import { reportError } from "../utils/observability";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Forward to the obs shim so a future vendor (Sentry, etc.) gets the
    // component stack alongside the error. The shim still console.errors
    // today so local dev sees the same payload.
    reportError(error, { componentStack: info?.componentStack, source: "ErrorBoundary" }, "error");
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Something went wrong.</h2>
          <p style={{ color: "#888" }}>{this.state.error?.message}</p>
          <button
            className="primary-button"
            onClick={() => { window.location.href = "/app"; }}
          >
            Go to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
