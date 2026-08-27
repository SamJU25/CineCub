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

let auth = null;
let db = null;

try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
} catch (e) {
  console.error("Firebase failed to load. Please disable your adblocker if you want to log in.", e);
}

// Global Auth State
let currentUser = null;

// Handle Redirect Result for Google Login
if (auth) {
  auth.getRedirectResult().then(async (result) => {
    if (result.credential && result.user) {
      let username = result.user.displayName || result.user.email.split('@')[0];
      let lowerUsername = username.toLowerCase();
      
      try {
        const userDoc = await db.collection("usernames").doc(lowerUsername).get();
        if (userDoc.exists && userDoc.data().uid !== result.user.uid) {
           // Username taken by someone else, append random numbers
           const randomNum = Math.floor(Math.random() * 10000);
           username = `${username}${randomNum}`;
           lowerUsername = username.toLowerCase();
        }
        db.collection("usernames").doc(lowerUsername).set({
          uid: result.user.uid,
          email: result.user.email
        }, { merge: true }).catch(e => console.warn("Username reserve failed:", e));
      } catch (err) {
        console.warn("Error handling Google username:", err);
      }
      
      // Save a small user doc in Firestore just in case this is a new user
      db.collection("users").doc(result.user.uid).set({
        username: username,
        email: result.user.email,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.warn("Firestore write failed:", err));
      
      if(typeof App !== 'undefined') App.showToast("Successfully logged in with Google!");
    }
  }).catch((error) => {
    console.error("Redirect auth error:", error);
    AuthUI.showError(error.message);
  });
}

// The Auth UI Controller
window.AuthUI = {
  openLogin: function() {
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'block';
    document.getElementById('auth-signup-view').style.display = 'none';
    const forgotView = document.getElementById('auth-forgot-view');
    if(forgotView) forgotView.style.display = 'none';
    if(typeof Sidebar !== 'undefined') Sidebar.close(); // Close sidebar if on mobile
  },
  openSignup: function() {
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-signup-view').style.display = 'block';
    const forgotView = document.getElementById('auth-forgot-view');
    if(forgotView) forgotView.style.display = 'none';
  },
  openForgot: function() {
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-signup-view').style.display = 'none';
    document.getElementById('auth-forgot-view').style.display = 'block';
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
  const inputStr = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const btn = document.getElementById('btn-login');
  
  if(!inputStr || !pass) return AuthUI.showError("Please fill in all fields.");
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  
  try {
    if(!auth) {
      document.getElementById('auth-login-error').textContent = "Firebase is blocked. Please disable your adblocker.";
      document.getElementById('auth-login-error').style.display = 'block';
      return;
    }
    
    let loginEmail = inputStr;
    // If input does not contain '@', assume it's a username
    if (!inputStr.includes('@')) {
      const userDoc = await db.collection("usernames").doc(inputStr.toLowerCase()).get();
      if (!userDoc.exists) {
        AuthUI.showError("Username not found.");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        return;
      }
      loginEmail = userDoc.data().email;
    }
    
    await auth.signInWithEmailAndPassword(loginEmail, pass);
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
  
  if(!auth) {
    return AuthUI.showError("Firebase is blocked. Please disable your adblocker and try again.", true);
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

  const lowerUsername = username.toLowerCase();
  
  try {
    const userDoc = await db.collection("usernames").doc(lowerUsername).get();
    if (userDoc.exists) {
      AuthUI.showError("Username is already taken.", true);
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
      return;
    }
  } catch(err) {
    console.warn("Could not check username:", err);
  }

  // 10-second timeout to prevent infinite hang
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out. Please check your connection and try again.")), 10000)
  );

  try {
    const cred = await Promise.race([
      auth.createUserWithEmailAndPassword(email, pass),
      timeoutPromise
    ]);
    // Save display name (non-blocking)
    cred.user.updateProfile({ displayName: username }).catch(err => console.warn("Profile update failed:", err));
    // Save user doc in Firestore (non-blocking)
    db.collection("users").doc(cred.user.uid).set({
      username: username,
      email: email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(fsErr => {
      console.warn("Firestore write failed (non-critical):", fsErr);
    });
    // Save username mapping (non-blocking)
    db.collection("usernames").doc(lowerUsername).set({
      uid: cred.user.uid,
      email: email
    }).catch(err => console.warn("Failed to save username mapping:", err));
    
    AuthUI.close();
    if(typeof App !== 'undefined') App.showToast("Account created successfully! Welcome, " + username + "!");
  } catch(error) {
    let msg = error.message || "Something went wrong. Please try again.";
    // Make Firebase error messages friendlier
    if(msg.includes('email-already-in-use')) msg = "This email is already registered. Try logging in instead.";
    else if(msg.includes('invalid-email')) msg = "Please enter a valid email address.";
    else if(msg.includes('weak-password')) msg = "Password is too weak. Use at least 6 characters.";
    else if(msg.includes('operation-not-allowed')) msg = "Email sign-up is currently disabled. Please use Google sign-in.";
    else if(msg.includes('network-request-failed') || msg.includes('timed out')) msg = "Network error. Please check your connection and disable any adblockers.";
    AuthUI.showError(msg, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
  }
}


  async function handleForgotPassword(e) {
    if(e) e.preventDefault();
    const btn = document.getElementById('btn-forgot');
    if(btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    }
    
    const email = document.getElementById('forgot-email').value.trim();
    if(!email) {
      AuthUI.showError("Please enter your email address.");
      if(btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
      }
      return;
    }
    
    try {
      await auth.sendPasswordResetEmail(email);
      document.getElementById('auth-forgot-view').innerHTML = `
        <div style="text-align:center; padding: 40px 20px;">
          <i class="fas fa-check-circle" style="font-size: 48px; color: var(--cv-green); margin-bottom: 20px;"></i>
          <h3 style="font-size: 24px; font-weight: 800; margin-bottom: 10px;">Check your email</h3>
          <p style="color: var(--text-3); font-size: 14px; margin-bottom: 20px;">We've sent a password reset link to <strong>${email}</strong>.</p>
          <button class="auth-btn-primary" onclick="AuthUI.openLogin()">Back to Login</button>
        </div>
      `;
    } catch(error) {
      AuthUI.showError(error.message);
      if(btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
      }
    }
  }

async function handleGoogleLogin() {
  if(!auth) {
    alert("Firebase is blocked. Please disable your adblocker.");
    return;
  }
  AuthUI.clearErrors();
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithRedirect(provider);
  } catch(error) {
    AuthUI.showError(error.message);
  }
}

window.handleLogout = function() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s ease;';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--cv-dark-1);border:1px solid var(--b-2);border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.5);width:90%;max-width:400px;text-align:center;padding:30px;transform:scale(0.9);opacity:0;transition:all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);';
  
  modal.innerHTML = `
    <div style="font-size: 48px; color: var(--cv-red); margin-bottom: 20px;">
      <i class="fas fa-sign-out-alt"></i>
    </div>
    <h3 style="font-size: 24px; font-weight: 800; margin-bottom: 10px; color: #fff;">Confirm Logout</h3>
    <p style="color: var(--text-3); font-size: 15px; margin-bottom: 30px;">Are you sure you want to log out of StreamHeaven?</p>
    <div style="display: flex; gap: 15px; justify-content: center;">
      <button id="btn-cancel-logout" style="background: var(--cv-dark-2); color: #fff; border: 1px solid var(--b-2); padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; flex: 1;">Cancel</button>
      <button id="btn-confirm-logout" style="background: var(--cv-red); color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; flex: 1;">Logout</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Trigger reflow
  void overlay.offsetWidth;
  overlay.style.opacity = '1';
  modal.style.transform = 'scale(1)';
  modal.style.opacity = '1';

  const close = () => {
    overlay.style.opacity = '0';
    modal.style.transform = 'scale(0.9)';
    modal.style.opacity = '0';
    setTimeout(() => overlay.remove(), 300);
  };

  document.getElementById('btn-cancel-logout').addEventListener('click', close);
  document.getElementById('btn-cancel-logout').addEventListener('mouseover', function() { this.style.background = 'var(--b-1)'; });
  document.getElementById('btn-cancel-logout').addEventListener('mouseout', function() { this.style.background = 'var(--cv-dark-2)'; });
  
  document.getElementById('btn-confirm-logout').addEventListener('click', () => {
    close();
    if(auth) {
      auth.signOut().then(() => {
        if (window.location.pathname.includes('profile.html')) {
          window.location.href = 'index.html';
        } else if(typeof App !== 'undefined') {
          App.showToast("Logged out successfully");
        }
      });
    }
  });
  document.getElementById('btn-confirm-logout').addEventListener('mouseover', function() { this.style.background = '#ff4d5a'; });
  document.getElementById('btn-confirm-logout').addEventListener('mouseout', function() { this.style.background = 'var(--cv-red)'; });
}

// Global Auth State Observer
if (auth) {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    const sidebarFooter = document.querySelector('.cv-sidebar-bottom');
    
    if(user) {
      // Logged In State
    const displayName = user.displayName || user.email.split('@')[0];
    const initial = displayName.charAt(0).toUpperCase();
        // Update the popup username
      const popupUsername = document.getElementById('popup-username');
      if(popupUsername) popupUsername.textContent = displayName;
      
      // Update the popup buttons
      const btnProfile = document.getElementById('popup-profile-btn');
      const btnLogout = document.getElementById('popup-logout-btn');
      const btnLogin = document.getElementById('popup-login-btn');
      if(btnProfile) btnProfile.style.display = 'flex';
      if(btnLogout) btnLogout.style.display = 'flex';
      if(btnLogin) btnLogin.style.display = 'none';

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
    // Update the popup username
    const popupUsername = document.getElementById('popup-username');
    if(popupUsername) popupUsername.textContent = 'Guest';

    // Update the popup buttons
    const btnProfile = document.getElementById('popup-profile-btn');
    const btnLogout = document.getElementById('popup-logout-btn');
    const btnLogin = document.getElementById('popup-login-btn');
    if(btnProfile) btnProfile.style.display = 'none';
    if(btnLogout) btnLogout.style.display = 'none';
    if(btnLogin) btnLogin.style.display = 'flex';

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
}

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
// window.handleLogout already attached
window.handleGoogleLogin = handleGoogleLogin;

window.togglePassword = function(inputId) {
  const input = document.getElementById(inputId);
  if(!input) return;
  const icon = input.nextElementSibling.querySelector('i') || input.nextElementSibling;
  
  if(input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
};
