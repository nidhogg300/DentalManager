/* =========================================================================
   DentalManager — Frontend prototype
   Data layer (localStorage-backed) + rendering + client-side routing.
   Every data access goes through the functions in the "DATA LAYER" section
   so a future API/Supabase/Postgres backend can replace localStorage
   without touching the UI code.
   ========================================================================= */

/* ============================ STORAGE KEYS ============================
   Ya no se usa localStorage: estas claves solo quedan como referencia
   histórica y para el caché en memoria de abajo (CACHE). */
const STORAGE_KEYS = {
  patients: 'dm_patients',
  followUps: 'dm_followups',
  financeTx: 'dm_finance_tx',
  settings: 'dm_settings',
};

/* ===================== DEFAULT CONFIGURABLE CATALOGS ==================== 
   These are clinic configuration values (not patient records), so they are
   pre-populated to match the reference design's "Configuración" screen. */
const DEFAULT_SETTINGS = {
  statuses: [
    { id: 'activo', name: 'Activo', desc: 'Paciente que asiste regularmente a consultas programadas', color: 'green', active: true },
    { id: 'nuevo', name: 'Nuevo paciente', desc: 'Registrado recientemente, primera valoración pendiente', color: 'yellow', active: true },
    { id: 'seguimiento', name: 'Seguimiento necesario', desc: 'Requiere contacto preventivo para evitar interrupción', color: 'blue', active: true },
    { id: 'inactivo', name: 'Inactivo', desc: 'Tratamiento pausado o sin contacto en los últimos 3 meses', color: 'gray', active: true },
    { id: 'completado', name: 'Tratamiento completado', desc: 'Finalizó satisfactoriamente todas las fases del presupuesto', color: 'teal', active: true },
    { id: 'cotizado', name: 'Cotizado/Considerando', desc: 'Se le entregó presupuesto, pendiente decisión de inicio', color: 'pink', active: true },
    { id: 'no_reactivar', name: 'No reactivar', desc: 'Solicitó retiro voluntario de datos o desistió permanentemente', color: 'red', active: true },
    { id: 'otro', name: 'Otro', desc: 'Estado no contemplado en las categorías anteriores', color: 'gray', active: true },
  ],
  treatments: [
    { id: 't1', name: 'Odontología general', desc: 'Consultas y procedimientos generales', active: true, price: 0 },
    { id: 't2', name: 'Ortodoncia', desc: 'Brackets, alineadores y correcciones', active: true, price: 0 },
    { id: 't3', name: 'Limpieza', desc: 'Profilaxis y limpieza dental', active: true, price: 0 },
    { id: 't4', name: 'Operatoria', desc: 'Resinas y restauraciones', active: true, price: 0 },
    { id: 't5', name: 'Implantes', desc: 'Implantología dental', active: true, price: 0 },
    { id: 't6', name: 'Estética', desc: 'Diseño de sonrisa y carillas', active: true, price: 0 },
    { id: 't7', name: 'Periodoncia', desc: 'Tratamiento de encías', active: true, price: 0 },
    {id:"t8",name:"endodoncia",desc:"Tratamiento de conductos",active:true,price:0},
    {id:"t9",name:"rehabilitación",desc:"devolver la función, la salud y la estética a la boca",active:true,price:0},
    {id:"t10",name:"Otro",desc:"Tratamiento no listado",active:true,price:0}
  ],
  // Costos fijos mensuales (arriendo, nómina, servicios...). "fixed: true" significa que
  // se repite automáticamente cada mes en el reporte de Finanzas sin necesidad de
  // volver a registrarlo manualmente; "fixed: false" sirve para costos variables que sí
  // se ingresan mes a mes desde la pestaña Finanzas.
  fixedCosts: [
    { id: 'c1', name: 'Nómina / Personal', desc: '', amount: 0, fixed: true, active: true },
    { id: 'c2', name: 'Servicios públicos', desc: '', amount: 0, fixed: true, active: true },
    { id: 'c3', name: 'Internet / Suscripciones', desc: '', amount: 0, fixed: true, active: true },
    { id: 'c4', name: 'Insumos y materiales', desc: 'Costo variable, se registra cada mes', amount: 0, fixed: false, active: true },
  ],
  // Correos autorizados para ver/editar la información contable (pestaña Finanzas).
  // Si la lista está vacía, cualquier cuenta autenticada puede verla (útil mientras
  // se configura por primera vez); en cuanto se agregue un correo, el acceso queda
  // restringido solo a los correos de esta lista.
  financeAccess: [],
  origins: [
    { id: 'o1', name: 'Referido', desc: 'Recomendado por otro paciente', active: true },
    { id: 'o2', name: 'Familia', desc: 'Familiar de paciente existente', active: true },
    { id: 'o3', name: 'Google', desc: 'Búsqueda orgánica o Google Ads', active: true },
    { id: 'o4', name: 'Redes sociales', desc: 'Instagram, Facebook u otras redes', active: true },
    { id: 'o5', name: 'Hotel', desc: 'Convenio con hotel o alojamiento', active: true },
    { id: 'o6', name: 'Convenio', desc: 'Alianza institucional', active: true },
    { id: 'o7', name: 'Evento/Feria', desc: 'Actividad o feria de salud', active: true },
    { id: 'o8', name: 'Paciente existente', desc: 'Contacto previo en la clínica', active: true },
    { id: 'o9', name: 'Otro', desc: 'Origen no listado', active: true },
  ],
  taskTypes: [
    { id: 'k1', name: 'Mensaje de bienvenida', desc: '', active: true },
    { id: 'k2', name: 'Entrega de kit', desc: '', active: true },
    { id: 'k3', name: 'Llamada de seguimiento', desc: '', active: true },
    { id: 'k4', name: 'WhatsApp', desc: '', active: true },
    { id: 'k5', name: 'Boletín', desc: '', active: true },
    { id: 'k6', name: 'Siguiente programa', desc: '', active: true },
    { id: 'k7', name: 'Redes sociales', desc: '', active: true },
    { id: 'k8', name: 'Solicitar review', desc: '', active: true },
    { id: 'k9', name: 'Solicitar testimonio', desc: '', active: true },
    { id: 'k10', name: 'Contacto de tratamiento', desc: '', active: true },
    { id: 'k11', name: 'Reactivación', desc: '', active: true },
    { id: 'k12', name: 'Otro', desc: '', active: true },
  ],
  inactivityReasons: [
    { id: 'r1', name: 'Tratamiento finalizado con éxito', desc: '', active: true },
    { id: 'r2', name: 'Reprogramado por costo/presupuesto', desc: '', active: true },
    { id: 'r3', name: 'Viaje / Cambio de residencia', desc: '', active: true },
    { id: 'r4', name: 'No contesta llamadas / WhatsApp', desc: '', active: true },
    { id: 'r5', name: 'Otro', desc: '', active: true },
  ],
  staff: [
    { id: 's1', name: 'Dra. Martha Contreras', desc: 'Gerente', active: true },
    { id: 's2', name: 'Dra. Alejandra', desc: 'Odontóloga', active: true }
  ],
};

// Nombre en español + indicativo telefónico. Se usa tanto para el selector
// de indicativo junto al teléfono como para el país de origen del paciente.
const COUNTRIES = [
['Afganistán','+93'],['Albania','+355'],['Alemania','+49'],['Andorra','+376'],['Angola','+244'],
['Antigua y Barbuda','+1268'],['Arabia Saudita','+966'],['Argelia','+213'],['Argentina','+54'],
['Armenia','+374'],['Australia','+61'],['Austria','+43'],['Azerbaiyán','+994'],['Bahamas','+1242'],
['Bangladés','+880'],['Barbados','+1246'],['Baréin','+973'],['Bélgica','+32'],['Belice','+501'],
['Benín','+229'],['Bielorrusia','+375'],['Bolivia','+591'],['Bosnia y Herzegovina','+387'],
['Botsuana','+267'],['Brasil','+55'],['Brunéi','+673'],['Bulgaria','+359'],['Burkina Faso','+226'],
['Burundi','+257'],['Bután','+975'],['Cabo Verde','+238'],['Camboya','+855'],['Camerún','+237'],
['Canadá','+1'],['Catar','+974'],['Chad','+235'],['Chile','+56'],['China','+86'],['Chipre','+357'],
['Colombia','+57'],['Comoras','+269'],['Corea del Norte','+850'],['Corea del Sur','+82'],
['Costa de Marfil','+225'],['Costa Rica','+506'],['Croacia','+385'],['Cuba','+53'],['Dinamarca','+45'],
['Dominica','+1767'],['Ecuador','+593'],['Egipto','+20'],['El Salvador','+503'],
['Emiratos Árabes Unidos','+971'],['Eritrea','+291'],['Eslovaquia','+421'],['Eslovenia','+386'],
['España','+34'],['Estados Unidos','+1'],['Estonia','+372'],['Esuatini','+268'],['Etiopía','+251'],
['Filipinas','+63'],['Finlandia','+358'],['Fiyi','+679'],['Francia','+33'],['Gabón','+241'],
['Gambia','+220'],['Georgia','+995'],['Ghana','+233'],['Granada','+1473'],['Grecia','+30'],
['Guatemala','+502'],['Guinea','+224'],['Guinea-Bisáu','+245'],['Guinea Ecuatorial','+240'],
['Guyana','+592'],['Haití','+509'],['Honduras','+504'],['Hungría','+36'],['India','+91'],
['Indonesia','+62'],['Irak','+964'],['Irán','+98'],['Irlanda','+353'],['Islandia','+354'],
['Islas Marshall','+692'],['Islas Salomón','+677'],['Israel','+972'],['Italia','+39'],
['Jamaica','+1876'],['Japón','+81'],['Jordania','+962'],['Kazajistán','+7'],['Kenia','+254'],
['Kirguistán','+996'],['Kiribati','+686'],['Kuwait','+965'],['Laos','+856'],['Lesoto','+266'],
['Letonia','+371'],['Líbano','+961'],['Liberia','+231'],['Libia','+218'],['Liechtenstein','+423'],
['Lituania','+370'],['Luxemburgo','+352'],['Macedonia del Norte','+389'],['Madagascar','+261'],
['Malasia','+60'],['Malaui','+265'],['Maldivas','+960'],['Malí','+223'],['Malta','+356'],
['Marruecos','+212'],['Mauricio','+230'],['Mauritania','+222'],['México','+52'],['Micronesia','+691'],
['Moldavia','+373'],['Mónaco','+377'],['Mongolia','+976'],['Montenegro','+382'],['Mozambique','+258'],
['Myanmar','+95'],['Namibia','+264'],['Nauru','+674'],['Nepal','+977'],['Nicaragua','+505'],
['Níger','+227'],['Nigeria','+234'],['Noruega','+47'],['Nueva Zelanda','+64'],['Omán','+968'],
['Países Bajos','+31'],['Pakistán','+92'],['Palaos','+680'],['Panamá','+507'],
['Papúa Nueva Guinea','+675'],['Paraguay','+595'],['Perú','+51'],['Polonia','+48'],['Portugal','+351'],
['Reino Unido','+44'],['República Centroafricana','+236'],['República Checa','+420'],
['República del Congo','+242'],['República Democrática del Congo','+243'],
['República Dominicana','+1809'],['Ruanda','+250'],['Rumania','+40'],['Rusia','+7'],['Samoa','+685'],
['San Cristóbal y Nieves','+1869'],['San Marino','+378'],['San Vicente y las Granadinas','+1784'],
['Santa Lucía','+1758'],['Santo Tomé y Príncipe','+239'],['Senegal','+221'],['Serbia','+381'],
['Seychelles','+248'],['Sierra Leona','+232'],['Singapur','+65'],['Siria','+963'],['Somalia','+252'],
['Sri Lanka','+94'],['Sudáfrica','+27'],['Sudán','+249'],['Sudán del Sur','+211'],['Suecia','+46'],
['Suiza','+41'],['Surinam','+597'],['Tailandia','+66'],['Tanzania','+255'],['Tayikistán','+992'],
['Timor Oriental','+670'],['Togo','+228'],['Tonga','+676'],['Trinidad y Tobago','+1868'],
['Túnez','+216'],['Turkmenistán','+993'],['Turquía','+90'],['Tuvalu','+688'],['Ucrania','+380'],
['Uganda','+256'],['Uruguay','+598'],['Uzbekistán','+998'],['Vanuatu','+678'],['Venezuela','+58'],
['Vietnam','+84'],['Yemen','+967'],['Yibuti','+253'],['Zambia','+260'],['Zimbabue','+263'],
];
function countryCodeOptions(selected) {
  return COUNTRIES.map(([name, code]) =>
    `<option value="${code}" ${code === selected ? 'selected' : ''}>${escapeHtml(name)} (${code})</option>`
  ).join('');
}
function countryNameOptions(selected) {
  return COUNTRIES.map(([name]) =>
    `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`
  ).join('');
}
function phoneCodeDisplay(code) {
  const match = COUNTRIES.find(([, c]) => c === code);
  return match ? `${match[0]} (${match[1]})` : (code || '');
}

