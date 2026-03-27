import React, { useMemo, useState } from 'react'
import Card from '../components/ui/Card'
import ProgressBar from '../components/ui/ProgressBar'
import { getTodaySessions } from '../utils/scheduler'
import './Dashboard.css'

const QUOTES = [
  "Go beyond the impossible and kick reason to the curb!",
  "Believe in the you that believes in yourself.",
  "Your drill is the drill that will pierce the heavens!",
  "Don't believe in yourself. Believe in the me that believes in you.",
  "If you're gonna dig, dig to the heavens!",
  "We evolve beyond the person we were a minute before.",
  "The tomorrow we're trying to reach is not a tomorrow you had decided on.",
  "My drill is my soul!",
  "Reject common sense to make the impossible possible!",
  "Who the hell do you think I am?!",
]

const CATEGORY_CONFIG = {
  revision: { icon: '📚', label: 'Révisions', color: 'var(--accent-green)' },
  devoir: { icon: '📝', label: 'Devoirs', color: 'var(--accent-blue)' },
  perso: { icon: '🏠', label: 'Tâches perso', color: 'var(--color-perso)' },
  rdv: { icon: '📅', label: 'Rendez-vous', color: 'var(--color-rdv)' },
}

export default function Dashboard({ store }) {
  const { data, toggleSession, toggleHomeworkStep, toggleTask, toggleControleSession, nextControlInfo } = store

  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [])

  const todayItems = useMemo(
    () => getTodaySessions(data.controls, data.homework, data.tasks, data.controles || []),
    [data.controls, data.homework, data.tasks, data.controles]
  )

  const totalDone = todayItems.filter(i => i.done).length
  const totalItems = todayItems.length

  const today = new Date()
  const dateLabel = today.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const grouped = useMemo(() => {
    const groups = {}
    todayItems.forEach(item => {
      const cat = item.category || 'perso'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    })
    return groups
  }, [todayItems])

  function handleToggle(item) {
    if (item.type === 'revision') {
      if (item.controleId) toggleControleSession(item.controleId, item.sessionDate)
      else toggleSession(item.controlId, item.sessionDate)
    } else if (item.type === 'homework') {
      toggleHomeworkStep(item.hwId, item.stepIndex)
    } else if (item.type === 'task') {
      toggleTask(item.taskId)
    }
  }

  return (
    <div className="dashboard">
      {/* Citation Gurren Lagann */}
      <div className="quote-banner">
        <div className="quote-drill">◈</div>
        <div className="quote-text">"{quote}"</div>
        <div className="quote-source">— Gurren Lagann</div>
      </div>

      {/* Header jour */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Aujourd'hui</h1>
          <p className="dashboard-date">{dateLabel}</p>
        </div>
        <div className="dashboard-streak">
          <span className="streak-fire">🔥</span>
          <div>
            <div className="streak-count">{data.settings.streak || 0}</div>
            <div className="streak-label">jour{(data.settings.streak || 0) > 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* Progression du jour */}
      <Card className="dashboard-progress-card">
        <div className="progress-title">
          <span>Progression du jour</span>
          <span className="progress-count">{totalDone}/{totalItems} tâches</span>
        </div>
        <ProgressBar
          value={totalDone}
          max={totalItems || 1}
          color="green"
          size="lg"
          showPercent={true}
        />
        {totalItems === 0 && (
          <p className="no-tasks-msg">Aucune tâche aujourd'hui — profite, mais pas trop 😤</p>
        )}
        {totalDone === totalItems && totalItems > 0 && (
          <p className="all-done-msg">🎉 Toutes les tâches complétées ! WHO THE HELL DO YOU THINK YOU ARE?!</p>
        )}
      </Card>

      {/* Prochain contrôle */}
      {nextControlInfo && (
        <Card className="dashboard-next-control">
          <div className="next-control-header">
            <span className="next-control-icon">🎯</span>
            <span className="next-control-label">Prochain contrôle</span>
            {nextControlInfo.intensite && (
              <span className="next-control-intensite">
                {'⭐'.repeat(nextControlInfo.intensite)}
              </span>
            )}
          </div>
          <div className="next-control-subject">{nextControlInfo.subject}</div>
          <div className="next-control-meta">
            <span className={`next-control-days ${nextControlInfo.daysLeft <= 2 ? 'days--red' : nextControlInfo.daysLeft <= 7 ? 'days--orange' : 'days--green'}`}>
              {nextControlInfo.daysLeft === 0 ? "Aujourd'hui !" : nextControlInfo.daysLeft === 1 ? 'Demain' : `Dans ${nextControlInfo.daysLeft} jours`}
            </span>
            <span className="next-control-sessions">
              {nextControlInfo.doneSessions}/{nextControlInfo.totalSessions} sessions faites
            </span>
          </div>
        </Card>
      )}

      {/* Tâches groupées */}
      {Object.entries(grouped).map(([category, items]) => {
        const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.perso
        const doneCat = items.filter(i => i.done).length
        return (
          <Card key={category} className="task-group-card">
            <div className="task-group-header">
              <div className="task-group-title" style={{ color: config.color }}>
                <span>{config.icon}</span>
                <span>{config.label}</span>
              </div>
              <span className="task-group-count">{doneCat}/{items.length}</span>
            </div>
            <div className="task-list">
              {items.map((item, idx) => (
                <TaskItem key={idx} item={item} onToggle={() => handleToggle(item)} />
              ))}
            </div>
          </Card>
        )
      })}

      {todayItems.length === 0 && (
        <div className="empty-day">
          <div className="empty-icon">⚡</div>
          <div className="empty-title">Journée libre !</div>
          <div className="empty-sub">Ajoute des contrôles et devoirs pour générer ton planning</div>
        </div>
      )}
    </div>
  )
}

function TaskItem({ item, onToggle }) {
  return (
    <button
      className={`task-item ${item.done ? 'task-item--done' : ''}`}
      onClick={onToggle}
    >
      <span className={`task-checkbox ${item.done ? 'task-checkbox--checked' : ''}`}>
        {item.done ? '✓' : ''}
      </span>
      <div className="task-info">
        <span className="task-title">{item.title}</span>
        {item.subject && <span className="task-subject">{item.subject}</span>}
        {item.time && <span className="task-time">🕐 {item.time}</span>}
      </div>
      <span className="task-duration">25 min</span>
    </button>
  )
}
