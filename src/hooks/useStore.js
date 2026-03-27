import { useState, useEffect, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  generateRevisionSessions,
  generateRevisionSessionsByIntensity,
  INTENSITE_CONFIG,
  getTodaySessions,
} from '../utils/scheduler'
import { db } from '../firebase'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc
} from 'firebase/firestore'

// ── Citations Gurren Lagann (défaut) ────────────────────────
export const DEFAULT_QUOTES = [
  { text: "Go beyond the impossible and kick reason to the curb!", author: "Kamina" },
  { text: "Believe in the you that believes in yourself.", author: "Kamina" },
  { text: "Your drill is the drill that will pierce the heavens!", author: "Kamina" },
  { text: "Don't believe in yourself. Believe in the me that believes in you.", author: "Kamina" },
  { text: "If you're gonna dig, dig to the heavens!", author: "Kamina" },
  { text: "We evolve beyond the person we were a minute before.", author: "Kamina" },
  { text: "The tomorrow we're trying to reach is not a tomorrow you had decided on.", author: "Simon" },
  { text: "My drill is my soul!", author: "Simon" },
  { text: "Reject common sense to make the impossible possible!", author: "Kamina" },
  { text: "Who the hell do you think I am?!", author: "Kamina" },
]

function getDailyQuote(quotes) {
  const list = (quotes && quotes.length) ? quotes : DEFAULT_QUOTES
  const day = new Date().toISOString().split('T')[0]
  const seed = day.split('-').reduce((acc, n) => acc + parseInt(n), 0)
  return list[seed % list.length]
}

// ── Couleurs par matière (défaut) ───────────────────────────
export const DEFAULT_SUBJECT_COLORS = {
  'Maths': '#3b82f6',
  'Français (EAF)': '#f59e0b',
  'Gestion': '#a855f7',
  'Management': '#ef4444',
  'Anglais': '#06b6d4',
}

const COLOR_PALETTE = [
  '#3b82f6', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4',
  '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6',
]

// ── Valeurs par défaut ──────────────────────────────────────
const DEFAULT_SUBJECTS = ['Maths', 'Français (EAF)', 'Management', 'Gestion', 'Anglais']

// Disponibilité en minutes par jour (0=Dim, 1=Lun, ..., 6=Sam)
export const DEFAULT_AVAILABILITY = {
  0: 120, // Dimanche
  1: 60,  // Lundi
  2: 60,  // Mardi
  3: 0,   // Mercredi
  4: 45,  // Jeudi
  5: 30,  // Vendredi
  6: 120, // Samedi
}

const DEFAULT_SETTINGS = {
  subjects: DEFAULT_SUBJECTS,
  streak: 0,
  lastActiveDate: null,
  availability: DEFAULT_AVAILABILITY,
  quotes: DEFAULT_QUOTES,
  subjectColors: DEFAULT_SUBJECT_COLORS,
}

// ── Prochain contrôle (manuel + Pronote) ────────────────────
function getNextControlInfo(controls, controles = []) {
  const today = new Date().toISOString().split('T')[0]

  const allControls = [
    ...controls.map(c => ({
      date: c.date,
      subject: c.subject,
      sessions: c.sessions || [],
      intensite: null,
    })),
    ...controles.map(c => ({
      date: c.date,
      subject: c.matiere,
      sessions: c.sessions || [],
      intensite: c.intensite,
    })),
  ]

  const upcoming = allControls
    .filter(c => c.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!upcoming.length) return null
  const next = upcoming[0]
  const msPerDay = 86400000
  const daysLeft = Math.max(0, Math.ceil((new Date(next.date) - new Date()) / msPerDay))
  const doneSessions = next.sessions.filter(s => s.done).length
  const dayStr = daysLeft === 0 ? "aujourd'hui" : daysLeft === 1 ? 'demain' : `dans ${daysLeft} jours`
  const intensiteStr = next.intensite ? ` · intensité ${next.intensite}/5` : ''
  return {
    text: `${next.subject} ${dayStr} — ${doneSessions} session${doneSessions !== 1 ? 's' : ''} faite${doneSessions !== 1 ? 's' : ''}${intensiteStr}`,
    subject: next.subject,
    date: next.date,
    daysLeft,
    doneSessions,
    totalSessions: next.sessions.length,
    intensite: next.intensite,
  }
}

// ── Constante du nombre de listeners ────────────────────────
// controls, homework, tasks, settings, controles (Pronote), devoirs (Pronote)
const TOTAL_LISTENERS = 6