/* ============================== DATA LAYER ==============================
   Respaldado por Supabase (Postgres). Para no reescribir todas las
   funciones de renderizado (que llaman getPatients()/getSettings()/etc.
   de forma síncrona), se mantiene un CACHÉ en memoria que se carga una
   vez al iniciar sesión (loadAllData) y se actualiza de inmediato en
   cada creación/edición. Cada mutación local se manda a Supabase en
   segundo plano ("fire and forget" con manejo de error vía toast); si
   la escritura remota falla, se avisa pero no se revierte la UI local
   (para eso, recarga la página y vuelve a intentar).
   ========================================================================= */
const CACHE = { patients: [], followUps: [], financeTx: [], settings: DEFAULT_SETTINGS, ready: false, userEmail: null };

function uid(prefix) {
  // Se usa como id temporal antes de tener respuesta de Supabase; para
  // filas nuevas se prefiere crypto.randomUUID() (ver createPatient etc.)
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function newId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uid('id');
}
function reportSyncError(action, err) {
  console.error('Supabase sync error:', action, err);
  showToast('⚠ No se pudo sincronizar con la base de datos (' + action + ')');
}

// Convierte una fila de la tabla `patients` (snake_case) al formato que usa la UI (camelCase)
function mapPatientRow(r) {
  return {
    id: r.id, fullName: r.full_name, status: r.status, phone: r.phone, email: r.email,
    origin: r.origin, treatment: r.treatment, responsible: r.responsible, cedula: r.cedula,
    address: r.address, notes: r.notes, lastVisit: r.last_visit, createdAt: r.created_at,
    dentalMap: r.dental_map || null,
    phoneCode: r.phone_code || '+57',
    countryOfOrigin: r.country_of_origin || 'Colombia',
  };
}
function mapFollowUpRow(r) {
  return {
    id: r.id, patientId: r.patient_id, taskType: r.task_type, responsible: r.responsible,
    dueDate: r.due_date, status: r.status, notes: r.notes, result: r.result,
    completedAt: r.completed_at, createdAt: r.created_at,
  };
}
function mapFinanceRow(r) {
  return {
    id: r.id, type: r.type, category: r.category, amount: Number(r.amount) || 0,
    responsible: r.responsible, patientId: r.patient_id, description: r.description,
    date: r.date, createdAt: r.created_at,
  };
}


/* Carga inicial: trae todo de Supabase y llena el caché en memoria.
   Se llama una sola vez, después de confirmar sesión, antes del primer router(). */
async function loadAllData() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  CACHE.userEmail = (user && user.email) ? user.email.toLowerCase() : null;

  const [patientsRes, followUpsRes, financeRes, settingsRes] = await Promise.all([
    supabaseClient.from('patients').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('follow_ups').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('finance_transactions').select('*').order('date', { ascending: false }),
    supabaseClient.from('app_settings').select('data').eq('id', 1).single(),
  ]);
  if (patientsRes.error) reportSyncError('cargar pacientes', patientsRes.error);
  if (followUpsRes.error) reportSyncError('cargar seguimientos', followUpsRes.error);
  if (financeRes.error) reportSyncError('cargar finanzas', financeRes.error);
  if (settingsRes.error) reportSyncError('cargar configuración', settingsRes.error);

  CACHE.patients = (patientsRes.data || []).map(mapPatientRow);
  CACHE.followUps = (followUpsRes.data || []).map(mapFollowUpRow);
  CACHE.financeTx = (financeRes.data || []).map(mapFinanceRow);
  CACHE.settings = { ...DEFAULT_SETTINGS, ...((settingsRes.data && settingsRes.data.data) || {}) };
  CACHE.ready = true;
}

/* --- Acceso a Finanzas ---
   Si financeAccess está vacío, cualquier cuenta autenticada puede ver Finanzas
   (útil antes de configurar). En cuanto se agrega al menos un correo, solo esos
   correos (comparados en minúsculas) pueden acceder. */
function isFinanceAuthorized() {
  const list = (getSettings().financeAccess || []).filter(a => a.active !== false).map(a => (a.email || '').toLowerCase());
  if (!list.length) return true;
  return !!CACHE.userEmail && list.includes(CACHE.userEmail);
}

// --- Patients ---
function getPatients() { return CACHE.patients; }
function getPatientById(id) { return getPatients().find(p => p.id === id) || null; }
function createPatient(data) {
  const patient = {
    id: newId(),
    fullName: data.fullName || '',
    status: data.status || 'nuevo',
    phone: data.phone || '',
    email: data.email || '',
    origin: data.origin || '',
    treatment: data.treatment || '',
    responsible: data.responsible || '',
    cedula: data.cedula || '',
    address: data.address || '',
    notes: data.notes || '',
    lastVisit: null,
    createdAt: new Date().toISOString(),
    phoneCode: data.phoneCode || '+57',
    countryOfOrigin: data.countryOfOrigin || 'Colombia',
  };
  CACHE.patients.unshift(patient);
  supabaseClient.from('patients').insert({
    id: patient.id, full_name: patient.fullName, status: patient.status, phone: patient.phone,
    email: patient.email, origin: patient.origin, treatment: patient.treatment,
    responsible: patient.responsible, cedula: patient.cedula, address: patient.address,
    notes: patient.notes, created_at: patient.createdAt,
    phone_code: patient.phoneCode, country_of_origin: patient.countryOfOrigin,
  }).then(({ error }) => { if (error) reportSyncError('guardar paciente', error); });
  return patient;
}
function updatePatient(id, data) {
  const patients = getPatients();
  const idx = patients.findIndex(p => p.id === id);
  if (idx === -1) return null;
  patients[idx] = { ...patients[idx], ...data };
  const p = patients[idx];
  supabaseClient.from('patients').update({
    full_name: p.fullName, status: p.status, phone: p.phone, email: p.email, origin: p.origin,
    treatment: p.treatment, responsible: p.responsible, cedula: p.cedula, address: p.address,
    notes: p.notes, last_visit: p.lastVisit,
    phone_code: p.phoneCode, country_of_origin: p.countryOfOrigin,
  }).eq('id', id).then(({ error }) => { if (error) reportSyncError('actualizar paciente', error); });
  return patients[idx];
}

