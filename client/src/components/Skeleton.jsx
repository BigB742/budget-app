const Skeleton = ({ width = "100%", height = 16, radius = 8, style }) => (
  <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} />
);

export const SkeletonCard = ({ height = 72 }) => (
  <div className="skeleton" style={{ width: "100%", height, borderRadius: "var(--radius)" }} />
);

export const SkeletonRow = () => (
  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem 0" }}>
    <Skeleton width={50} height={14} />
    <Skeleton width="60%" height={14} />
    <Skeleton width={60} height={14} style={{ marginLeft: "auto" }} />
  </div>
);

export default Skeleton;
