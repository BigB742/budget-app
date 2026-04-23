// PageContainer — web-first layout wrapper applied to every authenticated
// page. All the responsive width/padding logic lives in the .pp-container
// CSS class. Pages just wrap their content and inherit consistency.
//
// Desktop (≥1280px): 1120px max-width, 48px horizontal padding.
// Tablet  (768–1279px): 90% of viewport, 32px padding.
// Mobile  (480–767px): full width, 24px padding.
// Phone   (<480px): full width, 16px padding.
// Vertical: 64px top / 96px bottom on desktop; 40/64 on mobile.

const PageContainer = ({ children, className = "" }) => (
  <div className={`pp-container${className ? ` ${className}` : ""}`}>
    {children}
  </div>
);

export default PageContainer;
