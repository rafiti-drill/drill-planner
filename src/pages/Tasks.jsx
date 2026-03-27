import React, { useState } from 'react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { FormField, Input, Select } from '../components/ui/FormField'
import { formatDate } from '../utils/scheduler'
import './Tasks.css'

const CATEGORIES = [
  { value: 'perso', label: '🏠 Tâche perso', color: 'var(--color-perso)' },
  { value: 'rdv', label: '📅 Rendez-vous', color: 'var(--color-rdv)' },
]

const RECURRING = [
  { value: '', label: 'Une seule fois' },
  { value: 'daily', label: 'Tous les jours' },
  { value: 'weekly', label: 'Toutes les semaines' },
]

export default function Tasks({ store }) {
  const { data, addTask, toggleTask, deleteTask } = store
  const [showModal, setShowModal] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const todayTasks = data.tasks.filter(t => t.date === today || isRecurringToday(t))
  const futureTasks = data.tasks.filter(t => t.date > today && !t.recurring)
  const doneTasks = data.tasks.filter(t => t.done && t.date < today)

  return (
    <div className="tasks-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">✅ Tâches perso</h1>
          <p className="page-sub">{todayTasks.filter(t => !t.done).length} à faire aujourd'hui</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Ajouter</Button>
      </div>

      {data.tasks.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-title">Aucune tâche</div>
          <div className="empty-sub">Ajoute tes tâches perso et rendez-vous ici</div>
          <Button onClick={() => setShowModal(true)} className="mt-16">+ Ajouter une tâche</Button>
        </div>
      )}

      {todayTasks.length > 0 && (
        <section>
          <h2 className="section-title">Aujourd'hui</h2>
          <Card className="tasks-list-card">
            {todayTasks.map(task => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
            ))}
          </Card>
        </section>
      )}

      {futureTasks.length > 0 && (
        <section>
          <h2 className="section-title">À venir</h2>
          <Card className="tasks-list-card">
            {futureTasks.sort((a,b) => a.date.localeCompare(b.date)).map(task => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
            ))}
          </Card>
        </section>
      )}

      {data.tasks.filter(t => t.recurring).length > 0 && (
        <section>
          <h2 className="section-title">Récurrentes</h2>
          <Card className="tasks-list-card">
            {data.tasks.filter(t => t.recurring).map(task => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
            ))}
          </Card>
        </section>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nouvelle tâche">
        <TaskForm
          onSubmit={(values) => {
            addTask(values)
            setShowModal(false)
          }}
          onCancel={() => setShowModal(false)}
        />
      </Modal>
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }) {
  const catConfig = CATEGORIES.find(c => c.value === task.category) || CATEGORIES[0]

  return (
    <div className={`task-row ${task.done ? 'task-row--done' : ''}`}>
      <button className={`task-checkbox ${task.done ? 'task-checkbox--checked' : ''}`} onClick={onToggle}>
        {task.done ? '✓' : ''}
      </button>

      <div className="task-row-info">
        <div className="task-row-header">
          <span className="task-row-title">{task.title}</span>
          <span className="task-row-cat" style={{ color: catConfig.color }}>{catConfig.label}</span>
        </div>
        <div className="task-row-meta">
          {task.date && <span>{formatDate(task.date)}</span>}
          {task.time && <span>🕐 {task.time}</span>}
          {task.recurring && (
            <span className="task-recurring">
              🔄 {task.recurring === 'daily' ? 'Quotidien' : 'Hebdo'}
            </span>
          )}
        </div>
      </div>

      <button className="icon-btn icon-btn--danger" onClick={onDelete}>🗑️</button>
    </div>
  )
}

function TaskForm({ onSubmit, onCancel }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    title: '',
    category: 'perso',
    date: today,
    time: '',
    recurring: '',
  })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title || !form.date) return
    onSubmit(form)
  }

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <FormField label="Titre" required>
        <input className="form-input" placeholder="Ex: Appeler le médecin" value={form.title} onChange={e => set('title', e.target.value)} required />
      </FormField>

      <div className="form-row">
        <FormField label="Catégorie">
          <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </FormField>

        <FormField label="Date" required>
          <input className="form-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
        </FormField>
      </div>

      <div className="form-row">
        <FormField label="Heure (optionnel)">
          <input className="form-input" type="time" value={form.time} onChange={e => set('time', e.target.value)} />
        </FormField>

        <FormField label="Récurrence">
          <select className="form-select" value={form.recurring} onChange={e => set('recurring', e.target.value)}>
            {RECURRING.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </FormField>
      </div>

      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" variant="primary">Ajouter</Button>
      </div>
    </form>
  )
}

function isRecurringToday(task) {
  if (!task.recurring || !task.date) return false
  const today = new Date()
  const taskDate = new Date(task.date + 'T00:00:00')
  if (taskDate > today) return false
  if (task.recurring === 'daily') return true
  if (task.recurring === 'weekly') return today.getDay() === taskDate.getDay()
  return false
}