// ── Hook principal ──────────────────────────────────────────
export function useStore(userId) {
  const [controls, setControls] = useState([])
  const [homework, setHomework] = useState([])
  const [tasks, setTasks] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [controles, setControles] = useState([])   // Contrôles Pronote
  const [devoirs, setDevoirs] = useState([])         // Devoirs Pronote
  const [loading, setLoading] = useState(true)

  const loadedRef = useRef(0)
  const markLoaded = useCallback(() => {
    loadedRef.current += 1
    if (loadedRef.current >= TOTAL_LISTENERS) setLoading(false)
  }, [])

  // ── Listeners temps réel ──────────────────────────────────
  useEffect(() => {
    loadedRef.current = 0
    setLoading(true)

    const userPath = `users/${userId}`
    const settingsDoc = `${userPath}/settings/main`
    const unsubs = []

    unsubs.push(
      onSnapshot(collection(db, `${userPath}/controls`), snap => {
        setControls(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markLoaded()
      })
    )
    unsubs.push(
      onSnapshot(collection(db, `${userPath}/homework`), snap => {
        setHomework(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markLoaded()
      })
    )
    unsubs.push(
      onSnapshot(collection(db, `${userPath}/tasks`), snap => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markLoaded()
      })
    )
    unsubs.push(
      onSnapshot(doc(db, settingsDoc), snap => {
        if (snap.exists()) {
          const remote = snap.data()
          setSettings({
            ...DEFAULT_SETTINGS,
            ...remote,
            availability: { ...DEFAULT_AVAILABILITY, ...(remote.availability || {}) },
            quotes: remote.quotes || DEFAULT_QUOTES,
            subjectColors: { ...DEFAULT_SUBJECT_COLORS, ...(remote.subjectColors || {}) },
          })
        }
        markLoaded()
      })
    )
    // Contrôles Pronote
    unsubs.push(
      onSnapshot(collection(db, `${userPath}/controles`), snap => {
        setControles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markLoaded()
      })
    )
    // Devoirs Pronote
    unsubs.push(
      onSnapshot(collection(db, `${userPath}/devoirs`), snap => {
        setDevoirs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        markLoaded()
      })
    )

    return () => unsubs.forEach(u => u())
  }, [userId, markLoaded])

  // ── Auto-génération des sessions pour les contrôles Pronote ─
  // Quand un contrôle Pronote arrive sans sessions, on les génère
  const initializedControles = useRef(new Set())
  useEffect(() => {
    if (loading || !controles.length) return

    // Précalculer les matières présentes par jour (pour la règle des 3 matières max)
    const subjectsByDate = {}
    controls.forEach(c =>
      (c.sessions || []).forEach(s => {
        if (!subjectsByDate[s.date]) subjectsByDate[s.date] = new Set()
        subjectsByDate[s.date].add(c.subject)
      })
    )

    controles.forEach(async (controle) => {
      if (
        (!controle.sessions || controle.sessions.length === 0) &&
        !initializedControles.current.has(controle.id)
      ) {
        initializedControles.current.add(controle.id)

        const existingSessions = [
          ...controls.flatMap(c => c.sessions || []),
          ...controles
            .filter(c => c.id !== controle.id)
            .flatMap(c => c.sessions || []),
        ]

        const sessions = generateRevisionSessionsByIntensity({
          date: controle.date,
          intensite: controle.intensite || 2,
          matiere: controle.matiere || '',
          existingSessions,
          existingSubjectsByDate: subjectsByDate,
          availability: settings.availability,
        })

        const joursAvance = (INTENSITE_CONFIG[controle.intensite || 2] || INTENSITE_CONFIG[2]).joursAvance

        await setDoc(
          doc(db, `users/${userId}/controles`, controle.id),
          { ...controle, sessions, joursAvance },
          { merge: true }
        )
      }
    })
  }, [controles, loading, controls, settings.availability, userId])

  // ── Mise à jour du streak ────────────────────────────────
  const streakDone = useRef(false)
  useEffect(() => {
    if (loading || streakDone.current) return
    streakDone.current = true
    const settingsDoc = `users/${userId}/settings/main`
    const today = new Date().toISOString().split('T')[0]
    if (settings.lastActiveDate !== today) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yStr = yesterday.toISOString().split('T')[0]
      const newStreak = settings.lastActiveDate === yStr ? (settings.streak || 0) + 1 : 1
      setDoc(doc(db, settingsDoc), { lastActiveDate: today, streak: newStreak }, { merge: true })
    }
  }, [loading, userId, settings.lastActiveDate, settings.streak])

  // ── Sync widget public ──────────────────────────────────────
  useEffect(() => {
    if (loading) return
    const todayItems = getTodaySessions(controls, homework, tasks, controles)
    const doneCount = todayItems.filter(i => i.done).length
    const quotes = settings.quotes || DEFAULT_QUOTES
    const subjectColors = { ...DEFAULT_SUBJECT_COLORS, ...(settings.subjectColors || {}) }
    const streak = settings.streak || 0
    const todayQuote = getDailyQuote(quotes)
    const nextControl = getNextControlInfo(controls, controles)
    const widgetData = {
      tasks: todayItems.map(({ title, type, done: itemDone, category, subject }) => ({
        title,
        type,
        done: itemDone,
        category: category || 'perso',
        subject: subject || null,
      })),
      done: doneCount,
      total: todayItems.length,
      quote: todayQuote,
      quotes,
      subjectColors,
      streak,
      nextControl: nextControl?.text || null,
      updatedAt: new Date().toISOString(),
    }
    setDoc(doc(db, 'widget', userId), widgetData)
  }, [loading, controls, homework, tasks, settings, controles, userId])

  // ── SETTINGS ───────────────────────────────────────────────
  const updateSettings = useCallback(async (updates) => {
    await setDoc(doc(db, `users/${userId}/settings/main`), updates, { merge: true })
  }, [userId])

  const addSubject = useCallback(async (subject) => {
    const newSubjects = [...new Set([...settings.subjects, subject])]
    const currentColors = { ...DEFAULT_SUBJECT_COLORS, ...(settings.subjectColors || {}) }
    const updates = { subjects: newSubjects }
    if (!currentColors[subject]) {
      const idx = (Object.keys(currentColors).length) % COLOR_PALETTE.length
      updates.subjectColors = { ...currentColors, [subject]: COLOR_PALETTE[idx] }
    }
    await setDoc(doc(db, `users/${userId}/settings/main`), updates, { merge: true })
  }, [userId, settings.subjects, settings.subjectColors])

  const removeSubject = useCallback(async (subject) => {
    const newSubjects = settings.subjects.filter(s => s !== subject)
    await setDoc(doc(db, `users/${userId}/settings/main`), { subjects: newSubjects }, { merge: true })
  }, [userId, settings.subjects])

  const updateQuotes = useCallback(async (quotes) => {
    await setDoc(doc(db, `users/${userId}/settings/main`), { quotes }, { merge: true })
  }, [userId])

  const updateSubjectColors = useCallback(async (subjectColors) => {
    await setDoc(doc(db, `users/${userId}/settings/main`), { subjectColors }, { merge: true })
  }, [userId])

  // ── CONTRÔLES MANUELS ──────────────────────────────────────
  const addControl = useCallback(async (control) => {
    const id = uuidv4()
    const sessions = generateRevisionSessions({
      date: control.date,
      difficulty: control.difficulty,
      existingSessions: controls.flatMap(c => c.sessions || []),
      availability: settings.availability,
    })
    const newControl = { ...control, id, sessions }
    await setDoc(doc(db, `users/${userId}/controls`, id), newControl)
    return id
  }, [userId, controls, settings.availability])

  const updateControl = useCallback(async (id, updates) => {
    const control = controls.find(c => c.id === id)
    if (!control) return
    const updated = { ...control, ...updates }
    if (updates.date || updates.difficulty) {
      updated.sessions = generateRevisionSessions({
        date: updated.date,
        difficulty: updated.difficulty,
        existingSessions: controls.filter(c => c.id !== id).flatMap(c => c.sessions || []),
        availability: settings.availability,
      })
    }
    await setDoc(doc(db, `users/${userId}/controls`, id), updated)
  }, [userId, controls, settings.availability])

  const deleteControl = useCallback(async (id) => {
    await deleteDoc(doc(db, `users/${userId}/controls`, id))
  }, [userId])

  const toggleSession = useCallback(async (controlId, sessionDate) => {
    const control = controls.find(c => c.id === controlId)
    if (!control) return
    const sessions = (control.sessions || []).map(s =>
      s.date === sessionDate ? { ...s, done: !s.done } : s
    )
    await setDoc(doc(db, `users/${userId}/controls`, controlId), { ...control, sessions })
  }, [userId, controls])

  // ── CONTRÔLES PRONOTE ──────────────────────────────────────
  const updateControle = useCallback(async (id, updates) => {
    const controle = controles.find(c => c.id === id)
    if (!controle) return
    const updated = { ...controle, ...updates }

    // Si l'intensité change → recalculer joursAvance et régénérer les sessions
    if (updates.intensite !== undefined) {
      const config = INTENSITE_CONFIG[updates.intensite] || INTENSITE_CONFIG[2]
      updated.joursAvance = config.joursAvance

      const existingSessions = [
        ...controls.flatMap(c => c.sessions || []),
        ...controles.filter(c => c.id !== id).flatMap(c => c.sessions || []),
      ]
      const subjectsByDate = {}
      controls.forEach(c =>
        (c.sessions || []).forEach(s => {
          if (!subjectsByDate[s.date]) subjectsByDate[s.date] = new Set()
          subjectsByDate[s.date].add(c.subject)
        })
      )

      updated.sessions = generateRevisionSessionsByIntensity({
        date: updated.date,
        intensite: updates.intensite,
        matiere: updated.matiere || '',
        existingSessions,
        existingSubjectsByDate: subjectsByDate,
        availability: settings.availability,
      })
    }

    await setDoc(doc(db, `users/${userId}/controles`, id), updated)
  }, [userId, controles, controls, settings.availability])

  const deleteControle = useCallback(async (id) => {
    await deleteDoc(doc(db, `users/${userId}/controles`, id))
  }, [userId])

  const toggleControleSession = useCallback(async (controleId, sessionDate) => {
    const controle = controles.find(c => c.id === controleId)
    if (!controle) return
    const sessions = (controle.sessions || []).map(s =>
      s.date === sessionDate ? { ...s, done: !s.done } : s
    )
    await setDoc(doc(db, `users/${userId}/controles`, controleId), { ...controle, sessions })
  }, [userId, controles])

  // ── DEVOIRS MANUELS ────────────────────────────────────────
  const addHomework = useCallback(async (hw) => {
    const id = uuidv4()
    const steps = generateHomeworkSteps(hw)
    const newHw = { ...hw, id, steps }
    await setDoc(doc(db, `users/${userId}/homework`, id), newHw)
    return id
  }, [userId])

  const updateHomework = useCallback(async (id, updates) => {
    const hw = homework.find(h => h.id === id)
    if (!hw) return
    await setDoc(doc(db, `users/${userId}/homework`, id), { ...hw, ...updates })
  }, [userId, homework])

  const deleteHomework = useCallback(async (id) => {
    await deleteDoc(doc(db, `users/${userId}/homework`, id))
  }, [userId])

  const toggleHomeworkStep = useCallback(async (hwId, stepIndex) => {
    const hw = homework.find(h => h.id === hwId)
    if (!hw) return
    const steps = (hw.steps || []).map((s, i) =>
      i === stepIndex ? { ...s, done: !s.done } : s
    )
    await setDoc(doc(db, `users/${userId}/homework`, hwId), { ...hw, steps })
  }, [userId, homework])

  // ── DEVOIRS PRONOTE ────────────────────────────────────────
  const toggleDevoir = useCallback(async (id) => {
    const devoir = devoirs.find(d => d.id === id)
    if (!devoir) return
    await setDoc(doc(db, `users/${userId}/devoirs`, id), { ...devoir, fait: !devoir.fait })
  }, [userId, devoirs])

  const deleteDevoir = useCallback(async (id) => {
    await deleteDoc(doc(db, `users/${userId}/devoirs`, id))
  }, [userId])

  // ── TÂCHES ─────────────────────────────────────────────────
  const addTask = useCallback(async (task) => {
    const id = uuidv4()
    const newTask = { ...task, id, done: false }
    await setDoc(doc(db, `users/${userId}/tasks`, id), newTask)
    return id
  }, [userId])

  const updateTask = useCallback(async (id, updates) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    await setDoc(doc(db, `users/${userId}/tasks`, id), { ...task, ...updates })
  }, [userId, tasks])

  const deleteTask = useCallback(async (id) => {
    await deleteDoc(doc(db, `users/${userId}/tasks`, id))
  }, [userId])

  const toggleTask = useCallback(async (id) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    await setDoc(doc(db, `users/${userId}/tasks`, id), { ...task, done: !task.done })
  }, [userId, tasks])

  // ── Retour ─────────────────────────────────────────────────
  return {
    data: { controls, homework, tasks, settings, controles, devoirs },
    loading,
    nextControlInfo: getNextControlInfo(controls, controles),
    // Controls manuels
    addControl, updateControl, deleteControl, toggleSession,
    // Contrôles Pronote
    updateControle, deleteControle, toggleControleSession,
    // Homework manuels
    addHomework, updateHomework, deleteHomework, toggleHomeworkStep,
    // Devoirs Pronote
    toggleDevoir, deleteDevoir,
    // Tasks
    addTask, updateTask, deleteTask, toggleTask,
    // Settings
    addSubject, removeSubject, updateSettings, updateQuotes, updateSubjectColors,
  }
}

// ── Génération des étapes de devoir ────────────────────────
function generateHomeworkSteps(hw) {
  const sessions = hw.estimatedSessions || 1
  const dueDate = new Date(hw.dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)

  const daysAvailable = Math.max(1, Math.floor((dueDate - today) / 86400000))
  const steps = []

  if (sessions <= 1) {
    steps.push({ label: hw.title, date: hw.dueDate, done: false })
  } else {
    const interval = Math.max(1, Math.floor(daysAvailable / sessions))
    for (let i = 0; i < sessions; i++) {
      const stepDate = new Date(today)
      stepDate.setDate(today.getDate() + Math.min(i * interval, daysAvailable - 1))
      steps.push({
        label: `${hw.title} — partie ${i + 1}/${sessions}`,
        date: stepDate.toISOString().split('T')[0],
        done: false
      })
    }
  }
  return steps
}
