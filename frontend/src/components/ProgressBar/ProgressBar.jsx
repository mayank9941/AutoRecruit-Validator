import "./ProgressBar.css";

export default function ProgressBar({ value, max }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;

  return (
    <div className="progress-bar-track" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
