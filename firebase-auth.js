document.addEventListener('DOMContentLoaded', () => {
    const cachedAvatar = localStorage.getItem('cachedAvatar');
    const cachedName = localStorage.getItem('cachedName');
    if (cachedAvatar) {
        const topProfileBtn = document.getElementById('header-profile-btn');
        const topProfileName = document.getElementById('header-profile-name');
        
        if (topProfileName && cachedName) {
            topProfileName.textContent = cachedName;
            topProfileName.style.display = 'block';
        }
        
        if (topProfileBtn) {
            topProfileBtn.innerHTML = `<img src="${cachedAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Profile">`;
            topProfileBtn.onclick = (e) => {
                e.preventDefault();
                window.location.href = 'profile.html';
            };
        }
    }
});

// Custom Backend Password Reset URL (Points to your separate backend repo)
const RESET_PASSWORD_API_URL = "https://streamheaven-api.onrender.com/api/auth/forgot-password";

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
let currentUser = null;
let userDataUnsubscribe = null;

try {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
} catch (e) {
  console.error("Firebase failed to load. Please disable your adblocker if you want to log in.", e);
}

// Global Auth State


// The Auth UI Controller
window.AuthUI = {
  openLogin: function() {
    AuthUI.clearErrors();
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'block';
    document.getElementById('auth-signup-view').style.display = 'none';
    const forgotView = document.getElementById('auth-forgot-view');
    if(forgotView) forgotView.style.display = 'none';
    if(typeof Sidebar !== 'undefined') Sidebar.close(); // Close sidebar if on mobile
  },
  openSignup: function() {
    AuthUI.clearErrors();
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-signup-view').style.display = 'block';
    const forgotView = document.getElementById('auth-forgot-view');
    if(forgotView) forgotView.style.display = 'none';
  },
  openForgot: function() {
    AuthUI.clearErrors();
    document.getElementById('auth-modal-overlay').classList.add('open');
    document.getElementById('auth-login-view').style.display = 'none';
    document.getElementById('auth-signup-view').style.display = 'none';
    const forgotView = document.getElementById('auth-forgot-view');
    if(forgotView) forgotView.style.display = 'block';
  },
  close: function() {
    document.getElementById('auth-modal-overlay').classList.remove('open');
    AuthUI.clearErrors();
  },
  overlayClick: function(e) {
    if(e.target.id === 'auth-modal-overlay') {
      AuthUI.close();
    }
  },
  showError: function(msg, target = 'login') {
    let elId = 'auth-login-error';
    if (target === true || target === 'signup') {
      elId = 'auth-signup-error';
    } else if (target === 'forgot') {
      elId = 'auth-forgot-error';
    } else if (target === 'login' || target === false) {
      elId = 'auth-login-error';
    }
    const el = document.getElementById(elId);
    if(el) {
      el.className = 'auth-error';
      el.textContent = msg;
      el.style.display = 'block';
    }
  },
  showSuccess: function(msg, target = 'forgot') {
    let elId = 'auth-forgot-error';
    if (target === 'signup') {
      elId = 'auth-signup-error';
    } else if (target === 'login') {
      elId = 'auth-login-error';
    }
    const el = document.getElementById(elId);
    if(el) {
      el.className = 'auth-success';
      el.innerHTML = `<i class="fas fa-check-circle" style="margin-right:6px;"></i> ${msg}`;
      el.style.display = 'block';
    }
  },
  clearErrors: function() {
    const ids = ['auth-login-error', 'auth-signup-error', 'auth-forgot-error'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if(el) {
        el.style.display = 'none';
        el.textContent = '';
        el.className = 'auth-error';
      }
    });
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
    let isUsername = false;
    
    // If input does not contain '@' or starts with '@' and has no other '@', assume it's a username
    if (!inputStr.includes('@') || (inputStr.startsWith('@') && inputStr.indexOf('@') === inputStr.lastIndexOf('@'))) {
      isUsername = true;
      let checkUsername = inputStr;
      if (checkUsername.startsWith('@')) {
        checkUsername = checkUsername.substring(1);
      }
      
      const userDoc = await db.collection("usernames").doc(checkUsername.toLowerCase()).get();
      if (!userDoc.exists) {
        AuthUI.showError("Username not found.");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        return;
      }
      loginEmail = userDoc.data().email;
      
      // Fallback for older accounts that might not have email in usernames collection
      if (!loginEmail && userDoc.data().uid) {
         try {
            const userProfile = await db.collection("users").doc(userDoc.data().uid).get();
            if (userProfile.exists && userProfile.data().email) {
               loginEmail = userProfile.data().email;
            }
         } catch(e) {
            console.warn("Could not fetch user profile for email fallback", e);
         }
      }
      
      if (!loginEmail) {
        AuthUI.showError("We couldn't find the email linked to this username. Please login using your email address.");
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        return;
      }
    }
    
    await auth.signInWithEmailAndPassword(loginEmail, pass);
    AuthUI.close();
    if(typeof Toast !== 'undefined') Toast.show("Successfully logged in!");
  } catch(error) {
    let msg = error.message || "Login failed. Please try again.";
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      msg = "Incorrect password or email. Please try again.";
    } else if (error.code === 'auth/user-not-found') {
      msg = "No account found with this email/username.";
    } else if (error.code === 'auth/invalid-email') {
      msg = "Please enter a valid username or email address.";
    } else if (error.code === 'auth/too-many-requests') {
      msg = "Too many failed login attempts. Please try again later.";
    } else if (msg.includes('network-request-failed')) {
      msg = "Network error. Please check your connection.";
    }
    AuthUI.showError(msg);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
  }
}

