import { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'

// Retourne :
//   undefined  → vérification en cours (Firebase initialise)
//   null       → non connecté
//   object     → utilisateur Firebase connecté
export function useAuth() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null))
    return unsub
  }, [])

  return user
}
