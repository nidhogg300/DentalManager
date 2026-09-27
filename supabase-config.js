/* =========================================================================
   Configuración de Supabase
   Reemplaza estos dos valores con los de tu proyecto:
   Supabase → Project Settings → API → "Project URL" y "anon public" key.
   La "anon key" es pública por diseño (viaja en el navegador); la
   seguridad real la dan las políticas RLS definidas en schema.sql, que
   solo dejan pasar a usuarios autenticados.
   ========================================================================= */
const SUPABASE_URL = 'https://mrhjbyfncdsblkkxyynz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eNghLjYfSWLMeBRaen5ezA_cEuYj2OH';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);