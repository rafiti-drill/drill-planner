/**
 * Drill Planner — Backend Node.js
 * Intégration Pronote via pawnote + Firebase Admin + cron auto-sync
 *
 * Prérequis :
 *   1. npm install  (dans ce dossier /backend)
 *   2. Placer le fichier serviceAccount.json (Firebase Console → Paramètres du projet
 *      → Comptes de service → Générer une nouvelle clé privée) dans ce dossier.
 *   3. node server.js  — ou —  npm run dev
 */

import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

// ── Initialisation Firebase Admin ────────────────────────────
// Priorité 1 : variables d'environnement (Railway, production)
// Priorité 2 : fichier serviceAccount.json (développement local)
if (!admin.apps.length) {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Railway encode les \n en littéral — on les restaure
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    })
    console.log('🔐 Firebase Admin initialisé depuis les variables d\'environnement')
  } else {
    const serviceAccountPath = join(__dirname, 'serviceAccount.json')
    if (existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
      console.log('🔐 Firebase Admin initialisé depuis serviceAccount.json')
    } else {
      throw new Error(
        'Firebase Admin non configuré. Définir FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY ' +
        'ou placer serviceAccount.json dans le dossier backend/.'
      )
    }
  }
}

const db = admin.firestore()
const app = express()

app.use(cors({ origin: '*' }))
app.use(express.json())

// ── Mots-clés indiquant un devoir long ───────────────────────
const MOTS_AVANCE = ['dossier', 'exposé', 'oral', 'dm', 'devoir maison', 'recherche', 'fiche', 'présentation']

// ── POST /api/pronote/login ──────────────────────────────────
// Méthode QR code (ENT/Atrium) :
//   Body: { loginMethod: 'qr', qrData: { url, login, jeton }, pin, userId }
// Méthode directe (sans ENT) :
//   Body: { loginMethod: 'direct', url, username, password, userId }
// Retourne: { success, studentName }
app.post('/api/pronote/login', async (req, res) => {
  const { loginMethod = 'direct', userId } = req.body

  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId manquant' })
  }

  try {
    let sessionData, studentName

    if (loginMethod === 'qr') {
      // ── Connexion via QR Code (pour ENT Atrium et autres) ──────
      const { qrData, pin } = req.body
      if (!qrData || !pin) {
        return res.status(400).json({
          success: false,
          error: 'qrData et pin requis pour la connexion via QR code'
        })
      }

      // Nettoyer l'URL : s'assurer qu'elle contient bien mobile.eleve.html
      // (pawnote en a besoin pour déterminer le type de compte)
      const qrUrl = ensureQrUrl(qrData.url)
      console.log(`[QR Login] URL QR reçue : ${qrData.url}`)
      console.log(`[QR Login] URL QR normalisée : ${qrUrl}`)

      const { createSessionHandle, loginQrCode } = await import('pawnote')
      const handle = createSessionHandle()
      const deviceUUID = randomUUID()

      // loginQrCode retourne RefreshInformation: { url, token, username, kind, navigatorIdentifier }
      const refreshInfo = await loginQrCode(handle, {
        qr: {
          url: qrUrl,
          login: qrData.login,
          jeton: qrData.jeton,
        },
        pin: String(pin),
        deviceUUID,
      })

      // Le nom de l'élève est dans handle.user ou handle.userResource
      studentName = handle.userResource?.name
        || handle.user?.name
        || refreshInfo.username
        || qrData.login

      // Stocker le token pour la reconnexion automatique (sans QR)
      sessionData = {
        loginMethod: 'token',
        url: refreshInfo.url,
        username: refreshInfo.username,
        token: refreshInfo.token,
        deviceUUID,
        navigatorIdentifier: refreshInfo.navigatorIdentifier || null,
        kind: refreshInfo.kind,
        studentName,
        connectedAt: new Date().toISOString(),
        lastSync: null,
      }

    } else {
      // ── Connexion directe (sans ENT) ───────────────────────────
      const { url, username, password } = req.body
      if (!url || !username || !password) {
        return res.status(400).json({
          success: false,
          error: 'url, username et password requis pour la connexion directe'
        })
      }

      const { createSessionHandle, loginCredentials } = await import('pawnote')
      const handle = createSessionHandle()
      const deviceUUID = randomUUID()

      // loginCredentials retourne aussi RefreshInformation
      const refreshInfo = await loginCredentials(handle, {
        url: normalizeUrl(url),
        username,
        password,
        kind: 6, // AccountKind.STUDENT
        deviceUUID,
      })

      studentName = handle.userResource?.name || handle.user?.name || username

      sessionData = {
        loginMethod: 'token',
        url: refreshInfo.url,
        username: refreshInfo.username || username,
        token: refreshInfo.token,
        deviceUUID,
        navigatorIdentifier: refreshInfo.navigatorIdentifier || null,
        kind: refreshInfo.kind,
        studentName,
        connectedAt: new Date().toISOString(),
        lastSync: null,
      }
    }

    await db.collection('pronote').doc(userId).set(sessionData)
    console.log(`✅ Connexion Pronote OK pour userId=${userId} (${studentName}) via ${loginMethod}`)
    res.json({ success: true, studentName })

  } catch (err) {
    const ts = new Date().toISOString()
    console.error(`\n━━━━━ [Pronote] ERREUR CONNEXION ${ts} ━━━━━`)
    console.error(`  userId    : ${userId}`)
    console.error(`  méthode   : ${loginMethod}`)
    console.error(`  type      : ${err.name}`)
    console.error(`  message   : ${err.message}`)
    if (err.cause)  console.error(`  cause     : ${JSON.stringify(err.cause)}`)
    if (err.data)   console.error(`  data      : ${JSON.stringify(err.data)}`)
    if (err.code)   console.error(`  code      : ${err.code}`)
    if (err.stack)  console.error(`  stack     :\n${err.stack}`)
    console.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
    res.status(401).json({
      success: false,
      error: `[${err.name}] ${err.message}`
    })
  }
})

