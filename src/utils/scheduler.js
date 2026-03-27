import { DEFAULT_AVAILABILITY } from '../hooks/useStore'

const SESSION_DURATION = 25 // minutes par session
const ABSOLUTE_MAX_PER_DAY = 4 // plafond absolu même si dispo > 100 min

// ── Configuration intensité (utilisée pour les contrôles Pronote) ──
export const INTENSITE_CONFIG = {
  1: { joursAvance: 2,  sessionsParJour: 1, label: 'Facile',           hint: 'Planning commence 2 jours avant' },
  2: { joursAvance: 4,  sessionsParJour: 1, label: 'Normal',           hint: 'Planning commence 4 jours avant' },
  3: { joursAvance: 6,  sessionsParJour: 2, label: 'Important',        hint: 'Planning commence 6 jours avant' },
  4: { joursAvance: 9,  sessionsParJour: 2, label: 'Gros contrôle',    hint: 'Planning commence 9 jours avant' },
  5: { joursAvance: 14, sessionsParJour: 3, label: 'Exam / Bac blanc', hint: 'Planning commence 14 jours avant' },
}

/**
 * Calcule le nombre maximum de sessions pour un jour donné
 * selon les disponibilités configurées.
 */
function getMaxForDay(dayOfWeek, availability) {
  const avail = availability || DEFAULT_AVAILABILITY
  const minutes = avail[dayOfWeek] ?? avail[String(dayOfWeek)] ?? 0
  return Math.min(ABSOLUTE_MAX_PER_DAY, Math.floor(minutes / SESSION_DURATION))
}

/**
 * Génère des sessions de révision selon la difficulté, la date du contrôle
 * et les disponibilités par jour.
 */
export function generateRevisionSessions({ date, difficulty, existingSessions = [], availability }) {
  const controlDate = new Date(date)
  controlDate.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const sessions = []
  const startDate = new Date(today)

  // Déterminer la fenêtre de début selon la difficulté
  switch (difficulty) {
    case 'facile':
      startDate.setDate(controlDate.getDate() - 3)
      break
    case 'moyen':
      startDate.setDate(controlDate.getDate() - 7)
      break
    case 'dur':
      startDate.setDate(controlDate.getDate() - 30)
      break
    default:
      startDate.setDate(controlDate.getDate() - 7)
  }

  // Ne pas commencer dans le passé
  if (startDate < today) {
    startDate.setTime(today.getTime())
  }

  // Compter les sessions existantes par date pour équilibrage
  const sessionCountByDate = {}
  existingSessions.forEach(s => {
    sessionCountByDate[s.date] = (sessionCountByDate[s.date] || 0) + 1
  })

  const current = new Date(startDate)

  if (difficulty === 'facile') {
    // 1 session/jour, 2-3 jours avant
    while (current < controlDate) {
      if (canPlaceSession(current, controlDate, sessionCountByDate, availability)) {
        sessions.push({ date: toDateStr(current), done: false })
        sessionCountByDate[toDateStr(current)] = (sessionCountByDate[toDateStr(current)] || 0) + 1
      }
      current.setDate(current.getDate() + 1)
    }
  } else if (difficulty === 'moyen') {
    // 1 session tous les 2 jours, puis quotidien 3 jours avant
    let dayOffset = 0
    while (current < controlDate) {
      const daysLeft = Math.floor((controlDate - current) / 86400000)
      const isLastPhase = daysLeft <= 3
      const shouldPlace = isLastPhase || dayOffset % 2 === 0

      if (shouldPlace && canPlaceSession(current, controlDate, sessionCountByDate, availability)) {
        sessions.push({ date: toDateStr(current), done: false })
        sessionCountByDate[toDateStr(current)] = (sessionCountByDate[toDateStr(current)] || 0) + 1
      }
      current.setDate(current.getDate() + 1)
      dayOffset++
    }
  } else {
    // Dur : 4-5x/semaine, puis quotidien la dernière semaine
    let dayOffset = 0
    while (current < controlDate) {
      const daysLeft = Math.floor((controlDate - current) / 86400000)
      const isLastWeek = daysLeft <= 7
      const dayOfWeek = current.getDay()

      let shouldPlace = false
      if (isLastWeek) {
        shouldPlace = true
      } else {
        // 4-5x/semaine : lundi, mardi, jeudi, vendredi, samedi
        shouldPlace = [1, 2, 4, 5, 6].includes(dayOfWeek)
      }

      if (shouldPlace && canPlaceSession(current, controlDate, sessionCountByDate, availability)) {
        sessions.push({ date: toDateStr(current), done: false })
        sessionCountByDate[toDateStr(current)] = (sessionCountByDate[toDateStr(current)] || 0) + 1
      }
      current.setDate(current.getDate() + 1)
      dayOffset++
    }
  }

  return sessions
}

