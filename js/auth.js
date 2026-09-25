const Auth = {
  user: null,
  // true mientras el usuario viene del enlace de "restablecer contraseña":
  // tiene sesión, pero debe elegir la nueva contraseña antes de entrar a la app.
  recovering: initialAuthParams.get('type') === 'recovery',
  onReady: null,

  async init(onReady) {
    this.onReady = onReady;
    const { data: { session } } = await sb.auth.getSession();
    this.user = session ? session.user : null;

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.recovering = true;
      this.user = session ? session.user : null;
      onReady(this.user);
    });

    onReady(this.user);
  },

  async requestPasswordReset(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },

  async updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    this.recovering = false;
    this.onReady(this.user);
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

const AUTH_FORMS = ['loginForm', 'registerForm', 'forgotForm', 'newPasswordForm'];

function showAuthForm(id) {
  AUTH_FORMS.forEach(f => document.getElementById(f).classList.toggle('hidden', f !== id));
}

document.querySelectorAll('[data-auth-view]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthForm(link.dataset.authView);
    showAuthMessage('');
  });
});

// Enlace de recuperación vencido o ya usado: Supabase redirige con #error=...
if (initialAuthParams.get('error')) {
  showAuthForm('forgotForm');
  showAuthMessage('El enlace para restablecer la contraseña expiró o ya fue usado. Solicita uno nuevo.', true);
  history.replaceState(null, '', window.location.pathname);
}

function validateNewPassword(password, confirm) {
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  return null;
}

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
  const invalid = validateNewPassword(password, fd.get('confirmPassword'));
  if (invalid) {
    showAuthMessage(invalid, true);
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

document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.target.querySelector('button[type="submit"]');
  button.disabled = true;
  showAuthMessage('Enviando enlace...');
  try {
    await Auth.requestPasswordReset(new FormData(e.target).get('email'));
    // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
    showAuthMessage('Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.');
    e.target.reset();
  } catch (err) {
    showAuthMessage(translateAuthError(err.message), true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('newPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const password = fd.get('password');
  const invalid = validateNewPassword(password, fd.get('confirmPassword'));
  if (invalid) {
    showAuthMessage(invalid, true);
    return;
  }
  showAuthMessage('Guardando contraseña...');
  try {
    await Auth.updatePassword(password);
    e.target.reset();
    showAuthForm('loginForm');
    showAuthMessage('');
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
    'Password should be at least 6 characters.': 'La contraseña debe tener al menos 6 caracteres.',
    'New password should be different from the old password.': 'La nueva contraseña debe ser distinta de la anterior.',
    'Auth session missing!': 'El enlace expiró. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".'
  };
  if (map[msg]) return map[msg];
  const wait = msg.match(/after (\d+) seconds?/);
  if (wait) return `Por seguridad, espera ${wait[1]} segundos antes de solicitar otro enlace.`;
  if (/rate limit/i.test(msg)) return 'Se enviaron demasiados correos. Intenta de nuevo más tarde.';
  return msg;
}