let usernameCheckTimeout = null;
window.checkUsernameAvailability = function(value) {
    const feedback = document.getElementById('username-feedback');
    if(!feedback) return;
    
    if(usernameCheckTimeout) clearTimeout(usernameCheckTimeout);
    
    const val = value.trim();
    if(!val) {
        feedback.style.display = 'none';
        return;
    }
    
    // Only letters, numbers, and underscores
    const regex = /^[a-zA-Z0-9_]+$/;
    if(!regex.test(val)) {
        feedback.innerHTML = '<i class="fas fa-times-circle"></i> Username can only contain letters, numbers, and underscores.';
        feedback.style.color = "#ff4b4b";
        feedback.style.display = 'block';
        return;
    }
    
    if(val.length < 3) {
        feedback.innerHTML = '<i class="fas fa-times-circle"></i> Username must be at least 3 characters.';
        feedback.style.color = "#ff4b4b";
        feedback.style.display = 'block';
        return;
    }

    feedback.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking availability...';
    feedback.style.color = "var(--text-3)";
    feedback.style.display = 'block';
    
    usernameCheckTimeout = setTimeout(async () => {
        try {
            const lowerVal = val.toLowerCase();
            const userDoc = await db.collection("usernames").doc(lowerVal).get();
            if(userDoc.exists) {
                feedback.innerHTML = '<i class="fas fa-times-circle"></i> Username is already taken.';
                feedback.style.color = "#ff4b4b";
            } else {
                feedback.innerHTML = '<i class="fas fa-check-circle"></i> Username is available!';
                feedback.style.color = "#2ecc71";
            }
        } catch(e) {
            console.error("Availability check failed:", e);
            feedback.style.display = 'none';
        }
    }, 500);
};

