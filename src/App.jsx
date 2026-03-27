import React, { useState } from 'react'
import { useAuth } from './hooks/useAuth'
import { useStore } from './hooks/useStore'
import Sidebar from './components/layout/Sidebar'
import BottomNav from './components/layout/BottomNav'
import Dashboard from './pages/Dashboard'
import Controls from './pages/Controls'
import Homework from './pages/Homework'
import Planning from './pages/Planning'
import Stats from './pages/Stats'
import Tasks from './pages/Tasks'
import Settings from './pages/Settings'
import Pronote from './pages/Pronote'
import Login from './pages/Login'
import './styles/App.css'

function LoadingScreen({ message = 'Chargement…' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '1rem',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        fontFamily: 'Orbitron, monospace',
        fontSize: '1.4rem',
        color: 'var(--color-primary)',
        letterSpacing: '0.15em',
        animation: 'pulse 1.2s ease-in-out infinite',
      }}>
        ◈ DRILL PLANNER
      </div>
      <div style={{
        fontFamily: 'Rajdhani, sans-serif',
        fontSize: '0.85rem',
        color: 'var(--color-text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        {message}
      </div>
    </div>
  )
}

// Contenu de l'app — uniquement rendu quand l'utilisateur est connecté
function AppContent({ userId }) {
  const [activePage, setActivePage] = useState('dashboard')
  const store = useStore(userId)

  if (store.loading) return <LoadingScreen message="Connexion à Firestore…" />

  const pages = {
    dashboard: <Dashboard store={store} />,
    controls: <Controls store={store} />,
    homework: <Homework store={store} />,
    tasks: <Tasks store={store} />,
    planning: <Planning store={store} />,
    stats: <Stats store={store} />,
    settings: <Settings store={store} />,
    pronote: <Pronote store={store} userId={userId} />,
  }

  return (
    <div className="app-layout">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="app-main">
        <div className="page-content fade-in" key={activePage}>
          {pages[activePage]}
        </div>
      </main>
      <BottomNav activePage={activePage} onNavigate={setActivePage} />
    </div>
  )
}

export default function App() {
  const user = useAuth()

  // undefined = Firebase vérifie l'état d'auth (premier chargement)
  if (user === undefined) return <LoadingScreen message="Vérification de l'authentification…" />

  // null = non connecté → page de connexion
  if (user === null) return <Login />

  // connecté → app complète
  return <AppContent userId={user.uid} />
}
