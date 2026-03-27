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
// Body: { url, username, password, userId }
// Retourne: { success, studentName }
app.post('/api/pronote/login', async (req, res) => {
  const { url, username, password, userId } = req.body

  if (!url || !username || !password || !userId) {
    return res.status(400).json({
      success: false,
      error: 'Paramètres manquants. Requis : url, username, password, userId'
    })
  }

  try {
    const client = await connectToPronote(url, username, password)
    const studentName = extractStudentName(client, username)

    // Sauvegarder les infos de connexion dans Firestore
    // ⚠️  En production réelle, stocker un token de session plutôt que le mot de passe.
    // Pronote n'expose pas de token OAuth — on stocke les credentials de façon simple ici.
    await db.collection('pronote').doc(userId).set({
      url: normalizeUrl(url),
      username,
      password,
      studentName,
      connectedAt: new Date().toISOString(),
      lastSync: null,
    })

    console.log(`✅ Connexion Pronote réussie pour userId=${userId} (${studentName})`)
    res.json({ success: true, studentName })

  } catch (err) {
    console.error('[Pronote] Erreur de connexion:', err.message)
    res.status(401).json({
      success: false,
      error: `Connexion Pronote échouée : ${err.message}`
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
    console.error(`[Pronote] Erreur de sync pour userId=${userId}:`, err.message)
    res.status(500).json({
      success: false,
      error: `Synchronisation échouée : ${err.message}`
    })
  }
})

// ── Connexion pawnote ────────────────────────────────────────
async function connectToPronote(url, username, password) {
  // Import dynamique — pawnote est un module ESM
  const pawnote = await import('pawnote')

  // pawnote v6 expose createClientFromCredentials en export nommé ou default
  const createClient = pawnote.createClientFromCredentials
    || pawnote.default?.createClientFromCredentials

  if (typeof createClient !== 'function') {
    // Essayer l'API pawnote v5 (Client class)
    const Client = pawnote.Client || pawnote.default?.Client
    if (Client) {
      const client = new Client()
      await client.loginFromUsernamePassword({
        url: normalizeUrl(url),
        username,
        password,
      })
      return client
    }
    throw new Error(
      'API pawnote non reconnue. Vérifiez la version installée (npm list pawnote).'
    )
  }

  // Détection du type de CAS (aucun par défaut, ajustable selon l'établissement)
  const kindValue = pawnote.StudentAccountKind?.Student
    ?? pawnote.default?.StudentAccountKind?.Student
    ?? 0

  const client = await createClient({
    url: normalizeUrl(url),
    username,
    password,
    kind: kindValue,
  })

  return client
}

// ── Fonction principale de synchronisation ───────────────────
async function syncPronote(userId) {
  // Lire les credentials depuis Firestore
  const sessionSnap = await db.collection('pronote').doc(userId).get()
  if (!sessionSnap.exists) {
    throw new Error('Aucune session Pronote trouvée. Connectez-vous d\'abord depuis la page Pronote.')
  }

  const { url, username, password } = sessionSnap.data()
  const client = await connectToPronote(url, username, password)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)

  let devoirsCount = 0
  let controlesCount = 0

  // ── Synchronisation des devoirs ───────────────────────────
  try {
    const homeworkList = await fetchHomework(client, today, in30Days)

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
    const evaluations = await fetchEvaluations(client, today, in30Days)

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

// ── Récupération des devoirs (adaptatif selon l'API pawnote) ─
async function fetchHomework(client, from, to) {
  // Essayer différentes méthodes selon la version de pawnote
  if (typeof client.getHomeworkForInterval === 'function') {
    return await client.getHomeworkForInterval(from, to) || []
  }
  if (typeof client.getHomework === 'function') {
    return await client.getHomework(from, to) || []
  }
  if (typeof client.homework === 'function') {
    return await client.homework() || []
  }
  console.warn('[Pronote] Aucune méthode de récupération des devoirs trouvée dans l\'API pawnote.')
  return []
}

// ── Récupération des contrôles (adaptatif selon l'API pawnote)
async function fetchEvaluations(client, from, to) {
  // Les évaluations peuvent être dans différents endroits selon la version pawnote
  if (typeof client.getEvaluations === 'function') {
    return await client.getEvaluations() || []
  }

  // Certaines versions les exposent dans le cahier de textes
  if (typeof client.getTimetableForInterval === 'function') {
    const timetable = await client.getTimetableForInterval(from, to) || []
    return timetable.filter(item =>
      item.isExam
      || item.type === 'evaluation'
      || item.type === 'exam'
      || String(item.title || '').toLowerCase().includes('contrôle')
      || String(item.title || '').toLowerCase().includes('devoir')
      || String(item.title || '').toLowerCase().includes('ds ')
    )
  }

  // Fallback : notes/bulletins (peut contenir la liste des évaluations)
  if (typeof client.getGradesOverview === 'function') {
    const data = await client.getGradesOverview()
    return (data?.evaluations || data?.grades || []).filter(e => {
      const d = toDateStr(e.date)
      return d >= from.toISOString().split('T')[0] && d <= to.toISOString().split('T')[0]
    })
  }

  console.warn('[Pronote] Aucune méthode de récupération des contrôles trouvée dans l\'API pawnote.')
  return []
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
