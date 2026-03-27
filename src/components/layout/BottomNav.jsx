import React from 'react'
import './BottomNav.css'

const NAV_ITEMS = [
  { id: 'dashboard', icon: '⚡', label: "Auj." },
  { id: 'controls', icon: '🎯', label: 'Contrôles' },
  { id: 'homework', icon: '📝', label: 'Devoirs' },
  { id: 'planning', icon: '📅', label: 'Planning' },
  { id: 'pronote', icon: '🎓', label: 'Pronote' },
  { id: 'settings', icon: '⚙', label: 'Réglages' },
]

export default function BottomNav({ activePage, onNavigate }) {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`bottom-nav-item ${activePage === item.id ? 'active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span className="bottom-nav-icon">{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
