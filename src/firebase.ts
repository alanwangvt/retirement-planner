import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  type Auth,
} from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseio.com`,
};

const hasRequiredConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let databaseInstance: Database | null = null;

if (hasRequiredConfig) {
  try {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    databaseInstance = getDatabase(app);
  } catch (error) {
    console.warn('[Firebase] Initialization failed. Running with local-only mode.', error);
  }
} else {
  console.warn('[Firebase] Missing Firebase environment variables. Running with local-only mode.');
}

export const auth: Auth | null = authInstance;

export const database: Database | null = databaseInstance;

export const isFirebaseEnabled = Boolean(auth && database);

// Uncomment below to use Auth Emulator for local development
// if (import.meta.env.DEV) {
//   connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
// }

export default app;
