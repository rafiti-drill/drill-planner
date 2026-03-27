import React from 'react'
import './Sidebar.css'

const NAV_ITEMS = [
  { id: 'dashboard', icon: '⚡', label: "Aujourd'hui" },
  { id: 'controls', icon: '🎯', label: 'Contrôles' },
  { id: 'homework', icon: '📝', label: 'Devoirs' },
  { id: 'tasks', icon: '✅', label: 'Tâches' },
  { id: 'planning', icon: '📅', label: 'Planning' },
  { id: 'stats', icon: '📊', label: 'Stats' },
  { id: 'pronote', icon: '🎓', label: 'Pronote' },
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-icon">◈</span>
        <div>
          <div className="sidebar-logo-title">DRILL</div>
          <div className="sidebar-logo-sub">PLANNER</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            <span className="sidebar-item-label">{item.label}</span>
            {activePage === item.id && <span className="sidebar-item-bar" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className={`sidebar-item sidebar-settings-btn ${activePage === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <span className="sidebar-item-icon">⚙</span>
          <span className="sidebar-item-label">Réglages</span>
          {activePage === 'settings' && <span className="sidebar-item-bar" />}
        </button>
        <div className="sidebar-footer-text">1re STMG · 2025-2026</div>
      </div>
    </aside>
  )
}
