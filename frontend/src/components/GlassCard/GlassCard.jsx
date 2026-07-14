import "./GlassCard.css";

/**
 * The shared glass panel primitive -- applies the .glass-card recipe
 * (blur, border, gradient-edge highlight) from base.css. Use this as the
 * container for any content block: forms, tables, stat panels, etc.
 */
export default function GlassCard({ as: Tag = "div", className = "", children, ...rest }) {
  return (
    <Tag className={`glass-card glass-card-padded ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
