// firebase-auth.js

// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCLZ7hRHpoh_G_eX3ggZL15iL-xhJOvpIA",
  authDomain: "streamheaven-f7042.firebaseapp.com",
  projectId: "streamheaven-f7042",
  storageBucket: "streamheaven-f7042.firebasestorage.app",
  messagingSenderId: "423108789323",
  appId: "1:423108789323:web:a7f592cfc311b22e5df9ce",
  measurementId: "G-BHBJSJW06B"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Auth State
let currentUser = null;

// The Auth UI Controller
const AuthUI = {
  openLogin: function() {
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'block';
    document.getElementById('auth-signup-view').style.display = 'none';
    if(typeof Sidebar !== 'undefined') Sidebar.close(); // Close sidebar if on mobile
  },
  openSignup: function() {
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-signup-view').style.display = 'block';
  },
  close: function() {
    document.getElementById('auth-modal-overlay').classList.remove('open');
  },
  overlayClick: function(e) {
    if(e.target.id === 'auth-modal-overlay') {
      AuthUI.close();
    }
  },
  showError: function(msg, isSignup = false) {
    const elId = isSignup ? 'auth-signup-error' : 'auth-login-error';
    const el = document.getElementById(elId);
    if(el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  },
  clearErrors: function() {
    const e1 = document.getElementById('auth-login-error');
    const e2 = document.getElementById('auth-signup-error');
    if(e1) e1.style.display = 'none';
    if(e2) e2.style.display = 'none';
  }
};

// Handlers
async function handleLogin(e) {
  e.preventDefault();
  AuthUI.clearErrors();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  const btn = document.getElementById('btn-login');
  
  if(!email || !pass) return AuthUI.showError("Please fill in all fields.");
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    AuthUI.close();
    if(typeof App !== 'undefined') App.showToast("Successfully logged in!");
  } catch(error) {
    AuthUI.showError(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  AuthUI.clearErrors();
  
  const username = document.getElementById('signup-user').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-pass').value;
  const confirm = document.getElementById('signup-confirm').value;
  const btn = document.getElementById('btn-signup');
  
  if(!username || !email || !pass || !confirm) return AuthUI.showError("Please fill in all fields.", true);
  if(pass !== confirm) return AuthUI.showError("Passwords do not match.", true);
  if(pass.length < 6) return AuthUI.showError("Password must be at least 6 characters.", true);
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
  
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    // Save the username to the Firebase profile
    await cred.user.updateProfile({ displayName: username });
    
    // Also save a small user doc in Firestore just in case
    await db.collection("users").doc(cred.user.uid).set({
      username: username,
      email: email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    AuthUI.close();
    if(typeof App !== 'undefined') App.showToast("Account created successfully!");
  } catch(error) {
    AuthUI.showError(error.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
  }
}

async function handleForgotPassword() {
  const email = document.getElementById('login-email').value.trim();
  if(!email) {
    AuthUI.showError("Please enter your email above first.");
    return;
  }
  
  try {
    await auth.sendPasswordResetEmail(email);
    if(typeof App !== 'undefined') App.showToast("Password reset email sent! Check your inbox.");
  } catch(error) {
    AuthUI.showError(error.message);
  }
}

async function handleGoogleLogin() {
  AuthUI.clearErrors();
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    
    // Save a small user doc in Firestore just in case this is a new user
    await db.collection("users").doc(result.user.uid).set({
      username: result.user.displayName || result.user.email.split('@')[0],
      email: result.user.email,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    AuthUI.close();
    if(typeof App !== 'undefined') App.showToast("Successfully logged in with Google!");
  } catch(error) {
    AuthUI.showError(error.message);
  }
}

function handleLogout() {
  auth.signOut().then(() => {
    if(typeof App !== 'undefined') App.showToast("Logged out successfully");
  });
}

// Global Auth State Observer
auth.onAuthStateChanged(user => {
  currentUser = user;
  const sidebarFooter = document.querySelector('.sidebar-footer');
  
  if(user) {
    // Logged In State
    const displayName = user.displayName || user.email.split('@')[0];
    const initial = displayName.charAt(0).toUpperCase();
    
    if(sidebarFooter) {
      sidebarFooter.innerHTML = `
        <div class="sf-profile" onclick="handleLogout()" title="Click to logout">
          <div class="sf-avatar active">${initial}</div>
          <div class="sf-info">
            <div class="sf-name">${displayName}</div>
            <div class="sf-status">Active Session (Logout)</div>
          </div>
        </div>
      `;
    }
    
    // Attempt to load cloud wishlist
    syncWishlistFromCloud();
  } else {
    // Logged Out State
    if(sidebarFooter) {
      sidebarFooter.innerHTML = `
        <div class="sf-profile guest" onclick="AuthUI.openLogin()">
          <div class="sf-avatar">G</div>
          <div class="sf-info">
            <div class="sf-name">Guest Mode</div>
            <div class="sf-status">Sign in / Sign up</div>
          </div>
        </div>
      `;
    }
    
    // Clear in-memory wishlist UI if we were logged in
    const wlGrid = document.getElementById('wl-grid');
    if(wlGrid) wlGrid.innerHTML = '';
  }
});

// Wishlist Cloud Sync
async function syncWishlistFromCloud() {
  if(!currentUser) return;
  
  try {
    const snap = await db.collection("users").doc(currentUser.uid).collection("wishlist").get();
    let cloudList = [];
    snap.forEach(doc => {
      cloudList.push(doc.data());
    });
    
    // Save to local storage for offline fast-access, but cloud is source of truth
    localStorage.setItem('cv_watchlist', JSON.stringify(cloudList));
    
    // Re-render if on wishlist page
    const wlPage = document.getElementById('page-watchlist');
    if(wlPage && wlPage.classList.contains('active')) {
      if(typeof App !== 'undefined') App.showWatchlist();
    }
  } catch(e) {
    console.error("Error syncing wishlist", e);
  }
}

// Expose to window for inline HTML onclicks
window.AuthUI = AuthUI;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleForgotPassword = handleForgotPassword;
window.handleLogout = handleLogout;
window.handleGoogleLogin = handleGoogleLogin;
