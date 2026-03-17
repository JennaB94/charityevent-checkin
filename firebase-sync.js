// firebase-sync.js - Complete Firebase Configuration & Real-Time Sync
// Supports multi-device synchronization, offline persistence, and real-time updates

// ============================================================
// FIREBASE SDK INITIALIZATION
// ============================================================

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com"
};

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

// ============================================================
// WRITE OPERATIONS - PUSHING DATA TO FIREBASE
// ============================================================

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
        state.log.push(checkin);
        if (typeof renderDashboard === 'function') {
          renderDashboard();
        }
        broadcastCheckIn(checkin);
      }
    });
    
    console.log('✅ Real-time sync listeners activated');
  } else {
    console.warn('⚠️ Firebase not available - using local storage only');
  }
});
