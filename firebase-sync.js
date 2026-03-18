// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAVsREtbOF30frhPT9QAvQQ7s-Ekg3P4MQ",
  authDomain: "charity-event-checkin.firebaseapp.com",
  databaseURL: "https://charity-event-checkin-default-rtdb.firebaseio.com",
  projectId: "charity-event-checkin",
  storageBucket: "charity-event-checkin.firebasestorage.app",
  messagingSenderId: "422149994231",
  appId: "1:422149994231:web:9531f4d4b986b1ce78c5f2",
  measurementId: "G-Z5F8CGZGK6"
};
let firebaseReadyPromise = new Promise((resolve) => {
  window.firebaseReady = resolve;
});
let database, auth;

async function initializeFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
    
    console.log('✅ Firebase initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    return false;
  }
}

// ============================================================
// STATE MANAGEMENT & SYNC LISTENERS
// ============================================================

let syncState = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSync: null,
  pendingChanges: []
};

// Real-time sync for Check-ins (Critical for Live Dashboard)
function syncCheckIns(callback) {
  if (!database) return;
  
  const checkinsRef = database.ref('checkins');
  
  checkinsRef.orderByChild('timestamp').limitToLast(100).on('child_added', (snapshot) => {
    const checkin = snapshot.val();
    if (checkin) {
      console.log('✅ New check-in synced:', checkin);
      if (callback) callback(checkin);
    }
  }, (error) => {
    console.error('❌ Check-ins sync error:', error);
  });
}

// Real-time sync for Participants
function syncParticipants() {
  if (!database) return;

  database.ref('participants').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && typeof state !== 'undefined') {
      const existingIds = new Set(state.participants.map(p => p.id));
      Object.values(data).forEach(remote => {
        if (!existingIds.has(remote.id)) {
          state.participants.push(remote);
          existingIds.add(remote.id);
        }
      });
      localStorage.setItem('checkin_pro', JSON.stringify(state));
      if (typeof renderParticipants === 'function') renderParticipants();
    }
  }, (error) => {
    console.error('❌ Participants sync error:', error);
  });
}

// Real-time sync for Checkpoints
function syncCheckpoints() {
  if (!database) return;

  database.ref('checkpoints').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && typeof state !== 'undefined') {
      const existingIds = new Set(state.checkpoints.map(c => c.id));
      Object.values(data).forEach(remote => {
        if (!existingIds.has(remote.id)) {
          state.checkpoints.push(remote);
          existingIds.add(remote.id);
        }
      });
      localStorage.setItem('checkin_pro', JSON.stringify(state));
      if (typeof renderCheckpoints === 'function') renderCheckpoints();
      if (typeof populateScanCheckpoints === 'function') populateScanCheckpoints();
    }
  }, (error) => {
    console.error('❌ Checkpoints sync error:', error);
  });
}

// ============================================================
// WRITE OPERATIONS - PUSHING DATA TO FIREBASE
// ============================================================

// Save full app state to Firebase (participants, checkpoints, event)
async function saveStateToFirebase(appState) {
  if (!database) return;
  try {
    const updates = {};
    if (appState.event) {
      updates['event'] = appState.event;
    }
    if (appState.participants) {
      appState.participants.forEach(p => {
        updates['participants/' + p.id] = p;
      });
    }
    if (appState.checkpoints) {
      appState.checkpoints.forEach(cp => {
        updates['checkpoints/' + cp.id] = cp;
      });
    }
    await database.ref().update(updates);
    console.log('✅ State synced to Firebase');
  } catch (error) {
    console.error('❌ Error saving state to Firebase:', error);
  }
}

// Save Check-in (CRITICAL - Real-time updates)
async function saveCheckInToFirebase(checkinData) {
  try {
    if (!database) throw new Error('Firebase not initialized');
    
    syncState.isSyncing = true;
    const checkinRef = database.ref('checkins').push();
    await checkinRef.set({
      ...checkinData,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      syncedAt: new Date().toISOString()
    });
    console.log('✅ Check-in saved to Firebase:', checkinData);
    syncState.lastSync = new Date();
    syncState.isSyncing = false;
    return true;
  } catch (error) {
    console.error('❌ Error saving check-in:', error);
    syncState.pendingChanges.push({ type: 'checkin', data: checkinData });
    return false;
  }
}

// ============================================================
// OFFLINE/ONLINE HANDLING
// ============================================================

window.addEventListener('online', async () => {
  console.log('🌐 Back online! Syncing pending changes...');
  syncState.isOnline = true;
  
  if (syncState.pendingChanges.length > 0) {
    for (const change of syncState.pendingChanges) {
      try {
        if (change.type === 'checkin') await saveCheckInToFirebase(change.data);
      } catch (error) {
        console.error('Error syncing pending change:', error);
      }
    }
    syncState.pendingChanges = [];
    if (typeof toast === 'function') {
      toast('✅ All changes synced!', 'success');
    }
  }
});

window.addEventListener('offline', () => {
  console.log('⚠️ You are offline. Changes will be synced when back online.');
  syncState.isOnline = false;
  if (typeof toast === 'function') {
    toast('⚠️ Offline mode - changes will sync when online', 'warning');
  }
});

// ============================================================
// BROADCAST CHANNEL FOR MULTI-TAB SYNC
// ============================================================

let broadcastChannel;

function initBroadcastChannel() {
  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('checkin_sync');
    
    broadcastChannel.onmessage = (event) => {
      console.log('📡 Received message from other tab:', event.data);
      
      if (event.data.type === 'checkin' && typeof state !== 'undefined') {
        state.log.push(event.data.checkin);
        if (typeof renderDashboard === 'function') {
          renderDashboard();
        }
      }
    };
    
    console.log('✅ Broadcast Channel initialized for multi-tab sync');
  }
}

function broadcastCheckIn(checkinData) {
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      type: 'checkin',
      checkin: checkinData
    });
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Firebase Sync...');
  
  const firebaseReady = await initializeFirebase();
  initBroadcastChannel();
  
  if (firebaseReady) {
    syncCheckIns((checkin) => {
      if (typeof state !== 'undefined' && state) {
        // Avoid adding duplicates already in local state
        const existingIds = new Set(state.log.map(e => e.id));
        if (!existingIds.has(checkin.id)) {
          state.log.push(checkin);
        }
        if (typeof renderDashboard === 'function') {
          renderDashboard();
        }
        broadcastCheckIn(checkin);
      }
    });

    syncParticipants();
    syncCheckpoints();
    
    console.log('✅ Real-time sync listeners activated');
    window.firebaseReady(true);
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) {
      statusEl.textContent = '🟢 Firebase connected';
      statusEl.style.color = 'var(--accent3)';
    }
  } else {
    console.warn('⚠️ Firebase not available - using local storage only');
    window.firebaseReady(false);
    const statusEl = document.getElementById('firebase-status');
    if (statusEl) {
      statusEl.textContent = '🔴 Offline (local only)';
      statusEl.style.color = 'var(--accent2)';
    }
  }
});
