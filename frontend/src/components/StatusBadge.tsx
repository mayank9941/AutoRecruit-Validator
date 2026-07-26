import React from 'react';
import { statusLabel, statusTone } from '../lib/format';

export const StatusBadge: React.FC<{ status?: string | null; className?: string }> = ({ status, className = '' }) => (
  <span
    className={`inline-flex items-center px-3 py-1 rounded-md border text-sm font-semibold whitespace-nowrap ${statusTone(
      status
    )} ${className}`}
  >
    {statusLabel(status)}
  </span>
);

export default StatusBadge;