// --- Follow-ups ---
function getFollowUps() { return CACHE.followUps; }
function getFollowUpById(id) { return getFollowUps().find(f => f.id === id) || null; }
function getFollowUpsByPatient(patientId) { return getFollowUps().filter(f => f.patientId === patientId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); }
function createFollowUp(data) {
  const followUp = {
    id: newId(),
    patientId: data.patientId || '',
    taskType: data.taskType || '',
    responsible: data.responsible || '',
    dueDate: data.dueDate || '',
    status: data.status || 'pendiente',
    notes: data.notes || '',
    result: data.result || '',
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  CACHE.followUps.unshift(followUp);
  supabaseClient.from('follow_ups').insert({
    id: followUp.id, patient_id: followUp.patientId || null, task_type: followUp.taskType,
    responsible: followUp.responsible, due_date: followUp.dueDate || null, status: followUp.status,
    notes: followUp.notes, result: followUp.result, created_at: followUp.createdAt,
  }).then(({ error }) => { if (error) reportSyncError('guardar seguimiento', error); });
  return followUp;
}
function updateFollowUp(id, data) {
  const followUps = getFollowUps();
  const idx = followUps.findIndex(f => f.id === id);
  if (idx === -1) return null;
  followUps[idx] = { ...followUps[idx], ...data };
  const f = followUps[idx];
  // Al completar la primera cita/seguimiento, el paciente deja de estar "nuevo"
  if (f.status === 'completado' && f.patientId) {
    const p = getPatientById(f.patientId);
    if (p && p.status === 'nuevo') updatePatient(p.id, { status: 'activo' });
  }
  supabaseClient.from('follow_ups').update({
    task_type: f.taskType, responsible: f.responsible, due_date: f.dueDate || null,
    status: f.status, notes: f.notes, result: f.result, completed_at: f.completedAt,
  }).eq('id', id).then(({ error }) => { if (error) reportSyncError('actualizar seguimiento', error); });
  return followUps[idx];
}

// --- Finanzas (ingresos y gastos) ---
function getFinanceTx() { return CACHE.financeTx; }
function createFinanceTx(data) {
  const tx = {
    id: newId(),
    type: data.type || 'ingreso',
    category: data.category || '',
    amount: Number(data.amount) || 0,
    responsible: data.responsible || '',
    patientId: data.patientId || null,
    description: data.description || '',
    date: data.date || todayISO(),
    createdAt: new Date().toISOString(),
  };
  CACHE.financeTx.unshift(tx);
  supabaseClient.from('finance_transactions').insert({
    id: tx.id, type: tx.type, category: tx.category, amount: tx.amount,
    responsible: tx.responsible, patient_id: tx.patientId || null,
    description: tx.description, date: tx.date, created_at: tx.createdAt,
  }).then(({ error }) => { if (error) reportSyncError('guardar movimiento financiero', error); });
  return tx;
}
function deleteFinanceTx(id) {
  CACHE.financeTx = CACHE.financeTx.filter(t => t.id !== id);
  supabaseClient.from('finance_transactions').delete().eq('id', id)
    .then(({ error }) => { if (error) reportSyncError('eliminar movimiento financiero', error); });
}

// --- Salud dental (Dentograma 3D) ---
// Los datos del dentograma viven comprimidos en patients.dental_map (jsonb):
// { name, date, general, s: {diente: código}, x: {diente: 'códigos previos'}, t: {diente: nota corta} }
// Esta es la misma forma de datos que usa dentograma-app.js, para que el cálculo
// del % de salud oral sea idéntico en ambos lugares.
const DENTAL_HEALTH_WEIGHT = { S: 0, C: 0.90, F: 0.65, T: 0.30, A: 0.50, E: 0.20, O: 0.12, K: 0.10, I: 0.12 };
const DENTAL_ACTIVE_LOAD = { C: 1, F: 0.7, T: 0.35 };
const DENTAL_MAX_LOAD_PER_TOOTH = 1.3;
const DENTAL_ACTIVE_SEVERITY = 0.15;
const DENTAL_ALL_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
function dentalCondsOf(map, n) {
  const last = (map.s || {})[n];
  if (!last || last === 'S') return [];
  const earlier = (map.x && map.x[n]) ? String(map.x[n]).split('') : [];
  const list = [];
  earlier.concat(last).forEach(code => {
    const at = list.indexOf(code);
    if (at >= 0) list.splice(at, 1);
    list.push(code);
  });
  return list;
}
function dentalIsThirdMolar(n) { return Number(n) % 10 === 8; }
function dentalToothHealth(map, n) {
  let health = 1;
  dentalCondsOf(map, n).forEach(code => { health *= 1 - (DENTAL_HEALTH_WEIGHT[code] ?? 0); });
  return health;
}
// Calcula el % de salud oral y la "banda" (good/mid/low/crit), igual que el dentograma 3D.
function dentalHealthFromMap(dentalMap) {
  const map = dentalMap || { s: {}, x: {} };
  const considered = DENTAL_ALL_TEETH.filter(n => !(dentalIsThirdMolar(n) && dentalCondsOf(map, n).includes('A')));
  let sum = 0, load = 0;
  considered.forEach(n => {
    sum += dentalToothHealth(map, n);
    let toothLoad = 0;
    dentalCondsOf(map, n).forEach(code => { toothLoad += DENTAL_ACTIVE_LOAD[code] ?? 0; });
    load += Math.min(toothLoad, DENTAL_MAX_LOAD_PER_TOOTH);
  });
  const base = considered.length ? sum / considered.length : 1;
  const factor = Math.exp(-DENTAL_ACTIVE_SEVERITY * load);
  const score = Math.min(100, Math.max(0, Math.round(base * factor * 100)));
  const band = score >= 85 ? 'good' : score >= 65 ? 'mid' : score >= 40 ? 'low' : 'crit';
  return { score, band, hasData: !!(dentalMap && dentalMap.s && Object.keys(dentalMap.s).length) };
}
// Refresca en caché el dental_map de un paciente después de editarlo en el dentograma (iframe).
async function refreshPatientDentalMap(patientId) {
  const { data, error } = await supabaseClient.from('patients').select('dental_map').eq('id', patientId).single();
  if (error) { reportSyncError('actualizar salud dental', error); return; }
  const p = getPatientById(patientId);
  if (p) p.dentalMap = (data && data.dental_map) || null;
}

// --- Settings ---
function getSettings() { return CACHE.settings; }
function persistSettings() {
  supabaseClient.from('app_settings').update({ data: CACHE.settings }).eq('id', 1)
    .then(({ error }) => { if (error) reportSyncError('guardar configuración', error); });
}
function updateSettings(newSettings) { CACHE.settings = newSettings; persistSettings(); }
function addSettingOption(category, item) {
  CACHE.settings[category].push({ id: uid('opt'), active: true, desc: '', ...item });
  persistSettings();
  return CACHE.settings;
}
function toggleSettingOption(category, id) {
  const item = CACHE.settings[category].find(o => o.id === id);
  if (item) item.active = !item.active;
  persistSettings();
  return CACHE.settings;
}
function updateSettingOption(category, id, data) {
  const idx = CACHE.settings[category].findIndex(o => o.id === id);
  if (idx === -1) return CACHE.settings;
  CACHE.settings[category][idx] = { ...CACHE.settings[category][idx], ...data };
  persistSettings();
  return CACHE.settings;
}
function deleteSettingOption(category, id) {
  CACHE.settings[category] = CACHE.settings[category].filter(o => o.id !== id);
  persistSettings();
  return CACHE.settings;
}

/* ============================== HELPERS ============================== */
const BADGE_COLOR_MAP = {
  activo: 'green', nuevo: 'yellow', seguimiento: 'blue', inactivo: 'gray',
  completado: 'teal', cotizado: 'pink', no_reactivar: 'red', otro: 'gray',
  pendiente: 'blue', cancelado: 'gray',
};
function statusLabel(statusId) {
  const s = getSettings().statuses.find(x => x.id === statusId);
  return s ? s.name : (statusId || '—');
}
function statusColor(statusId) {
  const s = getSettings().statuses.find(x => x.id === statusId);
  return s ? s.color : 'gray';
}
function badge(text, color) {
  return `<span class="badge badge-${color || 'gray'}">${escapeHtml(text)}</span>`;
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function initials(name) {
  if (!name) return '—';
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
function optionsFor(list, selectedId) {
  return list.filter(o => o.active !== false).map(o =>
    `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
  ).join('');
}

function multiOptionsFor(list, selectedIds) {
  return list.filter(o => o.active !== false).map(o =>
    `<option value="${o.id}" ${selectedIds.includes(o.id) ? 'selected' : ''}>${escapeHtml(o.name)}</option>`
  ).join('');
}
function treatmentLabels(csv) {
  if (!csv) return '—';
  const names = csv.split(',').filter(Boolean).map(treatmentLabel);
  return names.length ? names.join(', ') : '—';
}
function patientPhoneDisplay(p) {
  if (!p.phone) return '—';
  return `${p.phoneCode || ''} ${p.phone}`.trim();
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}
function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

/* ============================== ROUTER ============================== */
const routes = {
  'inicio': renderDashboard,
  'pacientes': renderPatientList,
  'pacientes/nuevo': renderPatientForm,
  'seguimientos': renderFollowUpList,
  'seguimientos/nuevo': renderFollowUpForm,
  'finanzas': renderFinance,
  'reportes': renderReports,
  'configuracion': renderSettings,
};

function parseHash() {
  let hash = location.hash.replace(/^#\/?/, '');
  if (!hash) hash = 'inicio';
  return hash.split('/').filter(Boolean);
}

function router() {
  const parts = parseHash();
  const content = document.getElementById('content');
  closeSidebar();

  // Highlight active nav item
  const baseRoute = parts[0];
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.route === baseRoute);
  });

  let html = '';
  try {
    if (parts[0] === 'pacientes' && parts[1] && parts[2] === 'editar') {
      html = renderPatientForm(parts[1]);
    } else if (parts[0] === 'pacientes' && parts[1] && parts[1] !== 'nuevo') {
      html = renderPatientProfile(parts[1]);
    } else if (parts[0] === 'seguimientos' && parts[1] && parts[2] === 'editar') {
      html = renderFollowUpForm(parts[1]);
    } else {
      const key = parts.join('/');
      const handler = routes[key] || routes[parts[0]] || renderNotFound;
      html = handler();
    }
  } catch (e) {
    console.error(e);
    html = `<div class="empty-state"><p class="empty-title">Ocurrió un error al cargar la vista.</p></div>`;
  }
  content.innerHTML = html;
  attachViewHandlers(parts);
  window.scrollTo(0, 0);
}

function renderNotFound() {
  return `<div class="empty-state"><p class="empty-title">Vista no encontrada</p></div>`;
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', async () => {
  await bootApp();
});

/* ============================== AUTENTICACIÓN ==============================
   Pantalla de login simple con Supabase Auth. Solo el personal con un
   usuario creado en Supabase (Authentication → Users) puede entrar; sin
   sesión válida, la app nunca llama a loadAllData() ni muestra datos. */
async function bootApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    renderLoginScreen();
    return;
  }
  await startAppAfterLogin();
}

async function startAppAfterLogin() {
  document.getElementById('content').innerHTML = '<div class="empty-state"><p class="empty-title">Cargando datos…</p></div>';
  await loadAllData();
  router();
  setupChrome();
}

function renderLoginScreen() {
  document.querySelector('.app').style.display = 'none';
  const overlay = el(`
  <div id="loginScreen" style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
    <form id="loginForm" style="width:320px;max-width:90vw;background:#fff;padding:28px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);">
      <h2 style="margin:0 0 4px;">DentalManager</h2>
      <p style="margin:0 0 18px;color:#666;font-size:14px;">Inicia sesión para continuar</p>
      <div class="field"><label>Correo</label><input type="email" name="email" required></div>
      <div class="field mt-2"><label>Contraseña</label><input type="password" name="password" required></div>
      <div id="loginError" style="color:#c0392b;font-size:13px;margin-top:8px;"></div>
      <button type="submit" class="btn btn-primary" style="width:100%;margin-top:16px;">Entrar</button>
    </form>
  </div>`);
  document.body.appendChild(overlay);
  overlay.querySelector('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: fd.get('email'), password: fd.get('password'),
    });
    if (error) {
      overlay.querySelector('#loginError').textContent = 'Correo o contraseña incorrectos.';
      return;
    }
    overlay.remove();
    document.querySelector('.app').style.display = '';
    await startAppAfterLogin();
  });
}

/* ============================ CHROME (sidebar/search) ============================ */
function setupChrome() {
  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  const navFin = document.getElementById('navFinanzas');
  const lockIcon = document.getElementById('financeLockIcon');
  if (navFin && lockIcon) {
    const authorized = isFinanceAuthorized();
    lockIcon.style.display = authorized ? 'none' : '';
    navFin.classList.toggle('nav-locked', !authorized);
    navFin.title = authorized ? '' : 'Acceso restringido: solo cuentas autorizadas';
  }

  setupGlobalSearch();
}

/* Búsqueda global: al escribir muestra un desplegable con pacientes que
   coinciden por nombre, teléfono, email o cédula; Enter navega al listado
   de pacientes ya filtrado. */
function setupGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const box = input.closest('.search-box');
  if (!box) return;
  let results = el('<div class="search-results"></div>');
  box.appendChild(results);

  function runSearch(q) {
    q = q.toLowerCase().trim();
    if (!q) { results.classList.remove('open'); results.innerHTML = ''; return; }
    const matches = getPatients().filter(p =>
      p.fullName.toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.cedula || '').toLowerCase().includes(q)
    ).slice(0, 8);
    if (!matches.length) {
      results.innerHTML = `<div class="search-result-empty">Sin coincidencias para "${escapeHtml(q)}"</div>`;
    } else {
      results.innerHTML = matches.map(p => `
        <div class="search-result-item" data-id="${p.id}">
          <div class="avatar">${initials(p.fullName)}</div>
          <div><div class="lr-title">${escapeHtml(p.fullName)}</div><div class="lr-sub">${escapeHtml(p.phone || p.email || '')}</div></div>
        </div>`).join('');
      results.querySelectorAll('.search-result-item').forEach(item => item.addEventListener('click', () => {
        results.classList.remove('open');
        input.value = '';
        location.hash = `#/pacientes/${item.dataset.id}`;
      }));
    }
    results.classList.add('open');
  }

  input.addEventListener('input', (e) => runSearch(e.target.value));
  input.addEventListener('focus', (e) => { if (e.target.value.trim()) runSearch(e.target.value); });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) results.classList.remove('open'); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      results.classList.remove('open');
      location.hash = '#/pacientes';
      setTimeout(() => {
        const searchInput = document.getElementById('patientSearchInput');
        if (searchInput) { searchInput.value = q; filterPatientTable(); }
      }, 0);
    }
    if (e.key === 'Escape') results.classList.remove('open');
  });
}
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