// ── GET /api/pronote/sync?userId=xxx ─────────────────────────
// Synchronise devoirs + contrôles des 30 prochains jours
app.get('/api/pronote/sync', async (req, res) => {
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ success: false, error: 'Paramètre userId manquant' })
  }

  try {
    const result = await syncPronote(userId)
    console.log(`✅ Sync OK pour userId=${userId}: ${result.devoirs} devoirs, ${result.controles} contrôles`)
    res.json({ success: true, ...result })
  } catch (err) {
    console.error(`[Pronote] Erreur de sync [${err.name}] pour userId=${userId}: ${err.message}`)
    if (err.stack) console.error('[Pronote] Stack:', err.stack)
    res.status(500).json({
      success: false,
      error: `[${err.name}] ${err.message}`
    })
  }
})

// ── Reconnexion pawnote via token stocké ─────────────────────
// Retourne { handle, newToken } — newToken est non-null si le token a été renouvelé
async function reconnectPronote(sessionData) {
  const { createSessionHandle, loginToken } = await import('pawnote')
  const handle = createSessionHandle()

  const refreshInfo = await loginToken(handle, {
    url: sessionData.url,
    username: sessionData.username,
    token: sessionData.token,
    deviceUUID: sessionData.deviceUUID,
    kind: sessionData.kind ?? 6,
    navigatorIdentifier: sessionData.navigatorIdentifier || undefined,
  })

  const newToken = refreshInfo.token !== sessionData.token ? refreshInfo.token : null
  return { handle, newToken }
}

