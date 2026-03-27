import React, { useState, useEffect, useCallback } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { db } from '../firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { INTENSITE_CONFIG } from '../utils/scheduler'
import { daysUntil, formatDate } from '../utils/scheduler'
import './Pronote.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function Pronote({ store, userId }) {
  const { data, updateControle, deleteControle, toggleDevoir, deleteDevoir } = store

  // ── Formulaire de connexion ──────────────────────────────
  const [loginMethod, setLoginMethod] = useState('qr') // 'qr' | 'direct'
  const [form, setForm] = useState({ url: '', username: '', password: '', qrJson: '', pin: '' })
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  // ── Statut de connexion (depuis Firestore) ──────────────
  const [pronoteStatus, setPronoteStatus] = useState(null) // { studentName, connectedAt, lastSync }

  useEffect(() => {
    if (!userId) return
    const unsub = onSnapshot(doc(db, 'pronote', userId), snap => {
      if (snap.exists()) {
        setPronoteStatus(snap.data())
      } else {
        setPronoteStatus(null)
      }
    })
    return () => unsub()
  }, [userId])

  // ── Connexion à Pronote ──────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setConnecting(true)
    try {
      let body

      if (loginMethod === 'qr') {
        let qrData
        try {
          qrData = JSON.parse(form.qrJson)
        } catch {
          throw new Error('Le JSON du QR code est invalide. Vérifie le format.')
        }
        if (!qrData.url || !qrData.login || !qrData.jeton) {
          throw new Error('Le QR code doit contenir : url, login, jeton')
        }
        body = { loginMethod: 'qr', qrData, pin: form.pin, userId }
      } else {
        body = { loginMethod: 'direct', url: form.url, username: form.username, password: form.password, userId }
      }

      const res = await fetch(`${BACKEND_URL}/api/pronote/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setForm(f => ({ ...f, password: '', pin: '' }))
    } catch (err) {
      setError(err.message || 'Erreur de connexion. Vérifiez que le backend Render est actif.')
    } finally {
      setConnecting(false)
    }
  }

  // ── Synchronisation manuelle ─────────────────────────────
  async function handleSync() {
    setError('')
    setSyncing(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/pronote/sync?userId=${userId}`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
    } catch (err) {
      setError(err.message || 'Erreur de synchronisation. Vérifiez que le serveur tourne sur le port 3001.')
    } finally {
      setSyncing(false)
    }
  }

  // ── Modifier l'intensité d'un contrôle ──────────────────
  const handleIntensiteChange = useCallback((id, intensite) => {
    updateControle(id, { intensite })
  }, [updateControle])

  const controles = data.controles || []
  const devoirs = data.devoirs || []
  const sortedControles = [...controles].sort((a, b) => a.date.localeCompare(b.date))
  const sortedDevoirs = [...devoirs].sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))

  return (
    <div className="pronote-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🎓 Pronote</h1>
          <p className="page-sub">Synchronisation automatique de ton agenda</p>
        </div>
      </div>

      {/* ── Section Connexion ─────────────────────────────── */}
      <Card className="pronote-card">
        <h2 className="pronote-section-title">Connexion</h2>

        <div className="pronote-status-row">
          {pronoteStatus ? (
            <div className="pronote-status pronote-status--ok">
              <span>✅ Connecté en tant que <strong>{pronoteStatus.studentName}</strong></span>
            </div>
          ) : (
            <div className="pronote-status pronote-status--off">
              <span>❌ Non connecté</span>
            </div>
          )}
          {pronoteStatus?.lastSync && (
            <span className="pronote-lastsync">
              Dernière sync : {formatRelativeTime(pronoteStatus.lastSync)}
            </span>
          )}
        </div>

        {pronoteStatus && (
          <div className="pronote-sync-row">
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="primary"
            >
              {syncing ? '⏳ Synchronisation…' : '🔄 Synchroniser maintenant'}
            </Button>
          </div>
        )}

        {/* Onglets de méthode */}
        <div className="pronote-method-tabs">
          <button
            className={`pronote-method-tab ${loginMethod === 'qr' ? 'active' : ''}`}
            onClick={() => setLoginMethod('qr')}
            type="button"
          >
            📱 Via ENT / Atrium
          </button>
          <button
            className={`pronote-method-tab ${loginMethod === 'direct' ? 'active' : ''}`}
            onClick={() => setLoginMethod('direct')}
            type="button"
          >
            🔑 Connexion directe
          </button>
        </div>

        <form className="pronote-form" onSubmit={handleLogin}>
          {loginMethod === 'qr' ? (
            <>
              <div className="pronote-qr-instructions">
                <strong>Étapes :</strong>
                <ol>
                  <li>Ouvre Pronote via Atrium normalement</li>
                  <li>Va dans <em>Mon compte → Paramètres de connexion → Générer un QR code</em></li>
                  <li>Définis un code PIN à 4 chiffres</li>
                  <li>Lis le QR code avec une app (ex: Google Lens) — copie le texte JSON affiché</li>
                  <li>Colle-le ci-dessous</li>
                </ol>
              </div>
              <div className="pronote-field">
                <label className="pronote-label">Contenu du QR code (JSON)</label>
                <textarea
                  className="pronote-input pronote-textarea"
                  placeholder={'{"url":"https://...","login":"...","jeton":"..."}'}
                  value={form.qrJson}
                  onChange={e => setForm(f => ({ ...f, qrJson: e.target.value }))}
                  rows={3}
                  required
                />
              </div>
              <div className="pronote-field">
                <label className="pronote-label">Code PIN (4 chiffres)</label>
                <input
                  className="pronote-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  value={form.pin}
                  onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="pronote-field">
                <label className="pronote-label">URL Pronote</label>
                <input
                  className="pronote-input"
                  type="url"
                  placeholder="https://xxx.index-education.net/pronote/"
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  required
                />
              </div>
              <div className="pronote-field-row">
                <div className="pronote-field">
                  <label className="pronote-label">Identifiant</label>
                  <input
                    className="pronote-input"
                    type="text"
                    placeholder="Identifiant Pronote"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                    required
                  />
                </div>
                <div className="pronote-field">
                  <label className="pronote-label">Mot de passe</label>
                  <input
                    className="pronote-input"
                    type="password"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </>
          )}

          {error && <div className="pronote-error">⚠️ {error}</div>}

          <Button type="submit" disabled={connecting} fullWidth>
            {connecting ? '⏳ Connexion…' : pronoteStatus ? '🔄 Reconnecter' : '🔌 Connecter à Pronote'}
          </Button>
        </form>
      </Card>

      {/* ── Contrôles détectés ───────────────────────────── */}
      <Card className="pronote-card">
        <h2 className="pronote-section-title">
          Contrôles détectés
          <span className="pronote-count">{sortedControles.length}</span>
        </h2>

        {sortedControles.length === 0 ? (
          <div className="pronote-empty">
            Aucun contrôle synchronisé. Lance une synchronisation pour en importer.
          </div>
        ) : (
          <div className="pronote-controles-list">
            {sortedControles.map(controle => (
              <ControleItem
                key={controle.id}
                controle={controle}
                onIntensiteChange={handleIntensiteChange}
                onDelete={() => deleteControle(controle.id)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── Devoirs détectés ─────────────────────────────── */}
      <Card className="pronote-card">
        <h2 className="pronote-section-title">
          Devoirs détectés
          <span className="pronote-count">{sortedDevoirs.length}</span>
        </h2>

        {sortedDevoirs.length === 0 ? (
          <div className="pronote-empty">
            Aucun devoir synchronisé. Lance une synchronisation pour en importer.
          </div>
        ) : (
          <div className="pronote-devoirs-list">
            {sortedDevoirs.map(devoir => (
              <DevoirItem
                key={devoir.id}
                devoir={devoir}
                onToggle={() => toggleDevoir(devoir.id)}
                onDelete={() => deleteDevoir(devoir.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Composant : carte d'un contrôle Pronote ─────────────────
function ControleItem({ controle, onIntensiteChange, onDelete }) {
  const days = daysUntil(controle.date)
  const urgencyClass = days <= 2 ? 'urgent-red' : days <= 7 ? 'urgent-orange' : 'urgent-green'
  const intensite = controle.intensite || 2
  const config = INTENSITE_CONFIG[intensite] || INTENSITE_CONFIG[2]
  const sessionsDone = (controle.sessions || []).filter(s => s.done).length
  const sessionsTotal = (controle.sessions || []).length

  return (
    <div className={`pronote-controle-item ${urgencyClass}`}>
      <div className="pronote-controle-header">
        <div className="pronote-controle-info">
          <span className="pronote-controle-matiere">{controle.matiere}</span>
          <span className="pronote-controle-titre">{controle.titre}</span>
          <span className="pronote-controle-date">
            📅 {formatDate(controle.date)}
          </span>
        </div>
        <div className="pronote-controle-actions">
          <span className={`pronote-urgency-badge urgency--${urgencyClass}`}>
            {days < 0 ? `Passé` : days === 0 ? "Aujourd'hui" : `Dans ${days}j`}
          </span>
          <button
            className="icon-btn icon-btn--danger"
            onClick={onDelete}
            title="Ignorer ce contrôle"
          >
            🗑️
          </button>
        </div>
      </div>

      {sessionsTotal > 0 && (
        <div className="pronote-sessions-info">
          📚 {sessionsDone}/{sessionsTotal} sessions planifiées
        </div>
      )}

      <div className="pronote-intensite-row">
        <span className="pronote-intensite-label">
          ⭐ Intensité : <strong>{intensite}/5</strong> — {config.label}
        </span>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={intensite}
          onChange={e => onIntensiteChange(controle.id, Number(e.target.value))}
          className="pronote-intensite-slider"
        />
        <span className="pronote-intensite-hint">{config.hint}</span>
      </div>
    </div>
  )
}

// ── Composant : ligne d'un devoir Pronote ───────────────────
function DevoirItem({ devoir, onToggle, onDelete }) {
  const days = daysUntil(devoir.dateLimite)
  const urgencyClass = days <= 1 ? 'urgent-red' : days <= 3 ? 'urgent-orange' : 'urgent-green'

  return (
    <div className={`pronote-devoir-item ${devoir.fait ? 'pronote-devoir--fait' : ''}`}>
      <button
        className={`pronote-devoir-check ${devoir.fait ? 'pronote-devoir-check--done' : ''}`}
        onClick={onToggle}
      >
        {devoir.fait ? '✓' : '○'}
      </button>

      <div className="pronote-devoir-info">
        <div className="pronote-devoir-header">
          <span className="pronote-devoir-matiere">{devoir.matiere}</span>
          <span className="pronote-badge-pronote">🎓 Pronote</span>
          {devoir.necessiteAvance && (
            <span className="pronote-badge-avance">⚠️ À commencer tôt</span>
          )}
        </div>
        <p className="pronote-devoir-description">{devoir.description}</p>
        <div className="pronote-devoir-meta">
          <span className={`pronote-urgency-badge urgency--${urgencyClass}`}>
            {days < 0 ? `En retard de ${Math.abs(days)}j` : days === 0 ? 'À rendre auj.' : `Dans ${days}j`}
          </span>
          <span className="pronote-devoir-date">📅 {formatDate(devoir.dateLimite)}</span>
          <span className="pronote-devoir-time">⏱ ~{devoir.estimationMinutes} min</span>
        </div>
      </div>

      <button className="icon-btn icon-btn--danger" onClick={onDelete} title="Supprimer">
        🗑️
      </button>
    </div>
  )
}

// ── Utilitaire : temps relatif ───────────────────────────────
function formatRelativeTime(isoString) {
  if (!isoString) return '—'
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'à l\'instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}
