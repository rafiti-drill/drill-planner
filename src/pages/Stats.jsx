import React from 'react'
import Card from '../components/ui/Card'
import ProgressBar from '../components/ui/ProgressBar'
import { getWeekStart, getSubjectColor } from '../utils/scheduler'
import './Stats.css'

export default function Stats({ store }) {
  const { data } = store

  // Sessions cette semaine
  const weekStart = getWeekStart()
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const allSessions = data.controls.flatMap(c => c.sessions)
  const weekSessions = allSessions.filter(s => weekDays.includes(s.date))
  const weekDone = weekSessions.filter(s => s.done)

  // Toutes sessions confondues
  const totalDone = allSessions.filter(s => s.done).length
  const totalSessions = allSessions.length

  // Par contrôle
  const controlStats = data.controls.map(c => ({
    ...c,
    done: c.sessions.filter(s => s.done).length,
    total: c.sessions.length,
  }))

  // Devoirs
  const homeworkStats = data.homework.map(h => ({
    ...h,
    done: h.steps.filter(s => s.done).length,
    total: h.steps.length,
  }))

  // Jours actifs cette semaine
  const activeDays = new Set(weekDone.map(s => s.date)).size

  // Matières les plus révisées
  const subjectCounts = {}
  data.controls.forEach(c => {
    const done = c.sessions.filter(s => s.done).length
    subjectCounts[c.subject] = (subjectCounts[c.subject] || 0) + done
  })
  const topSubjects = Object.entries(subjectCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="stats-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Statistiques</h1>
          <p className="page-sub">Ta progression globale</p>
        </div>
      </div>

      {/* Mega stats */}
      <div className="mega-stats">
        <StatCard
          icon="🔥"
          value={data.settings.streak || 0}
          label="Jours consécutifs"
          color="var(--accent-orange)"
        />
        <StatCard
          icon="✅"
          value={totalDone}
          label="Sessions faites"
          color="var(--accent-green)"
        />
        <StatCard
          icon="📚"
          value={weekDone.length}
          label="Cette semaine"
          color="var(--accent-blue)"
        />
        <StatCard
          icon="⚡"
          value={activeDays}
          label="Jours actifs / semaine"
          color="var(--accent-yellow)"
        />
      </div>

      {/* Progression globale */}
      <Card>
        <h2 className="stats-section-title">Progression globale</h2>
        <ProgressBar
          value={totalDone}
          max={totalSessions || 1}
          color="green"
          label="Sessions de révision complétées"
          size="lg"
        />
      </Card>

      {/* Activité semaine */}
      <Card>
        <h2 className="stats-section-title">Activité cette semaine</h2>
        <div className="week-activity">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((name, i) => {
            const dayStr = weekDays[i]
            const daySessions = weekSessions.filter(s => s.date === dayStr)
            const dayDone = daySessions.filter(s => s.done).length
            const today = new Date().toISOString().split('T')[0]
            const isToday = dayStr === today
            const maxHeight = 80
            const height = daySessions.length > 0 ? Math.max(20, (dayDone / Math.max(daySessions.length, 1)) * maxHeight) : 0

            return (
              <div key={name} className="activity-day">
                <div className="activity-bar-wrap">
                  <div
                    className={`activity-bar ${isToday ? 'activity-bar--today' : ''}`}
                    style={{ height: `${height}px` }}
                  />
                  {daySessions.length > 0 && (
                    <div className="activity-total" style={{ height: `${(daySessions.length / Math.max(...weekSessions.length > 0 ? [4] : [1])) * maxHeight}px` }} />
                  )}
                </div>
                <span className="activity-label">{name}</span>
                <span className="activity-count">{dayDone}/{daySessions.length}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Contrôles */}
      {controlStats.length > 0 && (
        <Card>
          <h2 className="stats-section-title">Contrôles en cours</h2>
          <div className="control-stats-list">
            {controlStats.map(c => {
              const color = c.difficulty === 'dur' ? 'red' : c.difficulty === 'moyen' ? 'orange' : 'green'
              return (
                <div key={c.id} className="control-stat-item">
                  <div className="control-stat-header">
                    <span className="control-stat-subject" style={{ color: getSubjectColor(c.subject) }}>
                      {c.subject}
                    </span>
                    <span className="control-stat-title">{c.title}</span>
                  </div>
                  <ProgressBar
                    value={c.done}
                    max={c.total || 1}
                    color={color}
                    label={`${c.done}/${c.total} sessions`}
                    size="sm"
                  />
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Matières top */}
      {topSubjects.length > 0 && (
        <Card>
          <h2 className="stats-section-title">Matières les plus révisées</h2>
          <div className="subject-stats">
            {topSubjects.map(([subject, count]) => (
              <div key={subject} className="subject-stat">
                <div className="subject-stat-dot" style={{ background: getSubjectColor(subject) }} />
                <span className="subject-stat-name">{subject}</span>
                <span className="subject-stat-count" style={{ color: getSubjectColor(subject) }}>
                  {count} session{count > 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.controls.length === 0 && data.homework.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Aucune stat disponible</div>
          <div className="empty-sub">Ajoute des contrôles et des devoirs pour voir tes statistiques de progression</div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card">
      <span className="stat-card-icon">{icon}</span>
      <span className="stat-card-value" style={{ color }}>{value}</span>
      <span className="stat-card-label">{label}</span>
    </div>
  )
}