/**
 * Vérifie si une session peut être placée ce jour-là.
 * Prend en compte les disponibilités et les règles métier.
 */
export function getMaxForDay(dayOfWeek, availability) {
  const avail = availability || DEFAULT_AVAILABILITY
  const minutes = avail[dayOfWeek] ?? avail[String(dayOfWeek)] ?? 0
  return Math.min(ABSOLUTE_MAX_PER_DAY, Math.floor(minutes / SESSION_DURATION))
}

function canPlaceSession(date, controlDate, sessionCountByDate, availability) {
  const dateStr = toDateStr(date)
  const dayOfWeek = date.getDay()
  const daysLeft = Math.floor((controlDate - date) / 86400000)

  // Jamais le jour du contrôle
  if (daysLeft <= 0) return false

  // Vérifier les disponibilités : si dispo = 0, on bloque
  const maxForDay = getMaxForDay(dayOfWeek, availability)
  if (maxForDay === 0) return false

  // Pas dépasser le max calculé depuis les disponibilités
  if ((sessionCountByDate[dateStr] || 0) >= maxForDay) return false

  return true
}

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

/**
 * Retourne toutes les sessions du jour pour toutes les données
 * @param {Array} controles - Contrôles Pronote (optionnel)
 */
export function getTodaySessions(controls, homework, tasks, controles = []) {
  const today = new Date().toISOString().split('T')[0]
  const items = []

  controls.forEach(c => {
    (c.sessions || []).forEach(s => {
      if (s.date === today) {
        items.push({
          type: 'revision',
          controlId: c.id,
          subject: c.subject,
          title: `Révision : ${c.title}`,
          done: s.done,
          sessionDate: s.date,
          category: 'revision'
        })
      }
    })
  })

  // Sessions des contrôles Pronote
  controles.forEach(c => {
    ;(c.sessions || []).forEach(s => {
      if (s.date === today) {
        items.push({
          type: 'revision',
          controleId: c.id,
          subject: c.matiere,
          title: `Prép. ${c.matiere}`,
          done: s.done,
          sessionDate: s.date,
          category: 'revision',
          source: 'pronote',
        })
      }
    })
  })

  homework.forEach(h => {
    (h.steps || []).forEach((s, i) => {
      if (s.date === today) {
        items.push({
          type: 'homework',
          hwId: h.id,
          stepIndex: i,
          subject: h.subject,
          title: s.label,
          done: s.done,
          category: 'devoir'
        })
      }
    })
  })

  tasks.forEach(t => {
    if (t.date === today || isRecurringToday(t)) {
      items.push({
        type: 'task',
        taskId: t.id,
        title: t.title,
        done: t.done,
        category: t.category || 'perso',
        time: t.time
      })
    }
  })

  return items
}

function isRecurringToday(task) {
  if (!task.recurring || !task.date) return false
  const today = new Date()
  const taskDate = new Date(task.date)
  if (taskDate > today) return false

  if (task.recurring === 'daily') return true
  if (task.recurring === 'weekly') {
    return today.getDay() === taskDate.getDay()
  }
  return false
}

/**
 * Retourne les sessions d'une semaine donnée
 * @param {Array} controles - Contrôles Pronote (optionnel)
 */