// ── Fonction principale de synchronisation ───────────────────
async function syncPronote(userId) {
  const sessionSnap = await db.collection('pronote').doc(userId).get()
  if (!sessionSnap.exists) {
    throw new Error('Aucune session Pronote trouvée. Connectez-vous d\'abord depuis la page Pronote.')
  }

  const sessionData = sessionSnap.data()

  if (!sessionData.token) {
    throw new Error('Token de session manquant. Reconnectez-vous depuis la page Pronote.')
  }

  const { handle, newToken } = await reconnectPronote(sessionData)
  if (newToken) {
    await db.collection('pronote').doc(userId).update({ token: newToken })
    console.log(`[Pronote] Token renouvelé pour userId=${userId}`)
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)

  let devoirsCount = 0
  let controlesCount = 0

  // ── Synchronisation des devoirs ───────────────────────────
  try {
    const homeworkList = await fetchHomework(handle, today, in30Days)

    // Supprimer les anciens devoirs Pronote pour éviter les doublons
    const existingDevoirs = await db.collection(`users/${userId}/devoirs`).get()
    const deleteBatch = db.batch()
    existingDevoirs.docs.forEach(d => deleteBatch.delete(d.ref))
    if (!existingDevoirs.empty) await deleteBatch.commit()

    // Insérer les nouveaux
    const insertBatch = db.batch()
    for (const hw of homeworkList) {
      const description = String(hw.description || hw.content || hw.subject?.description || '')
      const estimationMinutes = estimateMinutes(description)
      const necessiteAvance = checkNecessiteAvance(description, estimationMinutes)
      const id = `pronote_hw_${sanitizeId(hw.id || hw.subjectId || String(Math.random()))}`

      const ref = db.collection(`users/${userId}/devoirs`).doc(id)
      insertBatch.set(ref, {
        id,
        matiere: hw.subject?.name || hw.subject || '',
        description: description.slice(0, 500), // Limiter la longueur
        dateLimite: toDateStr(hw.deadline || hw.date || hw.dueDate || today),
        estimationMinutes,
        necessiteAvance,
        fait: false,
        source: 'pronote',
        syncedAt: new Date().toISOString(),
      })
      devoirsCount++
    }
    if (devoirsCount > 0) await insertBatch.commit()

  } catch (err) {
    console.warn(`[Pronote] Devoirs non récupérés : ${err.message}`)
  }

  // ── Synchronisation des contrôles/évaluations ────────────
  try {
    const evaluations = await fetchEvaluations(handle, today, in30Days)

    // Supprimer les anciens contrôles Pronote
    const existingControles = await db.collection(`users/${userId}/controles`).where('source', '==', 'pronote').get()
    const deleteBatch2 = db.batch()
    existingControles.docs.forEach(d => deleteBatch2.delete(d.ref))
    if (!existingControles.empty) await deleteBatch2.commit()

    // Insérer les nouveaux
    const insertBatch2 = db.batch()
    for (const eval_ of evaluations) {
      const date = toDateStr(eval_.date || eval_.startDate || eval_.deadline || today)
      if (date < today.toISOString().split('T')[0]) continue // Ignorer le passé

      const titre = eval_.title || eval_.name || eval_.description || 'Évaluation'
      const id = `pronote_ctrl_${sanitizeId(eval_.id || titre + date)}`
      const ref = db.collection(`users/${userId}/controles`).doc(id)

      insertBatch2.set(ref, {
        id,
        matiere: eval_.subject?.name || eval_.subject || '',
        titre,
        date,
        type: detectType(titre),
        intensite: 2,       // Par défaut — modifiable par l'élève
        joursAvance: 4,     // intensite 2 → 4 jours avant
        source: 'pronote',
        couleur: '',
        sessions: [],       // Générées côté frontend après chargement
        syncedAt: new Date().toISOString(),
      })
      controlesCount++
    }
    if (controlesCount > 0) await insertBatch2.commit()

  } catch (err) {
    console.warn(`[Pronote] Contrôles non récupérés : ${err.message}`)
  }

  // Mettre à jour la date de dernière sync
  await db.collection('pronote').doc(userId).update({
    lastSync: new Date().toISOString()
  })

  return { devoirs: devoirsCount, controles: controlesCount }
}

// ── Récupération des devoirs — pawnote v1.6.2 ────────────────
async function fetchHomework(handle, from, to) {
  const { assignmentsFromIntervals } = await import('pawnote')

  try {
    // assignmentsFromIntervals attend un tableau d'intervalles [{ from, to }]
    const result = await assignmentsFromIntervals(handle, [{ from, to }])
    return result || []
  } catch (err) {
    console.warn('[Pronote] assignmentsFromIntervals échoué:', err.message)
    return []
  }
}

