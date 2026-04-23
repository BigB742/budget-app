// PageContainer — Apple-grade layout wrapper applied to every authenticated
// page. Width and padding rules live in the .pp-container class in
// design-system.css so pages stay consistent.
//
// Desktop (≥1280px): 1024px max-width, 48px horizontal padding, 96/128 vertical
// Tablet  (768–1279px): full width, 32px horizontal padding, 80/96 vertical
// Mobile  (480–767px): full width, 24px horizontal padding, 64/80 vertical
// Phone   (<480px): full width, 20px horizontal padding, 56/64 vertical

const PageContainer = ({ children, className = "" }) => (
  <div className={`pp-container${className ? ` ${className}` : ""}`}>
    {children}
  </div>
);

export default PageContainer;
