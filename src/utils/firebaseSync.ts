import { ref, set, get, onValue, Unsubscribe } from 'firebase/database';
import { database } from '../firebase';
import { Account, Profile, Assumptions } from '../types';

const ensureDatabase = () => {
  if (!database) {
    throw new Error('Firebase database is not configured.');
  }
  return database;
};

/**
 * Save user's investment accounts to Firebase Realtime Database
 */
export const saveAccountsToFirebase = async (userId: string, accounts: Account[]): Promise<void> => {
  try {
    console.log(`[Firebase] Saving accounts for user ${userId}:`, accounts);
    const db = ensureDatabase();
    const userRef = ref(db, `users/${userId}/accounts`);
    await set(userRef, accounts);
    console.log('[Firebase] Accounts saved successfully');
  } catch (error) {
    console.error('[Firebase] Error saving accounts:', error);
    throw error;
  }
};

/**
 * Save user's profile to Firebase Realtime Database
 */
export const saveProfileToFirebase = async (userId: string, profile: Profile): Promise<void> => {
  try {
    console.log(`[Firebase] Saving profile for user ${userId}:`, profile);
    const db = ensureDatabase();
    const userRef = ref(db, `users/${userId}/profile`);
    await set(userRef, profile);
    console.log('[Firebase] Profile saved successfully');
  } catch (error) {
    console.error('[Firebase] Error saving profile:', error);
    throw error;
  }
};

/**
 * Save user's assumptions to Firebase Realtime Database
 */
export const saveAssumptionsToFirebase = async (userId: string, assumptions: Assumptions): Promise<void> => {
  try {
    console.log(`[Firebase] Saving assumptions for user ${userId}:`, assumptions);
    const db = ensureDatabase();
    const userRef = ref(db, `users/${userId}/assumptions`);
    await set(userRef, assumptions);
    console.log('[Firebase] Assumptions saved successfully');
  } catch (error) {
    console.error('[Firebase] Error saving assumptions:', error);
    throw error;
  }
};

/**
 * Load user's investment accounts from Firebase
 */
export const loadAccountsFromFirebase = async (userId: string): Promise<Account[] | null> => {
  try {
    console.log(`[Firebase] Loading accounts for user ${userId}`);
    const db = ensureDatabase();
    const userRef = ref(db, `users/${userId}/accounts`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      console.log('[Firebase] Accounts loaded:', snapshot.val());
      return snapshot.val();
    }
    console.log('[Firebase] No accounts found in Firebase');
    return null;
  } catch (error) {
    console.error('[Firebase] Error loading accounts:', error);
    return null;
  }
};

/**
 * Load user's profile from Firebase
 */
export const loadProfileFromFirebase = async (userId: string): Promise<Profile | null> => {
  try {
    console.log(`[Firebase] Loading profile for user ${userId}`);
    const db = ensureDatabase();
    const userRef = ref(db, `users/${userId}/profile`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      console.log('[Firebase] Profile loaded:', snapshot.val());
      return snapshot.val();
    }
    console.log('[Firebase] No profile found in Firebase');
    return null;
  } catch (error) {
    console.error('[Firebase] Error loading profile:', error);
    return null;
  }
};

/**
 * Load user's assumptions from Firebase
 */
export const loadAssumptionsFromFirebase = async (userId: string): Promise<Assumptions | null> => {
  try {
    console.log(`[Firebase] Loading assumptions for user ${userId}`);
    const db = ensureDatabase();
    const userRef = ref(db, `users/${userId}/assumptions`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      console.log('[Firebase] Assumptions loaded:', snapshot.val());
      return snapshot.val();
    }
    console.log('[Firebase] No assumptions found in Firebase');
    return null;
  } catch (error) {
    console.error('[Firebase] Error loading assumptions:', error);
    return null;
  }
};

/**
 * Load all user data from Firebase (accounts, profile, assumptions)
 */
export const loadAllUserDataFromFirebase = async (userId: string) => {
  try {
    console.log(`[Firebase] Loading all data for user ${userId}`);
    const [accounts, profile, assumptions] = await Promise.all([
      loadAccountsFromFirebase(userId),
      loadProfileFromFirebase(userId),
      loadAssumptionsFromFirebase(userId),
    ]);
    
    console.log('[Firebase] All data loaded successfully');
    return { accounts, profile, assumptions };
  } catch (error) {
    console.error('[Firebase] Error loading user data:', error);
    return { accounts: null, profile: null, assumptions: null };
  }
};

/**
 * Subscribe to real-time updates for user's accounts
 */
export const subscribeToAccounts = (userId: string, callback: (accounts: Account[] | null) => void): Unsubscribe => {
  if (!database) {
    callback(null);
    return () => undefined;
  }

  const userRef = ref(database, `users/${userId}/accounts`);
  return onValue(userRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
};

/**
 * Subscribe to real-time updates for user's profile
 */
export const subscribeToProfile = (userId: string, callback: (profile: Profile | null) => void): Unsubscribe => {
  if (!database) {
    callback(null);
    return () => undefined;
  }

  const userRef = ref(database, `users/${userId}/profile`);
  return onValue(userRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
};

/**
 * Subscribe to real-time updates for user's assumptions
 */
export const subscribeToAssumptions = (userId: string, callback: (assumptions: Assumptions | null) => void): Unsubscribe => {
  if (!database) {
    callback(null);
    return () => undefined;
  }

  const userRef = ref(database, `users/${userId}/assumptions`);
  return onValue(userRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
};
