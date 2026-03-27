import React, { useState } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { DifficultyBadge } from '../components/ui/Badge'
import ProgressBar from '../components/ui/ProgressBar'
import { FormField, Input, Select } from '../components/ui/FormField'
import { daysUntil, formatDate } from '../utils/scheduler'
import './Controls.css'

const SUBJECTS_DEFAULT = ['Maths', 'Français (EAF)', 'Management', 'Gestion', 'Anglais']

export default function Controls({ store }) {
  const { data, addControl, updateControl, deleteControl, toggleSession, addSubject } = store
  const [showModal, setShowModal] = useState(false)
  const [editControl, setEditControl] = useState(null)
  const [newSubject, setNewSubject] = useState('')

  const subjects = data.settings.subjects

  const sorted = [...data.controls].sort((a, b) => new Date(a.date) - new Date(b.date))
  const upcoming = sorted.filter(c => daysUntil(c.date) >= 0)
  const past = sorted.filter(c => daysUntil(c.date) < 0)

  function handleDelete(id) {
    if (confirm('Supprimer ce contrôle et toutes ses sessions ?')) deleteControl(id)
  }

  function openEdit(control) {
    setEditControl(control)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditControl(null)
  }

  return (
    <div className="controls-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🎯 Contrôles</h1>
          <p className="page-sub">{upcoming.length} à venir</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Ajouter</Button>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <EmptyState onAdd={() => setShowModal(true)} />
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="section-title">À venir</h2>
          <div className="controls-grid">
            {upcoming.map(control => (
              <ControlCard
                key={control.id}
                control={control}
                onToggleSession={(date) => toggleSession(control.id, date)}
                onEdit={() => openEdit(control)}
                onDelete={() => handleDelete(control.id)}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="section-title section-title--muted">Passés</h2>
          <div className="controls-grid">
            {past.map(control => (
              <ControlCard
                key={control.id}
                control={control}
                past
                onToggleSession={(date) => toggleSession(control.id, date)}
                onEdit={() => openEdit(control)}
                onDelete={() => handleDelete(control.id)}
              />
            ))}
          </div>
        </section>
      )}

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editControl ? 'Modifier le contrôle' : 'Nouveau contrôle'}
      >
        <ControlForm
          subjects={subjects}
          initial={editControl}
          onSubmit={(values) => {
            if (editControl) {
              updateControl(editControl.id, values)
            } else {
              addControl(values)
            }
            closeModal()
          }}
          onCancel={closeModal}
          onAddSubject={(s) => { addSubject(s); setNewSubject('') }}
        />
      </Modal>
    </div>
  )
}