async function handleSignup(e) {
  e.preventDefault();
  AuthUI.clearErrors();
  
  const name = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-user').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass = document.getElementById('signup-pass').value;
  const confirm = document.getElementById('signup-confirm').value;
  const btn = document.getElementById('btn-signup');
  
  if(!name || !username || !email || !pass || !confirm) return AuthUI.showError("Please fill in all fields.", true);
  
  const regex = /^[a-zA-Z0-9_]+$/;
  if(!regex.test(username)) return AuthUI.showError("Username can only contain letters, numbers, and underscores.", true);
  if(username.length < 3) return AuthUI.showError("Username must be at least 3 characters.", true);

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
    const defaultAvatar = '/assets/avatars/av_1.png?v=3';
    // Save display name and default avatar (non-blocking)
    cred.user.updateProfile({ displayName: name, photoURL: defaultAvatar }).catch(err => console.warn("Profile update failed:", err));
    // Save user doc in Firestore (non-blocking)
    db.collection("users").doc(cred.user.uid).set({
      name: name,
      username: username,
      email: email,
      avatar: defaultAvatar,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(fsErr => {
      console.warn("Firestore write failed (non-critical):", fsErr);
    });
    // Save username mapping (non-blocking)
    db.collection("usernames").doc(lowerUsername).set({
      uid: cred.user.uid,
      email: email
    }).catch(err => console.warn("Failed to save username mapping:", err));
    
    localStorage.setItem('cachedAvatar', defaultAvatar);
    localStorage.setItem('cachedName', name);
    localStorage.setItem('cachedUsername', username);
    
    AuthUI.close();
    if(typeof Toast !== 'undefined') Toast.show("Account created successfully! Welcome, " + username + "!");
  } catch(error) {
    let msg = error.message || "Something went wrong. Please try again.";
    // Make Firebase error messages friendlier
    if(msg.includes('email-already-in-use')) msg = "This email is already registered. Try logging in instead.";
    else if(msg.includes('invalid-email')) msg = "Please enter a valid email address.";
    else if(msg.includes('weak-password')) msg = "Password is too weak. Use at least 6 characters.";
    else if(msg.includes('operation-not-allowed')) msg = "Email sign-up is currently disabled. Please contact support.";
    else if(msg.includes('network-request-failed') || msg.includes('timed out')) msg = "Network error. Please check your connection and disable any adblockers.";
    AuthUI.showError(msg, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
  }
}


  async function handleForgotPassword(e) {
    if(e) e.preventDefault();
    AuthUI.clearErrors();
    const btn = document.getElementById('btn-forgot');
    if(btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending link...';
    }
    
    const emailInput = document.getElementById('forgot-email');
    const email = emailInput ? emailInput.value.trim() : '';
    if(!email) {
      AuthUI.showError("Please enter your email address.", 'forgot');
      if(btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
      }
      return;
    }
    
    // Attempt custom Mailtrap Node.js backend first
    let backendSuccess = false;
    let lastErrorMessage = '';
    const backendEndpoints = [];

    if (typeof RESET_PASSWORD_API_URL !== 'undefined' && RESET_PASSWORD_API_URL) {
      backendEndpoints.push(RESET_PASSWORD_API_URL);
    }
    backendEndpoints.push('/api/auth/forgot-password', '/auth/forgot-password');

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      backendEndpoints.unshift('http://localhost:8787/api/auth/forgot-password', 'http://localhost:5000/api/auth/forgot-password', 'http://localhost:3000/api/auth/forgot-password');
    }

    for (const endpoint of backendEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
          backendSuccess = true;
          break;
        } else if (response.status === 404 && data.error === 'USER_NOT_FOUND') {
          lastErrorMessage = "No account found with this email address.";
          break;
        } else if (data.message) {
          lastErrorMessage = data.message;
        }
      } catch (err) {
        // Backend not reachable on this endpoint, continue to next or fallback
      }
    }

    // Fallback: Use Firebase client-side SDK if backend is offline or unconfigured
    if (!backendSuccess && !lastErrorMessage.includes('No account found')) {
      try {
        if (auth) {
          await auth.sendPasswordResetEmail(email);
          backendSuccess = true;
        }
      } catch (fbError) {
        console.warn("Firebase client reset fallback error:", fbError);
        if (fbError.code === 'auth/user-not-found') {
          lastErrorMessage = "No account found with this email address.";
        } else if (fbError.code === 'auth/invalid-email') {
          lastErrorMessage = "Please enter a valid email address.";
        } else if (fbError.message && fbError.message.includes('network-request-failed')) {
          lastErrorMessage = "Network error. Please check your connection.";
        } else {
          lastErrorMessage = fbError.message || "Failed to send reset link.";
        }
      }
    }

    if (backendSuccess) {
      AuthUI.showSuccess(`Password reset link sent to <strong>${email}</strong>.<br><small style="display:block;margin-top:6px;opacity:0.9;">Please check your inbox (and spam folder) to set a new password.</small>`, 'forgot');
      if (typeof Toast !== 'undefined') {
        Toast.show("Reset link sent to " + email, "success");
      }
      if(btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Link Sent';
      }
      setTimeout(() => {
        if (btn) {
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Again';
        }
      }, 5000);
    } else {
      AuthUI.showError(lastErrorMessage || "Failed to send reset link. Please check your email and try again.", 'forgot');
      if(btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reset Link';
      }
    }
  }


