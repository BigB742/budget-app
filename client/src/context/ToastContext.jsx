import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [current, setCurrent] = useState(null);
  const queue = useRef([]);
  const timer = useRef(null);

  const dismiss = useCallback(() => {
    setCurrent(null);
    clearTimeout(timer.current);
    if (queue.current.length > 0) {
      const next = queue.current.shift();
      setTimeout(() => {
        setCurrent(next);
        timer.current = setTimeout(dismiss, 4000);
      }, 300);
    }
  }, []);

  const showToast = useCallback((message) => {
    if (current) {
      queue.current.push(message);
    } else {
      setCurrent(message);
      timer.current = setTimeout(dismiss, 4000);
    }
  }, [current, dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {current && (
        <div className="pp-toast" role="status" aria-live="polite">
          <span>{current}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
};
