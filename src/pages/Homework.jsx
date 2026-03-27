import React, { useState } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ProgressBar from '../components/ui/ProgressBar'
import { FormField, Input, Select, Textarea } from '../components/ui/FormField'
import { daysUntil, formatDate } from '../utils/scheduler'
import './Homework.css'

export default function Homework({ store }) {
  const { data, addHomework, updateHomework, deleteHomework, toggleHomeworkStep, toggleDevoir, deleteDevoir } = store
  const [showModal, setShowModal] = useState(false)
  const [editHw, setEditHw] = useState(null)

  const subjects = data.settings.subjects

  // Devoirs manuels
  const sorted = [...data.homework].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  const upcomingManual = sorted.filter(h => daysUntil(h.dueDate) >= 0)
  const pastManual = sorted.filter(h => daysUntil(h.dueDate) < 0)

  // Devoirs Pronote
  const pronoteDevoirs = [...(data.devoirs || [])].sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))
  const upcomingPronote = pronoteDevoirs.filter(d => daysUntil(d.dateLimite) >= 0)
  const pastPronote = pronoteDevoirs.filter(d => daysUntil(d.dateLimite) < 0)

  const totalUpcoming = upcomingManual.length + upcomingPronote.length

  function handleDelete(id) {
    if (confirm('Supprimer ce devoir ?')) deleteHomework(id)
  }

  function closeModal() {
    setShowModal(false)
    setEditHw(null)
  }

  return (
    <div className="homework-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">📝 Devoirs</h1>
          <p className="page-sub">{totalUpcoming} à rendre</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Ajouter</Button>
      </div>

      {sorted.length === 0 && pronoteDevoirs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <div className="empty-title">Aucun devoir</div>
          <div className="empty-sub">Ajoute tes devoirs ou connecte Pronote pour les importer automatiquement</div>
          <Button onClick={() => setShowModal(true)} className="mt-16">+ Ajouter un devoir</Button>
        </div>
      )}

      {/* ── À rendre : manuels + Pronote mélangés ─────────── */}
      {(upcomingManual.length > 0 || upcomingPronote.length > 0) && (
        <section>
          <h2 className="section-title">À rendre</h2>
          <div className="hw-list">
            {upcomingManual.map(hw => (
              <HomeworkCard
                key={hw.id}
                hw={hw}
                onToggleStep={(i) => toggleHomeworkStep(hw.id, i)}
                onDelete={() => handleDelete(hw.id)}
              />
            ))}
            {upcomingPronote.map(devoir => (
              <PronoteCard
                key={devoir.id}
                devoir={devoir}
                onToggle={() => toggleDevoir(devoir.id)}
                onDelete={() => deleteDevoir(devoir.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Rendus ─────────────────────────────────────────── */}
      {(pastManual.length > 0 || pastPronote.length > 0) && (
        <section>
          <h2 className="section-title section-title--muted">Rendus</h2>
          <div className="hw-list">
            {pastManual.map(hw => (
              <HomeworkCard
                key={hw.id}
                hw={hw}
                past
                onToggleStep={(i) => toggleHomeworkStep(hw.id, i)}
                onDelete={() => handleDelete(hw.id)}
              />
            ))}
            {pastPronote.map(devoir => (
              <PronoteCard
                key={devoir.id}
                devoir={devoir}
                past
                onToggle={() => toggleDevoir(devoir.id)}
                onDelete={() => deleteDevoir(devoir.id)}
              />
            ))}
          </div>
        </section>
      )}

      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title="Nouveau devoir"
      >
        <HomeworkForm
          subjects={subjects}
          onSubmit={(values) => {
            addHomework(values)
            closeModal()
          }}
          onCancel={closeModal}
        />
      </Modal>
    </div>
  )
}

function HomeworkCard({ hw, onToggleStep, onDelete, past }) {
  const [expanded, setExpanded] = useState(false)
  const doneSteps = hw.steps.filter(s => s.done).length
  const days = daysUntil(hw.dueDate)
  const urgencyColor = days <= 1 ? 'red' : days <= 3 ? 'orange' : 'green'

  return (
    <Card className={`hw-card ${past ? 'hw-card--past' : ''}`} glowColor={urgencyColor}>
      <div className="hw-card-header">
        <div>
          <div className="hw-subject" style={{ color: getSubjectColorVar(hw.subject) }}>
            {hw.subject}
          </div>
          <h3 className="hw-title">{hw.title}</h3>
        </div>
        <button className="icon-btn icon-btn--danger" onClick={onDelete}>🗑️</button>
      </div>

      {hw.description && (
        <p className="hw-description">{hw.description}</p>
      )}

      <div className="hw-meta">
        <span className={`days-badge days-badge--${urgencyColor}`}>
          {days < 0 ? `Rendu il y a ${Math.abs(days)}j` : days === 0 ? 'À rendre aujourd\'hui !' : `À rendre dans ${days}j`}
        </span>
        <span className="hw-date">📅 {formatDate(hw.dueDate)}</span>
        <span className="hw-sessions">⏱️ {hw.estimatedSessions} session{hw.estimatedSessions > 1 ? 's' : ''}</span>
      </div>

      <ProgressBar
        value={doneSteps}
        max={hw.steps.length}
        color={urgencyColor}
        label={`${doneSteps}/${hw.steps.length} étapes`}
        size="sm"
      />

      {hw.steps.length > 0 && (
        <div className="hw-steps-section">
          <button className="hw-steps-toggle" onClick={() => setExpanded(!expanded)}>
            <span>Étapes</span>
            <span>{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <div className="hw-steps-list">
              {hw.steps.map((step, i) => (
                <button
                  key={i}
                  className={`step-item ${step.done ? 'step-item--done' : ''}`}
                  onClick={() => onToggleStep(i)}
                >
                  <span className={`session-check ${step.done ? 'session-check--done' : ''}`}>
                    {step.done ? '✓' : '○'}
                  </span>
                  <div className="step-info">
                    <span className="step-label">{step.label}</span>
                    <span className="step-date">{formatDate(step.date)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function HomeworkForm({ subjects, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    subject: subjects[0] || '',
    title: '',
    dueDate: '',
    description: '',
    estimatedSessions: 2,
  })

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.subject || !form.title || !form.dueDate) return
    onSubmit({ ...form, estimatedSessions: Number(form.estimatedSessions) })
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormField label="Matière" required>
        <Select value={form.subject} onChange={e => set('subject', e.target.value)}>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </FormField>

      <FormField label="Titre du devoir" required>
        <input
          className="form-input"
          placeholder="Ex: Dissertation sur la liberté"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          required
        />
      </FormField>

      <div className="form-row">
        <FormField label="Date de rendu" required>
          <input
            className="form-input"
            type="date"
            value={form.dueDate}
            onChange={e => set('dueDate', e.target.value)}
            required
          />
        </FormField>

        <FormField label="Sessions estimées (25 min)">
          <input
            className="form-input"
            type="number"
            min="1"
            max="20"
            value={form.estimatedSessions}
            onChange={e => set('estimatedSessions', e.target.value)}
          />
        </FormField>
      </div>

      <FormField label="Description (optionnel)">
        <textarea
          className="form-textarea"
          placeholder="Consignes, notes..."
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
        />
      </FormField>

      <div className="sessions-hint">
        💡 L'app découpera automatiquement le travail en {form.estimatedSessions} étape{form.estimatedSessions > 1 ? 's' : ''} réparties avant la date de rendu
      </div>

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary">Créer le devoir</Button>
      </div>
    </form>
  )
}

// ── Carte devoir Pronote ────────────────────────────────────
function PronoteCard({ devoir, onToggle, onDelete, past }) {
  const days = daysUntil(devoir.dateLimite)
  const urgencyColor = days <= 1 ? 'red' : days <= 3 ? 'orange' : 'green'

  return (
    <Card
      className={`hw-card ${past ? 'hw-card--past' : ''} ${devoir.fait ? 'hw-card--past' : ''}`}
      glowColor={urgencyColor}
    >
      <div className="hw-card-header">
        <div>
          <div className="hw-subject" style={{ color: getSubjectColorVar(devoir.matiere) }}>
            {devoir.matiere}
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.7rem',
              background: 'rgba(99,102,241,0.18)',
              color: '#818cf8',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: '4px',
              padding: '0.1rem 0.4rem',
              fontFamily: 'Rajdhani, sans-serif',
              fontWeight: 700,
            }}>🎓 Pronote</span>
            {devoir.necessiteAvance && (
              <span style={{
                marginLeft: '0.4rem',
                fontSize: '0.7rem',
                background: 'rgba(245,158,11,0.18)',
                color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.25)',
                borderRadius: '4px',
                padding: '0.1rem 0.4rem',
                fontFamily: 'Rajdhani, sans-serif',
                fontWeight: 700,
              }}>⚠️ À commencer tôt</span>
            )}
          </div>
          <h3 className="hw-title">{devoir.description || '(sans description)'}</h3>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            onClick={onToggle}
            style={{
              width: '1.6rem', height: '1.6rem', borderRadius: '50%',
              border: `2px solid ${devoir.fait ? 'var(--accent-green)' : 'var(--color-border)'}`,
              background: devoir.fait ? 'var(--accent-green)' : 'transparent',
              color: devoir.fait ? '#000' : 'var(--color-text)',
              cursor: 'pointer', fontSize: '0.8rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {devoir.fait ? '✓' : '○'}
          </button>
          <button className="icon-btn icon-btn--danger" onClick={onDelete}>🗑️</button>
        </div>
      </div>

      <div className="hw-meta">
        <span className={`days-badge days-badge--${urgencyColor}`}>
          {days < 0
            ? `Rendu il y a ${Math.abs(days)}j`
            : days === 0
              ? 'À rendre aujourd\'hui !'
              : `À rendre dans ${days}j`}
        </span>
        <span className="hw-date">📅 {formatDate(devoir.dateLimite)}</span>
        <span className="hw-sessions">⏱️ ~{devoir.estimationMinutes} min</span>
      </div>
    </Card>
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