/* ============================== DASHBOARD ============================== */
function renderDashboard() {
  const patients = getPatients();
  const followUps = getFollowUps();
  const pendingToday = followUps.filter(f => f.status === 'pendiente');
  const attentionPatients = patients.filter(p => p.status === 'no_reactivar' || p.status === 'inactivo').slice(0, 5);
  const settings = getSettings();

  const statusCounts = {};
  patients.forEach(p => { statusCounts[p.status] = (statusCounts[p.status] || 0) + 1; });
  const activos = statusCounts['activo'] || 0;
  const nuevos = statusCounts['nuevo'] || 0;

  return `
  <div class="page-head">
    <div>
      <h1>¡Hola!</h1>
      <p class="subtitle">Esto es lo que necesitas saber hoy en DentalManager</p>
    </div>
    <a href="#/pacientes/nuevo" class="btn btn-primary">+ Nuevo Paciente</a>
  </div>

  <div class="grid-metrics">
    ${metricCard('Total Pacientes', patients.length, 'blue')}
    ${metricCard('Pacientes Activos', activos, 'green')}
    ${metricCard('Nuevos del Mes', nuevos, 'yellow')}
    ${metricCard('Tareas Pendientes', pendingToday.length, 'yellow')}
    ${metricCard('Tareas Vencidas', followUps.filter(f => f.status === 'pendiente' && f.dueDate && f.dueDate < todayISO()).length, 'red')}
  </div>

  <div class="two-col">
    <div>
      <div class="section-card">
        <div class="section-card-head">
          <h3>Seguimientos de Hoy</h3>
          <a href="#/seguimientos" class="btn-link">Ver todos</a>
        </div>
        <div class="section-card-body">
          ${pendingToday.length ? pendingToday.slice(0, 5).map(f => {
            const p = getPatientById(f.patientId);
            return `<div class="list-row">
              <div>
                <div class="lr-title">${escapeHtml(p ? p.fullName : 'Paciente')}</div>
                <div class="lr-sub">${escapeHtml(taskTypeLabel(f.taskType))}</div>
              </div>
              <div class="lr-right">
                <span>${escapeHtml(staffLabel(f.responsible))}</span>
                ${badge('Pendiente', 'blue')}
              </div>
            </div>`;
          }).join('') : emptyStateHtml('No hay seguimientos pendientes', 'Las tareas del día aparecerán aquí.')}
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3>Pacientes que requieren atención</h3>
        </div>
        <div class="section-card-body">
          ${attentionPatients.length ? attentionPatients.map(p => `
            <div class="list-row">
              <div class="lr-alert">
                <div class="lr-title">${escapeHtml(p.fullName)}</div>
                <div class="lr-sub">Sin contacto reciente</div>
              </div>
              <div class="lr-right">
                <span>Último: ${formatDate(p.lastVisit)}</span>
                ${badge(statusLabel(p.status), statusColor(p.status))}
              </div>
            </div>`).join('') : emptyStateHtml('Sin pacientes pendientes de atención', 'Cuando un paciente requiera seguimiento aparecerá aquí.')}
        </div>
      </div>
    </div>

    <div>
      <div class="card mt-0" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Distribución de Pacientes</h3>
        ${donutChart([
          { label: 'Activos', value: statusCounts['activo'] || 0, color: 'var(--color-accent-green)' },
          { label: 'Nuevos', value: statusCounts['nuevo'] || 0, color: 'var(--color-accent-yellow)' },
          { label: 'En Seguimiento', value: statusCounts['seguimiento'] || 0, color: 'var(--color-primary)' },
          { label: 'Inactivos', value: statusCounts['inactivo'] || 0, color: 'var(--color-text-faint)' },
        ], patients.length)}
      </div>
      <div class="note-box">
        <strong>⚠ Notas Internas</strong>
        <p>No hay notas registradas por el equipo administrativo por el momento.</p>
      </div>
    </div>
  </div>
  `;
}
function metricCard(label, value, color) {
  const dotColors = { blue: 'var(--color-primary)', green: 'var(--color-accent-green)', yellow: 'var(--color-accent-yellow)', red: 'var(--color-accent-red)' };
  return `<div class="metric-card">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${value}<span class="metric-dot" style="background:${dotColors[color] || dotColors.blue}"></span></div>
  </div>`;
}
function donutChart(segments, total) {
  let acc = 0;
  const stops = segments.map(s => {
    const pct = total ? (s.value / total) * 100 : 0;
    const start = acc; acc += pct;
    return `${s.color} ${start}% ${acc}%`;
  }).join(', ');
  const bg = total ? `conic-gradient(${stops})` : '#eef1f5';
  return `<div class="donut-wrap">
    <div class="donut" style="background:${bg}"><div class="donut-center"><strong>${total}</strong><span>Total</span></div></div>
    <div class="legend">
      ${segments.map(s => `<div class="legend-item"><span class="lg-left"><i class="legend-dot" style="background:${s.color}"></i>${escapeHtml(s.label)}</span><strong>${s.value}</strong></div>`).join('')}
    </div>
  </div>`;
}
function emptyStateHtml(title, sub) {
  return `<div class="empty-state"><div class="empty-icon">—</div><p class="empty-title">${escapeHtml(title)}</p><p class="empty-sub">${escapeHtml(sub || '')}</p></div>`;
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function taskTypeLabel(id) {
  const t = getSettings().taskTypes.find(x => x.id === id);
  return t ? t.name : (id || 'Tarea de seguimiento');
}

/* ============================== PATIENT LIST ============================== */
let patientListPage = 1;
const PAGE_SIZE = 7;

function renderPatientList() {
  const settings = getSettings();
  return `
  <div class="page-head">
    <div>
      <h1>Listado de Pacientes</h1>
      <p class="subtitle">Gestiona y filtra los expedientes clínicos de la clínica</p>
    </div>
    <a href="#/pacientes/nuevo" class="btn btn-primary">+ Agregar Paciente</a>
  </div>

  <div class="card">
    <div class="filters-row">
      <div class="field-inline-search">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" id="patientSearchInput" placeholder="Buscar por nombre, teléfono o email...">
      </div>
      <select class="field-select" id="filterStatus">
        <option value="">Todos los Estados</option>
        ${settings.statuses.filter(s => s.active).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
      </select>
      <select class="field-select" id="filterTreatment">
        <option value="">Cualquier Tratamiento</option>
        ${settings.treatments.filter(t => t.active).map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
      </select>
      <select class="field-select" id="filterOrigin">
        <option value="">Cualquier Origen</option>
        ${settings.origins.filter(o => o.active).map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" id="clearFiltersBtn">Limpiar</button>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Nombre completo</th><th>Estado</th><th>Tratamiento / Interés</th>
          <th>Origen</th><th>Responsable</th><th>Última visita</th><th>Acción</th>
        </tr></thead>
        <tbody id="patientTableBody"></tbody>
      </table>
    </div>
    <div class="pagination" id="patientPagination"></div>
  </div>
  `;
}

function filterPatientTable() {
  const patients = getPatients();
  const settings = getSettings();
  const q = (document.getElementById('patientSearchInput')?.value || '').toLowerCase().trim();
  const st = document.getElementById('filterStatus')?.value || '';
  const tr = document.getElementById('filterTreatment')?.value || '';
  const or = document.getElementById('filterOrigin')?.value || '';

  let filtered = patients.filter(p => {
    const matchesQ = !q || p.fullName.toLowerCase().includes(q) || (p.phone || '').includes(q) || (p.email || '').toLowerCase().includes(q);
    const matchesSt = !st || p.status === st;
    const matchesTr = !tr || p.treatment === tr;
    const matchesOr = !or || p.origin === or;
    return matchesQ && matchesSt && matchesTr && matchesOr;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (patientListPage > totalPages) patientListPage = totalPages;
  const pageItems = filtered.slice((patientListPage - 1) * PAGE_SIZE, patientListPage * PAGE_SIZE);

  const tbody = document.getElementById('patientTableBody');
  if (!tbody) return;

  if (!patients.length) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyStateHtml('Aún no hay pacientes registrados', 'Usa "Agregar Paciente" para crear el primer expediente clínico.')}</td></tr>`;
  } else if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyStateHtml('Sin resultados', 'Ajusta la búsqueda o los filtros para ver pacientes.')}</td></tr>`;
  } else {
    tbody.innerHTML = pageItems.map(p => `
      <tr data-id="${p.id}" class="patient-row">
        <td><div class="name-cell"><div class="avatar">${initials(p.fullName)}</div>${escapeHtml(p.fullName)}</div></td>
        <td>${badge(statusLabel(p.status), statusColor(p.status))}</td>
        <td>${escapeHtml(treatmentLabels(p.treatment))}</td>
        <td>${escapeHtml(originLabel(p.origin))}</td>
        <td>${escapeHtml(staffLabel(p.responsible))}</td>
        <td>${p.lastVisit ? formatDate(p.lastVisit) : '—'}</td>
        <td><button class="btn btn-sm btn-secondary view-patient-btn" data-id="${p.id}">Ver Perfil</button></td>
      </tr>`).join('');
  }

  const pag = document.getElementById('patientPagination');
  if (pag) {
    pag.innerHTML = `
      <span>Mostrando ${filtered.length ? ((patientListPage - 1) * PAGE_SIZE + 1) : 0}-${Math.min(patientListPage * PAGE_SIZE, filtered.length)} de ${filtered.length} pacientes</span>
      <div class="pages">
        <button id="pgPrev" ${patientListPage <= 1 ? 'disabled' : ''}>Anterior</button>
        ${Array.from({ length: totalPages }, (_, i) => `<button data-page="${i + 1}" class="${i + 1 === patientListPage ? 'active' : ''}">${i + 1}</button>`).join('')}
        <button id="pgNext" ${patientListPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
      </div>`;
    pag.querySelectorAll('button[data-page]').forEach(b => b.addEventListener('click', () => { patientListPage = +b.dataset.page; filterPatientTable(); }));
    const prev = document.getElementById('pgPrev'), next = document.getElementById('pgNext');
    if (prev) prev.addEventListener('click', () => { patientListPage--; filterPatientTable(); });
    if (next) next.addEventListener('click', () => { patientListPage++; filterPatientTable(); });
  }

  tbody.querySelectorAll('.view-patient-btn').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); location.hash = `#/pacientes/${btn.dataset.id}`; });
  });
  tbody.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => { location.hash = `#/pacientes/${row.dataset.id}`; });
  });
}
function treatmentLabel(id) { const t = getSettings().treatments.find(x => x.id === id); return t ? t.name : (id || '—'); }
function originLabel(id) { const o = getSettings().origins.find(x => x.id === id); return o ? o.name : (id || '—'); }
function staffLabel(id) { const s = getSettings().staff.find(x => x.id === id); return s ? s.name : (id || '—'); }

