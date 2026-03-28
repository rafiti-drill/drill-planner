import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import { db } from '../firebase'
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore'
import { INTENSITE_CONFIG, daysUntil, formatDate } from '../utils/scheduler'
import './Pronote.css'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const QR_READER_ID = 'pronote-qr-reader'

// ── Composant scanner QR ─────────────────────────────────────
function QrScanner({ onScanned, onClose }) {
  const scannerRef = useRef(null)
  const [scanError, setScanError] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    let scanner = null

    async function startScanner() {
      try {
        scanner = new Html5Qrcode(QR_READER_ID)
        scannerRef.current = scanner

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (decodedText) => {
            // Tente de parser le JSON Pronote
            try {
              const data = JSON.parse(decodedText)
              if (data.url && data.login && data.jeton) {
                onScanned(data)
              } else {
                setScanError('QR code scanné, mais ce n\'est pas un QR Pronote valide.')
              }
            } catch {
              setScanError('QR code non reconnu. Assure-toi de scanner le QR Pronote.')
            }
          },
          () => {} // erreurs de frame ignorées
        )
        setStarted(true)
      } catch (err) {
        setScanError(`Impossible d'accéder à la caméra : ${err.message}`)
      }
    }

    startScanner()

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
        scannerRef.current.clear()
        scannerRef.current = null
      }
    }
  }, [onScanned])

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-box">
        <div className="qr-scanner-header">
          <span className="qr-scanner-title">📷 Scanner le QR Code Pronote</span>
          <button className="qr-scanner-close" onClick={onClose}>✕</button>
        </div>

        <div className="qr-scanner-viewport">
          {/* html5-qrcode injecte le flux vidéo ici */}
          <div id={QR_READER_ID} className="qr-reader-element" />
          {!started && !scanError && (
            <div className="qr-scanner-loading">⏳ Activation de la caméra…</div>
          )}
          {started && (
            <div className="qr-scanner-frame">
              <div className="qr-frame-corner qr-frame-corner--tl" />
              <div className="qr-frame-corner qr-frame-corner--tr" />
              <div className="qr-frame-corner qr-frame-corner--bl" />
              <div className="qr-frame-corner qr-frame-corner--br" />
            </div>
          )}
        </div>

        {scanError && <div className="qr-scanner-error">⚠️ {scanError}</div>}

        <p className="qr-scanner-hint">
          Pointe la caméra vers le QR Code affiché dans<br />
          <em>Pronote → Mon compte → Paramètres de connexion</em>
        </p>
      </div>
    </div>
  )
}