export function getWeekSessions(controls, homework, tasks, weekStart, controles = []) {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }

  const items = []

  controls.forEach(c => {
    (c.sessions || []).forEach(s => {
      if (days.includes(s.date)) {
        items.push({
          type: 'revision',
          controlId: c.id,
          subject: c.subject,
          title: `Rév. ${c.subject}`,
          done: s.done,
          date: s.date,
          color: getSubjectColor(c.subject)
        })
      }
    })
  })

  // Sessions des contrôles Pronote — groupées par jour pour éviter le bruit visuel
  controles.forEach(c => {
    const parJour = {}
    ;(c.sessions || []).forEach(s => {
      if (!days.includes(s.date)) return
      if (!parJour[s.date]) parJour[s.date] = []
      parJour[s.date].push(s)
    })
    Object.entries(parJour).forEach(([date, ss]) => {
      const count = ss.length
      const allDone = ss.every(s => s.done)
      items.push({
        type: 'revision',
        controleId: c.id,
        subject: c.matiere,
        title: count > 1 ? `${count}× Prép. ${c.matiere}` : `Prép. ${c.matiere}`,
        done: allDone,
        date,
        color: c.couleur || getSubjectColor(c.matiere),
        source: 'pronote',
      })
    })
  })

  homework.forEach(h => {
    (h.steps || []).forEach((s, i) => {
      if (days.includes(s.date)) {
        items.push({
          type: 'homework',
          hwId: h.id,
          stepIndex: i,
          subject: h.subject,
          title: s.label,
          done: s.done,
          date: s.date,
          color: getSubjectColor(h.subject)
        })
      }
    })
  })

  tasks.forEach(t => {
    days.forEach(day => {
      const taskDate = t.date
      const isToday = taskDate === day
      const isRecurring = t.recurring === 'daily' ||
        (t.recurring === 'weekly' && new Date(day).getDay() === new Date(t.date).getDay())

      if (isToday || (isRecurring && taskDate <= day)) {
        items.push({
          type: 'task',
          taskId: t.id,
          title: t.title,
          done: t.done,
          date: day,
          color: t.category === 'rdv' ? 'var(--color-rdv)' : 'var(--color-perso)'
        })
      }
    })
  })

  return items
}

export function getSubjectColor(subject) {
  const map = {
    'Maths': 'var(--color-maths)',
    'Français (EAF)': 'var(--color-francais)',
    'Management': 'var(--color-management)',
    'Gestion': 'var(--color-gestion)',
    'Anglais': 'var(--color-anglais)',
  }
  return map[subject] || 'var(--color-default)'
}

export function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target - today) / 86400000)
}

/**
 * Génère des sessions de révision selon l'intensité (1-5) pour les contrôles Pronote.
 * Règle 3 : jamais plus de 3 matières différentes par jour (vérifié via existingSubjectsByDate).
 */
export function generateRevisionSessionsByIntensity({
  date,
  intensite,
  matiere = '',
  existingSessions = [],
  existingSubjectsByDate = {},
  availability,
}) {
  const config = INTENSITE_CONFIG[intensite] || INTENSITE_CONFIG[2]

  const controlDate = new Date(date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const startDate = new Date(controlDate)
  startDate.setDate(controlDate.getDate() - config.joursAvance)
  if (startDate < today) startDate.setTime(today.getTime())

  // Compter les sessions existantes par date (toutes matières confondues)
  const occupiedPerDay = {}
  existingSessions.forEach(s => {
    occupiedPerDay[s.date] = (occupiedPerDay[s.date] || 0) + 1
  })

  const sessions = []
  const current = new Date(startDate)

  while (current < controlDate) {
    const dateStr = toDateStr(current)
    const dayOfWeek = current.getDay()
    const daysLeft = Math.floor((controlDate - current) / 86400000)
    if (daysLeft <= 0) break

    const avail = availability || DEFAULT_AVAILABILITY
    const availMinutes = Number(avail[dayOfWeek] ?? avail[String(dayOfWeek)] ?? 0)

    if (availMinutes >= SESSION_DURATION) {
      const maxFromAvail = Math.min(ABSOLUTE_MAX_PER_DAY, Math.floor(availMinutes / SESSION_DURATION))
      const alreadyOccupied = occupiedPerDay[dateStr] || 0
      const slotsLeft = maxFromAvail - alreadyOccupied

      // Règle 3 : max 3 matières différentes par jour
      const subjectsThisDay = existingSubjectsByDate[dateStr] || new Set()
      const matieresCount = subjectsThisDay.size + (subjectsThisDay.has(matiere) ? 0 : 1)
      if (matieresCount > 3 && !subjectsThisDay.has(matiere)) {
        current.setDate(current.getDate() + 1)
        continue
      }

      if (slotsLeft > 0) {
        const toPlace = Math.min(config.sessionsParJour, slotsLeft)
        for (let i = 0; i < toPlace; i++) {
          sessions.push({ date: dateStr, done: false })
        }
        occupiedPerDay[dateStr] = alreadyOccupied + toPlace
      }
    }

    current.setDate(current.getDate() + 1)
  }

  return sessions
}
