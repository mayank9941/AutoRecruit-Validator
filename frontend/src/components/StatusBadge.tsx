import React from 'react';
import { statusLabel, statusTone } from '../lib/format';

export const StatusBadge: React.FC<{ status?: string | null; className?: string }> = ({ status, className = '' }) => (
  <span
    className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider ${statusTone(
      status
    )} ${className}`}
  >
    {statusLabel(status)}
  </span>
);

export default StatusBadge;
