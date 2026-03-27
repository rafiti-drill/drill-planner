import React from 'react'
import './Badge.css'

const DIFFICULTY_MAP = {
  facile: { label: 'Facile', color: 'green' },
  moyen: { label: 'Moyen', color: 'orange' },
  dur: { label: 'Difficile', color: 'red' },
}

export function DifficultyBadge({ difficulty }) {
  const config = DIFFICULTY_MAP[difficulty] || { label: difficulty, color: 'muted' }
  return <span className={`badge badge--${config.color}`}>{config.label}</span>
}

export function Badge({ children, color = 'green' }) {
  return <span className={`badge badge--${color}`}>{children}</span>
}
