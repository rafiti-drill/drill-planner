import React from 'react'
import './ProgressBar.css'

export default function ProgressBar({ value, max, color = 'green', label, showPercent = true, size = 'md' }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100)

  return (
    <div className={`progress-wrap progress-wrap--${size}`}>
      {(label || showPercent) && (
        <div className="progress-header">
          {label && <span className="progress-label">{label}</span>}
          {showPercent && <span className="progress-percent" style={{ color: `var(--color-${color}, var(--accent-green))` }}>{percent}%</span>}
        </div>
      )}
      <div className={`progress-track progress-track--${size}`}>
        <div
          className={`progress-fill progress-fill--${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {max > 0 && <div className="progress-sub">{value}/{max}</div>}
    </div>
  )
}
