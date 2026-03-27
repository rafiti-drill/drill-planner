import React, { useState, useEffect } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { DEFAULT_QUOTES, DEFAULT_SUBJECT_COLORS } from '../hooks/useStore'
import './Settings.css'

const DAYS = [
  { id: 1, label: 'Lundi' },
  { id: 2, label: 'Mardi' },
  { id: 3, label: 'Mercredi' },
  { id: 4, label: 'Jeudi' },
  { id: 5, label: 'Vendredi' },
  { id: 6, label: 'Samedi' },
  { id: 0, label: 'Dimanche' },
]

function formatMinutes(min) {
  if (min === 0) return 'Indisponible'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function sessionsCount(minutes) {
  return Math.floor(minutes / 25)
}

export default function Settings({ store }) {
  const { data, updateSettings, addSubject, removeSubject, updateQuotes, updateSubjectColors } = store
  const { settings } = data

  // ── Matières ──────────────────────────────────────────────
  const [newSubject, setNewSubject] = useState('')
  const [subjectError, setSubjectError] = useState('')

  // ── Citations ─────────────────────────────────────────────
  const quotes = settings.quotes || DEFAULT_QUOTES
  const [editingQuoteIdx, setEditingQuoteIdx] = useState(null)
  const [editText, setEditText] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('')
  const [quoteError, setQuoteError] = useState('')

  // ── Couleurs ──────────────────────────────────────────────
  const savedColors = { ...DEFAULT_SUBJECT_COLORS, ...(settings.subjectColors || {}) }
  const [localColors, setLocalColors] = useState(null)
  const [colorsSaved, setColorsSaved] = useState(false)

  // Réinitialise les couleurs locales quand Firestore se met à jour
  useEffect(() => {
    setLocalColors(null)
  }, [settings.subjectColors])

  const displayColors = localColors || savedColors
  const colorsChanged = localColors !== null &&
    settings.subjects.some(s => localColors[s] !== savedColors[s])

  // ── Disponibilités ────────────────────────────────────────
  const handleSlider = (dayId, value) => {
    updateSettings({
      availability: {
        ...settings.availability,
        [dayId]: Number(value),
      }
    })
  }

  // ── Matières ──────────────────────────────────────────────
  const handleAddSubject = (e) => {
    e.preventDefault()
    const trimmed = newSubject.trim()
    if (!trimmed) return
    if (settings.subjects.includes(trimmed)) {
      setSubjectError('Cette matière existe déjà.')
      return
    }
    addSubject(trimmed)
    setNewSubject('')
    setSubjectError('')
  }

  const handleRemoveSubject = (subject) => {
    if (settings.subjects.length <= 1) return
    removeSubject(subject)
  }

  // ── Citations ─────────────────────────────────────────────
  const startEditQuote = (idx) => {
    setEditingQuoteIdx(idx)
    setEditText(quotes[idx].text)
    setEditAuthor(quotes[idx].author)
  }

  const cancelEditQuote = () => {
    setEditingQuoteIdx(null)
    setEditText('')
    setEditAuthor('')
  }

  const saveQuoteEdit = (idx) => {
    const text = editText.trim()
    const author = editAuthor.trim()
    if (!text) return
    const updated = quotes.map((q, i) => i === idx ? { text, author: author || 'Anonyme' } : q)
    updateQuotes(updated)
    setEditingQuoteIdx(null)
  }

  const deleteQuote = (idx) => {
    if (quotes.length <= 1) return
    const updated = quotes.filter((_, i) => i !== idx)
    updateQuotes(updated)
    if (editingQuoteIdx === idx) setEditingQuoteIdx(null)
  }

  const handleAddQuote = (e) => {
    e.preventDefault()
    const text = newQuoteText.trim()
    const author = newQuoteAuthor.trim()
    if (!text) {
      setQuoteError('Le texte de la citation est requis.')
      return
    }
    const updated = [...quotes, { text, author: author || 'Anonyme' }]
    updateQuotes(updated)
    setNewQuoteText('')
    setNewQuoteAuthor('')
    setQuoteError('')
  }

  const resetQuotes = () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Remettre les 10 citations Gurren Lagann par défaut ?')) return
    updateQuotes(DEFAULT_QUOTES)
    setEditingQuoteIdx(null)
  }

  // ── Couleurs ──────────────────────────────────────────────
  const handleColorChange = (subject, color) => {
    setLocalColors(prev => ({
      ...(prev || savedColors),
      [subject]: color,
    }))
    setColorsSaved(false)
  }

  const handleSaveColors = async () => {
    await updateSubjectColors(displayColors)
    setColorsSaved(true)
    setTimeout(() => setColorsSaved(false), 2000)
  }

  const handleResetColors = () => {
    setLocalColors({ ...DEFAULT_SUBJECT_COLORS })
    setColorsSaved(false)
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1 className="settings-title">
          <span className="settings-title-icon">⚙</span>
          Réglages
        </h1>
        <p className="settings-subtitle">Configure ton planning selon tes disponibilités</p>
      </div>

      {/* ── Section disponibilités ── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-section-icon">⏱</span>
          Disponibilités par jour
        </h2>
        <p className="settings-section-desc">
          Définis le temps disponible chaque jour. 1 session = 25 min.
        </p>

        <div className="availability-grid">
          {DAYS.map(day => {
            const minutes = settings.availability?.[day.id] ?? settings.availability?.[String(day.id)] ?? 0
            const sessions = sessionsCount(minutes)

            return (
              <div key={day.id} className={`availability-row ${minutes === 0 ? 'unavailable' : ''}`}>
                <div className="availability-day">
                  <span className="availability-day-label">{day.label}</span>
                  <span className="availability-sessions">
                    {sessions > 0
                      ? `${sessions} session${sessions > 1 ? 's' : ''} max`
                      : 'Repos'}
                  </span>
                </div>

                <div className="availability-control">
                  <input
                    type="range"
                    min="0"
                    max="240"
                    step="15"
                    value={minutes}
                    onChange={e => handleSlider(day.id, e.target.value)}
                    className="availability-slider"
                  />
                  <span className="availability-value">{formatMinutes(minutes)}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="availability-legend">
          <span className="legend-item"><span className="legend-dot green" />Disponible</span>
          <span className="legend-item"><span className="legend-dot red" />Indisponible</span>
          <span className="legend-info">Plafond absolu : 4 sessions/jour</span>
        </div>
      </section>

      {/* ── Section citations ── */}
      <section className="settings-section settings-quotes">
        <div className="settings-section-header">
          <div>
            <h2 className="settings-section-title">
              <span className="settings-section-icon">◈</span>
              Citations motivantes
            </h2>
            <p className="settings-section-desc">
              {quotes.length} citation{quotes.length > 1 ? 's' : ''} — une différente s'affiche chaque jour
            </p>
          </div>
          <button className="section-reset-btn" onClick={resetQuotes} title="Remettre les citations par défaut">
            Réinitialiser
          </button>
        </div>

        <div className="quotes-list">
          {quotes.map((q, idx) => (
            editingQuoteIdx === idx ? (
              <div key={idx} className="quote-edit-row">
                <div className="quote-edit-fields">
                  <input
                    className="quote-edit-input"
                    placeholder="Texte de la citation..."
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="quote-edit-input quote-edit-author"
                    placeholder="Auteur..."
                    value={editAuthor}
                    onChange={e => setEditAuthor(e.target.value)}
                  />
                </div>
                <div className="quote-edit-actions">
                  <button className="quote-action-btn quote-btn-save" onClick={() => saveQuoteEdit(idx)} title="Enregistrer">✓</button>
                  <button className="quote-action-btn quote-btn-cancel" onClick={cancelEditQuote} title="Annuler">✗</button>
                </div>
              </div>
            ) : (
              <div key={idx} className="quote-item">
                <div className="quote-item-content" onClick={() => startEditQuote(idx)} title="Cliquer pour modifier">
                  <span className="quote-item-text">"{q.text}"</span>
                  <span className="quote-item-author">— {q.author}</span>
                </div>
                <button
                  className="quote-action-btn quote-btn-delete"
                  onClick={() => deleteQuote(idx)}
                  disabled={quotes.length <= 1}
                  title="Supprimer"
                >
                  🗑
                </button>
              </div>
            )
          ))}
        </div>

        <form className="quote-add-form" onSubmit={handleAddQuote}>
          <div className="quote-add-inputs">
            <input
              className="subject-add-input"
              placeholder="Nouvelle citation..."
              value={newQuoteText}
              onChange={e => { setNewQuoteText(e.target.value); setQuoteError('') }}
              maxLength={200}
            />
            <input
              className="subject-add-input quote-add-author-input"
              placeholder="Auteur (optionnel)"
              value={newQuoteAuthor}
              onChange={e => setNewQuoteAuthor(e.target.value)}
              maxLength={60}
            />
          </div>
          <button type="submit" className="subject-add-btn">+ Ajouter</button>
        </form>
        {quoteError && <p className="subject-error">{quoteError}</p>}
      </section>

      {/* ── Section couleurs des matières ── */}
      <section className="settings-section settings-colors">
        <div className="settings-section-header">
          <div>
            <h2 className="settings-section-title">
              <span className="settings-section-icon">🎨</span>
              Couleurs des matières
            </h2>
            <p className="settings-section-desc">
              Clique sur le swatch pour changer la couleur. Enregistre ensuite.
            </p>
          </div>
          <button className="section-reset-btn" onClick={handleResetColors} title="Remettre les couleurs par défaut">
            Réinitialiser
          </button>
        </div>

        <div className="subject-colors-list">
          {settings.subjects.map(subject => {
            const color = displayColors[subject] || '#8888aa'
            return (
              <div key={subject} className="subject-color-row">
                <label className="color-swatch-label" title={`Changer la couleur de ${subject}`}>
                  <span
                    className="color-swatch"
                    style={{ background: color, boxShadow: `0 0 10px ${color}66` }}
                  />
                  <input
                    type="color"
                    value={color}
                    onChange={e => handleColorChange(subject, e.target.value)}
                    className="color-input-hidden"
                  />
                </label>
                <span className="subject-color-name">{subject}</span>
                <span className="subject-color-hex">{color}</span>
              </div>
            )
          })}
        </div>

        {(colorsChanged || colorsSaved) && (
          <div className="color-save-row">
            {colorsChanged && (
              <button className="color-save-btn" onClick={handleSaveColors}>
                Enregistrer les couleurs
              </button>
            )}
            {colorsSaved && (
              <span className="color-saved-msg">✓ Couleurs enregistrées !</span>
            )}
          </div>
        )}
      </section>

      {/* ── Section matières ── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-section-icon">📚</span>
          Gestion des matières
        </h2>
        <p className="settings-section-desc">
          Ajoute ou supprime les matières disponibles dans l'application.
        </p>

        <div className="subjects-list">
          {settings.subjects.map(subject => (
            <div
              key={subject}
              className="subject-chip"
              style={{ borderColor: `${displayColors[subject] || '#8888aa'}66` }}
            >
              <span
                className="subject-chip-dot"
                style={{ background: displayColors[subject] || '#8888aa' }}
              />
              <span className="subject-chip-label">{subject}</span>
              <button
                className="subject-chip-delete"
                onClick={() => handleRemoveSubject(subject)}
                disabled={settings.subjects.length <= 1}
                title="Supprimer"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <form className="subject-add-form" onSubmit={handleAddSubject}>
          <input
            type="text"
            className="subject-add-input"
            placeholder="Nouvelle matière..."
            value={newSubject}
            onChange={e => {
              setNewSubject(e.target.value)
              setSubjectError('')
            }}
            maxLength={40}
          />
          <button type="submit" className="subject-add-btn">
            + Ajouter
          </button>
        </form>
        {subjectError && <p className="subject-error">{subjectError}</p>}
      </section>

      {/* ── Info session ── */}
      <section className="settings-section settings-info">
        <h2 className="settings-section-title">
          <span className="settings-section-icon">ℹ</span>
          Comment fonctionne la planification ?
        </h2>
        <ul className="info-list">
          <li>1 session de révision = <strong>25 minutes</strong></li>
          <li>Le planificateur respecte tes disponibilités par jour</li>
          <li>Si un jour est à <strong>0 min</strong>, aucune session n'y est placée</li>
          <li>Les sessions sont réparties selon la difficulté du contrôle</li>
          <li>Modifier les dispo ne recalcule pas les contrôles existants — supprime et recrée-les</li>
        </ul>
      </section>

      {/* ── Déconnexion ── */}
      <section className="settings-section">
        <h2 className="settings-section-title">
          <span className="settings-section-icon">🔒</span>
          Compte
        </h2>
        <p className="settings-section-desc">
          Déconnecte-toi de Drill Planner sur cet appareil.
        </p>
        <button
          className="logout-btn"
          onClick={() => signOut(auth)}
        >
          Se déconnecter
        </button>
      </section>
    </div>
  )
}
