import { createContext, useCallback, useContext, useState } from "react";

const CelebrationContext = createContext(null);
export const useCelebration = () => useContext(CelebrationContext);

export const CelebrationProvider = ({ children }) => {
  const [modal, setModal] = useState(null);

  const showCelebration = useCallback(({ title, subtext, buttonText, storageKey }) => {
    if (storageKey && localStorage.getItem(storageKey)) return;
    setModal({ title, subtext, buttonText: buttonText || "Got it", storageKey });
  }, []);

  const dismissCelebration = useCallback(() => {
    if (modal?.storageKey) localStorage.setItem(modal.storageKey, "1");
    setModal(null);
  }, [modal]);

  return (
    <CelebrationContext.Provider value={{ showCelebration }}>
      {children}
      {modal && (
        <div className="pp-celebration-overlay">
          <div className="pp-celebration-card">
            <h2 className="pp-celebration-title">{modal.title}</h2>
            <p className="pp-celebration-sub">{modal.subtext}</p>
            <button type="button" className="primary-button pp-celebration-btn" onClick={dismissCelebration}>
              {modal.buttonText}
            </button>
          </div>
        </div>
      )}
    </CelebrationContext.Provider>
  );
};
