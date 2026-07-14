import "./Button.css";

/**
 * variant: "primary" | "glass" | "ghost"
 * Matches the three button styles from style-guide.html exactly.
 */
export default function Button({ variant = "primary", children, ...rest }) {
  return (
    <button className={`btn btn-${variant}`} {...rest}>
      {children}
    </button>
  );
}
