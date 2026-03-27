import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDsGUI_guduP6Kb0wbLaQlo4tLhkhi6yE0",
  authDomain: "drill-planner-9a8eb.firebaseapp.com",
  projectId: "drill-planner-9a8eb",
  storageBucket: "drill-planner-9a8eb.firebasestorage.app",
  messagingSenderId: "761429780977",
  appId: "1:761429780977:web:a5a3bd84dd9371dc26bc50"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
