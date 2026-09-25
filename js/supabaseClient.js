const SUPABASE_URL = 'https://umnjqdpznmtrghqoocmg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7Sod9sC9feiil_XZVvhfPQ__NNdD5ky';

// Se lee antes de crear el cliente: Supabase consume y limpia el hash de la URL
// (p. ej. #type=recovery del enlace de restablecer contraseña).
const initialAuthParams = new URLSearchParams(window.location.hash.slice(1));

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
