const Auth = {
  user: null,

  async init(onReady) {
    const { data: { session } } = await sb.auth.getSession();
    this.user = session ? session.user : null;

    sb.auth.onAuthStateChange((_event, session) => {
      this.user = session ? session.user : null;
      onReady(this.user);
    });

    onReady(this.user);
  },

  async signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    await sb.auth.signOut();
  }
};

function showAuthMessage(msg, isError = false) {
  const el = document.getElementById('authMessage');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.toggle('hidden', !msg);
}

document.getElementById('showRegister').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.remove('hidden');
  showAuthMessage('');
});

document.getElementById('showLogin').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('loginForm').classList.remove('hidden');
  showAuthMessage('');
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  showAuthMessage('Iniciando sesión...');
  try {
    await Auth.signIn(fd.get('email'), fd.get('password'));
    showAuthMessage('');
  } catch (err) {
    showAuthMessage(translateAuthError(err.message), true);
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const password = fd.get('password');
  const confirm = fd.get('confirmPassword');
  if (password !== confirm) {
    showAuthMessage('Las contraseñas no coinciden.', true);
    return;
  }
  if (password.length < 6) {
    showAuthMessage('La contraseña debe tener al menos 6 caracteres.', true);
    return;
  }
  showAuthMessage('Creando cuenta...');
  try {
    const data = await Auth.signUp(fd.get('email'), password);
    if (data.session) {
      showAuthMessage('');
    } else {
      showAuthMessage('Cuenta creada. Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.');
    }
    e.target.reset();
  } catch (err) {
    showAuthMessage(translateAuthError(err.message), true);
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => Auth.signOut());

function translateAuthError(msg) {
  const map = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'User already registered': 'Ya existe una cuenta con ese correo.',
    'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
    'Password should be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres.'
  };
  return map[msg] || msg;
}
