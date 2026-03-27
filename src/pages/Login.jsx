import React, { useState } from 'react'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../firebase'
import './Login.css'

const QUOTE = '« Percez les cieux — même l\'impossible est une étape sur le chemin. »'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuth = async (action) => {
    setError('')
    if (!email.trim() || !password) {
      setError('Remplis tous les champs.')
      return
    }
    setLoading(true)
    try {
      if (action === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (err) {
      setError(translateFirebaseError(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        {/* Logo + titre */}
        <div className="login-logo">
          <span className="login-logo-icon">◈</span>
          <span className="login-logo-text">DRILL PLANNER</span>
        </div>

        {/* Citation */}
        <p className="login-quote">{QUOTE}</p>

        {/* Formulaire */}
        <form className="login-form" onSubmit={e => e.preventDefault()}>
          <div className="login-field">
            <label className="login-label">Email</label>
            <input
              className="login-input"
              type="email"
              placeholder="ton@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label className="login-label">Mot de passe</label>
            <input
              className="login-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <div className="login-actions">
            <button
              className="login-btn login-btn-primary"
              onClick={() => handleAuth('login')}
              disabled={loading}
            >
              {loading ? '…' : 'Se connecter'}
            </button>
            <button
              className="login-btn login-btn-secondary"
              onClick={() => handleAuth('register')}
              disabled={loading}
            >
              {loading ? '…' : 'Créer un compte'}
            </button>
          </div>
        </form>

        <p className="login-hint">
          Crée un compte la première fois, connecte-toi ensuite.
        </p>
      </div>
    </div>
  )
}

function translateFirebaseError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Adresse email invalide.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email ou mot de passe incorrect.'
    case 'auth/email-already-in-use':
      return 'Ce compte existe déjà. Connecte-toi.'
    case 'auth/weak-password':
      return 'Mot de passe trop faible (6 caractères min).'
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.'
    default:
      return 'Erreur de connexion. Réessaie.'
  }
}
