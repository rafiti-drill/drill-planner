import React, { useState, useMemo } from 'react'
import { getWeekSessions, getWeekStart, getSubjectColor, getMaxForDay } from '../utils/scheduler'
import './Planning.css'

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_NAMES_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export default function Planning({ store }) {
  const { data } = store
  const [weekOffset, setWeekOffset] = useState(0)

  const baseWeekStart = getWeekStart()
  const weekStart = new Date(baseWeekStart)
  weekStart.setDate(baseWeekStart.getDate() + weekOffset * 7)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const sessions = getWeekSessions(data.controls, data.homework, data.tasks, weekStart, data.controles || [])

  // ── Détection surcharge (Règle 4) ────────────────────────
  const overloadedDays = useMemo(() => {
    const countByDay = {}
    sessions.forEach(s => {
      countByDay[s.date] = (countByDay[s.date] || 0) + 1
    })
    return Object.entries(countByDay)
      .filter(([dateStr, count]) => {
        const dow = new Date(dateStr + 'T00:00:00').getDay()
        return count > getMaxForDay(dow, data.settings.availability)
      })
      .map(([d]) => d)
  }, [sessions, data.settings.availability])

  const hasOverload = overloadedDays.length > 0

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const today = new Date().toISOString().split('T')[0]

  const weekLabel = `${formatShort(weekStart)} — ${formatShort(weekEnd)}`

  const totalSessions = sessions.length
  const doneSessions = sessions.filter(s => s.done).length

  return (
    <div className="planning-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📅 Planning</h1>
          <p className="page-sub">{weekLabel}</p>
        </div>
        <div className="week-nav">
          <button className="week-btn" onClick={() => setWeekOffset(o => o - 1)}>‹</button>
          <button className="week-btn week-btn--today" onClick={() => setWeekOffset(0)}>Aujourd'hui</button>
          <button className="week-btn" onClick={() => setWeekOffset(o => o + 1)}>›</button>
        </div>
      </div>

      {hasOverload && (
        <div className="planning-overload-alert">
          ⚠️ Semaine chargée — planning ajusté automatiquement sur les jours précédents
        </div>
      )}

      <div className="planning-summary">
        <div className="planning-stat">
          <span className="planning-stat-value" style={{ color: 'var(--accent-green)' }}>{totalSessions}</span>
          <span className="planning-stat-label">sessions cette semaine</span>
        </div>
        <div className="planning-stat">
          <span className="planning-stat-value" style={{ color: 'var(--accent-blue)' }}>{doneSessions}</span>
          <span className="planning-stat-label">complétées</span>
        </div>
        <div className="planning-stat">
          <span className="planning-stat-value" style={{ color: 'var(--accent-orange)' }}>{totalSessions - doneSessions}</span>
          <span className="planning-stat-label">restantes</span>
        </div>
      </div>

      {/* Vue desktop : grille semaine */}
      <div className="week-grid">
        {days.map((dateStr, i) => {
          const daySessions = sessions.filter(s => s.date === dateStr)
          const isToday = dateStr === today
          const isPast = dateStr < today

          return (
            <div key={dateStr} className={`day-col ${isToday ? 'day-col--today' : ''} ${isPast ? 'day-col--past' : ''}`}>
              <div className="day-header">
                <span className="day-name">{DAY_NAMES[i]}</span>
                <span className="day-num">{new Date(dateStr + 'T00:00:00').getDate()}</span>
                {daySessions.length > 0 && (
                  <span className="day-count">{daySessions.length}</span>
                )}
              </div>
              <div className="day-sessions">
                {daySessions.map((s, idx) => (
                  <div
                    key={idx}
                    className={`planning-item ${s.done ? 'planning-item--done' : ''} planning-item--${s.type}`}
                    style={{ borderLeftColor: s.color }}
                    title={s.title}
                  >
                    <span className="planning-item-title">{s.title}</span>
                    {s.done && <span className="planning-item-check">✓</span>}
                  </div>
                ))}
                {daySessions.length === 0 && (
                  <div className="day-empty">—</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Vue mobile : liste par jour */}
      <div className="week-mobile">
        {days.map((dateStr, i) => {
          const daySessions = sessions.filter(s => s.date === dateStr)
          const isToday = dateStr === today

          if (daySessions.length === 0 && !isToday) return null

          return (
            <div key={dateStr} className={`mobile-day ${isToday ? 'mobile-day--today' : ''}`}>
              <div className="mobile-day-header">
                <span className="mobile-day-name">{DAY_NAMES_FULL[i]}</span>
                <span className="mobile-day-date">{new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                {isToday && <span className="today-badge">Aujourd'hui</span>}
              </div>
              {daySessions.length === 0 ? (
                <div className="mobile-day-empty">Aucune tâche 🎉</div>
              ) : (
                <div className="mobile-day-sessions">
                  {daySessions.map((s, idx) => (
                    <div
                      key={idx}
                      className={`mobile-session ${s.done ? 'mobile-session--done' : ''}`}
                      style={{ borderLeftColor: s.color }}
                    >
                      <div className="mobile-session-title">{s.title}</div>
                      <div className="mobile-session-meta">
                        <span className="mobile-session-type">{typeLabel(s.type)}</span>
                        {s.done && <span style={{ color: 'var(--accent-green)' }}>✓ Fait</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Légende */}
      <div className="planning-legend">
        <span className="legend-title">Légende</span>
        <div className="legend-items">
          <LegendItem color="var(--accent-green)" label="Révision" />
          <LegendItem color="var(--accent-blue)" label="Devoir" />
          <LegendItem color="var(--color-perso)" label="Tâche perso" />
          <LegendItem color="var(--color-rdv)" label="Rendez-vous" />
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label }) {
  return (
    <div className="legend-item">
      <div className="legend-dot" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

function formatShort(date) {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function typeLabel(type) {
  const map = { revision: '📚 Révision', homework: '📝 Devoir', task: '✅ Tâche' }
  return map[type] || type
}