// ── Page principale Pronote ──────────────────────────────────
export default function Pronote({ store, userId }) {
  const { data, updateControle, deleteControle, toggleDevoir, deleteDevoir } = store

  // ── États connexion ──────────────────────────────────────
  const [loginMethod, setLoginMethod] = useState('qr')
  const [showScanner, setShowScanner] = useState(false)
  const [scannedData, setScannedData] = useState(null) // { url, login, jeton } une fois scanné
  const [form, setForm] = useState({ url: '', username: '', password: '', pin: '' })
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const errorRef = useRef(null)

  // ── Statut Firestore ─────────────────────────────────────
  const [pronoteStatus, setPronoteStatus] = useState(null)

  useEffect(() => {
    if (!userId) return
    const unsub = onSnapshot(doc(db, 'pronote', userId), snap => {
      const data = snap.exists() ? snap.data() : null
      setPronoteStatus(data)
      if (data) setShowForm(false)
    })
    return () => unsub()
  }, [userId])

  // ── Callback scan réussi ─────────────────────────────────
  const handleScanned = useCallback((data) => {
    setScannedData(data)
    setShowScanner(false)
    setError('')
  }, [])

  // ── Utiliser le JSON collé manuellement ──────────────────
  function handleUseJson() {
    setJsonError('')
    try {
      const data = JSON.parse(jsonText.trim())
      if (!data.url || !data.login || !data.jeton) {
        setJsonError('JSON invalide : il doit contenir url, login et jeton.')
        return
      }
      setScannedData(data)
      setJsonText('')
      setError('')
    } catch {
      setJsonError('JSON invalide. Vérifie le format.')
    }
  }

  // ── Connexion ────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setConnecting(true)

    try {
      let body

      if (loginMethod === 'qr') {
        if (!scannedData) throw new Error('Aucun QR code scanné. Clique sur "Scanner le QR Code".')
        if (!form.pin || form.pin.length < 4) throw new Error('Entre ton code PIN à 4 chiffres.')
        body = { loginMethod: 'qr', qrData: scannedData, pin: form.pin, userId }
      } else {
        body = {
          loginMethod: 'direct',
          url: form.url,
          username: form.username,
          password: form.password,
          userId,
        }
      }

      let res, result
      try {
        res = await fetch(`${BACKEND_URL}/api/pronote/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        result = await res.json()
      } catch (fetchErr) {
        if (!res) {
          throw new Error(
            `Impossible de joindre le backend (${BACKEND_URL}). ` +
            `Vérifier que le service Render est démarré.`
          )
        }
        throw new Error(
          `Le serveur a répondu HTTP ${res.status} avec une réponse non-JSON. ` +
          `Voir les logs Render pour le détail.`
        )
      }

      if (!result.success) {
        throw new Error(result.error || `Erreur serveur HTTP ${res.status}`)
      }

      // Réinitialiser les champs sensibles (seulement en cas de succès)
      setForm(f => ({ ...f, password: '', pin: '' }))
      setScannedData(null)

    } catch (err) {
      const msg = err.message || 'Erreur de connexion. Vérifiez que le backend Render est actif.'
      setError(msg)
      setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    } finally {
      setConnecting(false)
    }
  }

  // ── Déconnexion ─────────────────────────────────────────
  async function handleDisconnect() {
    if (!userId) return
    setDisconnecting(true)
    setError('')
    try {
      await deleteDoc(doc(db, 'pronote', userId))
      setShowForm(false)
      setScannedData(null)
      setForm({ url: '', username: '', password: '', pin: '' })
    } catch (err) {
      setError('Erreur lors de la déconnexion : ' + err.message)
    } finally {
      setDisconnecting(false)
    }
  }

  // ── Sync manuelle ────────────────────────────────────────
  async function handleSync() {
    setError('')
    setSyncing(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/pronote/sync?userId=${userId}`)
      const result = await res.json()
      if (!result.success) throw new Error(result.error)
    } catch (err) {
      setError(err.message || 'Erreur de synchronisation.')
    } finally {
      setSyncing(false)
    }
  }

  const handleIntensiteChange = useCallback((id, intensite) => {
    updateControle(id, { intensite })
  }, [updateControle])

  const controles = data.controles || []
  const devoirs = data.devoirs || []
  const sortedControles = [...controles].sort((a, b) => a.date.localeCompare(b.date))
  const sortedDevoirs = [...devoirs].sort((a, b) => a.dateLimite.localeCompare(b.dateLimite))

  return (
    <div className="pronote-page">
      {/* Scanner QR en overlay */}
      {showScanner && (
        <QrScanner
          onScanned={handleScanned}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">🎓 Pronote</h1>
          <p className="page-sub">Synchronisation automatique de ton agenda</p>
        </div>
      </div>

      {/* ── Section Connexion ─────────────────────────────── */}
      <Card className="pronote-card">
        <h2 className="pronote-section-title">Connexion</h2>

        {/* ── État connecté ── */}
        {pronoteStatus && !showForm ? (
          <>
            <div className="pronote-connected-banner">
              <div className="pronote-connected-info">
                <span className="pronote-connected-badge">✅ Connecté</span>
                <span className="pronote-connected-name">{pronoteStatus.studentName}</span>
              </div>
              {pronoteStatus.lastSync && (
                <span className="pronote-lastsync">
                  Dernière sync : {formatRelativeTime(pronoteStatus.lastSync)}
                </span>
              )}
            </div>

            <div className="pronote-connected-actions">
              <Button onClick={handleSync} disabled={syncing || disconnecting} variant="primary">
                {syncing ? '⏳ Synchronisation…' : '🔄 Synchroniser maintenant'}
              </Button>
              <button
                type="button"
                className="pronote-disconnect-btn"
                onClick={handleDisconnect}
                disabled={disconnecting || syncing}
              >
                {disconnecting ? '⏳…' : '🔌 Déconnecter'}
              </button>
            </div>

            {error && <div ref={errorRef} className="pronote-error pronote-error--login">⚠️ {error}</div>}
          </>
        ) : (
          <>
            {/* Statut non connecté */}
            {!pronoteStatus && (
              <div className="pronote-status pronote-status--off" style={{ marginBottom: '1rem' }}>
                ❌ Non connecté
              </div>
            )}

            {/* ── Bouton "Reconnecter" si déjà connecté mais showForm=true ── */}
            {pronoteStatus && showForm && (
              <div className="pronote-reconnect-hint">
                Actuellement connecté en tant que <strong>{pronoteStatus.studentName}</strong> —{' '}
                <button type="button" className="pronote-link-btn" onClick={() => setShowForm(false)}>
                  annuler
                </button>
              </div>
            )}

        {/* Onglets */}
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
              {/* ── Bouton scanner ── */}
              {!scannedData ? (
                <div className="pronote-scan-zone">
                  <button
                    type="button"
                    className="pronote-scan-btn"
                    onClick={() => setShowScanner(true)}
                  >
                    <span className="pronote-scan-btn-icon">📷</span>
                    <span className="pronote-scan-btn-text">Scanner le QR Code Pronote</span>
                    <span className="pronote-scan-btn-sub">
                      Pronote → Mon compte → Paramètres de connexion
                    </span>
                  </button>
                </div>
              ) : (
                /* ── QR scanné avec succès ── */
                <div className="pronote-scanned-success">
                  <div className="pronote-scanned-icon">✅</div>
                  <div className="pronote-scanned-info">
                    <div className="pronote-scanned-title">QR Code scanné !</div>
                    <div className="pronote-scanned-login">Compte : <strong>{scannedData.login}</strong></div>
                  </div>
                  <button
                    type="button"
                    className="pronote-scanned-rescan"
                    onClick={() => { setScannedData(null); setShowScanner(true) }}
                  >
                    🔄 Rescanner
                  </button>
                </div>
              )}

              {/* ── Zone coller JSON manuellement ── */}
              {!scannedData && (
                <div className="pronote-json-zone">
                  <div className="pronote-json-divider">
                    <span>ou colle le JSON ici</span>
                  </div>
                  <textarea
                    className="pronote-input pronote-json-textarea"
                    placeholder={'{"url":"...","login":"...","jeton":"..."}'}
                    value={jsonText}
                    onChange={e => { setJsonText(e.target.value); setJsonError('') }}
                    spellCheck={false}
                  />
                  {jsonError && <div className="pronote-json-error">⚠️ {jsonError}</div>}
                  <button
                    type="button"
                    className="pronote-json-btn"
                    onClick={handleUseJson}
                    disabled={!jsonText.trim()}
                  >
                    Utiliser ce JSON
                  </button>
                </div>
              )}

              {/* PIN — affiché dès qu'un QR est scanné */}
              {scannedData && (
                <div className="pronote-field">
                  <label className="pronote-label">Code PIN Pronote (4 chiffres)</label>
                  <input
                    className="pronote-input pronote-pin-input"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
                    autoFocus
                    required
                  />
                  <span className="pronote-pin-hint">
                    C'est le PIN que tu as choisi lors de la génération du QR code
                  </span>
                </div>
              )}
            </>
          ) : (
            /* ── Connexion directe ── */
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

          {error && <div ref={errorRef} className="pronote-error pronote-error--login">⚠️ {error}</div>}

          {/* Bouton connecter — masqué en mode QR tant que pas encore scanné */}
          {(loginMethod === 'direct' || scannedData) && (
            <Button type="submit" disabled={connecting} fullWidth>
              {connecting ? '⏳ Connexion…' : pronoteStatus ? '🔄 Reconnecter' : '🔌 Connecter à Pronote'}
            </Button>
          )}
        </form>
          </>
        )}
      </Card>

      {/* ── Contrôles détectés ───────────────────────────── */}
      <Card className="pronote-card">
        <h2 className="pronote-section-title">
          Contrôles détectés
          <span className="pronote-count">{sortedControles.length}</span>
        </h2>
        {sortedControles.length === 0 ? (
          <div className="pronote-empty">Aucun contrôle synchronisé. Lance une synchronisation.</div>
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
          <div className="pronote-empty">Aucun devoir synchronisé. Lance une synchronisation.</div>
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

// ── Contrôle Pronote ─────────────────────────────────────────
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
          <span className="pronote-controle-date">📅 {formatDate(controle.date)}</span>
        </div>
        <div className="pronote-controle-actions">
          <span className={`pronote-urgency-badge urgency--${urgencyClass}`}>
            {days < 0 ? 'Passé' : days === 0 ? "Aujourd'hui" : `Dans ${days}j`}
          </span>
          <button className="icon-btn icon-btn--danger" onClick={onDelete} title="Ignorer">🗑️</button>
        </div>
      </div>
      {sessionsTotal > 0 && (
        <div className="pronote-sessions-info">📚 {sessionsDone}/{sessionsTotal} sessions planifiées</div>
      )}
      <div className="pronote-intensite-row">
        <span className="pronote-intensite-label">
          ⭐ Intensité : <strong>{intensite}/5</strong> — {config.label}
        </span>
        <input
          type="range" min="1" max="5" step="1" value={intensite}
          onChange={e => onIntensiteChange(controle.id, Number(e.target.value))}
          className="pronote-intensite-slider"
        />
        <span className="pronote-intensite-hint">{config.hint}</span>
      </div>
    </div>
  )
}

// ── Devoir Pronote ───────────────────────────────────────────
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
      <button className="icon-btn icon-btn--danger" onClick={onDelete}>🗑️</button>
    </div>
  )
}

// ── Temps relatif ────────────────────────────────────────────
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