window.handleLogout = function() {
  const user = auth.currentUser;
  let userImageHtml = `<div style="width: 56px; height: 56px; border-radius: 14px; background: rgba(255, 75, 75, 0.10); color: #ff5c5c; border: 1px solid rgba(255, 75, 75, 0.20); display: flex; align-items: center; justify-content: center; font-size: 22px; margin: 0 auto 16px;"><i class="fas fa-sign-out-alt"></i></div>`;
  let userNameHtml = '';

  if (user) {
      let photoURL = user.photoURL;
      if (photoURL && photoURL.includes('assets/avatars/av_')) {
          photoURL = photoURL.replace('.jpg', '.png');
          const match = photoURL.match(/av_(\d+)\.png/);
          if (match && parseInt(match[1]) > 21) {
              photoURL = '/assets/avatars/av_1.png?v=3';
          } else if (!photoURL.startsWith('/')) {
              photoURL = '/' + photoURL;
          }
      }
      const displayName = user.displayName || user.email.split('@')[0];
      
      if (photoURL) {
          userImageHtml = `<img src="${photoURL}" alt="User Avatar" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block; border: 3px solid var(--cv-dark-2);">`;
      } else {
          const initial = displayName.charAt(0).toUpperCase();
          userImageHtml = `<div style="width: 80px; height: 80px; border-radius: 50%; background: var(--cv-dark-2); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; margin: 0 auto 10px auto; border: 3px solid var(--cv-dark-2);">${initial}</div>`;
      }
      userNameHtml = `<div style="color: var(--text-2); font-size: 16px; font-weight: 600; margin-bottom: 20px;">${displayName}</div>`;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);backdrop-filter:blur(10px);z-index:9999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s ease;';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--cv-dark-1);border:1px solid var(--b-2);border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,0.5);width:90%;max-width:400px;text-align:center;padding:30px;transform:scale(0.9);opacity:0;transition:all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);';
  
  modal.innerHTML = `
    ${userImageHtml}
    ${userNameHtml}
    <h3 style="font-size: 22px; font-weight: 800; margin-bottom: 10px; color: #fff; font-family: inherit;">Confirm Logout</h3>
    <p style="color: var(--text-3); font-size: 14px; margin-bottom: 26px; line-height: 1.5;">Are you sure you want to log out of StreamHeaven?</p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="btn-cancel-logout" style="background: var(--cv-dark-4); color: var(--text-2); border: 1px solid var(--b-2); padding: 12px 20px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s, color 0.2s; flex: 1; font-family: inherit;">Cancel</button>
      <button id="btn-confirm-logout" style="background: rgba(255, 75, 75, 0.12); color: #ff5c5c; border: 1px solid rgba(255, 75, 75, 0.25); padding: 12px 20px; border-radius: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s, color 0.2s, border-color 0.2s; flex: 1; font-family: inherit;">Logout</button>
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
  document.getElementById('btn-cancel-logout').addEventListener('mouseover', function() { this.style.background = 'var(--cv-dark-3)'; this.style.color = '#fff'; });
  document.getElementById('btn-cancel-logout').addEventListener('mouseout', function() { this.style.background = 'var(--cv-dark-4)'; this.style.color = 'var(--text-2)'; });
  
  document.getElementById('btn-confirm-logout').addEventListener('click', () => {
    close();
    if(auth) {
      if (typeof userDataUnsubscribe === 'function') {
        userDataUnsubscribe();
        userDataUnsubscribe = null;
      }
      auth.signOut().then(() => {
        if (window.location.pathname.includes('profile.html')) {
          window.location.href = 'index.html';
        } else if(typeof App !== 'undefined') {
          if(typeof Toast !== 'undefined') Toast.show("Logged out successfully", "success");
        }
      });
    }
  });
  document.getElementById('btn-confirm-logout').addEventListener('mouseover', function() { this.style.background = 'rgba(255, 75, 75, 0.20)'; this.style.color = '#ff6b6b'; this.style.borderColor = 'rgba(255, 75, 75, 0.35)'; });
  document.getElementById('btn-confirm-logout').addEventListener('mouseout', function() { this.style.background = 'rgba(255, 75, 75, 0.12)'; this.style.color = '#ff5c5c'; this.style.borderColor = 'rgba(255, 75, 75, 0.25)'; });
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
      let photoURL = user.photoURL;
      
      const updateUIWithPhoto = (url, nameToShow = '') => {
        const topProfileBtn = document.getElementById('header-profile-btn');
        const topProfileName = document.getElementById('header-profile-name');
        
        if (topProfileName) {
          if (nameToShow) {
            topProfileName.textContent = nameToShow;
            topProfileName.style.display = 'block';
          } else {
            topProfileName.style.display = 'none';
          }
        }
        
        if (topProfileBtn) {
          topProfileBtn.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Profile">`;
          topProfileBtn.onclick = (e) => { 
            e.preventDefault(); 
            window.location.href = 'profile.html'; 
          };
        }
        localStorage.setItem('cachedAvatar', url);
        if (nameToShow) {
            localStorage.setItem('cachedName', nameToShow);
            const sfName = document.getElementById('sf-display-name');
            if (sfName) {
                sfName.innerText = nameToShow;
            }
        }
        const sfAvatar = document.querySelector('.cv-sidebar-bottom .sf-avatar');
        if (sfAvatar) {
            sfAvatar.classList.add('active');
            sfAvatar.innerHTML = `<img src="${url}" alt="User Avatar">`;
        }
      };

      if (photoURL && photoURL.includes('assets/avatars/av_')) {
          photoURL = photoURL.replace('.jpg', '.png');
          const match = photoURL.match(/av_(\d+)\.png/);
          if (match && parseInt(match[1]) > 21) {
              photoURL = '/assets/avatars/av_1.png?v=3';
          } else if (!photoURL.startsWith('/') && !photoURL.startsWith('http')) {
              photoURL = '/' + photoURL;
          }
      }
      
      if (!photoURL) {
        photoURL = '/assets/avatars/av_1.png?v=3';
      }
      
      updateUIWithPhoto(photoURL, displayName);

      // Sync from Firestore in case Firebase Auth dropped the relative URL
      db.collection("users").doc(user.uid).get().then(doc => {
          if (doc.exists) {
              const fsAvatar = doc.data().avatar;
              const fsName = doc.data().displayName || displayName;
              let photoToUse = photoURL;
              
              if (fsAvatar && fsAvatar !== photoURL) {
                  user.updateProfile({ photoURL: fsAvatar }).catch(()=>{});
                  photoToUse = fsAvatar;
              }
              
              if (photoToUse) {
                  updateUIWithPhoto(photoToUse, fsName);
              }
          }
      }).catch(e => console.warn("Avatar sync error:", e));

      if(sidebarFooter) {
        let avatarHtml = `<div class="sf-avatar active">${initial}</div>`;
        if (photoURL) {
          avatarHtml = `<div class="sf-avatar active"><img src="${photoURL}" alt="User Avatar"></div>`;
        }
        sidebarFooter.innerHTML = `
          <div class="sf-profile">
            ${avatarHtml}
            <div class="sf-info">
              <div class="sf-name" id="sf-display-name">${displayName}</div>
              <div class="sf-status">Active Session</div>
            </div>
          </div>
          <button class="sf-logout-btn" onclick="handleLogout()" title="Logout">
            <svg class="sf-logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span class="sf-logout-text">Logout</span>
          </button>
        `;
      }
    
    // Attempt to load cloud data
    subscribeToUserData();
  } else {
    const topProfileBtn = document.getElementById('header-profile-btn');
    const topProfileName = document.getElementById('header-profile-name');
    
    if (topProfileName) {
      topProfileName.style.display = 'none';
    }
    if (topProfileBtn) {
      topProfileBtn.innerHTML = `<i class="fas fa-user"></i>`;
      topProfileBtn.onclick = (e) => {
        e.preventDefault();
        if(typeof AuthUI !== 'undefined') AuthUI.openLogin();
      };
    }

    // Logged Out State
    localStorage.removeItem('cachedAvatar');
    localStorage.removeItem('cachedName');
    localStorage.removeItem('cachedUsername');
    
    if(sidebarFooter) {
      sidebarFooter.innerHTML = `
        <div class="sf-profile guest" onclick="AuthUI.openLogin()">
          <div class="sf-avatar"><i class="fas fa-user"></i></div>
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

// User Data Cloud Sync
// User Data Cloud Sync - Real Time Listener
function subscribeToUserData() {
  if(!currentUser || !db) return;
  
  if (typeof userDataUnsubscribe === 'function') {
    userDataUnsubscribe();
  }
  
  try {
    userDataUnsubscribe = db.collection("users").doc(currentUser.uid).onSnapshot(docSnap => {
      if(docSnap.exists) {
        const data = docSnap.data();
        let changed = false;
        
        // 1. Live Real-time Avatar Sync across devices
        if(data.avatar) {
          let avUrl = data.avatar;
          if (avUrl && avUrl.includes('assets/avatars/av_')) {
            avUrl = avUrl.replace('.jpg', '.png');
            if (!avUrl.startsWith('/') && !avUrl.startsWith('http')) {
              avUrl = '/' + avUrl;
            }
          }
          const currentCached = localStorage.getItem('cachedAvatar');
          if (avUrl !== currentCached || (currentUser && currentUser.photoURL !== avUrl)) {
            localStorage.setItem('cachedAvatar', avUrl);
            if (currentUser && currentUser.photoURL !== avUrl) {
              currentUser.updateProfile({ photoURL: avUrl }).catch(() => {});
            }
            // Update Header Profile Button
            const topProfileBtn = document.getElementById('header-profile-btn');
            if (topProfileBtn) {
              topProfileBtn.innerHTML = `<img src="${avUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="Profile">`;
            }
            // Update Sidebar Avatar
            const sfAvatar = document.querySelector('.cv-sidebar-bottom .sf-avatar');
            if (sfAvatar) {
              sfAvatar.classList.add('active');
              sfAvatar.innerHTML = `<img src="${avUrl}" alt="User Avatar">`;
            }
            // Update Profile Page Avatar if open
            const pfAvatar = document.getElementById('pf-avatar');
            if (pfAvatar) {
              pfAvatar.innerHTML = `<img src="${avUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;transform:scale(1.04);" alt="User Avatar"><div class="pf-avatar-badge"></div>`;
              pfAvatar.style.border = 'none';
            }
          }
        }

        // 2. Live Real-time Display Name & Username Sync
        if(data.displayName || data.name) {
          const nameToShow = data.displayName || data.name;
          localStorage.setItem('cachedName', nameToShow);
          const topProfileName = document.getElementById('header-profile-name');
          if (topProfileName) {
            topProfileName.textContent = nameToShow;
            topProfileName.style.display = 'block';
          }
          const sfName = document.getElementById('sf-display-name');
          if (sfName) sfName.innerText = nameToShow;
          const pfName = document.getElementById('pf-name');
          if (pfName) pfName.textContent = nameToShow;
          const sn = document.getElementById('settings-name-sub');
          if (sn) sn.textContent = nameToShow;
        }

        if(data.username) {
          localStorage.setItem('cachedUsername', data.username);
          const pfUsername = document.getElementById('pf-username');
          if (pfUsername) pfUsername.textContent = data.username;
          const su = document.getElementById('settings-username-sub');
          if (su) su.textContent = data.username;
        }
        
        // 3. Live Watchlist & History Sync
        if(typeof State !== 'undefined') {
          if(data.watchlist) {
            State.watchlist = data.watchlist;
            localStorage.setItem('sh_watchlist', JSON.stringify(data.watchlist));
            changed = true;
          }
          if(data.history) {
            State.history = data.history;
            localStorage.setItem('sh_history', JSON.stringify(data.history));
            changed = true;
          }
          
          if(changed) {
            // Re-render active UI dynamically
            if(State.activePage === 'page-watchlist') {
              if(typeof Watchlist !== 'undefined' && Watchlist.render) Watchlist.render();
            } else if(State.activePage === 'page-history') {
              if(typeof History !== 'undefined' && History.render) History.render();
            }
            if(typeof ContinueWatching !== 'undefined' && ContinueWatching.render) {
              ContinueWatching.render();
            }
            if(typeof App !== 'undefined' && App.updateWatchlistButtons) {
              App.updateWatchlistButtons();
            }
          }
        }
      }
    }, err => {
      console.error("Error listening to user data", err);
    });
  } catch(e) {
    console.error("Error subscribing to user data", e);
  }
}