// ── Récupération des contrôles/évaluations — pawnote v1.6.2 ──
async function fetchEvaluations(handle, from, to) {
  const { evaluations } = await import('pawnote')

  try {
    const result = await evaluations(handle)
    if (!result) return []

    const fromStr = from.toISOString().split('T')[0]
    const toStr = to.toISOString().split('T')[0]

    // Filtrer les évaluations dans la plage de dates
    const allEvals = Array.isArray(result) ? result : (result.evaluations || [])
    return allEvals.filter(e => {
      const d = toDateStr(e.date || e.startDate)
      return d >= fromStr && d <= toStr
    })
  } catch (err) {
    console.warn('[Pronote] evaluations() échoué:', err.message)
    return []
  }
}

// ── Utilitaires ──────────────────────────────────────────────
function extractStudentName(client, fallback) {
  return client?.studentName
    || client?.student?.name
    || client?.user?.name
    || client?.name
    || fallback
}

function normalizeUrl(url) {
  let u = url.trim()
  if (!u.endsWith('/')) u += '/'
  if (!u.startsWith('http')) u = 'https://' + u
  return u
}

// Garantit que l'URL du QR code contient bien mobile.eleve.html
// (pawnote l'utilise pour déterminer le type de compte)
function ensureQrUrl(url) {
  let u = (url || '').trim()
  if (!u.startsWith('http')) u = 'https://' + u
  // Si l'URL contient déjà mobile.xxx.html, on la garde telle quelle
  if (/\/mobile\.\w+\.html$/.test(u)) return u
  // Sinon on enlève le slash final et on ajoute mobile.eleve.html
  return u.replace(/\/$/, '') + '/mobile.eleve.html'
}

function sanitizeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
}

function estimateMinutes(description) {
  if (!description) return 20
  const words = description.trim().split(/\s+/).length
  return Math.min(Math.max(words * 2, 15), 180)
}

function checkNecessiteAvance(description, estimationMinutes) {
  if (estimationMinutes > 45) return true
  const d = description.toLowerCase()
  return MOTS_AVANCE.some(mot => d.includes(mot))
}

function detectType(title) {
  const t = title.toLowerCase()
  if (t.includes('bac') || t.includes('blanc')) return 'ds'
  if (t.includes('devoir maison') || /\bdm\b/.test(t)) return 'dm'
  if (t.includes('oral')) return 'oral'
  if (t.includes('ds') || t.includes('devoir surveillé')) return 'ds'
  return 'controle'
}

function toDateStr(value) {
  if (!value) return new Date().toISOString().split('T')[0]
  if (typeof value === 'string') return value.split('T')[0]
  if (value instanceof Date) return value.toISOString().split('T')[0]
  try { return new Date(value).toISOString().split('T')[0] } catch { return new Date().toISOString().split('T')[0] }
}

// ── Cron job — auto-sync toutes les heures ───────────────────
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Synchronisation automatique Pronote...')
  try {
    const snapshot = await db.collection('pronote').get()
    if (snapshot.empty) {
      console.log('[Cron] Aucun utilisateur connecté à Pronote.')
      return
    }
    for (const document of snapshot.docs) {
      const userId = document.id
      try {
        const result = await syncPronote(userId)
        console.log(`[Cron] ✅ ${userId}: ${result.devoirs} devoirs, ${result.controles} contrôles`)
      } catch (err) {
        console.warn(`[Cron] ⚠️  ${userId}: ${err.message}`)
      }
    }
  } catch (err) {
    console.error('[Cron] Erreur globale:', err.message)
  }
})

// ── Démarrage ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('')
  console.log(`  ◈ DRILL PLANNER BACKEND`)
  console.log(`  Serveur démarré sur http://localhost:${PORT}`)
  console.log('')
  console.log('  Routes disponibles :')
  console.log(`  POST http://localhost:${PORT}/api/pronote/login`)
  console.log(`  GET  http://localhost:${PORT}/api/pronote/sync?userId=XXX`)
  console.log('')
  console.log('  Cron : synchronisation automatique toutes les heures')
  console.log('')
})