/* ============================== PATIENT PROFILE ============================== */
function renderPatientProfile(id) {
  const patient = getPatientById(id);
  if (!patient) {
    return `${emptyStateHtml('Paciente no encontrado', 'Selecciona un paciente desde el listado.')}<div class="mt-4"><a href="#/pacientes" class="btn btn-secondary">Volver a Pacientes</a></div>`;
  }
  const followUps = getFollowUpsByPatient(patient.id);

  return `
  <div class="profile-head">
    <div class="avatar" style="width:56px;height:56px;font-size:16px;">${initials(patient.fullName)}</div>
    <div>
      <h1>${escapeHtml(patient.fullName)} ${badge(statusLabel(patient.status), statusColor(patient.status))}</h1>
      <p class="subtitle">ID Paciente: #${patient.id.slice(-6).toUpperCase()} · Registrado el ${formatDate(patient.createdAt)}</p>
    </div>
    <div class="profile-actions">
      <a href="#/pacientes/${patient.id}/editar" class="btn btn-secondary">✎ Editar</a>
      <button class="btn btn-primary" id="addFollowUpBtn">+ Agregar Seguimiento</button>
    </div>
  </div>

  <div class="two-col">
    <div>
      ${oralHealthWidget(patient)}
      <div class="section-card">
        <div class="section-card-head"><h3>Notas Generales de Gestión</h3></div>
        <div class="section-card-body">
          <p style="padding:12px 0;color:var(--color-text-soft);font-size:13px;">${patient.notes ? escapeHtml(patient.notes) : 'Sin notas registradas para este paciente.'}</p>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card-head">
          <h3>Historial de Seguimientos</h3>
          <button class="btn-link" id="exportHistoryBtn">Exportar Historia</button>
        </div>
        <div class="section-card-body">
          ${followUps.length ? `<div class="timeline">${followUps.map((f, i) => `
            <div class="timeline-item">
              <div class="timeline-dot-col"><span class="timeline-dot" style="background:${f.status === 'completado' ? 'var(--color-accent-green)' : f.status === 'cancelado' ? 'var(--color-text-faint)' : 'var(--color-primary)'}"></span>${i < followUps.length - 1 ? '<span class="timeline-line"></span>' : ''}</div>
              <div class="timeline-body">
                <div class="timeline-title-row">
                  <div><span class="timeline-title">${escapeHtml(taskTypeLabel(f.taskType))}</span> <span class="timeline-meta">por ${escapeHtml(staffLabel(f.responsible))}</span></div>
                  <span class="timeline-date">${formatDate(f.dueDate || f.createdAt)}</span>
                </div>
                ${f.notes ? `<p class="timeline-note">${escapeHtml(f.notes)}</p>` : ''}
                <div class="mt-2">${badge(followUpStatusLabel(f.status), followUpStatusColor(f.status))}</div>
              </div>
            </div>`).join('')}</div>` : emptyStateHtml('Sin seguimientos registrados', 'Agrega el primer seguimiento para este paciente.')}
        </div>
      </div>
    </div>

    <div>
      <div class="section-card">
        <div class="section-card-head"><h3>Información de Contacto</h3></div>
        <div class="section-card-body">
          <div class="info-row"><span class="info-label">Teléfono Móvil</span><span class="info-value">${escapeHtml(patientPhoneDisplay(patient))}</span></div>
          <div class="info-row"><span class="info-label">Email</span><span class="info-value">${escapeHtml(patient.email || '—')}</span></div>
          <div class="info-row"><span class="info-label">Dirección de Residencia</span><span class="info-value">${escapeHtml(patient.address || '—')}</span></div>
          <div class="info-row"><span class="info-label">Documento de Identidad</span><span class="info-value">${escapeHtml(patient.cedula || '—')}</span></div>
        </div>
      </div>
      <div class="section-card">
        <div class="section-card-head"><h3>Información Clínica</h3></div>
        <div class="section-card-body">
          <div class="info-row"><span class="info-label">Origen de Paciente</span><span class="info-value">${escapeHtml(originLabel(patient.origin))}</span></div>
          <div class="info-row"><span class="info-label">Responsable</span><span class="info-value">${escapeHtml(staffLabel(patient.responsible))}</span></div>
          <div class="info-row"><span class="info-label">Tratamientos / Intereses</span><span class="info-value">${escapeHtml(treatmentLabels(patient.treatment))}</span></div>
          <div class="info-row"><span class="info-label">Última Visita</span><span class="info-value">${patient.lastVisit ? formatDate(patient.lastVisit) : '—'}</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Add follow-up modal -->
  <div class="modal-overlay" id="followUpModal">
    <div class="modal">
      <h3>Agregar Seguimiento</h3>
      <form id="quickFollowUpForm">
        <div class="field mt-2"><label>Tipo de tarea *</label><select name="taskType" required><option value="">Selecciona...</option>${optionsFor(getSettings().taskTypes)}</select></div>
        <div class="field mt-2"><label>Responsable *</label><select name="responsible" required><option value="">Selecciona...</option>${optionsFor(getSettings().staff)}</select></div>
        <div class="field mt-2"><label>Fecha límite</label><input type="date" name="dueDate"></div>
        <div class="field mt-2"><label>Notas</label><textarea name="notes" placeholder="Detalles del seguimiento..."></textarea></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="cancelFollowUpModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar seguimiento</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Dentograma 3D -->
  <div class="modal-overlay dentogram-overlay" id="dentogramModal">
    <div class="modal dentogram-modal">
      <button type="button" class="dentogram-close" id="closeDentogramModal" aria-label="Cerrar">✕</button>
      <iframe id="dentogramFrame" class="dentogram-frame" title="Dentograma 3D" loading="lazy"></iframe>
    </div>
  </div>
  `;
}
/* Pastilla de Salud Oral: usa el mismo estilo de anillo (y el titileo en rojo) del
   dentograma 3D. Es seleccionable: al tocarla abre el dentograma completo. */
function oralHealthWidget(patient) {
  const h = dentalHealthFromMap(patient.dentalMap);
  const bandLabel = { good: 'Buena', mid: 'Media', low: 'Baja', crit: 'Crítica' }[h.band];
  return `
  <button type="button" class="oral-health-card" id="openDentogramBtn" data-patient-id="${patient.id}" data-patient-name="${escapeHtml(patient.fullName)}">
    <span class="oral-health-score" data-band="${h.band}" style="--pct:${h.score}" role="img" aria-label="Salud oral estimada">${h.hasData ? h.score : '—'}</span>
    <span class="oral-health-info">
      <strong>Salud Oral — ${h.hasData ? bandLabel : 'Sin evaluar'}</strong>
      <span>${h.hasData ? 'Toca para abrir el dentograma 3D con el detalle de cada diente.' : 'Aún no se ha hecho la valoración dental. Toca para registrarla.'}</span>
    </span>
    <span class="oral-health-arrow">→</span>
  </button>`;
}
function followUpStatusLabel(s) { return { pendiente: 'Pendiente', completado: 'Completado', cancelado: 'Cancelado' }[s] || s; }
function followUpStatusColor(s) { return { pendiente: 'blue', completado: 'green', cancelado: 'gray' }[s] || 'gray'; }

