import "./Input.css";

/**
 * A labeled input/select field matching style-guide.html's .field-demo.
 * Pass `as="select"` with `children` (option elements) for a dropdown.
 */
export default function Input({ label, as = "input", children, id, error, ...rest }) {
  const fieldId = id || label?.toLowerCase().replace(/\s+/g, "-");
  const Tag = as;

  return (
    <div className="field">
      {label && <label htmlFor={fieldId}>{label}</label>}
      <Tag id={fieldId} {...rest}>
        {children}
      </Tag>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