window.syncUserDataToCloud = async function(watchlist, history) {
  if(!currentUser || !db) return;
  try {
    await db.collection("users").doc(currentUser.uid).set({
      watchlist: watchlist || [],
      history: history || []
    }, { merge: true });
  } catch(e) {
    console.error("Error syncing user data to cloud", e);
  }
};

// Expose to window for inline HTML onclicks
window.AuthUI = AuthUI;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleForgotPassword = handleForgotPassword;
// window.handleLogout already attached


window.togglePassword = function(inputId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const wrap = input.closest('.auth-input-wrap') || input.parentElement;
  const toggleBtn = wrap ? wrap.querySelector('.auth-password-toggle') : null;
  const icon = toggleBtn ? toggleBtn.querySelector('i') : null;
  
  const isPassword = input.type === 'password' || input.getAttribute('type') === 'password';
  
  if (isPassword) {
    input.setAttribute('type', 'text');
    input.type = 'text';
    if (icon) {
      icon.className = 'fas fa-eye-slash';
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', 'Hide password');
    }
  } else {
    input.setAttribute('type', 'password');
    input.type = 'password';
    if (icon) {
      icon.className = 'fas fa-eye';
    }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-label', 'Show password');
    }
  }
  
  // Maintain cursor position at end of text without blur
  try {
    const len = input.value.length;
    if (document.activeElement === input) {
      input.setSelectionRange(len, len);
    }
  } catch(e) {}
};