function ControlCard({ control, onToggleSession, onEdit, onDelete, past }) {
  const [expanded, setExpanded] = useState(false)
  const days = daysUntil(control.date)
  const doneSessions = control.sessions.filter(s => s.done).length
  const totalSessions = control.sessions.length

  const urgencyColor = days <= 2 ? 'red' : days <= 7 ? 'orange' : 'green'

  // Grouper les sessions par semaine pour l'affichage
  const upcomingSessions = control.sessions
    .filter(s => daysUntil(s.date) >= 0)
    .slice(0, expanded ? undefined : 5)

  return (
    <Card className={`control-card ${past ? 'control-card--past' : ''}`} glowColor={urgencyColor}>
      <div className="control-card-header">
        <div className="control-card-subject" style={{ color: getSubjectColorVar(control.subject) }}>
          {control.subject}
        </div>
        <div className="control-card-actions">
          <button className="icon-btn" onClick={onEdit} title="Modifier">✏️</button>
          <button className="icon-btn icon-btn--danger" onClick={onDelete} title="Supprimer">🗑️</button>
        </div>
      </div>

      <h3 className="control-card-title">{control.title}</h3>

      <div className="control-card-meta">
        <DifficultyBadge difficulty={control.difficulty} />
        <span className={`days-badge days-badge--${urgencyColor}`}>
          {days < 0 ? `Il y a ${Math.abs(days)}j` : days === 0 ? "Aujourd'hui !" : `Dans ${days}j`}
        </span>
        <span className="control-card-date">📅 {formatDate(control.date)}</span>
      </div>

      <div className="control-card-progress">
        <ProgressBar
          value={doneSessions}
          max={totalSessions}
          color={urgencyColor}
          label={`${doneSessions}/${totalSessions} sessions`}
          size="sm"
        />
      </div>

      {totalSessions > 0 && (
        <div className="sessions-section">
          <div className="sessions-header" onClick={() => setExpanded(!expanded)}>
            <span className="sessions-label">Sessions de révision</span>
            <span className="sessions-toggle">{expanded ? '▲' : '▼'}</span>
          </div>
          {(expanded || upcomingSessions.length <= 5) && (
            <div className="sessions-list">
              {control.sessions
                .slice(0, expanded ? undefined : 5)
                .map((s, i) => (
                  <button
                    key={i}
                    className={`session-item ${s.done ? 'session-item--done' : ''}`}
                    onClick={() => onToggleSession(s.date)}
                  >
                    <span className={`session-check ${s.done ? 'session-check--done' : ''}`}>
                      {s.done ? '✓' : '○'}
                    </span>
                    <span className="session-date">{formatDate(s.date)}</span>
                    <span className="session-duration">25 min</span>
                  </button>
                ))}
              {!expanded && control.sessions.length > 5 && (
                <button className="sessions-more" onClick={() => setExpanded(true)}>
                  + {control.sessions.length - 5} sessions de plus
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function ControlForm({ subjects, initial, onSubmit, onCancel, onAddSubject }) {
  const [form, setForm] = useState({
    subject: initial?.subject || subjects[0] || '',
    title: initial?.title || '',
    date: initial?.date || '',
    difficulty: initial?.difficulty || 'moyen',
  })
  const [customSubject, setCustomSubject] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.subject || !form.title || !form.date) return
    onSubmit(form)
  }

  function handleAddSubject() {
    if (customSubject.trim()) {
      onAddSubject(customSubject.trim())
      set('subject', customSubject.trim())
      setCustomSubject('')
      setShowCustom(false)
    }
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormField label="Matière" required>
        <Select value={form.subject} onChange={e => set('subject', e.target.value)}>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="__custom__">+ Ajouter une matière...</option>
        </Select>
        {form.subject === '__custom__' && (
          <div className="custom-subject-row">
            <input
              className="form-input"
              placeholder="Nom de la matière"
              value={customSubject}
              onChange={e => setCustomSubject(e.target.value)}
            />
            <Button type="button" size="sm" onClick={handleAddSubject}>OK</Button>
          </div>
        )}
      </FormField>

      <FormField label="Titre / Chapitre" required>
        <Input
          placeholder="Ex: Équations du 2nd degré"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          required
        />
      </FormField>

      <div className="form-row">
        <FormField label="Date du contrôle" required>
          <Input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            required
          />
        </FormField>

        <FormField label="Difficulté">
          <Select value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
            <option value="facile">Facile</option>
            <option value="moyen">Moyen</option>
            <option value="dur">Difficile</option>
          </Select>
        </FormField>
      </div>

      <div className="difficulty-hint">
        {form.difficulty === 'facile' && '📗 Début 3 jours avant · 1 session/jour'}
        {form.difficulty === 'moyen' && '📙 Début 1 semaine avant · Sessions espacées'}
        {form.difficulty === 'dur' && '📕 Début 1 mois avant · Intensif la dernière semaine'}
      </div>

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary">
          {initial ? 'Sauvegarder' : 'Créer le contrôle'}
        </Button>
      </div>
    </form>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🎯</div>
      <div className="empty-title">Aucun contrôle</div>
      <div className="empty-sub">Ajoute tes contrôles pour générer automatiquement ton planning de révisions</div>
      <Button onClick={onAdd} className="mt-16">+ Ajouter mon premier contrôle</Button>
    </div>
  )
}

function getSubjectColorVar(subject) {
  const map = {
    'Maths': 'var(--color-maths)',
    'Français (EAF)': 'var(--color-francais)',
    'Management': 'var(--color-management)',
    'Gestion': 'var(--color-gestion)',
    'Anglais': 'var(--color-anglais)',
  }
  return map[subject] || 'var(--color-default)'
}