/* ============================== PATIENT FORM (create/edit) ============================== */
function renderPatientForm(editId) {
  const isEdit = !!editId;
  const patient = isEdit ? getPatientById(editId) : null;
  if (isEdit && !patient) return emptyStateHtml('Paciente no encontrado', '');
  const settings = getSettings();

  return `
  <div class="page-head">
    <div>
      <h1>${isEdit ? 'Editar Expediente Clínico' : 'Crear Expediente de Paciente'} ${isEdit ? badge(patient.fullName, 'gray') : ''}</h1>
      <p class="subtitle">${isEdit ? `Datos del paciente #${patient.id.slice(-6).toUpperCase()} · Registrado el ${formatDate(patient.createdAt)}` : 'Por favor completa los siguientes datos para ingresar el paciente al sistema clínico'}</p>
    </div>
  </div>

  <div id="formAlert"></div>

  <form class="form-card" id="patientForm">
    <div class="form-section-title">1. Datos Obligatorios</div>
    <div class="form-grid">
      <div class="field"><label>Nombre Completo *</label><input type="text" name="fullName" placeholder="Ej: Carlos Andrés Mendoza" required value="${escapeHtml(patient?.fullName || '')}"></div>
            <div class="field">
        <label>Teléfono Móvil *</label>
        <div class="phone-input-group">
          <input type="text" name="phoneCodeText" list="countryCodeList" class="phone-code-input"
            placeholder="País" autocomplete="off"
            value="${escapeHtml(phoneCodeDisplay(patient?.phoneCode || '+57'))}">
          <input type="tel" name="phone" placeholder="300 123 4567" required value="${escapeHtml(patient?.phone || '')}">
        </div>
        <datalist id="countryCodeList">
          ${COUNTRIES.map(([name, code]) => `<option value="${escapeHtml(name)} (${code})">`).join('')}
        </datalist>
      </div>
      <div class="field"><label>Correo Electrónico *</label><input type="email" name="email" placeholder="ejemplo@correo.com" required value="${escapeHtml(patient?.email || '')}"></div>
      <div class="field"><label>Estado ${isEdit ? '' : 'Inicial'} *</label><select name="status" required>${optionsFor(settings.statuses, patient?.status || 'nuevo')}</select></div>
      <div class="field"><label>Origen de Paciente *</label><select name="origin" required><option value="">Selecciona...</option>${optionsFor(settings.origins, patient?.origin)}</select></div>
      <div class="field">
        <label>País de Origen</label>
        <input type="text" name="countryOfOrigin" list="countryNameList" placeholder="Escribe para buscar..." autocomplete="off" value="${escapeHtml(patient?.countryOfOrigin || 'Colombia')}">
        <datalist id="countryNameList">${COUNTRIES.map(([name]) => `<option value="${escapeHtml(name)}">`).join('')}</datalist>
      </div>
      <div class="field"><label>Responsable *</label><select name="responsible" required><option value="">Selecciona...</option>${optionsFor(settings.staff, patient?.responsible)}</select></div>
      <div class="field full">
        <label>Tratamientos / Intereses *</label>
        <div class="chip-select-group" id="treatmentChips">
          ${settings.treatments.filter(t => t.active !== false).map(t => {
            const checked = (patient?.treatment || '').split(',').filter(Boolean).includes(t.id);
            return `<label class="chip-toggle ${checked ? 'active' : ''}">
              <input type="checkbox" name="treatment" value="${t.id}" ${checked ? 'checked' : ''}>
              <span>${escapeHtml(t.name)}</span>
            </label>`;
          }).join('')}
        </div>
        <span class="field-hint">Toca uno o varios. Puedes combinarlos.</span>
      </div>
    </div>
    <div class="form-section-title">2. Datos Opcionales${isEdit ? ' &amp; Notas de Gestión' : ''}</div>
    <div class="form-grid">
      <div class="field"><label>Cédula de Ciudadanía (C.C.)</label><input type="text" name="cedula" placeholder="Número de documento" value="${escapeHtml(patient?.cedula || '')}"></div>
      <div class="field"><label>Dirección completa</label><input type="text" name="address" placeholder="Ej: Cra 7 #72-10" value="${escapeHtml(patient?.address || '')}"></div>
      <div class="field full"><label>Notas del Paciente / Alergias o Comentarios</label><textarea name="notes" placeholder="Agrega notas clínicas preliminares relevantes aquí...">${escapeHtml(patient?.notes || '')}</textarea></div>
    </div>

    ${!isEdit ? `<div class="checkbox-row mt-4"><input type="checkbox" id="addTaskNow" name="addTaskNow"><label for="addTaskNow">Agregar tarea de seguimiento inmediatamente para este paciente</label></div>` : ''}

    <div class="form-actions">
      <a href="${isEdit ? '#/pacientes/' + patient.id : '#/pacientes'}" class="btn btn-secondary">Cancelar</a>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Guardar paciente'}</button>
    </div>
  </form>
  `;
}

/* ============================== FOLLOW-UPS LIST ============================== */
let followUpTab = 'hoy';
function renderFollowUpList() {
  const followUps = getFollowUps();
  const vencidos = followUps.filter(f => f.status === 'pendiente' && f.dueDate && f.dueDate < todayISO()).length;
  const completados = followUps.filter(f => f.status === 'completado').length;

  return `
  <div class="page-head">
    <div>
      <h1>Gestión de Seguimientos</h1>
      <p class="subtitle">Monitorea las tareas programadas con pacientes para evitar perder contacto</p>
    </div>
    <a href="#/seguimientos/nuevo" class="btn btn-primary">+ Nueva Tarea</a>
  </div>

  <div class="tabs">
    <button class="tab-item ${followUpTab === 'hoy' ? 'active' : ''}" data-tab="hoy">Hoy <span class="count">${followUps.filter(f => f.status === 'pendiente').length}</span></button>
    <button class="tab-item ${followUpTab === 'vencidos' ? 'active' : ''}" data-tab="vencidos">Vencidos <span class="count">${vencidos}</span></button>
    <button class="tab-item ${followUpTab === 'completados' ? 'active' : ''}" data-tab="completados">Completados <span class="count">${completados}</span></button>
    <button class="tab-item ${followUpTab === 'todos' ? 'active' : ''}" data-tab="todos">Todos <span class="count">${followUps.length}</span></button>
  </div>

  <div class="card">
    <div class="filters-row">
      <div class="field-inline-search">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="search" id="fuSearchInput" placeholder="Filtrar por paciente...">
      </div>
      <select class="field-select" id="fuResponsibleFilter">
        <option value="">Responsable: Todos</option>
        ${optionsFor(getSettings().staff)}
      </select>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Paciente</th><th>Tarea / Acción requerida</th><th>Vencimiento</th><th>Responsable</th><th>Estado</th><th>Acciones rápidas</th></tr></thead>
        <tbody id="fuTableBody"></tbody>
      </table>
    </div>
  </div>
  `;
}
function filterFollowUpTable() {
  const tbody = document.getElementById('fuTableBody');
  if (!tbody) return;
  let followUps = getFollowUps();
  const q = (document.getElementById('fuSearchInput')?.value || '').toLowerCase().trim();
  const resp = document.getElementById('fuResponsibleFilter')?.value || '';

  if (followUpTab === 'hoy') followUps = followUps.filter(f => f.status === 'pendiente');
  if (followUpTab === 'vencidos') followUps = followUps.filter(f => f.status === 'pendiente' && f.dueDate && f.dueDate < todayISO());
  if (followUpTab === 'completados') followUps = followUps.filter(f => f.status === 'completado');

  followUps = followUps.filter(f => {
    const p = getPatientById(f.patientId);
    const matchesQ = !q || (p && p.fullName.toLowerCase().includes(q));
    const matchesResp = !resp || f.responsible === resp;
    return matchesQ && matchesResp;
  });

  if (!followUps.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyStateHtml('No hay seguimientos en esta vista', 'Crea una nueva tarea con "Nueva Tarea".')}</td></tr>`;
    return;
  }

  tbody.innerHTML = followUps.map(f => {
    const p = getPatientById(f.patientId);
    const overdue = f.status === 'pendiente' && f.dueDate && f.dueDate < todayISO();
    return `<tr>
      <td><strong>${escapeHtml(p ? p.fullName : 'Paciente eliminado')}</strong></td>
      <td>${escapeHtml(taskTypeLabel(f.taskType))}</td>
      <td style="${overdue ? 'color:var(--color-accent-red);font-weight:600;' : ''}">${f.dueDate ? formatDate(f.dueDate) : '—'}</td>
      <td>${escapeHtml(staffLabel(f.responsible))}</td>
      <td>${badge(followUpStatusLabel(f.status), followUpStatusColor(f.status))}</td>
      <td class="actions-cell">
        ${f.status === 'pendiente' ? `<button class="action-link complete-fu-btn" data-id="${f.id}">Completar</button><button class="action-link muted postpone-fu-btn" data-id="${f.id}">Posponer</button>` : ''}
        <a href="#/seguimientos/${f.id}/editar" class="action-link muted">Editar</a>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.complete-fu-btn').forEach(b => b.addEventListener('click', () => {
    updateFollowUp(b.dataset.id, { status: 'completado', completedAt: new Date().toISOString() });
    showToast('Seguimiento marcado como completado');
    filterFollowUpTable();
    renderFollowUpList_refreshTabs();
  }));
  tbody.querySelectorAll('.postpone-fu-btn').forEach(b => b.addEventListener('click', () => {
    const f = getFollowUpById(b.dataset.id);
    const next = new Date(f.dueDate || Date.now());
    next.setDate(next.getDate() + 1);
    updateFollowUp(b.dataset.id, { dueDate: next.toISOString().slice(0, 10) });
    showToast('Tarea pospuesta un día');
    filterFollowUpTable();
  }));
}
function renderFollowUpList_refreshTabs() {
  const content = document.getElementById('content');
  if (content.querySelector('.tabs')) { content.innerHTML = renderFollowUpList(); attachViewHandlers(['seguimientos']); }
}

/* ============================== FOLLOW-UP FORM ============================== */
function renderFollowUpForm(editId) {
  const isEdit = !!editId;
  const fu = isEdit ? getFollowUpById(editId) : null;
  if (isEdit && !fu) return emptyStateHtml('Seguimiento no encontrado', '');
  const settings = getSettings();
  const patients = getPatients();

  return `
  <div class="page-head">
    <div>
      <h1>${isEdit ? 'Editar Seguimiento' : 'Nuevo Seguimiento'}</h1>
      <p class="subtitle">${isEdit ? 'Actualiza el estado o los datos de esta tarea' : 'Programa una tarea de seguimiento con un paciente'}</p>
    </div>
  </div>
  <form class="form-card" id="followUpFullForm">
    <div class="form-grid">
      <div class="field full"><label>Paciente *</label>
        <select name="patientId" required ${!patients.length ? 'disabled' : ''}>
          <option value="">Selecciona un paciente...</option>
          ${patients.map(p => `<option value="${p.id}" ${fu?.patientId === p.id ? 'selected' : ''}>${escapeHtml(p.fullName)}</option>`).join('')}
        </select>
        ${!patients.length ? '<span class="text-faint">Primero crea un paciente para poder asignarle seguimientos.</span>' : ''}
      </div>
      <div class="field"><label>Tipo de Tarea *</label><select name="taskType" required><option value="">Selecciona...</option>${optionsFor(settings.taskTypes, fu?.taskType)}</select></div>
      <div class="field"><label>Responsable *</label><select name="responsible" required><option value="">Selecciona...</option>${optionsFor(settings.staff, fu?.responsible)}</select></div>
      <div class="field"><label>Fecha Límite</label><input type="date" name="dueDate" value="${fu?.dueDate || ''}"></div>
      <div class="field"><label>Estado</label>
        <select name="status">
          <option value="pendiente" ${fu?.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
          <option value="completado" ${fu?.status === 'completado' ? 'selected' : ''}>Completado</option>
          <option value="cancelado" ${fu?.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
        </select>
      </div>
      <div class="field full"><label>Notas</label><textarea name="notes" placeholder="Detalles de la tarea...">${escapeHtml(fu?.notes || '')}</textarea></div>
      ${isEdit ? `<div class="field full"><label>Resultado</label><textarea name="result" placeholder="Resultado de la gestión...">${escapeHtml(fu?.result || '')}</textarea></div>` : ''}
    </div>
    <div class="form-actions">
      <a href="#/seguimientos" class="btn btn-secondary">Cancelar</a>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Guardar cambios' : 'Guardar seguimiento'}</button>
    </div>
  </form>
  `;
}

/* ============================== FINANZAS ============================== */
let financeMonth = todayISO().slice(0, 7); // 'YYYY-MM'

function formatCOP(n) { return '$' + Math.round(n || 0).toLocaleString('es-CO'); }
function moneyBarItem(label, value, max, color) {
  const pct = max ? (value / max) * 100 : 0;
  return `<div class="bar-list-item">
    <div class="bar-list-head"><span>${escapeHtml(label)}</span><strong>${formatCOP(value)}</strong></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}
function fixedCostLabel(id) { const c = getSettings().fixedCosts.find(x => x.id === id); return c ? c.name : (id || 'Gasto'); }
function financeTxCategoryLabel(tx) {
  return tx.type === 'ingreso' ? treatmentLabel(tx.category) : fixedCostLabel(tx.category);
}

function renderFinance() {
  if (!isFinanceAuthorized()) {
    return `
    <div class="page-head">
      <div><h1>Finanzas del Consultorio</h1><p class="subtitle">Información contable de la clínica</p></div>
    </div>
    <div class="locked-card">
      <div class="locked-icon">
        <svg viewBox="0 0 24 24" width="26" height="26"><rect x="5" y="10.5" width="14" height="9" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
      </div>
      <h3>Acceso restringido</h3>
      <p>La información contable solo está disponible para las cuentas autorizadas por la clínica. Si necesitas acceso, pide a un administrador que agregue tu correo en Configuración → Acceso a Finanzas.</p>
    </div>`;
  }
  const settings = getSettings();
  const patients = getPatients();
  const month = financeMonth;
  const txMonth = getFinanceTx().filter(t => (t.date || '').slice(0, 7) === month);
  const ingresos = txMonth.filter(t => t.type === 'ingreso');
  const gastosVariables = txMonth.filter(t => t.type === 'gasto');
  const fixedActive = settings.fixedCosts.filter(c => c.active !== false && c.fixed);
  const totalIngresos = ingresos.reduce((s, t) => s + t.amount, 0);
  const totalFijos = fixedActive.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalGastos = gastosVariables.reduce((s, t) => s + t.amount, 0) + totalFijos;
  const utilidad = totalIngresos - totalGastos;

  const byDoctor = {};
  ingresos.forEach(t => { const k = t.responsible || ''; byDoctor[k] = (byDoctor[k] || 0) + t.amount; });
  const doctorRows = Object.entries(byDoctor).map(([id, val]) => ({ name: id ? staffLabel(id) : 'Sin asignar', value: val })).sort((a, b) => b.value - a.value);
  const maxDoctor = Math.max(1, ...doctorRows.map(d => d.value));

  return `
  <div class="page-head">
    <div>
      <h1>Finanzas del Consultorio</h1>
      <p class="subtitle">Ingresos, gastos y utilidad — información restringida al personal autorizado</p>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <input type="month" id="financeMonthInput" value="${month}" class="field-select">
      <button class="btn btn-primary" id="addFinanceTxBtn">+ Registrar movimiento</button>
    </div>
  </div>

  <div class="grid-metrics">
    ${metricCard('Ingresos del mes', formatCOP(totalIngresos), 'green')}
    ${metricCard('Gastos del mes', formatCOP(totalGastos), 'red')}
    ${metricCard('Costos fijos incluidos', formatCOP(totalFijos), 'blue')}
    ${metricCard('Utilidad del mes', formatCOP(utilidad), utilidad >= 0 ? 'green' : 'red')}
  </div>

  <div class="two-col">
    <div>
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Ingresos por Doctor(a) — ${monthLabel(month)}</h3>
        ${doctorRows.length ? doctorRows.map((d, i) => moneyBarItem(d.name, d.value, maxDoctor, ['var(--color-accent-green)', 'var(--color-primary)', 'var(--color-accent-yellow)', 'var(--color-accent-purple)', 'var(--color-text-faint)'][i % 5])).join('') : emptyStateHtml('Sin ingresos registrados este mes', 'Registra el primer movimiento con "+ Registrar movimiento".')}
      </div>
      <div class="section-card">
        <div class="section-card-head"><h3>Movimientos de ${monthLabel(month)}</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Responsable</th><th>Paciente</th><th>Valor</th><th></th></tr></thead>
            <tbody>
              ${txMonth.length ? txMonth.map(t => `
                <tr>
                  <td>${formatDate(t.date)}</td>
                  <td>${badge(t.type === 'ingreso' ? 'Ingreso' : 'Gasto', t.type === 'ingreso' ? 'green' : 'red')}</td>
                  <td>${escapeHtml(financeTxCategoryLabel(t))}</td>
                  <td>${t.responsible ? escapeHtml(staffLabel(t.responsible)) : '—'}</td>
                  <td>${t.patientId ? escapeHtml((getPatientById(t.patientId) || {}).fullName || '—') : '—'}</td>
                  <td>${formatCOP(t.amount)}</td>
                  <td><button class="action-link muted del-finance-btn" data-id="${t.id}">Eliminar</button></td>
                </tr>`).join('') : `<tr><td colspan="7">${emptyStateHtml('Sin movimientos este mes', 'Usa "+ Registrar movimiento" para agregar ingresos o gastos.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Ingresos vs. Gastos</h3>
        ${donutChart([
          { label: 'Ingresos', value: totalIngresos, color: 'var(--color-accent-green)' },
          { label: 'Gastos', value: totalGastos, color: 'var(--color-accent-red)' },
        ], totalIngresos + totalGastos || 1)}
      </div>
      <div class="section-card">
        <div class="section-card-head">
          <h3>Costos y tratamientos</h3>
          <a href="#/configuracion" class="btn-link">Editar valores</a>
        </div>
        <div class="section-card-body">
          <p class="text-faint" style="font-size:12px;margin-bottom:8px;">Costos fijos (se incluyen automáticamente cada mes):</p>
          ${settings.fixedCosts.filter(c => c.active !== false && c.fixed).map(c => `<div class="info-row"><span class="info-label">${escapeHtml(c.name)}</span><span class="info-value">${formatCOP(c.amount)}</span></div>`).join('') || `<p class="text-faint" style="font-size:12.5px;">Sin costos fijos configurados.</p>`}
        </div>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="financeTxModal">
    <div class="modal">
      <h3>Registrar movimiento</h3>
      <form id="financeTxForm">
        <div class="field"><label>Tipo *</label>
          <select name="type" id="financeTxType" required>
            <option value="ingreso">Ingreso (pago de tratamiento)</option>
            <option value="gasto">Gasto</option>
          </select>
        </div>
        <div class="field mt-2">
          <label id="financeCategoryLabel">Tratamiento</label>
          <select name="category" id="financeCategorySelect">
            <option value="">Selecciona...</option>
            ${settings.treatments.filter(t => t.active).map(t => `<option value="${t.id}" data-price="${t.price || 0}">${escapeHtml(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field mt-2"><label>Valor (COP) *</label><input type="number" min="0" step="1000" name="amount" id="financeAmountInput" required></div>
        <div class="field mt-2"><label>Doctor(a) responsable</label><select name="responsible"><option value="">Selecciona...</option>${optionsFor(settings.staff)}</select></div>
        <div class="field mt-2"><label>Paciente (opcional)</label><select name="patientId"><option value="">Ninguno</option>${patients.map(p => `<option value="${p.id}">${escapeHtml(p.fullName)}</option>`).join('')}</select></div>
        <div class="field mt-2"><label>Fecha *</label><input type="date" name="date" required value="${todayISO()}"></div>
        <div class="field mt-2"><label>Notas</label><input type="text" name="description" placeholder="Detalle opcional"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="cancelFinanceTxModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar movimiento</button>
        </div>
      </form>
    </div>
  </div>
  `;
}

/* ============================== REPORTS ============================== */
function renderReports() {
  const patients = getPatients();
  const followUps = getFollowUps();
  const completados = followUps.filter(f => f.status === 'completado').length;
  const pendientes = followUps.filter(f => f.status === 'pendiente').length;
  const settings = getSettings();

  const byOrigin = settings.origins.filter(o => o.active).map(o => ({ name: o.name, value: patients.filter(p => p.origin === o.id).length }))
    .sort((a, b) => b.value - a.value).slice(0, 5);
  const byTreatment = settings.treatments.filter(t => t.active).map(t => ({ name: t.name, value: patients.filter(p => (p.treatment || '').split(',').includes(t.id)).length }))
    .sort((a, b) => b.value - a.value).slice(0, 5);
  const countryCounts = {};
  patients.forEach(p => { const c = (p.countryOfOrigin || '').trim() || 'Sin especificar'; countryCounts[c] = (countryCounts[c] || 0) + 1; });
  const byCountry = Object.entries(countryCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const maxCountry = Math.max(1, ...byCountry.map(c => c.value));
  const maxOrigin = Math.max(1, ...byOrigin.map(o => o.value));
  const maxTreatment = Math.max(1, ...byTreatment.map(o => o.value));
  const activos = patients.filter(p => p.status === 'activo').length;
  const inactivos = patients.filter(p => p.status === 'inactivo').length;
  const sinContacto = patients.filter(p => p.status === 'no_reactivar').length;

  return `
  <div class="page-head">
    <div><h1>Reportes e Indicadores</h1><p class="subtitle">Visión general y rendimiento administrativo de la clínica</p></div>
  </div>

  <div class="grid-metrics">
    ${metricCard('Seguimientos Completados', completados, 'green')}
    ${metricCard('Seguimientos Pendientes', pendientes, 'blue')}
    ${metricCard('Nuevos Pacientes', patients.length, 'yellow')}
    ${metricCard('Sin Contacto (30+ días)', sinContacto, 'red')}
  </div>

  <div class="two-col">
    <div>
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Pacientes por Origen de Contacto</h3>
        ${patients.length ? byOrigin.map((o, i) => barItem(o.name, o.value, maxOrigin, ['var(--color-accent-green)', 'var(--color-primary)', 'var(--color-accent-yellow)', 'var(--color-accent-purple)', 'var(--color-text-faint)'][i % 5])).join('') : emptyStateHtml('Sin datos suficientes', 'El reporte se completará con el registro de pacientes.')}
      </div>
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Distribución por Tratamiento de Interés</h3>
        ${patients.length ? byTreatment.map((o, i) => barItem(o.name, o.value, maxTreatment, ['var(--color-primary)', 'var(--color-accent-green)', 'var(--color-accent-yellow)', 'var(--color-text-faint)', 'var(--color-accent-purple)'][i % 5])).join('') : emptyStateHtml('Sin datos suficientes', 'El reporte se completará con el registro de pacientes.')}
      </div>
    </div>
    <div>
      <div class="card" style="margin-bottom:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Relación de Actividad</h3>
        ${donutChart([
          { label: 'Activos', value: activos, color: 'var(--color-accent-green)' },
          { label: 'Inactivos', value: inactivos, color: 'var(--color-accent-red)' },
        ], patients.length)}
      </div>
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Motivos de Inactividad</h3>
        ${settings.inactivityReasons.filter(r => r.active).length ? settings.inactivityReasons.filter(r => r.active).map(r => `
          <div class="legend-item" style="padding:6px 0;"><span class="lg-left"><i class="legend-dot" style="background:var(--color-primary)"></i>${escapeHtml(r.name)}</span><strong>—</strong></div>
        `).join('') : emptyStateHtml('Sin motivos configurados', '')}
      </div>
    </div>
    <div class="card" style="margin-top:20px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">Pacientes por País de Origen</h3>
        ${patients.length ? byCountry.map((c, i) => barItem(c.name, c.value, maxCountry, ['var(--color-primary)', 'var(--color-accent-green)', 'var(--color-accent-yellow)', 'var(--color-accent-purple)', 'var(--color-text-faint)'][i % 5])).join('') : emptyStateHtml('Sin datos suficientes', '')}
      </div>
  </div>
  `;
}
function barItem(label, value, max, color) {
  const pct = max ? (value / max) * 100 : 0;
  return `<div class="bar-list-item">
    <div class="bar-list-head"><span>${escapeHtml(label)}</span><strong>${value} pacientes</strong></div>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}

/* ============================== SETTINGS ============================== */
const SETTINGS_TABS = [
  { key: 'statuses', label: 'Estados de paciente' },
  { key: 'treatments', label: 'Tratamientos / Precios' },
  { key: 'fixedCosts', label: 'Costos fijos y variables' },
  { key: 'origins', label: 'Orígenes de paciente' },
  { key: 'taskTypes', label: 'Tipos de seguimiento' },
  { key: 'staff', label: 'Miembros del equipo' },
  { key: 'inactivityReasons', label: 'Motivos de inactividad' },
  { key: 'financeAccess', label: 'Acceso a Finanzas' },
];
let settingsActiveTab = 'statuses';
function renderSettings() {
  if (settingsActiveTab === 'financeAccess' && !isFinanceAuthorized()) settingsActiveTab = 'statuses';
  const settings = getSettings();
  const items = settings[settingsActiveTab] || [];
  const tabInfo = SETTINGS_TABS.find(t => t.key === settingsActiveTab);
  const isTreatments = settingsActiveTab === 'treatments';
  const isCosts = settingsActiveTab === 'fixedCosts';
  const isAccess = settingsActiveTab === 'financeAccess';
  const visibleTabs = SETTINGS_TABS.filter(t => t.key !== 'financeAccess' || isFinanceAuthorized());

  return `
  <div class="page-head">
    <div><h1>Configuración del Sistema</h1><p class="subtitle">Personaliza los parámetros globales, catálogos, precios y miembros de equipo clínico</p></div>
  </div>

  <div class="tabs">
    ${visibleTabs.map(t => `<button class="tab-item ${t.key === settingsActiveTab ? 'active' : ''}" data-settings-tab="${t.key}">${t.label}</button>`).join('')}
  </div>

  <div class="section-card">
    <div class="section-card-head">
      <div>
        <h3>${tabInfo.label}</h3>
        <p class="text-faint" style="font-size:12.5px;margin-top:2px;">${isTreatments ? 'Los valores fijados aquí se usan como precio sugerido en Finanzas; edítalos solo cuando cambien.' : isCosts ? 'Los costos marcados como "fijos" se incluyen automáticamente cada mes en Finanzas, sin necesidad de volver a registrarlos.' : isAccess ? 'Solo las cuentas (correo de inicio de sesión) listadas aquí pueden ver la pestaña Finanzas. Si la lista está vacía, cualquier cuenta puede verla.' : 'Define las opciones disponibles en los formularios del sistema'}</p>
      </div>
      <button class="btn btn-primary btn-sm" id="addOptionBtn">+ Agregar ${isAccess ? 'correo' : 'opción'}</button>
    </div>
    <div class="section-card-body">
      ${items.length ? items.map(item => `
        <div class="settings-catalog-row">
          <div class="settings-catalog-left">
            ${settingsActiveTab === 'statuses' ? badge(item.name, item.color) : isAccess ? `<strong>${escapeHtml(item.email)}</strong>` : `<strong>${escapeHtml(item.name)}</strong>`}
            ${isTreatments ? `<span class="settings-catalog-desc">Precio actual: ${formatCOP(item.price)}</span>` : ''}
            ${isCosts ? `<span class="settings-catalog-desc">${item.fixed ? 'Fijo mensual' : 'Variable'} · ${formatCOP(item.amount)}</span>` : ''}
            ${item.desc && !isAccess ? `<span class="settings-catalog-desc">${escapeHtml(item.desc)}</span>` : ''}
            ${item.active === false ? `<span class="text-faint" style="font-size:11.5px;">Deshabilitado</span>` : ''}
          </div>
          <div class="settings-catalog-actions">
            <button class="action-link edit-option-btn" data-id="${item.id}">✎ Editar</button>
            <button class="action-link muted toggle-option-btn" data-id="${item.id}" style="color:${item.active === false ? 'var(--color-accent-green)' : 'var(--color-accent-red)'}">${item.active === false ? 'Habilitar' : 'Deshabilitar'}</button>
            <button class="action-link muted delete-option-btn" data-id="${item.id}" data-name="${escapeHtml(isAccess ? item.email : item.name)}" style="color:var(--color-accent-red)">🗑 Eliminar</button>
          </div>
        </div>
      `).join('') : emptyStateHtml('Sin opciones configuradas', 'Agrega la primera opción para este catálogo.')}
    </div>
  </div>

  <div class="modal-overlay" id="optionModal">
    <div class="modal">
      <h3 id="optionModalTitle">Agregar ${isAccess ? 'correo' : 'opción'}</h3>
      <form id="optionForm">
        <input type="hidden" name="optionId">
        ${isAccess ? `
          <div class="field"><label>Correo autorizado *</label><input type="email" name="email" required placeholder="doctora@clinica.com"></div>
        ` : `
          <div class="field"><label>Nombre *</label><input type="text" name="name" required></div>
          <div class="field mt-2"><label>Descripción</label><input type="text" name="desc"></div>
          ${isTreatments ? `<div class="field mt-2"><label>Precio (COP) *</label><input type="number" min="0" step="1000" name="price" required></div>` : ''}
          ${isCosts ? `
            <div class="field mt-2"><label>Valor mensual (COP) *</label><input type="number" min="0" step="1000" name="amount" required></div>
            <div class="checkbox-row mt-2"><input type="checkbox" id="optFixed" name="fixed"><label for="optFixed">Es un costo fijo (se repite todos los meses automáticamente)</label></div>
          ` : ''}
        `}
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="cancelOptionModal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  </div>
  `;
}

/* ============================== EVENT WIRING PER VIEW ============================== */
function attachViewHandlers(parts) {
  const route = parts[0];

  if (route === 'pacientes' && (!parts[1])) {
    patientListPage = 1;
    filterPatientTable();
    ['patientSearchInput', 'filterStatus', 'filterTreatment', 'filterOrigin'].forEach(id => {
      const elx = document.getElementById(id);
      if (elx) elx.addEventListener('input', () => { patientListPage = 1; filterPatientTable(); });
    });
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      ['patientSearchInput'].forEach(id => { const e2 = document.getElementById(id); if (e2) e2.value = ''; });
      ['filterStatus', 'filterTreatment', 'filterOrigin'].forEach(id => { const e2 = document.getElementById(id); if (e2) e2.value = ''; });
      patientListPage = 1; filterPatientTable();
    });
  }

  if (route === 'pacientes' && parts[1] === 'nuevo') {
    document.getElementById('patientForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const treatments = fd.getAll('treatment');
      if (!treatments.length) { showToast('Selecciona al menos un tratamiento de interés'); return; }
      const data = Object.fromEntries(fd.entries());
      data.treatment = treatments.join(',');
      const codeMatch = (data.phoneCodeText || '').match(/\(([^)]+)\)\s*$/);
      data.phoneCode = codeMatch ? codeMatch[1] : '+57';
      delete data.phoneCodeText;
      const patient = createPatient(data);
      if (data.addTaskNow) {
        location.hash = `#/pacientes/${patient.id}`;
        setTimeout(() => { showToast('Paciente creado. Agrega ahora su seguimiento.'); openFollowUpModal(); }, 50);
      } else {
        showToast('Paciente creado correctamente');
        location.hash = `#/pacientes/${patient.id}`;
      }
    });
  }

  if (route === 'pacientes' && parts[1] && parts[2] === 'editar') {
    document.getElementById('patientForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const treatments = fd.getAll('treatment');
      if (!treatments.length) { showToast('Selecciona al menos un tratamiento de interés'); return; }
      const data = Object.fromEntries(fd.entries());
      data.treatment = treatments.join(',');
      const codeMatch = (data.phoneCodeText || '').match(/\(([^)]+)\)\s*$/);
      data.phoneCode = codeMatch ? codeMatch[1] : '+57';
      delete data.phoneCodeText;
      updatePatient(parts[1], data);
      document.querySelectorAll('#treatmentChips .chip-toggle input').forEach(cb => {
      cb.addEventListener('change', () => cb.closest('.chip-toggle').classList.toggle('active', cb.checked));
      });
      document.getElementById('formAlert').innerHTML = `<div class="alert-success">✓ Cambios listos para guardar. Se ha verificado la información del expediente clínico.</div>`;
      showToast('Cambios guardados correctamente');
      setTimeout(() => { location.hash = `#/pacientes/${parts[1]}`; }, 700);
    });
  }

  if (route === 'pacientes' && parts[1] && parts[1] !== 'nuevo' && !parts[2]) {
    const addBtn = document.getElementById('addFollowUpBtn');
    if (addBtn) addBtn.addEventListener('click', openFollowUpModal);
    const cancelBtn = document.getElementById('cancelFollowUpModal');
    if (cancelBtn) cancelBtn.addEventListener('click', closeFollowUpModal);
    const form = document.getElementById('quickFollowUpForm');
    document.querySelectorAll('#treatmentChips .chip-toggle input').forEach(cb => {
      cb.addEventListener('change', () => cb.closest('.chip-toggle').classList.toggle('active', cb.checked));
    });
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.patientId = parts[1];
      createFollowUp(data);
      closeFollowUpModal();
      showToast('Seguimiento agregado al historial del paciente');
      location.hash = '';
      router();
      location.hash = `#/pacientes/${parts[1]}`;
    });
    const exportBtn = document.getElementById('exportHistoryBtn');
    if (exportBtn) exportBtn.addEventListener('click', () => showToast('Exportación de historial disponible próximamente'));

    const dentogramModal = document.getElementById('dentogramModal');
    const dentogramFrame = document.getElementById('dentogramFrame');
    const openBtn = document.getElementById('openDentogramBtn');
    if (openBtn) openBtn.addEventListener('click', () => {
      dentogramFrame.src = `dentograma.html?patient=${encodeURIComponent(openBtn.dataset.patientId)}&name=${encodeURIComponent(openBtn.dataset.patientName)}`;
      dentogramModal.classList.add('open');
    });
    const closeDentogramBtn = document.getElementById('closeDentogramModal');
    if (closeDentogramBtn) closeDentogramBtn.addEventListener('click', async () => {
      dentogramModal.classList.remove('open');
      dentogramFrame.src = 'about:blank';
      await refreshPatientDentalMap(parts[1]);
      router();
    });
  }

  if (route === 'seguimientos' && !parts[1]) {
    filterFollowUpTable();
    document.querySelectorAll('[data-tab]').forEach(t => t.addEventListener('click', () => { followUpTab = t.dataset.tab; renderFollowUpList_refreshTabs(); }));
    const s1 = document.getElementById('fuSearchInput'), s2 = document.getElementById('fuResponsibleFilter');
    if (s1) s1.addEventListener('input', filterFollowUpTable);
    if (s2) s2.addEventListener('input', filterFollowUpTable);
  }

  if (route === 'seguimientos' && (parts[1] === 'nuevo' || parts[2] === 'editar')) {
    document.getElementById('followUpFullForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if (parts[2] === 'editar') {
        if (data.status === 'completado') data.completedAt = new Date().toISOString();
        updateFollowUp(parts[1], data);
        showToast('Seguimiento actualizado');
      } else {
        createFollowUp(data);
        showToast('Seguimiento creado');
      }
      location.hash = '#/seguimientos';
    });
  }

  if (route === 'finanzas' && isFinanceAuthorized()) {
    const modal = document.getElementById('financeTxModal');
    const addBtn = document.getElementById('addFinanceTxBtn');
    if (addBtn) addBtn.addEventListener('click', () => modal.classList.add('open'));
    const cancelBtn = document.getElementById('cancelFinanceTxModal');
    if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.remove('open'));

    const typeSelect = document.getElementById('financeTxType');
    const categorySelect = document.getElementById('financeCategorySelect');
    const categoryLabel = document.getElementById('financeCategoryLabel');
    const amountInput = document.getElementById('financeAmountInput');
    function refreshCategoryOptions() {
      const settings = getSettings();
      if (typeSelect.value === 'ingreso') {
        categoryLabel.textContent = 'Tratamiento';
        categorySelect.innerHTML = '<option value="">Selecciona...</option>' + settings.treatments.filter(t => t.active).map(t => `<option value="${t.id}" data-price="${t.price || 0}">${escapeHtml(t.name)}</option>`).join('');
      } else {
        categoryLabel.textContent = 'Concepto de gasto';
        categorySelect.innerHTML = '<option value="">Selecciona...</option>' + settings.fixedCosts.filter(c => c.active !== false).map(c => `<option value="${c.id}" data-price="${c.amount || 0}">${escapeHtml(c.name)}</option>`).join('');
      }
    }
    if (typeSelect) typeSelect.addEventListener('change', refreshCategoryOptions);
    if (categorySelect) categorySelect.addEventListener('change', () => {
      const opt = categorySelect.selectedOptions[0];
      if (opt && opt.dataset.price) amountInput.value = opt.dataset.price;
    });

    const monthInput = document.getElementById('financeMonthInput');
    if (monthInput) monthInput.addEventListener('change', () => { financeMonth = monthInput.value; router(); });

    document.querySelectorAll('.del-finance-btn').forEach(b => b.addEventListener('click', () => {
      deleteFinanceTx(b.dataset.id);
      showToast('Movimiento eliminado');
      router();
    }));

    const form = document.getElementById('financeTxForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      createFinanceTx(Object.fromEntries(fd.entries()));
      modal.classList.remove('open');
      showToast('Movimiento registrado');
      router();
    });
  }

  if (route === 'configuracion') {
    document.querySelectorAll('[data-settings-tab]').forEach(t => t.addEventListener('click', () => { settingsActiveTab = t.dataset.settingsTab; router(); }));
    const modal = document.getElementById('optionModal');
    const addBtn = document.getElementById('addOptionBtn');
    if (addBtn) addBtn.addEventListener('click', () => {
      document.getElementById('optionModalTitle').textContent = 'Agregar opción';
      document.getElementById('optionForm').reset();
      document.querySelector('#optionForm [name=optionId]').value = '';
      modal.classList.add('open');
    });
    document.querySelectorAll('.edit-option-btn').forEach(b => b.addEventListener('click', () => {
      const settings = getSettings();
      const item = settings[settingsActiveTab].find(o => o.id === b.dataset.id);
      document.getElementById('optionModalTitle').textContent = 'Editar ' + (settingsActiveTab === 'financeAccess' ? 'correo' : 'opción');
      document.querySelector('#optionForm [name=optionId]').value = item.id;
      if (settingsActiveTab === 'financeAccess') {
        document.querySelector('#optionForm [name=email]').value = item.email || '';
      } else {
        document.querySelector('#optionForm [name=name]').value = item.name;
        document.querySelector('#optionForm [name=desc]').value = item.desc || '';
        if (settingsActiveTab === 'treatments') document.querySelector('#optionForm [name=price]').value = item.price || 0;
        if (settingsActiveTab === 'fixedCosts') {
          document.querySelector('#optionForm [name=amount]').value = item.amount || 0;
          document.querySelector('#optionForm [name=fixed]').checked = !!item.fixed;
        }
      }
      modal.classList.add('open');
    }));
    document.querySelectorAll('.toggle-option-btn').forEach(b => b.addEventListener('click', () => {
      toggleSettingOption(settingsActiveTab, b.dataset.id);
      showToast('Catálogo actualizado');
      router();
    }));
    document.querySelectorAll('.delete-option-btn').forEach(b => b.addEventListener('click', () => {
      const ok = confirm(`¿Eliminar "${b.dataset.name}"? Esta acción no se puede deshacer. Los registros que ya usaban esta opción conservarán el valor guardado, pero dejará de aparecer en los formularios.`);
      if (!ok) return;
      deleteSettingOption(settingsActiveTab, b.dataset.id);
      showToast('Opción eliminada');
      router();
    }));
    const cancelOpt = document.getElementById('cancelOptionModal');
    if (cancelOpt) cancelOpt.addEventListener('click', () => modal.classList.remove('open'));
    const optForm = document.getElementById('optionForm');
    if (optForm) optForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      let payload;
      if (settingsActiveTab === 'financeAccess') {
        payload = { email: (data.email || '').trim().toLowerCase(), name: data.email };
      } else {
        payload = { name: data.name, desc: data.desc };
        if (settingsActiveTab === 'treatments') payload.price = Number(data.price) || 0;
        if (settingsActiveTab === 'fixedCosts') { payload.amount = Number(data.amount) || 0; payload.fixed = data.fixed === 'on'; }
      }
      if (data.optionId) {
        updateSettingOption(settingsActiveTab, data.optionId, payload);
      } else {
        addSettingOption(settingsActiveTab, payload);
      }
      modal.classList.remove('open');
      showToast('Catálogo actualizado correctamente');
      router();
    });
  }
}

function openFollowUpModal() { document.getElementById('followUpModal').classList.add('open'); }
function closeFollowUpModal() { document.getElementById('followUpModal').classList.remove('open'); }
