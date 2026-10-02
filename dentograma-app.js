import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

'use strict';

/* ============================================================
   CONFIGURACIÓN DEL MODELO 3D
   ============================================================ */

// Pon aquí el nombre/ruta real de tu archivo .glb.
const MODEL_URL = './dientes-v1.glb';

const TOOTH_NAME_REGEX = /^t_(\d{2})$/;
const UPPER_GUM_NAME = 'teeth_upper_gum';
const LOWER_GUM_NAME = 'teeth_bottom_gum';

/* ============================================================
   UTILIDADES GENERALES
   ============================================================ */

const $ = (selector, root = document) => root.querySelector(selector);
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const reduce = !!(
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const p = (iso || '').split('-');
  if (p.length !== 3) return '';
  try {
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return iso;
  }
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/* ============================================================
   CATÁLOGO DE ESTADOS
   ============================================================ */

const STATES = {
  S: {
    name: 'Sano',
    color: '#F4EFE3',
    text: '#12303A',
    cat: 'ok',
    desc: 'Sin problemas visibles en la valoración.'
  },
  C: {
    name: 'Caries',
    color: '#D9483F',
    text: '#FFFFFF',
    cat: 'attn',
    desc: 'Hay una lesión en el diente que necesita tratamiento.'
  },
  F: {
    name: 'Fractura o desgaste',
    color: '#F08C2B',
    text: '#12303A',
    cat: 'attn',
    desc: 'El diente está roto, astillado o muy gastado.'
  },
  T: {
    name: 'Sarro (cálculo)',
    color: '#8A6A3B',
    text: '#FFFFFF',
    cat: 'attn',
    desc: 'Placa endurecida pegada al diente, sobre todo por detrás y cerca de la encía. No se quita cepillando: requiere limpieza profesional.'
  },
  O: {
    name: 'Obturación (empaste)',
    color: '#3A78D8',
    text: '#FFFFFF',
    cat: 'done',
    desc: 'Ya tiene un empaste.'
  },
  E: {
    name: 'Endodoncia',
    color: '#8B5CC8',
    text: '#FFFFFF',
    cat: 'done',
    desc: 'Ya tiene tratamiento de conducto.'
  },
  K: {
    name: 'Corona',
    color: '#DDAE3F',
    text: '#12303A',
    cat: 'done',
    desc: 'Tiene una corona que protege el diente.'
  },
  I: {
    name: 'Implante',
    color: '#a9a9aa',
    text: '#FFFFFF',
    cat: 'done',
    desc: 'Diente artificial sobre un implante.'
  },
  A: {
    name: 'Ausente',
    color: '#C9D3D1',
    text: '#12303A',
    cat: 'absent',
    desc: 'Falta este diente.'
  }
};

const KEYS = ['S', 'C', 'F', 'T', 'O', 'E', 'K', 'I', 'A'];

// Un diente puede combinar varias condiciones (p. ej. endodoncia + corona),
// salvo estas dos: un diente ausente o un implante no admite las demás.
const EXCLUSIVE_CODES = new Set(['A', 'I']);

/* ============================================================
   % DE SALUD ORAL
   ------------------------------------------------------------
   Es un indicador orientativo para el paciente, no un diagnóstico.
   Cómo se calcula:
   1) Cada diente tiene una "salud" entre 0 y 1 que sale de multiplicar
      (1 - peso) de cada condición que tenga. Los problemas SIN tratar
      pesan mucho; lo ya tratado pesa poco.
   2) Se promedian los dientes evaluados. Las muelas del juicio AUSENTES no
      se cuentan (mucha gente las pierde por anatomía; el índice CPOD de la
      OMS tampoco las incluye). Si están presentes sí se evalúan.
   3) Se aplica un castigo extra por "carga de enfermedad activa"
      (caries, fracturas, sarro): cada una baja el resultado de forma
      exponencial, para que unos pocos problemas sin tratar se noten.
   Ajusta estas constantes libremente.
   ============================================================ */

const HEALTH_WEIGHT = {
  S: 0,
  C: 0.90,  // Caries activa: la más grave, enfermedad sin tratar
  F: 0.65,  // Fractura/desgaste: riesgo estructural
  T: 0.30,  // Sarro: reversible con limpieza, pero inflama la encía
  A: 0.50,  // Ausente: pérdida funcional
  E: 0.20,  // Endodoncia: ya tratada, diente más frágil
  O: 0.12,  // Obturación: ya tratada, impacto bajo
  K: 0.10,  // Corona: diente protegido
  I: 0.12   // Implante: funcionalmente restaurado
};

// Carga de "enfermedad activa" (solo lo que aún necesita tratamiento).
const ACTIVE_LOAD = { C: 1, F: 0.7, T: 0.35 };
const MAX_ACTIVE_LOAD_PER_TOOTH = 1.3;
// Qué tan fuerte cae el % por cada unidad de carga activa (más alto = más severo).
const ACTIVE_SEVERITY = 0.15;

function isThirdMolar(number) {
  return Number(number) % 10 === 8;
}

function toothHealth(number) {
  let health = 1;
  condsOf(number).forEach(code => {
    health *= 1 - (HEALTH_WEIGHT[code] ?? 0);
  });
  return health;
}

function computeHealthDetails() {
  const considered = ALL.filter(n => !(isThirdMolar(n) && hasCond(n, 'A')));
  let sum = 0;
  let load = 0;

  considered.forEach(n => {
    sum += toothHealth(n);
    let toothLoad = 0;
    condsOf(n).forEach(code => { toothLoad += ACTIVE_LOAD[code] ?? 0; });
    load += Math.min(toothLoad, MAX_ACTIVE_LOAD_PER_TOOTH);
  });

  const base = considered.length ? sum / considered.length : 1;
  const factor = Math.exp(-ACTIVE_SEVERITY * load);
  const score = Math.min(100, Math.max(0, Math.round(base * factor * 100)));
  const band = score >= 85 ? 'good' : score >= 65 ? 'mid' : score >= 40 ? 'low' : 'crit';

  return { score, band, considered: considered.length, load };
}

function computeOralHealth() {
  return computeHealthDetails().score;
}

/* ============================================================
   DENTICIÓN / FDI
   ============================================================ */

// Orden visual del mapa cuando se mira al paciente de frente.
const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const ALL = UPPER.concat(LOWER);
const SORTED = ALL.slice().sort((a, b) => a - b);

const TYPE_NAMES = {
  1: 'incisivo central',
  2: 'incisivo lateral',
  3: 'canino',
  4: 'primer premolar',
  5: 'segundo premolar',
  6: 'primer molar',
  7: 'segundo molar',
  8: 'tercer molar (muela del juicio)'
};

function toothName(number) {
  const n = Number(number);
  const quadrant = Math.floor(n / 10);
  const type = n % 10;
  const arch = (quadrant === 1 || quadrant === 2) ? 'superior' : 'inferior';
  const side = (quadrant === 1 || quadrant === 4) ? 'derecho' : 'izquierdo';
  return `${cap(TYPE_NAMES[type] || 'diente')} ${arch} ${side}`;
}

function toothArch(number) {
  const n = Number(number);
  return (n >= 11 && n <= 28) ? 'upper' : 'lower';
}

// Tipo dental a partir del último dígito FDI:
// 1-3 = incisivos/canino (dientes "de al frente"), 4-8 = premolares/molares.
function toothIsAnterior(number) {
  const type = Number(number) % 10;
  return type >= 1 && type <= 3;
}

/* ============================================================
   DATOS DEL PACIENTE
   ============================================================ */

function demoData() {
  return {
    name: 'Paciente de ejemplo',
    date: todayISO(),
    general: 'Se recomienda tratar primero las caries y programar una limpieza.',
    s: {
      16: 'C',
      47: 'C',
      11: 'F',
      26: 'O',
      14: 'O',
      37: 'O',
      36: 'K',
      46: 'K',
      31: 'T',
      41: 'T',
      32: 'T',
      35: 'I',
      24: 'A',
      18: 'A',
      28: 'A',
      38: 'A',
      48: 'A'
    },
    // Condiciones anteriores de un mismo diente (la última va en "s").
    x: {
      36: 'E',  // endodoncia + corona
      16: 'T',  // sarro + caries
      26: 'T'   // sarro + obturación
    },
    t: {
      16: 'Tratar pronto',
      11: 'Borde roto por un golpe',
      47: 'Caries inicial'
    }
  };
}

let data = demoData();
let mode = 'patient';
let brush = 'C';
let sel = null;
let hover = null;

/* ============================================================
   CONDICIONES MÚLTIPLES POR DIENTE
   ------------------------------------------------------------
   data.s[n] = última condición marcada (la "principal", la que
               se dibuja en el modelo 3D y colorea el mapa).
   data.x[n] = texto con las condiciones anteriores (de la más
               vieja a la más nueva). Opcional.
   Todas cuentan para el % de salud; solo la última se dibuja
   (el sarro se dibuja siempre como capa extra, ver T).
   ============================================================ */

function condsOf(number) {
  const last = data.s[number];
  if (!last || last === 'S') return [];
  const earlier = (data.x && data.x[number]) ? String(data.x[number]).split('') : [];
  const list = [];
  earlier.concat(last).forEach(code => {
    if (!STATES[code] || code === 'S') return;
    const at = list.indexOf(code);
    if (at >= 0) list.splice(at, 1);
    list.push(code);
  });
  return list;
}

function setConds(number, codes) {
  const clean = [];
  codes.forEach(code => {
    if (!STATES[code] || code === 'S') return;
    const at = clean.indexOf(code);
    if (at >= 0) clean.splice(at, 1);
    clean.push(code);
  });

  if (!data.x) data.x = {};
  if (!clean.length) {
    delete data.s[number];
    delete data.x[number];
    return;
  }
  data.s[number] = clean[clean.length - 1];
  const earlier = clean.slice(0, -1).join('');
  if (earlier) data.x[number] = earlier;
  else delete data.x[number];
}

function hasCond(number, code) {
  return condsOf(number).includes(code);
}

// Estado que se dibuja: la última condición que no sea sarro (el sarro es
// una capa aparte). Si solo hay sarro, el estado visible es 'T'.
function visualState(number) {
  const list = condsOf(number);
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] !== 'T') return list[i];
  }
  return list.length ? 'T' : 'S';
}

function needsAttention(number) {
  return condsOf(number).some(code => STATES[code].cat === 'attn');
}

// "Corona + Endodoncia" (la más reciente primero) o "Sano".
function conditionLabel(number) {
  const list = condsOf(number);
  if (!list.length) return STATES.S.name;
  return list.slice().reverse().map(code => STATES[code].name).join(' + ');
}

function decodeBase64Unicode(value) {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decode(b64) {
  try {
    const object = JSON.parse(decodeBase64Unicode(b64));
    if (!object || typeof object.s !== 'string' || object.s.length !== 32) return null;

    const s = {};
    ALL.forEach((n, i) => {
      const code = object.s[i];
      if (STATES[code] && code !== 'S') s[n] = code;
    });

    // Condiciones adicionales por diente (opcional; los enlaces antiguos no lo traen).
    const x = {};
    if (object.x && typeof object.x === 'object') {
      ALL.forEach(n => {
        const raw = object.x[n];
        if (typeof raw !== 'string' || !s[n] || EXCLUSIVE_CODES.has(s[n])) return;
        const codes = raw.split('').filter(c => STATES[c] && c !== 'S' && !EXCLUSIVE_CODES.has(c));
        if (codes.length) x[n] = codes.join('');
      });
    }

    return {
      name: String(object.n || ''),
      date: String(object.d || ''),
      general: String(object.g || ''),
      s,
      x,
      t: (object.t && typeof object.t === 'object') ? object.t : {}
    };
  } catch {
    return null;
  }
}

/* ============================================================
   PERSISTENCIA: patients.dental_map (Supabase)
   ------------------------------------------------------------
   Este dentograma vive embebido como iframe de DentalManager y recibe
   el paciente por la URL (?patient=<id>&name=<nombre>). Los cambios se
   reflejan de inmediato en pantalla (save()) pero solo se guardan en la
   base de datos cuando el personal toca "Guardar cambios" dos veces
   (ver bindUI → btnSave), para evitar escrituras accidentales.
   ============================================================ */
const URL_PARAMS = new URLSearchParams(location.search);
const PATIENT_ID = URL_PARAMS.get('patient');
const PATIENT_NAME_HINT = URL_PARAMS.get('name') || '';

function emptyPatientData(prefillName) {
  return { name: prefillName || '', date: todayISO(), general: '', s: {}, x: {}, t: {} };
}

// Actualiza la vista en vivo. El guardado real ocurre solo al confirmar
// "Guardar cambios" (persistToSupabase), no en cada edición.
function save() {
  render();
}

async function loadInitial() {
  if (!PATIENT_ID || !window.supabaseClient) {
    data = PATIENT_ID ? emptyPatientData(PATIENT_NAME_HINT) : demoData();
    return 'patient';
  }
  try {
    const { data: row, error } = await window.supabaseClient
      .from('patients')
      .select('full_name, dental_map')
      .eq('id', PATIENT_ID)
      .single();
    if (error) throw error;
    const map = row && row.dental_map;
    if (map && map.s) {
      data = {
        name: map.name || row.full_name || PATIENT_NAME_HINT || '',
        date: map.date || todayISO(),
        general: map.general || '',
        s: map.s || {},
        x: map.x || {},
        t: map.t || {}
      };
    } else {
      data = emptyPatientData((row && row.full_name) || PATIENT_NAME_HINT);
    }
  } catch (err) {
    console.error('No se pudo cargar el dentograma del paciente:', err);
    data = emptyPatientData(PATIENT_NAME_HINT);
  }
  return 'patient';
}

async function persistToSupabase() {
  // 1. Verificación explícita de variables globales
  if (!PATIENT_ID) {
    console.error('Error al guardar: PATIENT_ID no está definido o es nulo.');
    return { ok: false, reason: 'missing_patient_id' };
  }
  if (!window.supabaseClient) {
    console.error('Error al guardar: window.supabaseClient no está disponible.');
    return { ok: false, reason: 'missing_supabase_client' };
  }

  const payload = {
    name: data.name,
    date: data.date,
    general: data.general,
    s: data.s,
    x: data.x,
    t: data.t
  };

  try {
    // 2. Ejecutar actualización con .select() para confirmar respuesta
    const { data: updatedRows, error } = await window.supabaseClient
      .from('patients')
      .update({ dental_map: payload })
      .eq('id', PATIENT_ID)
      .select();

    if (error) {
      console.error('Error devuelto por Supabase:', error.message, error.details, error.hint);
      throw error;
    }

    // 3. Si no devolvió filas, las políticas RLS de Supabase bloquearon el UPDATE
    if (!updatedRows || updatedRows.length === 0) {
      console.warn('Atención: La consulta fue exitosa pero 0 filas fueron actualizadas. Revisa los permisos RLS en Supabase.');
      return { ok: false, reason: 'no_rows_updated' };
    }

    console.log('Dentograma actualizado correctamente:', updatedRows);
    return { ok: true };
  } catch (err) {
    console.error('Excepción atrapada al guardar el dentograma:', err);
    return { ok: false, error: err };
  }
}

/* ============================================================
   DOM
   ============================================================ */

const canvas = $('#gl');
const stage = $('#stage');
const selectedToothLabel = $('#selected-tooth');
const tip = $('#tip');

/* ============================================================
   ESCENA 3D
   ============================================================ */

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
camera.position.set(0, 50, 250);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.setSize(Math.max(stage.clientWidth, 1), Math.max(stage.clientHeight, 1), false);

const controls = new OrbitControls(camera, renderer.domElement);
let lastInteraction = performance.now();
controls.addEventListener('start', () => {
  lastInteraction = performance.now();
  view.animating = false;
});
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.8;
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;
controls.target.set(0, 0, 0);

// Luces para conservar la apariencia PBR del GLB.
scene.add(new THREE.HemisphereLight(0xffffff, 0x3f585a, 1.25));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
keyLight.position.set(80, 120, 100);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xd8eff2, 0.65);
fillLight.position.set(-100, 10, -70);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
rimLight.position.set(0, -100, 40);
scene.add(rimLight);

/* ============================================================
   CARGA DEL GLB
   ============================================================ */

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let modelScene = null;
let modelReady = false;
let modelStateDirty = true;
let upperGums = [];
let lowerGums = [];
let modelCenter = new THREE.Vector3();
let modelRadius = 100;

// FDI -> objeto raíz t_XX.
const toothObjects = new Map();
// Meshes pertenecientes a dientes, usados exclusivamente para raycasting.
const toothPickMeshes = [];

const view = {
  mode: 'both',
  animating: false,
  desiredPosition: new THREE.Vector3(),
  desiredTarget: new THREE.Vector3(),
  fitDistance: 250
};

function isToothNodeName(name) {
  return TOOTH_NAME_REGEX.test(name || '');
}

function findToothRoot(object) {
  let current = object;
  while (current && current !== modelScene) {
    if (isToothNodeName(current.name)) return current;
    current = current.parent;
  }
  return null;
}

// Convierte un material clonado a MeshPhysicalMaterial (si no lo era ya),
// conservando color/mapas/roughness/metalness. Physical nos da acceso a
// transmission (translucidez real) y clearcoat (brillo de porcelana),
// que MeshStandardMaterial no tiene.
function upgradeToPhysical(material) {
  if (material.isMeshPhysicalMaterial) return material;
  const physical = new THREE.MeshPhysicalMaterial({
    color: material.color ? material.color.clone() : 0xffffff,
    map: material.map || null,
    normalMap: material.normalMap || null,
    roughness: typeof material.roughness === 'number' ? material.roughness : 0.4,
    metalness: typeof material.metalness === 'number' ? material.metalness : 0,
    transparent: !!material.transparent,
    opacity: typeof material.opacity === 'number' ? material.opacity : 1,
    side: material.side,
    name: material.name
  });
  material.dispose();
  return physical;
}

function collectMeshMaterials(object) {
  if (!object.isMesh) return;

  if (Array.isArray(object.material)) {
    object.material = object.material.map(material => material ? upgradeToPhysical(material.clone()) : material);
  } else if (object.material) {
    object.material = upgradeToPhysical(object.material.clone());
  }

  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];

  materials.forEach(material => {
    if (!material) return;
    if (!material.userData.dentOriginal) {
      material.userData.dentOriginal = {
        color: material.color ? material.color.clone() : null,
        emissive: material.emissive ? material.emissive.clone() : null,
        emissiveIntensity: typeof material.emissiveIntensity === 'number' ? material.emissiveIntensity : 1,
        transparent: !!material.transparent,
        opacity: typeof material.opacity === 'number' ? material.opacity : 1,
        depthWrite: material.depthWrite,
        wireframe: 'wireframe' in material ? !!material.wireframe : undefined,
        metalness: typeof material.metalness === 'number' ? material.metalness : undefined,
        roughness: typeof material.roughness === 'number' ? material.roughness : undefined,
        transmission: typeof material.transmission === 'number' ? material.transmission : 0,
        thickness: typeof material.thickness === 'number' ? material.thickness : 0,
        ior: typeof material.ior === 'number' ? material.ior : 1.5,
        clearcoat: typeof material.clearcoat === 'number' ? material.clearcoat : 0,
        clearcoatRoughness: typeof material.clearcoatRoughness === 'number' ? material.clearcoatRoughness : 0
      };
    }
  });
}

function registerModelObjects(root) {
  toothObjects.clear();
  archCenters = null;
  toothPickMeshes.length = 0;
  upperGums = [];
  lowerGums = [];

  root.traverse(object => {
    const objectName = (object.name || '').toLowerCase();
    if (objectName === UPPER_GUM_NAME.toLowerCase() || objectName.startsWith(`${UPPER_GUM_NAME.toLowerCase()}.`)) upperGums.push(object);
    if (objectName === LOWER_GUM_NAME.toLowerCase() || objectName.startsWith(`${LOWER_GUM_NAME.toLowerCase()}.`)) lowerGums.push(object);

    if (isToothNodeName(object.name)) {
      const number = Number(object.name.slice(2));
      if (ALL.includes(number)) toothObjects.set(number, object);
    }
  });

  // Clonar materiales después de localizar los dientes para que cada pieza
  // pueda pintarse de forma independiente sin alterar otros dientes/encías.
  root.traverse(object => {
    if (object.isMesh) {
      collectMeshMaterials(object);
    }
  });

  toothObjects.forEach(object => {
    object.traverse(child => {
      if (child.isMesh) toothPickMeshes.push(child);
    });
  });

  console.log(`Dientes detectados: ${toothObjects.size}/32`);
  console.log(`${UPPER_GUM_NAME}:`, upperGums.length ? `${upperGums.length} objeto(s) detectado(s)` : 'NO detectada');
  console.log(`${LOWER_GUM_NAME}:`, lowerGums.length ? `${lowerGums.length} objeto(s) detectado(s)` : 'NO detectada');

  const missing = ALL.filter(number => !toothObjects.has(number));
  if (missing.length) console.warn('Dientes FDI no encontrados:', missing.join(', '));
}

function centerAndMeasureModel(root) {
  const before = new THREE.Box3().setFromObject(root);
  const center = before.getCenter(new THREE.Vector3());

  root.position.sub(center);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());

  modelCenter.copy(box.getCenter(new THREE.Vector3()));
  modelRadius = Math.max(sphere.radius, 1);

  // El valor base para ambas arcadas deja margen alrededor del modelo.
  view.fitDistance = modelRadius * 2.15;

  camera.near = Math.max(0.01, modelRadius / 100);
  camera.far = Math.max(1000, modelRadius * 30);
  camera.updateProjectionMatrix();
}

function loadModel() {
  gltfLoader.load(
    MODEL_URL,
    gltf => {
      modelScene = gltf.scene;
      registerModelObjects(modelScene);
      centerAndMeasureModel(modelScene);
      scene.add(modelScene);
      modelReady = true;
      modelStateDirty = true;

      setArcVisibility('both');
      setView('both', true);
      applyModelStates();
      render();

      console.log('Modelo 3D cargado correctamente:', MODEL_URL);
    },
    xhr => {
      if (xhr.total) {
        console.log(`Cargando modelo 3D: ${(xhr.loaded / xhr.total * 100).toFixed(1)}%`);
      }
    },
    error => {
      console.error('Error al cargar el modelo 3D:', error);
      const fallback = $('#nogl');
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = `No se pudo cargar el modelo 3D (${MODEL_URL}). Revisa el nombre del archivo y abre la aplicación desde un servidor local.`;
      }
      const viewSeg = $('#viewSeg');
      if (viewSeg) viewSeg.hidden = true;
    }
  );
}

/* ============================================================
   MATERIAL / ESTADOS VISUALES AVANZADOS
   ============================================================ */

function forEachToothMaterial(number, callback) {
  const tooth = toothObjects.get(Number(number));
  if (!tooth) return;

  tooth.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (material) callback(material, object);
    });
  });
}

function restoreOriginalMaterial(material) {
  const original = material.userData?.dentOriginal;
  if (!original) return;

  if (material.color && original.color) material.color.copy(original.color);
  if (material.emissive && original.emissive) material.emissive.copy(original.emissive);
  if ('emissiveIntensity' in material) material.emissiveIntensity = original.emissiveIntensity;
  material.transparent = original.transparent;
  material.opacity = original.opacity;
  material.depthWrite = original.depthWrite;
  if ('wireframe' in material && original.wireframe != null) material.wireframe = original.wireframe;
  if ('metalness' in material && original.metalness != null) material.metalness = original.metalness;
  if ('roughness' in material && original.roughness != null) material.roughness = original.roughness;
  if ('transmission' in material) material.transmission = original.transmission || 0;
  if ('thickness' in material) material.thickness = original.thickness || 0;
  if ('ior' in material) material.ior = original.ior || 1.5;
  if ('clearcoat' in material) material.clearcoat = original.clearcoat || 0;
  if ('clearcoatRoughness' in material) material.clearcoatRoughness = original.clearcoatRoughness || 0;
  if ('envMap' in material) { material.envMap = null; material.envMapIntensity = 1; }
  material.needsUpdate = true;
}

function tintMaterial(material, hex, strength) {
  if (!material.color) return;
  const original = material.userData?.dentOriginal;
  if (!original?.color) return;
  const color = new THREE.Color(hex);
  material.color.copy(original.color).lerp(color, strength);
}

function getLocalToothBounds(tooth) {
  const box = new THREE.Box3();
  const worldPoint = new THREE.Vector3();
  const localPoint = new THREE.Vector3();
  const geometryBox = new THREE.Box3();

  tooth.updateWorldMatrix(true, true);
  const rootInverseReady = tooth.matrixWorld.clone().invert();

  tooth.traverse(object => {
    if (object.userData?.isConditionOverlay || object.parent?.userData?.isConditionOverlay) return;
    if (!object.isMesh || !object.geometry) return;
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    geometryBox.copy(object.geometry.boundingBox);

    const corners = [
      new THREE.Vector3(geometryBox.min.x, geometryBox.min.y, geometryBox.min.z),
      new THREE.Vector3(geometryBox.min.x, geometryBox.min.y, geometryBox.max.z),
      new THREE.Vector3(geometryBox.min.x, geometryBox.max.y, geometryBox.min.z),
      new THREE.Vector3(geometryBox.min.x, geometryBox.max.y, geometryBox.max.z),
      new THREE.Vector3(geometryBox.max.x, geometryBox.min.y, geometryBox.min.z),
      new THREE.Vector3(geometryBox.max.x, geometryBox.min.y, geometryBox.max.z),
      new THREE.Vector3(geometryBox.max.x, geometryBox.max.y, geometryBox.min.z),
      new THREE.Vector3(geometryBox.max.x, geometryBox.max.y, geometryBox.max.z)
    ];

    corners.forEach(corner => {
      worldPoint.copy(corner).applyMatrix4(object.matrixWorld);
      localPoint.copy(worldPoint).applyMatrix4(rootInverseReady);
      box.expandByPoint(localPoint);
    });
  });

  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  }

  return {
    min: box.min.clone(),
    max: box.max.clone(),
    size: box.getSize(new THREE.Vector3()),
    center: box.getCenter(new THREE.Vector3())
  };
}

function createOverlayGroup(tooth) {
  if (tooth.userData.advancedOverlay) {
    tooth.remove(tooth.userData.advancedOverlay);
    disposeObject3D(tooth.userData.advancedOverlay);
  }

  const group = new THREE.Group();
  group.name = 'dentograma_condition_overlay';
  group.userData.isConditionOverlay = true;
  tooth.add(group);
  tooth.userData.advancedOverlay = group;
  return group;
}

function disposeObject3D(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse(child => {
    if (!child.isMesh && !child.isLine && !child.isPoints) return;
    if (child.geometry) geometries.add(child.geometry);
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(material => { if (material) materials.add(material); });
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

// Sin mapa de entorno, un material con metalness alto solo refleja negro.
// Se genera una sola vez y se asigna ÚNICAMENTE a materiales metálicos, para
// no cambiar la iluminación del resto de la escena.
let metalEnvMap = null;
function getMetalEnvMap() {
  if (!metalEnvMap) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    metalEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return metalEnvMap;
}

function makeConditionMaterial(options) {
  const metalness = options.metalness ?? 0;
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.6,
    metalness,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    depthTest: true,
    side: options.side ?? THREE.FrontSide
  });
  if (metalness > 0.3) {
    material.envMap = getMetalEnvMap();
    material.envMapIntensity = options.envMapIntensity ?? 1.2;
  }
  return material;
}

function getBoundsCorners(bounds) {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
}

function getAxisRange(bounds, axis) {
  const center = bounds.center;
  let min = Infinity;
  let max = -Infinity;

  for (const corner of getBoundsCorners(bounds)) {
    const value = corner.clone().sub(center).dot(axis);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return { min, max, size: Math.max(max - min, 0.01) };
}

// ------------------------------------------------------------------
// DIAGNÓSTICO DEL BUG "todo queda desubicado":
// getLocalToothBounds() ya devuelve bounds en el espacio LOCAL del propio
// t_XX (deshace la rotación y la traslación que lo ubican en el arco).
// El código anterior, sin embargo, calculaba crownDir mirando hacia dónde
// queda el CENTRO DE TODO EL MODELO desde cada diente, en espacio MUNDO,
// y luego lo rotaba a local. Eso solo da un resultado razonable para los
// incisivos centrales; para cualquier diente hacia los lados o hacia atrás,
// "la dirección hacia el centro de la boca" NO es "hacia la corona" —  es
// más bien "hacia adentro del arco", casi perpendicular al eje real del
// diente. Por eso los tornillos, las caries, etc. salían disparados hacia
// un lado en vez de hundirse en la encía: estaban usando un eje
// prácticamente arbitrario para cada diente que no fuera el frontal.
//
// LA CORRECCIÓN: un set de dientes modelado como el tuyo (t_11..t_48, cada
// uno modelado "de pie" y luego solo rotado/trasladado para ubicarlo en el
// arco) tiene un eje corona-raíz CONSTANTE en espacio local — no depende
// de en qué diente estés ni de dónde quede en la boca. No hace falta (ni
// conviene) inferirlo desde el mundo: basta usar el mismo eje local fijo
// para los 32 dientes, y dejar que la rotación propia de cada nodo t_XX
// (ya incluida en bounds/matrixWorld) sea la que lo oriente correctamente
// dentro del arco.
// ------------------------------------------------------------------

// Si al probar ves las piezas (tornillo, caries, margen de corona...)
// apuntando al revés o hacia el lado equivocado, el ajuste es SOLO
// cambiar estos dos ejes — no hay que tocar nada más del sistema.
// Por defecto: +Y local = hacia la corona/cara oclusal, +Z local = hacia
// la cara frontal (labial/bucal). Si tu convención en Blender fue otra
// (p. ej. +Z = corona), intercambia los vectores de abajo.
const TOOTH_LOCAL_CROWN_AXIS = new THREE.Vector3(0, 1, 0);
const TOOTH_LOCAL_FRONT_AXIS = new THREE.Vector3(0, 0, 1);

// ==========================================
// Funciones Auxiliares de Orientación y Vectores
// ==========================================

function orientYAxisTo(direction) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
}

function orientXAxisTo(direction) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction.clone().normalize()
  );
}

// Centroide (en MUNDO) de cada arcada, calculado una sola vez tras cargar el modelo.
let archCenters = null;

function getArchCenterWorld(arch) {
  if (!archCenters) {
    archCenters = {};
    ['upper', 'lower'].forEach(name => {
      const sum = new THREE.Vector3();
      let count = 0;
      (name === 'upper' ? UPPER : LOWER).forEach(number => {
        const t = toothObjects.get(number);
        if (!t) return;
        // Bounds LOCALES (ignoran overlays) -> centro -> mundo.
        const b = getLocalToothBounds(t);
        sum.add(b.center.clone().applyMatrix4(t.matrixWorld));
        count++;
      });
      archCenters[name] = count ? sum.divideScalar(count) : new THREE.Vector3();
    });
  }
  return archCenters[arch];
}

// IMPORTANTE: todo lo que devuelve esta función está en el espacio LOCAL
// del nodo t_XX, porque los overlays se agregan como hijos de ese nodo
// (tooth.add(group)). Las direcciones "anatómicas" se definen en MUNDO
// (la corona del superior apunta hacia abajo, la del inferior hacia arriba,
// el frente es radial desde el centro de la arcada) y luego se convierten a
// local con la inversa de matrixWorld. Así no importa cómo exportó Blender
// la rotación/escala/traslación de cada diente.
function getToothOrientation(tooth, localBounds) {
  const bounds = localBounds || getLocalToothBounds(tooth);
  const center = bounds.center.clone();
  const size = bounds.size.clone();

  tooth.updateWorldMatrix(true, false);
  const number = Number(tooth.name.slice(2));
  const arch = toothArch(number);

  // 1. Direcciones en MUNDO
  const crownWorld = new THREE.Vector3(0, arch === 'upper' ? -1 : 1, 0);
  const centerWorld = center.clone().applyMatrix4(tooth.matrixWorld);
  const frontWorld = centerWorld.clone().sub(getArchCenterWorld(arch));
  frontWorld.y = 0;
  if (frontWorld.lengthSq() < 1e-8) frontWorld.set(0, 0, 1);
  frontWorld.normalize();

  // 2. Mundo -> local del diente
  const inv = tooth.matrixWorld.clone().invert();
  const crownDir = crownWorld.transformDirection(inv);
  const frontDir = frontWorld.transformDirection(inv);
  frontDir.addScaledVector(crownDir, -frontDir.dot(crownDir)).normalize();
  const sideDir = new THREE.Vector3().crossVectors(crownDir, frontDir).normalize();

  const rootDir = crownDir.clone().negate();
  const backDir = frontDir.clone().negate();

  return {
    bounds,
    center,
    size,
    crownDir,
    rootDir,
    frontDir,
    backDir,
    sideDir,
    crownRange: getAxisRange(bounds, crownDir),
    frontRange: getAxisRange(bounds, frontDir),
    sideRange: getAxisRange(bounds, sideDir)
  };
}

// ------------------------------------------------------------------
// ANCLAJE A LA SUPERFICIE REAL
// Antes, las lesiones se ubicaban con la CAJA envolvente (AABB) del diente:
// como un diente no es una caja, quedaban separadas de la superficie. Ahora
// se lanza un rayo contra la malla real y se ajusta ("shrink-wrap") cada
// marca a ella. Todo ocurre en el espacio LOCAL del diente.
// ------------------------------------------------------------------
function isInsideOverlay(object, tooth) {
  let p = object;
  while (p && p !== tooth) {
    if (p.userData?.isConditionOverlay) return true;
    p = p.parent;
  }
  return false;
}

// Reúne solo los triángulos cercanos al eje (anchor, dir) para que cada rayo
// pruebe cientos de triángulos y no los ~20k del diente completo.
function createSurfaceSampler(tooth, anchor, dir, lateralRadius) {
  try {
    tooth.updateWorldMatrix(true, true);
    const toothInv = tooth.matrixWorld.clone().invert();
    const toLocal = new THREE.Matrix4();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const rel = new THREE.Vector3();
    const r2 = lateralRadius * lateralRadius;
    const kept = [];

    tooth.traverse(obj => {
      if (!obj.isMesh || !obj.geometry || isInsideOverlay(obj, tooth)) return;
      const pos = obj.geometry.attributes.position;
      const index = obj.geometry.index;
      if (!pos) return;
      toLocal.multiplyMatrices(toothInv, obj.matrixWorld);
      const triCount = (index ? index.count : pos.count) / 3;
      const vi = i => (index ? index.getX(i) : i);
      for (let t = 0; t < triCount; t++) {
        a.fromBufferAttribute(pos, vi(t * 3)).applyMatrix4(toLocal);
        b.fromBufferAttribute(pos, vi(t * 3 + 1)).applyMatrix4(toLocal);
        c.fromBufferAttribute(pos, vi(t * 3 + 2)).applyMatrix4(toLocal);
        rel.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(anchor);
        rel.addScaledVector(dir, -rel.dot(dir));
        if (rel.lengthSq() <= r2) {
          kept.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        }
      }
    });
    if (!kept.length) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    geometry.computeBoundingSphere();
    const proxy = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    proxy.updateMatrixWorld(true);

    const unit = dir.clone().normalize();
    const down = unit.clone().negate();
    const reach = geometry.boundingSphere.radius * 2 + 1;
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3();

    return {
      dir: unit,
      sample(point) {
        origin.copy(point).addScaledVector(unit, reach);
        raycaster.set(origin, down);
        const hits = raycaster.intersectObject(proxy, false);
        if (!hits.length) return null;
        const normal = hits[0].face.normal.clone().normalize();
        if (normal.dot(unit) < 0) normal.negate();
        return { point: hits[0].point.clone(), normal };
      },
      // Rayo libre (origen y dirección arbitrarios), normal hacia el origen.
      cast(from, direction) {
        const d = direction.clone().normalize();
        raycaster.set(from, d);
        const hits = raycaster.intersectObject(proxy, false);
        if (!hits.length) return null;
        const normal = hits[0].face.normal.clone().normalize();
        if (normal.dot(d) > 0) normal.negate();
        return { point: hits[0].point.clone(), normal };
      },
      dispose() { geometry.dispose(); proxy.material.dispose(); }
    };
  } catch (error) {
    console.warn('No se pudo crear el muestreador de superficie:', error);
    return null;
  }
}

// Pega una malla sobre la superficie: cada vértice se proyecta al diente y
// conserva su altura relativa (lo que queda "debajo" del plano queda enterrado).
// Los vértices que NO tocan el diente (borde de la silueta, p. ej. en caninos)
// o que caen en una zona muy distinta (> maxDeviation de altura) se colapsan
// sobre el punto de anclaje (fallback), en vez de quedarse flotando y estirar
// la malla como un "palito".
function conformMeshToSurface(mesh, sampler, dir, lift, maxDeviation, fallback) {
  if (!sampler) return;
  mesh.updateMatrix();
  const m = mesh.matrix.clone();
  const inv = m.clone().invert();
  const base = mesh.position.clone();
  const ref = base.dot(dir);
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  const rel = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    const h = rel.copy(v).sub(base).dot(dir);
    let hit = sampler.sample(v);
    if (hit && maxDeviation != null && Math.abs(hit.point.dot(dir) - ref) > maxDeviation) hit = null;
    if (!hit) hit = fallback;
    if (!hit) continue;
    v.copy(hit.point).addScaledVector(hit.normal, h + lift).applyMatrix4(inv);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

// Elige, entre varios puntos candidatos, el primero que cae sobre una zona
// "sólida" del diente: el centro y 4 puntos de prueba alrededor tocan la malla
// a una altura parecida. Evita anclar una lesión en el borde puntiagudo de un
// canino, donde la silueta es angosta. Devuelve { hit, guess } o null.
function pickSurfaceAnchor(sampler, candidates, tangents, probe, maxDeviation) {
  if (!sampler) return null;
  const dir = sampler.dir;
  let firstValid = null;
  for (const candidate of candidates) {
    const center = sampler.sample(candidate);
    if (!center) continue;
    if (!firstValid) firstValid = { hit: center, guess: candidate };
    const ref = center.point.dot(dir);
    let solid = true;
    for (const tangent of tangents) {
      for (const sign of [1, -1]) {
        const probePoint = candidate.clone().addScaledVector(tangent, sign * probe);
        const h = sampler.sample(probePoint);
        if (!h || Math.abs(h.point.dot(dir) - ref) > maxDeviation) { solid = false; break; }
      }
      if (!solid) break;
    }
    if (solid) return { hit: center, guess: candidate };
  }
  return firstValid;
}

function getExactSurfacePoint(tooth, direction, center, offsetDistance = 20) {
  const rayOrigin = center.clone().addScaledVector(direction, offsetDistance);
  const rayDirection = direction.clone().negate();

  const raycaster = new THREE.Raycaster(rayOrigin, rayDirection);
  const intersects = raycaster.intersectObject(tooth, true);

  if (intersects.length > 0) {
    return {
      point: intersects[0].point,
      normal: intersects[0].face.normal
    };
  }

  return {
    point: center.clone().addScaledVector(direction, 2),
    normal: direction.clone()
  };
}

function pointOnToothSurface(orientation, crownDistance, frontDistance = 0, sideDistance = 0) {
  return orientation.center.clone()
    .addScaledVector(orientation.crownDir, crownDistance)
    .addScaledVector(orientation.frontDir, frontDistance)
    .addScaledVector(orientation.sideDir, sideDistance);
}
/**
 * CARIES — cráter irregular con centro oscuro rugoso y borde desmineralizado.
 * - Premolares/molares (posteriores): el cráter va en la cara OCLUSAL
 *   (la mesa de masticación, en la punta de crownDir).
 * - Incisivos/canino (anteriores): el cráter va en una ESQUINA del borde
 *   incisal/frontal, que es donde clínicamente suele iniciar en estos
 *   dientes, en vez de "flotar" sobre una cara plana que no existe ahí.
 * Además esta función tiñe todo el diente de un tono amarillento para que
 * la lesión se note desde lejos, no solo de cerca.
 */
function addCariesOverlay(overlay, bounds, orientation, number) {
  const tooth = overlay.parent;
  const anterior = toothIsAnterior(number);
  const crown = orientation.crownRange.max;
  const span = orientation.crownRange.size;
  const sideSize = orientation.sideRange.size;
  const frontSize = orientation.frontRange.size;
  const frontMax = orientation.frontRange.max;

  const radius = anterior
    ? Math.max(0.018, Math.min(sideSize, frontSize) * 0.13)
    : Math.max(0.02, Math.min(sideSize, frontSize) * 0.19);
  const lift = Math.max(radius * 0.03, 0.004);
  const anchorDir = anterior ? orientation.frontDir : orientation.crownDir;

  // Candidatos de anclaje (de más a menos "esquinero"). Si el primero cae en
  // una zona angosta del diente (p. ej. la punta de un canino), se usa el
  // siguiente, más cercano al centro de la cara.
  const at = anterior
    ? (c, s) => pointOnToothSurface(orientation, crown - span * c, frontMax, sideSize * s)
    : (c, s) => pointOnToothSurface(orientation, crown, 0, sideSize * s);
  const candidates = anterior
    ? [[0.06, 0.26], [0.12, 0.18], [0.2, 0.1], [0.3, 0]].map(([c, s]) => at(c, s))
    : [-0.08, 0, 0.1].map(s => at(0, s));
  const tangents = anterior
    ? [orientation.crownDir, orientation.sideDir]
    : [orientation.frontDir, orientation.sideDir];

  const sampler = createSurfaceSampler(
    tooth,
    candidates[candidates.length - 1],
    anchorDir,
    Math.max(sideSize, anterior ? span : frontSize) * 0.8
  );
  const picked = pickSurfaceAnchor(sampler, candidates, tangents, radius * 0.7, radius * 1.0);
  const hit = picked ? picked.hit : null;
  const anchor = hit ? hit.point : candidates[0];
  const maxDev = radius * 1.2;

  const cavityMaterial = makeConditionMaterial({
    color: 0x2a1a12,
    roughness: 1.0
  });

  // Cráter oscuro, aplastado y proyectado sobre el esmalte.
  const crater = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), cavityMaterial);
  crater.scale.set(
    radius * (anterior ? 0.95 : 1.25),
    Math.max(radius * (anterior ? 0.4 : 0.28), 0.012),
    radius * (anterior ? 0.8 : 0.98)
  );
  crater.quaternion.copy(orientYAxisTo(anchorDir));
  crater.position.copy(anchor);
  conformMeshToSurface(crater, sampler, anchorDir, lift, maxDev, hit);
  overlay.add(crater);

  // Segunda lesión más pequeña: solo si cae sobre una zona válida.
  if (hit) {
    const sign = anterior ? -1 : 1;
    for (const factor of [1, 0.5]) {
      const guess2 = anchor.clone().addScaledVector(orientation.sideDir, sign * sideSize * 0.16 * factor);
      const hit2 = sampler.sample(guess2);
      if (!hit2 || Math.abs(hit2.point.dot(anchorDir) - hit.point.dot(anchorDir)) > maxDev) continue;
      const secondary = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), cavityMaterial);
      secondary.scale.set(radius * 0.45, Math.max(radius * 0.16, 0.01), radius * 0.32);
      secondary.quaternion.copy(orientYAxisTo(anchorDir));
      secondary.position.copy(hit2.point);
      conformMeshToSurface(secondary, sampler, anchorDir, lift, maxDev, hit2);
      overlay.add(secondary);
      break;
    }
  }

  if (sampler) sampler.dispose();

  // Tinte amarillento en todo el diente.
  tintMaterialOnTooth(number, 0xC9A227, 0.26);
}

/**
 * OBTURACIÓN — inlay metálico (amalgama) bien delimitado, "incrustado" en
 * la cara oclusal: una muesca oscura hace de pared de la cavidad y el
 * relleno metálico facetado se asienta dentro de ella, en vez de flotar
 * encima como una pastilla pegada.
 *
 * Para una resina fotocurada (color diente, acabado satinado) en vez de
 * amalgama, solo hay que cambiar FILLING_STYLE a 'resin'.
 */
const FILLING_STYLE = 'amalgam'; // 'amalgam' | 'resin'

function addFillingOverlay(overlay, bounds, orientation) {
  const tooth = overlay.parent;
  const crown = orientation.crownRange.max;
  const sideSize = orientation.sideRange.size;
  const frontSize = orientation.frontRange.size;
  const radius = Math.max(0.025, Math.min(sideSize, frontSize) * 0.24);
  const thickness = Math.max(0.03, Math.min(sideSize, frontSize) * 0.05);
  const dir = orientation.crownDir;
  const lift = Math.max(radius * 0.02, 0.004);
  const maxDev = radius * 1.2;

  const isAmalgam = FILLING_STYLE === 'amalgam';
  const fillColor = isAmalgam ? 0xb4bec4 : 0xEFE2C8;
  const fillRoughness = isAmalgam ? 0.3 : 0.42;
  const fillMetalness = isAmalgam ? 0.85 : 0.02;

  const candidates = [-0.03, 0, 0.1].map(s => pointOnToothSurface(orientation, crown, 0, sideSize * s));
  const sampler = createSurfaceSampler(
    tooth,
    candidates[1],
    dir,
    Math.max(sideSize, frontSize) * 0.8
  );
  const picked = pickSurfaceAnchor(
    sampler,
    candidates,
    [orientation.frontDir, orientation.sideDir],
    radius * 0.8,
    radius * 1.0
  );
  const hit = picked ? picked.hit : null;
  const anchor = hit ? hit.point : candidates[0];

  // Pared de la cavidad: muesca oscura un poco más ancha que el relleno.
  const cavityMaterial = makeConditionMaterial({ color: 0x2b2f31, roughness: 0.95 });
  const cavityWall = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), cavityMaterial);
  cavityWall.scale.set(radius * 1.12, thickness * 1.2, radius * 1.12);
  cavityWall.quaternion.copy(orientYAxisTo(dir));
  cavityWall.position.copy(anchor);
  conformMeshToSurface(cavityWall, sampler, dir, lift, maxDev, hit);
  overlay.add(cavityWall);

  // Relleno: inlay aplastado, proyectado sobre la superficie oclusal.
  const fillingMaterial = makeConditionMaterial({
    color: fillColor,
    roughness: fillRoughness,
    metalness: fillMetalness
  });
  const filling = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), fillingMaterial);
  filling.scale.set(radius, thickness * 1.5, radius);
  filling.quaternion.copy(orientYAxisTo(dir));
  filling.position.copy(anchor);
  conformMeshToSurface(filling, sampler, dir, lift * 2, maxDev, hit);
  overlay.add(filling);

  if (sampler) sampler.dispose();
}

function makeTube(points, radius, material, segments = 24) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 8, false);
  return new THREE.Mesh(geometry, material);
}

// Color de la dentina expuesta: más amarilla/opaca que el esmalte (que es
// blanco translúcido y brillante). El contraste entre ambas es la señal
// visual principal de una fractura, más que el color del diente completo.
const DENTIN_COLOR = 0xE4CE9B;

function addFractureOverlay(overlay, bounds, orientation) {
  const tooth = overlay.parent;
  const crown = orientation.crownRange.max;
  const root = orientation.rootDir;
  const sideSize = orientation.sideRange.size;
  const front = orientation.frontRange.max;
  const crownSpan = orientation.crownRange.size;
  const frontDir = orientation.frontDir;
  const crackRadius = Math.max(Math.min(sideSize, crownSpan) * 0.018, 0.012);
  const crackLift = crackRadius * 0.25; // medio enterrada: se lee como surco

  // Muestreador sobre la cara frontal (labial/bucal) del diente.
  const faceGuess = pointOnToothSurface(orientation, crown - crownSpan * 0.3, front, 0);
  const sampler = createSurfaceSampler(
    tooth,
    faceGuess,
    frontDir,
    Math.max(sideSize, crownSpan) * 0.8
  );
  const faceRef = sampler ? sampler.sample(faceGuess) : null;

  // Proyecta una polilínea sobre la superficie descartando los puntos que no
  // tocan el diente o que caen lejos de la cara principal (silueta angosta).
  const snapPath = (points, segments = 14) => {
    const out = [];
    new THREE.CatmullRomCurve3(points).getPoints(segments).forEach(p => {
      const h = sampler ? sampler.sample(p) : null;
      if (!h) return;
      if (faceRef && Math.abs(h.point.dot(frontDir) - faceRef.point.dot(frontDir)) > sideSize * 0.35) return;
      out.push(h.point.clone().addScaledVector(h.normal, crackLift));
    });
    return out;
  };

  const crackMaterial = makeConditionMaterial({ color: 0x3d211b, roughness: 0.93 });

  // Dentina expuesta: parche amarillo pegado a la cara frontal, cerca del borde.
  const dentinMaterial = makeConditionMaterial({
    color: DENTIN_COLOR,
    roughness: 0.78,
    metalness: 0
  });
  const chipSize = Math.max(Math.min(sideSize, crownSpan) * 0.22, 0.03);
  const facetCandidates = [[0.12, 0.1], [0.2, 0.05], [0.3, 0]].map(([c, s]) =>
    pointOnToothSurface(orientation, crown - crownSpan * c, front, sideSize * s)
  );
  const facetPick = pickSurfaceAnchor(
    sampler,
    facetCandidates,
    [orientation.crownDir, orientation.sideDir],
    chipSize * 0.6,
    chipSize * 0.8
  );
  if (facetPick) {
    const dentinFacet = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), dentinMaterial);
    dentinFacet.scale.set(chipSize, chipSize * 0.22, chipSize * 0.8);
    dentinFacet.quaternion.copy(orientYAxisTo(frontDir));
    dentinFacet.position.copy(facetPick.hit.point);
    conformMeshToSurface(
      dentinFacet,
      sampler,
      frontDir,
      Math.max(chipSize * 0.01, 0.004),
      chipSize * 0.9,
      facetPick.hit
    );
    overlay.add(dentinFacet);
  }

  // Grieta principal, siguiendo la superficie.
  const start = pointOnToothSurface(orientation, crown - crownSpan * 0.08, front, -sideSize * 0.22);
  const mid = pointOnToothSurface(orientation, crown - crownSpan * 0.28, front, 0);
  const end = pointOnToothSurface(orientation, crown - crownSpan * 0.48, front, sideSize * 0.14);
  const crack = snapPath([start, mid, end]);
  if (crack.length >= 3) overlay.add(makeTube(crack, crackRadius, crackMaterial, 48));

  // Rama secundaria.
  const branchEnd = mid.clone()
    .addScaledVector(root, crownSpan * 0.17)
    .addScaledVector(orientation.sideDir, sideSize * 0.14);
  const branchMid = mid.clone().addScaledVector(root, crownSpan * 0.08);
  const branch = snapPath([mid, branchMid, branchEnd], 10);
  if (branch.length >= 3) overlay.add(makeTube(branch, crackRadius * 0.78, crackMaterial, 32));

  // (Se eliminó el fragmento blanco desprendido y el aro de la dentina.)

  if (sampler) sampler.dispose();
}

// Rosa/salmón clásico con el que se representa la gutapercha en ilustración
// dental, para que se distinga claramente del rojo de "inflamación/alerta".
const GUTTA_PERCHA_COLOR = 0xD98C6B;

/**
 * ENDODONCIA — el esmalte se vuelve realmente translúcido (transmission de
 * MeshPhysicalMaterial, no solo opacity) y por dentro se ve la gutapercha
 * rellenando el conducto desde la cámara pulpar hasta la punta de la raíz.
 * applyTranslucentEnamel() es la que hace translúcido el diente; esta
 * función solo construye la gutapercha.
 */
function applyTranslucentEnamel(number) {
  forEachToothMaterial(number, material => {
    if ('transmission' in material) material.transmission = 0.72;
    if ('thickness' in material) material.thickness = 1.2;
    if ('ior' in material) material.ior = 1.52;
    material.roughness = 0.18;
    material.transparent = true;
    material.opacity = 1; // la transparencia real la da transmission, no opacity
    material.depthWrite = true;
    material.needsUpdate = true;
  });
}

function addEndodonticOverlay(overlay, bounds, orientation) {
  const crown = orientation.crownRange.max;
  const sideSize = orientation.sideRange.size;
  const frontSize = orientation.frontRange.size;
  const canalRadius = Math.max(Math.min(sideSize, frontSize) * 0.05, 0.018);

  // El conducto va desde la cámara pulpar (bajo la cara oclusal) hasta más
  // allá de la raíz visible: se extiende un poco por fuera de la geometría
  // del diente a propósito, porque la raíz real queda embebida en la encía
  // y debe asomar justo hasta ese límite.
  const canalStart = crown - orientation.crownRange.size * 0.12;
  const canalEnd = orientation.crownRange.min - orientation.crownRange.size * 0.35;
  const canalLength = Math.max(canalStart - canalEnd, 0.1);
  const canalCenter = (canalStart + canalEnd) / 2;

  const guttaMaterial = makeConditionMaterial({
    color: GUTTA_PERCHA_COLOR,
    roughness: 0.55,
    metalness: 0
  });

  const canal = new THREE.Mesh(
    new THREE.CylinderGeometry(canalRadius, canalRadius * 0.45, canalLength, 14),
    guttaMaterial
  );
  canal.quaternion.copy(orientYAxisTo(orientation.crownDir));
  canal.position.copy(pointOnToothSurface(orientation, canalCenter, -frontSize * 0.02, 0));
  overlay.add(canal);

  // Cámara pulpar: el ensanche justo bajo la corona de donde nace el conducto.
  const chamber = new THREE.Mesh(
    new THREE.SphereGeometry(canalRadius * 1.7, 16, 12),
    guttaMaterial
  );
  chamber.scale.y = 1.3;
  chamber.position.copy(pointOnToothSurface(orientation, canalStart, -frontSize * 0.02, 0));
  overlay.add(chamber);

  // Punta del conducto (ápice): un pequeño tope donde termina el sellado.
  const apex = new THREE.Mesh(
    new THREE.ConeGeometry(canalRadius * 0.5, canalRadius * 1.4, 10),
    guttaMaterial
  );
  apex.quaternion.copy(orientYAxisTo(orientation.rootDir));
  apex.position.copy(pointOnToothSurface(orientation, canalEnd, -frontSize * 0.02, 0));
  overlay.add(apex);
}

/**
 * CORONA — funda de porcelana/cerámica completa (clearcoat real, no solo
 * "brillo bajo roughness") más un margen cervical metálico/dorado sutil,
 * justo donde la corona se une a la encía — así se lee como una pieza
 * protésica real y no como "el mismo diente pero más brillante".
 */
// Margen dorado de la corona (aro fino en el cuello del diente que sigue la
// forma real de la raíz/cuello). Ponlo en false para quitarlo.
const CROWN_GOLD_MARGIN = true;

function addCrownOverlay(overlay, tooth, bounds, orientation) {
  const crownMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xfffdf6,
    roughness: 0.08,
    metalness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.06
  });

  const sideSize = orientation.sideRange.size;
  const frontSize = orientation.frontRange.size;

  // BUG CORREGIDO: antes se copiaba object.position/rotation/scale tal cual.
  // Esos valores son relativos al PADRE del mesh. Cuando el propio t_XX es el
  // mesh, eran la traslación y rotación del diente dentro del arco, y como el
  // overlay ya es hijo del diente, se aplicaban dos veces (copia desplazada y
  // girada en el aire, sobre todo en los dientes de atrás). Ahora la
  // transformación se calcula RELATIVA al diente: para el mesh del propio
  // diente es la identidad.
  tooth.updateWorldMatrix(true, true);
  const toothInv = tooth.matrixWorld.clone().invert();
  const relative = new THREE.Matrix4();
  const shell = Math.max(Math.min(sideSize, frontSize) * 0.008, 0.01);

  tooth.traverse(object => {
    if (!object.isMesh || !object.geometry || isInsideOverlay(object, tooth)) return;

    // Cascarón: copia inflada una pizca a lo largo de las normales (en vez de
    // escalar desde el origen, que desplaza la copia en dientes descentrados).
    const geometry = object.geometry.clone();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i++) {
      position.setXYZ(
        i,
        position.getX(i) + normal.getX(i) * shell,
        position.getY(i) + normal.getY(i) * shell,
        position.getZ(i) + normal.getZ(i) * shell
      );
    }
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const clone = new THREE.Mesh(geometry, crownMaterial);
    relative.multiplyMatrices(toothInv, object.matrixWorld);
    relative.decompose(clone.position, clone.quaternion, clone.scale);
    clone.renderOrder = 4;
    overlay.add(clone);
  });

  if (!CROWN_GOLD_MARGIN) return;

  // Margen cervical: se lanzan rayos radiales desde el eje del diente a la
  // altura del cuello y el aro pasa por los puntos donde tocan la malla.
  const neck = pointOnToothSurface(
    orientation,
    orientation.crownRange.min + orientation.crownRange.size * 0.22,
    0,
    0
  );
  const sampler = createSurfaceSampler(tooth, neck, orientation.crownDir, Infinity);
  if (!sampler) return;

  const reach = Math.max(sideSize, frontSize) * 1.5;
  const tubeRadius = Math.max(Math.min(sideSize, frontSize) * 0.03, 0.02);
  const points = [];
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const radial = orientation.frontDir.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(orientation.sideDir, Math.sin(angle));
    const from = neck.clone().addScaledVector(radial, reach);
    const hit = sampler.cast(from, radial.clone().negate());
    if (hit) points.push(hit.point.addScaledVector(hit.normal, tubeRadius * 0.4));
  }
  sampler.dispose();
  if (points.length < 12) return;

  const marginMaterial = makeConditionMaterial({
    color: 0xC9A227,
    roughness: 0.22,
    metalness: 0.85
  });
  overlay.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 96, tubeRadius, 8, true),
      marginMaterial
    )
  );
}

function addImplantOverlay(overlay, bounds, orientation) {
  const rootRange = orientation.crownRange;
  const sideSize = orientation.sideRange.size;
  const frontSize = orientation.frontRange.size;
  const screwRadius = Math.max(Math.min(sideSize, frontSize) * 0.15, 0.025);
  // Tornillo corto: solo debe sugerir el perno bajo la encía, no un
  // vástago largo que sobresalga más allá de lo anatómicamente razonable.
  const screwHeight = Math.max(rootRange.size * 0.34, 0.14);

  const metalMaterial = makeConditionMaterial({
    color: 0xC9D0D6,
    roughness: 0.28,
    metalness: 0.9
  });

  const abutment = new THREE.Mesh(
    new THREE.CylinderGeometry(
      screwRadius * 1.25,
      screwRadius,
      Math.max(rootRange.size * 0.16, 0.06),
      12
    ),
    metalMaterial
  );
  abutment.quaternion.copy(orientYAxisTo(orientation.rootDir));
  abutment.position.copy(
    pointOnToothSurface(
      orientation,
      rootRange.min * 0.30,
      0,
      0
    )
  );
  overlay.add(abutment);

  // IMPORTANTE: el tornillo sigue la dirección REAL de la raíz. En dientes
  // superiores va hacia arriba; en inferiores, hacia abajo. Si el t_XX tiene
  // una rotación propia, esa rotación también se respeta.
  const screw = new THREE.Mesh(
    new THREE.CylinderGeometry(
      screwRadius,
      screwRadius * 0.82,
      screwHeight,
      16
    ),
    metalMaterial
  );
  screw.quaternion.copy(orientYAxisTo(orientation.rootDir));
  screw.position.copy(
    pointOnToothSurface(
      orientation,
      rootRange.min - screwHeight * 0.35,
      0,
      0
    )
  );
  overlay.add(screw);

  const threadMaterial = makeConditionMaterial({
    color: 0xb6c0c9,
    roughness: 0.18,
    metalness: 0.92
  });
  const turns = 4;

  for (let i = 0; i < turns; i++) {
    const t = turns === 1 ? 0.5 : i / (turns - 1);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        screwRadius * 1.04,
        Math.max(screwRadius * 0.065, 0.008),
        6,
        18
      ),
      threadMaterial
    );
    ring.quaternion.copy(orientYAxisTo(orientation.rootDir));
    ring.position.copy(
      pointOnToothSurface(
        orientation,
        rootRange.min - screwHeight * 0.05 - screwHeight * 0.84 * t,
        0,
        0
      )
    );
    overlay.add(ring);
  }
}

/**
 * SARRO (cálculo dental) — placa endurecida de color amarillo/pardo pegada
 * al diente, junto a la encía. Clínicamente se acumula sobre todo por la
 * cara LINGUAL (por detrás) de los incisivos inferiores, donde desembocan
 * las glándulas salivales. Aquí se dibuja SOLO por detrás del diente, en
 * el cuello, y cada lóbulo se amolda a la superficie real.
 */
const TARTAR_COLORS = [0xC9AE72, 0xB59655, 0x9A7B45];

// Cuaternión con el eje X hacia xDir y el eje Y hacia yDir.
function basisQuaternion(xDir, yDir) {
  const y = yDir.clone().normalize();
  const x = xDir.clone().addScaledVector(y, -xDir.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function addTartarOverlay(overlay, bounds, orientation, number) {
  const tooth = overlay.parent;
  const sideSize = orientation.sideRange.size;
  const frontSize = orientation.frontRange.size;
  const span = orientation.crownRange.size;
  const small = Math.min(sideSize, frontSize);
  const upper = toothArch(number) === 'upper';
  const neckAt = orientation.crownRange.min + span * 0.3; // altura del margen de la encía

  const materials = TARTAR_COLORS.map(color =>
    makeConditionMaterial({ color, roughness: 0.95, metalness: 0 })
  );

  // Lóbulos de un depósito: s = desplazamiento lateral (× ancho), c = altura
  // (× alto de la corona), sx/sy/sz = tamaño lateral / grosor / alto.
  const BAND = [
    { s: 0,     c: 0,      sx: 0.34, sy: 0.085, sz: 0.070, m: 0 },
    { s: -0.20, c: 0.02,   sx: 0.17, sy: 0.110, sz: 0.085, m: 1 },
    { s: 0.22,  c: -0.015, sx: 0.16, sy: 0.100, sz: 0.075, m: 2 },
    { s: 0.05,  c: 0.075,  sx: 0.12, sy: 0.070, sz: 0.050, m: 1 }
  ];

  const buildDeposit = (dir, frontDistance, lobes, bulk) => {
    const first = lobes[0];
    const at = (dc, side) => pointOnToothSurface(
      orientation,
      neckAt + span * (first.c + dc),
      frontDistance,
      sideSize * side
    );
    const candidates = [
      at(0, first.s),
      at(0.04, first.s * 0.7),
      at(-0.04, first.s * 0.7),
      at(0, first.s * 0.4)
    ];

    const sampler = createSurfaceSampler(
      tooth,
      candidates[0],
      dir,
      Math.max(sideSize, span) * 0.75
    );
    const picked = pickSurfaceAnchor(
      sampler,
      candidates,
      [orientation.crownDir, orientation.sideDir],
      small * 0.15,
      small * 0.25
    );
    if (!picked) {
      if (sampler) sampler.dispose();
      return;
    }

    const anchor = picked.hit.point;
    const maxDev = small * 0.3;
    const lift = Math.max(small * 0.004, 0.004);
    const quaternion = basisQuaternion(orientation.sideDir, dir);

    lobes.forEach(lobe => {
      const guess = anchor.clone()
        .addScaledVector(orientation.sideDir, sideSize * (lobe.s - first.s))
        .addScaledVector(orientation.crownDir, span * (lobe.c - first.c));
      const hit = sampler.sample(guess);
      if (!hit || Math.abs(hit.point.dot(dir) - anchor.dot(dir)) > maxDev) return;

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), materials[lobe.m]);
      mesh.scale.set(
        Math.max(sideSize * lobe.sx * bulk, 0.03),
        Math.max(small * lobe.sy * bulk, 0.02),
        Math.max(span * lobe.sz * bulk, 0.03)
      );
      mesh.quaternion.copy(quaternion);
      mesh.position.copy(hit.point);
      conformMeshToSurface(mesh, sampler, dir, lift, maxDev, hit);
      overlay.add(mesh);
    });

    sampler.dispose();
  };

  // Solo cara lingual/palatina (por detrás del diente). Más abundante en
  // incisivos inferiores. No se dibuja nada en la cara frontal.
  const lingualBulk = (!upper && toothIsAnterior(number)) ? 1.25 : 1;
  buildDeposit(orientation.backDir, orientation.frontRange.min, BAND, lingualBulk);
}

function clearAdvancedVisualState(tooth) {
  if (!tooth?.userData?.advancedOverlay) return;
  const overlay = tooth.userData.advancedOverlay;
  tooth.remove(overlay);
  disposeObject3D(overlay);
  tooth.userData.advancedOverlay = null;
}

function applyAdvancedVisualState(tooth, stateKey, options = {}) {
  if (!tooth) return;

  clearAdvancedVisualState(tooth);

  forEachToothMaterial(Number(tooth.name.slice(2)), material => {
    restoreOriginalMaterial(material);
    if ('wireframe' in material) material.wireframe = false;
  });
  tooth.visible = true;

  const number = Number(tooth.name.slice(2));
  const bounds = getLocalToothBounds(tooth);
  const orientation = getToothOrientation(tooth, bounds);
  const overlay = createOverlayGroup(tooth);

  switch (stateKey) {
    case 'C': // CARIES: cráter + borde desmineralizado + tinte amarillento
      addCariesOverlay(overlay, bounds, orientation, number);
      break;

    case 'F': // FRACTURA: grieta ramificada + pequeño fragmento desprendido
      tintMaterialOnTooth(number, 0x70402c, 0.12);
      addFractureOverlay(overlay, bounds, orientation);
      break;

    case 'O': // OBTURACIÓN: material metálico sobre la superficie oclusal
      addFillingOverlay(overlay, bounds, orientation);
      break;

    case 'E': // ENDODONCIA: esmalte con translucidez física + gutapercha visible
      applyTranslucentEnamel(number);
      addEndodonticOverlay(overlay, bounds, orientation);
      break;

    case 'K': // CORONA: funda de porcelana con clearcoat + margen dorado
      addCrownOverlay(overlay, tooth, bounds, orientation);
      break;

    case 'I': // IMPLANTE: pieza dental + pilar y tornillo roscado metálico
      // Implante: el diente pasa a un gris metálico y las estructuras
      // añadidas siguen el eje real de la raíz.
      forEachToothMaterial(number, material => {
        if (material.color) material.color.setHex(0xC9D0D6);
        if ('metalness' in material) material.metalness = 0.9;
        if ('roughness' in material) material.roughness = 0.3;
        if ('clearcoat' in material) material.clearcoat = 0;
        if ('clearcoatRoughness' in material) material.clearcoatRoughness = 0;
        // Sin mapa de entorno un metal se ve negro: se le asigna uno.
        if ('envMap' in material) {
          material.envMap = getMetalEnvMap();
          material.envMapIntensity = 1.3;
        }
        material.needsUpdate = true;
      });
      addImplantOverlay(overlay, bounds, orientation);
      break;

    case 'T': // SARRO: no hay cambio base; el depósito se dibuja abajo como capa
      break;

    case 'A': // AUSENTE: silueta fantasma del diente original
      tintMaterialOnTooth(number, 0xa9c3be, 0.40);
      forEachToothMaterial(number, material => {
        material.transparent = true;
        material.opacity = 0.13;
        material.depthWrite = false;
        if ('wireframe' in material) material.wireframe = true;
        material.needsUpdate = true;
      });
      break;

    case 'S': // SANO
    default:
      break;
  }

  // Sarro: capa adicional compatible con cualquier estado (menos ausente/implante).
  if (options.tartar && stateKey !== 'A' && stateKey !== 'I') {
    addTartarOverlay(overlay, bounds, orientation, number);
  }

  // Evita dejar un overlay vacío para el estado sano.
  if (!overlay.children.length) {
    tooth.remove(overlay);
    tooth.userData.advancedOverlay = null;
    disposeObject3D(overlay);
  }
}

// Alias pequeño para conservar una sola ruta de pintado del material original.
function tintMaterialOnTooth(number, hex, strength) {
  forEachToothMaterial(number, material => tintMaterial(material, hex, strength));
}

function applyStateToTooth(number) {
  const tooth = toothObjects.get(Number(number));
  if (!tooth) return;
  const state = visualState(number);
  applyAdvancedVisualState(tooth, state, { tartar: hasCond(number, 'T') });
  tooth.userData.dentState = state;
}

function applyModelStates() {
  if (!modelReady) return;
  ALL.forEach(applyStateToTooth);
  modelStateDirty = false;
}

function updateInteractiveGlow(time) {
  if (!modelReady) return;

  ALL.forEach(number => {
    const tooth = toothObjects.get(number);
    if (!tooth) return;

    const state = hasCond(number, 'C') ? 'C' : hasCond(number, 'F') ? 'F' : 'S';
    const isSelected = number === sel;
    const isHovered = number === hover;

    let stateColor = null;
    let stateStrength = 0;

    if (state === 'C' || state === 'F') {
      stateColor = new THREE.Color(STATES[state].color);
      stateStrength = reduce ? 0.10 : (0.07 + 0.05 * Math.sin(time / 450 + number));
    }

    forEachToothMaterial(number, material => {
      if (!material.emissive) return;
      const original = material.userData?.dentOriginal;
      if (!original?.emissive) return;

      material.emissive.copy(original.emissive);
      material.emissiveIntensity = original.emissiveIntensity;

      if (stateColor && stateStrength > 0) {
        material.emissive.lerp(stateColor, stateStrength);
      }

      if (isHovered) {
        material.emissive.lerp(new THREE.Color(0xffffff), 0.25);
        material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.8);
      }

      if (isSelected) {
        material.emissive.copy(new THREE.Color(0x3b82f6));
        material.emissiveIntensity = 0.85;
      }

      material.needsUpdate = true;
    });
  });
}

/* ============================================================
   VISTAS: AMBAS / SUPERIOR / INFERIOR
   ============================================================ */

function setArcVisibility(modeName) {
  const showUpper = modeName !== 'lower';
  const showLower = modeName !== 'upper';

  // Dientes reales del GLB.
  toothObjects.forEach((object, number) => {
    object.visible = toothArch(number) === 'upper' ? showUpper : showLower;
  });

  // Encías reales del GLB. Se recorren TODAS las coincidencias por si el
  // exportador creó un grupo padre y varios meshes hijos.
  upperGums.forEach(gum => {
    gum.visible = showUpper;
  });
  lowerGums.forEach(gum => {
    gum.visible = showLower;
  });
}

function targetForView(modeName) {
  const center = modelCenter.clone();
  const d = view.fitDistance;

  if (modeName === 'upper') {
    return {
      position: center.clone().add(new THREE.Vector3(0, -d * 1.25, 0)),
      target: center
    };
  }

  if (modeName === 'lower') {
    return {
      position: center.clone().add(new THREE.Vector3(0, d * 1.25, 0)),
      target: center
    };
  }

  return {
    position: center.clone().add(new THREE.Vector3(0, -d * 0.30, d)),
    target: center
  };
}

function setView(modeName, immediate = false) {
  view.mode = modeName;
  setArcVisibility(modeName);

  const preset = targetForView(modeName);
  view.desiredPosition.copy(preset.position);
  view.desiredTarget.copy(preset.target);
  view.animating = !immediate && !reduce;

  if (immediate || reduce) {
    camera.position.copy(view.desiredPosition);
    controls.target.copy(view.desiredTarget);
    controls.update();
  }

  document.querySelectorAll('#viewSeg button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.view === modeName ? 'true' : 'false');
  });

  view.fitDistance = Math.max(view.fitDistance, 1);
  controls.minDistance = view.fitDistance * 0.20;
  controls.maxDistance = view.fitDistance * 4.5;
}

function focusTooth(number) {
  const tooth = toothObjects.get(Number(number));
  if (!tooth) return;

  const arch = toothArch(number);
  if (view.mode !== 'both' && view.mode !== arch) {
    setView(arch);
  }

  tooth.updateWorldMatrix(true, false);
  const worldPosition = new THREE.Vector3();
  tooth.getWorldPosition(worldPosition);

  const offset = camera.position.clone().sub(controls.target);
  view.desiredTarget.copy(worldPosition);
  view.desiredPosition.copy(worldPosition).add(offset);
  view.animating = !reduce;
}

/* ============================================================
   RAYCASTER / SELECCIÓN 3D
   ============================================================ */

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function toothAtPointer(event) {
  if (!modelReady) return null;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  ndc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(ndc, camera);
  const intersections = raycaster.intersectObjects(toothPickMeshes, false);

  for (const hit of intersections) {
    const tooth = findToothRoot(hit.object);
    if (!tooth) continue;

    const number = Number(tooth.name.slice(2));
    if (!toothObjects.has(number)) continue;
    if (!tooth.visible) continue;

    return number;
  }

  return null;
}

function showTip(number, event) {
  if (!tip) return;

  if (number == null) {
    tip.hidden = true;
    return;
  }

  const rect = stage.getBoundingClientRect();
  tip.replaceChildren();
  tip.append(
    el('b', null, `Diente ${number} · ${conditionLabel(number)}`),
    document.createTextNode(toothName(number))
  );

  const left = Math.min(event.clientX - rect.left + 12, Math.max(0, rect.width - 220));
  const top = Math.min(event.clientY - rect.top + 12, Math.max(0, rect.height - 72));

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.hidden = false;
}

let pointerDown = false;
let pointerStartX = 0;
let pointerStartY = 0;
let pointerMoved = false;
const activePointers = new Set();

canvas.addEventListener('pointerdown', event => {
  activePointers.add(event.pointerId);
  pointerDown = activePointers.size === 1;
  pointerMoved = false;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  lastInteraction = performance.now();
  if (activePointers.size > 1) {
    pointerMoved = true;
    if (tip) tip.hidden = true;
  }
});

canvas.addEventListener('pointermove', event => {
  const dx = event.clientX - pointerStartX;
  const dy = event.clientY - pointerStartY;

  if (pointerDown && Math.hypot(dx, dy) > 6) {
    pointerMoved = true;
    lastInteraction = performance.now();
    hover = null;
    canvas.classList.remove('overtooth');
    if (tip) tip.hidden = true;
    return;
  }

  if (!pointerDown && event.pointerType === 'mouse') {
    const number = toothAtPointer(event);
    hover = number;
    canvas.classList.toggle('overtooth', number != null);
    showTip(number, event);
  }
});

function finishPointer(event) {
  const wasSinglePointerClick = pointerDown && activePointers.size === 1 && !pointerMoved;
  activePointers.delete(event.pointerId);
  pointerDown = activePointers.size === 1;

  if (wasSinglePointerClick && event.type === 'pointerup') {
    const number = toothAtPointer(event);
    if (number != null) onToothClick(number);
  }
}

canvas.addEventListener('pointerup', finishPointer);
canvas.addEventListener('pointercancel', event => {
  activePointers.delete(event.pointerId);
  pointerDown = activePointers.size === 1;
  pointerMoved = false;
});

canvas.addEventListener('pointerleave', () => {
  hover = null;
  canvas.classList.remove('overtooth');
  if (tip) tip.hidden = true;
});

/* ============================================================
   INTERFAZ / PINTAR DIENTES
   ============================================================ */

function paint(number) {
  const current = condsOf(number);

  if (brush === 'S') {
    // Sano: limpia todas las marcas del diente.
    setConds(number, []);
  } else if (EXCLUSIVE_CODES.has(brush)) {
    // Ausente / Implante: no se combinan con nada; tocar otra vez lo quita.
    if (current.length === 1 && current[0] === brush) setConds(number, []);
    else setConds(number, [brush]);
  } else if (current.some(code => EXCLUSIVE_CODES.has(code))) {
    // El diente estaba ausente o con implante: la nueva marca lo reemplaza.
    setConds(number, [brush]);
  } else if (current.includes(brush)) {
    // Misma marca otra vez: se quita solo esa.
    setConds(number, current.filter(code => code !== brush));
  } else {
    // Se suma a las que ya tenía; la nueva pasa a ser la principal.
    setConds(number, current.concat(brush));
  }

  modelStateDirty = true;
}

function onToothClick(number) {
  if (mode === 'doctor' && brush) {
    paint(number);
  }
  selectTooth(number, false);
}

function selectTooth(number, focus = false) {
  if (!ALL.includes(Number(number))) return;

  sel = Number(number);

  if (selectedToothLabel) {
    selectedToothLabel.textContent = `Diente seleccionado: ${sel}`;
  }

  if (focus) focusTooth(sel);

  if (mode === 'doctor') save();
  else render();
}

function setMode(newMode) {
  mode = newMode;
  document.body.classList.toggle('doctor', newMode === 'doctor');

  document.querySelectorAll('#modeSeg button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.mode === newMode ? 'true' : 'false');
  });

  render();
}

/* ============================================================
   MAPA 2D
   ============================================================ */

const chips = {};

function buildChips() {
  [[UPPER, '#rowUpper'], [LOWER, '#rowLower']].forEach(([numbers, selector]) => {
    const row = $(selector);
    if (!row) return;

    numbers.forEach((number, index) => {
      if (index === 8) row.append(el('span', 'spacer'));

      const button = el('button', 'chip', String(number));
      button.type = 'button';
      button.dataset.n = String(number);
      button.addEventListener('click', () => {
        if (mode === 'doctor' && brush) paint(number);
        selectTooth(number, true);
      });

      row.append(button);
      chips[number] = button;
    });
  });
}

function buildPalette() {
  const box = $('#palette');
  if (!box) return;

  KEYS.forEach(key => {
    const button = el('button', 'brush');
    button.type = 'button';
    button.dataset.k = key;

    const dot = el('span', 'dot');
    dot.style.background = STATES[key].color;
    button.append(dot, document.createTextNode(STATES[key].name));

    button.addEventListener('click', () => {
      brush = key;
      renderPalette();
    });

    box.append(button);
  });

  const selectButton = el('button', 'brush');
  selectButton.type = 'button';
  selectButton.dataset.k = '';

  const dot = el('span', 'dot');
  dot.style.background = 'transparent';
  selectButton.append(dot, document.createTextNode('Solo seleccionar'));

  selectButton.addEventListener('click', () => {
    brush = null;
    renderPalette();
  });

  box.append(selectButton);
}

function renderPalette() {
  document.querySelectorAll('#palette .brush').forEach(button => {
    button.setAttribute('aria-pressed', String((button.dataset.k || null) === brush));
  });
}

/* ============================================================
   RESUMEN / DETALLE / HALLAZGOS
   ============================================================ */

const HEALTH_COPY = {
  good: [
    'Tu salud oral está en muy buen estado',
    'Sigue con tus controles cada 6 meses para mantenerla así.'
  ],
  mid: [
    'Tu salud oral necesita atención',
    'Estás a tiempo: los problemas pequeños son más fáciles, rápidos y económicos de resolver.'
  ],
  low: [
    'Tu salud oral está en riesgo',
    'Los problemas sin tratar no se curan solos: avanzan, y mientras más se espera, más tiempo, molestias y costo.'
  ],
  crit: [
    'Tu salud oral está en estado crítico',
    'Necesitas iniciar tratamiento cuanto antes: el daño ya compromete varios dientes y seguirá avanzando.'
  ]
};

function renderSummary() {
  // counts: dientes que TIENEN cada condición (un diente puede sumar en varias).
  // visual: distribución por estado visible; suma siempre 32 (para la barra).
  const counts = {};
  const visual = {};
  KEYS.forEach(key => { counts[key] = 0; visual[key] = 0; });

  ALL.forEach(number => {
    const list = condsOf(number);
    if (!list.length) counts.S++;
    list.forEach(code => counts[code]++);
    visual[visualState(number)]++;
  });

  const urgent = ALL.filter(n => hasCond(n, 'C') || hasCond(n, 'F')).length;
  const tartar = counts.T;
  const treated = ALL.filter(n => ['O', 'E', 'K', 'I'].some(code => hasCond(n, code))).length;
  const absentReal = ALL.filter(n => hasCond(n, 'A') && !isThirdMolar(n)).length;

  const { score, band } = computeHealthDetails();
  const scoreEl = $('#healthScore');
  const headline = $('#headline');
  const subline = $('#subline');
  const note = $('#healthNote');
  const row = scoreEl ? scoreEl.closest('.healthRow') : null;

  const copy = score === 100
    ? ['Tu salud oral está en excelente estado', 'Mantén tus controles cada 6 meses para conservarla así.']
    : HEALTH_COPY[band];

  if (scoreEl) {
    scoreEl.textContent = `${score}%`;
    scoreEl.dataset.band = band;
    scoreEl.style.setProperty('--pct', String(score));
    scoreEl.setAttribute('aria-label', `Salud oral: ${score} por ciento`);
  }
  if (row) row.dataset.band = band;
  if (headline) headline.textContent = copy[0];

  if (subline) {
    const parts = [];
    if (urgent) parts.push(`${urgent} ${plural(urgent, 'diente con caries o fractura', 'dientes con caries o fractura')}`);
    if (tartar) parts.push(`${tartar} con sarro`);
    if (absentReal) parts.push(`${absentReal} ${plural(absentReal, 'ausente', 'ausentes')}`);
    if (treated) parts.push(`${treated} ${plural(treated, 'ya tratado', 'ya tratados')}`);
    subline.textContent = parts.length ? parts.join(' · ') : 'Todos tus dientes se ven sanos';
  }

  if (note) {
    note.replaceChildren(
      el('strong', null, copy[1]),
      el('small', null, 'Indicador orientativo calculado con lo marcado en el mapa; no es un diagnóstico. Las muelas del juicio ausentes no restan.')
    );
  }

  const bar = $('#bar');
  const legend = $('#legend');
  if (!bar || !legend) return;

  bar.replaceChildren();
  legend.replaceChildren();

  const parts = [];
  KEYS.forEach(key => {
    if (visual[key]) {
      const segment = el('i');
      segment.style.width = `${visual[key] / 32 * 100}%`;
      segment.style.background = STATES[key].color;
      bar.append(segment);
      parts.push(`${visual[key]} ${STATES[key].name.toLowerCase()}`);
    }

    if (counts[key]) {
      const item = el('li');
      const dot = el('span', 'dot');
      dot.style.background = STATES[key].color;
      item.append(dot, document.createTextNode(`${counts[key]} ${STATES[key].name.toLowerCase()}`));
      legend.append(item);
    }
  });

  bar.setAttribute('aria-label', `Distribución de los 32 dientes: ${parts.join(', ')}`);
}

function renderChips() {
  ALL.forEach(number => {
    const button = chips[number];
    if (!button) return;

    const list = condsOf(number);
    const state = visualState(number);
    const definition = STATES[state];
    const label = conditionLabel(number);

    button.style.background = definition.color;
    button.style.color = definition.text;
    button.dataset.s = state;
    // Insignia "+N" cuando el diente tiene más de una condición.
    if (list.length > 1) button.dataset.multi = String(list.length - 1);
    else delete button.dataset.multi;
    button.classList.toggle('attn', needsAttention(number));
    button.classList.toggle('sel', number === sel);
    button.setAttribute('aria-label', `Diente ${number}, ${toothName(number)}, ${label}`);
    button.title = `${toothName(number)} · ${label}`;
  });
}

function renderDetail() {
  const hasSelection = sel != null;
  const hint = $('#dHint');
  const body = $('#dBody');
  if (!hint || !body) return;

  hint.hidden = hasSelection;
  body.hidden = !hasSelection;
  if (!hasSelection) return;

  const state = visualState(sel);
  const definition = STATES[state];
  const ordered = condsOf(sel).slice().reverse();
  const note = data.t[sel] || '';

  $('#dDot').style.background = definition.color;
  $('#dTitle').textContent = `Diente ${sel}`;
  $('#dName').textContent = toothName(sel);
  $('#dState').textContent = ordered.length > 1
    ? `${ordered.map(code => STATES[code].name).join(' + ')}. ${ordered.map(code => STATES[code].desc).join(' ')}`
    : `${definition.name}. ${definition.desc}`;

  const noteView = $('#dNote');
  if (noteView) {
    noteView.textContent = note ? `Nota de la doctora: ${note}` : '';
    noteView.hidden = !note;
  }

  const input = $('#inNote');
  if (input && document.activeElement !== input) input.value = note;
}

function renderFindings() {
  const box = $('#findings');
  if (!box) return;

  box.replaceChildren();

  const groups = [
    ['attn', 'Necesitan atención'],
    ['done', 'Ya tratados'],
    ['absent', 'Ausentes']
  ];

  let any = false;

  groups.forEach(([category, title]) => {
    const items = SORTED.filter(number => condsOf(number).some(code => STATES[code].cat === category));
    if (!items.length) return;

    any = true;
    box.append(el('h3', null, title));

    const list = el('ul', 'flist');
    items.forEach(number => {
      // Solo las condiciones de esta categoría (la más reciente primero).
      const codes = condsOf(number).filter(code => STATES[code].cat === category).reverse();
      const li = el('li');
      const button = el('button', 'fitem');
      button.type = 'button';

      const dot = el('span', 'dot');
      dot.style.background = STATES[codes[0]].color;

      const text = el('span');
      const strong = el('strong', null, `Diente ${number} · ${codes.map(code => STATES[code].name).join(' + ')}`);
      const small = el('small', null, `${toothName(number)}${data.t[number] ? ` — ${data.t[number]}` : ''}`);
      text.append(strong, small);

      button.append(dot, text);
      button.addEventListener('click', () => selectTooth(number, true));
      li.append(button);
      list.append(li);
    });

    box.append(list);
  });

  if (!any) {
    box.append(el('p', 'okmsg', 'No hay hallazgos: todos los dientes se ven sanos.'));
  } else if (!SORTED.some(needsAttention)) {
    box.prepend(el('p', 'okmsg', 'Ningún diente necesita atención por ahora.'));
  }
}

function renderPatientInfo() {
  const patientName = $('#pname');
  const patientDate = $('#pdate');
  const generalNote = $('#gnote');

  if (patientName) patientName.textContent = data.name || 'Paciente';
  if (patientDate) patientDate.textContent = data.date ? `Valoración del ${fmtDate(data.date)}` : '';
  if (generalNote) {
    generalNote.textContent = data.general || '';
    generalNote.hidden = !data.general;
  }

  const nameInput = $('#inName');
  const dateInput = $('#inDate');
  const generalInput = $('#inGeneral');

  if (nameInput && document.activeElement !== nameInput) nameInput.value = data.name || '';
  if (dateInput && document.activeElement !== dateInput) dateInput.value = data.date || '';
  if (generalInput && document.activeElement !== generalInput) generalInput.value = data.general || '';
}

function render() {
  if (modelReady && modelStateDirty) applyModelStates();
  renderSummary();
  renderChips();
  renderDetail();
  renderFindings();
  renderPatientInfo();
  renderPalette();

  if (selectedToothLabel) {
    selectedToothLabel.textContent = sel == null
      ? 'Diente seleccionado: Ninguno'
      : `Diente seleccionado: ${sel}`;
  }
}

/* ============================================================
   CONTROLES DE INTERFAZ
   ============================================================ */

function bindUI() {
  document.querySelectorAll('#modeSeg button').forEach(button => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  document.querySelectorAll('#viewSeg button').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  const inName = $('#inName');
  if (inName) inName.addEventListener('input', event => {
    data.name = event.target.value;
    save();
  });

  const inDate = $('#inDate');
  if (inDate) inDate.addEventListener('input', event => {
    data.date = event.target.value;
    save();
  });

  const inGeneral = $('#inGeneral');
  if (inGeneral) inGeneral.addEventListener('input', event => {
    data.general = event.target.value;
    save();
  });

  const inNote = $('#inNote');
  if (inNote) inNote.addEventListener('input', event => {
    if (sel == null) return;
    const value = event.target.value.trim();
    if (value) data.t[sel] = value;
    else delete data.t[sel];
    save();
  });

  let saveArmed = null;
  const btnSave = $('#btnSave');

  if (btnSave) {
  console.log('Botón #btnSave encontrado en el DOM.'); // Verificar si encuentra el botón
  
  btnSave.addEventListener('click', async event => {
    console.log('Clic detectado en el botón guardar.'); // Verificar si escucha el clic

    const button = event.currentTarget;

    if (!saveArmed) {
      console.log('Primer clic: Armando confirmación...');
      button.textContent = '¿Seguro? Toca otra vez';
      button.classList.add('warn');
      saveArmed = setTimeout(() => {
        saveArmed = null;
        button.textContent = 'Guardar cambios';
        button.classList.remove('warn');
      }, 3000);
      return;
    }

    console.log('Segundo clic: Ejecutando persistToSupabase()...');
    clearTimeout(saveArmed);
    saveArmed = null;
    button.classList.remove('warn');
    button.textContent = 'Guardando...';
    button.disabled = true;

    // Llamada real al guardado
    const result = await persistToSupabase();

    button.disabled = false;
    button.textContent = 'Guardar cambios';
    
    if (saveStatus) {
      saveStatus.textContent = result.ok ? 'Cambios guardados ✓' : 'No se pudo guardar. Intenta de nuevo.';
      setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 3000);
    }
  });
} else {
  console.error('No se encontró el elemento #btnSave en el HTML.');
}

  const saveStatus = $('#saveStatus');

  if (btnSave) btnSave.addEventListener('click', async event => {
    const button = event.currentTarget;

    if (!saveArmed) {
      button.textContent = '¿Seguro? Toca otra vez';
      button.classList.add('warn');
      saveArmed = setTimeout(() => {
        saveArmed = null;
        button.textContent = 'Guardar cambios';
        button.classList.remove('warn');
      }, 3000);
      return;
    }

    clearTimeout(saveArmed);
    saveArmed = null;
    button.classList.remove('warn');
    button.textContent = 'Guardando...';
    button.disabled = true;

    const result = await persistToSupabase();

    button.disabled = false;
    button.textContent = 'Guardar cambios';
    if (saveStatus) {
      saveStatus.textContent = result.ok ? 'Cambios guardados ✓' : 'No se pudo guardar. Intenta de nuevo.';
      setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 3000);
    }
  });

  // "Todos sanos": deja los 32 dientes en estado sano (conserva nombre,
  // fecha y observaciones generales). Pide confirmación con un segundo toque.
  let healthyArmed = null;
  const btnAllHealthy = $('#btnAllHealthy');

  if (btnAllHealthy) btnAllHealthy.addEventListener('click', event => {
    const button = event.currentTarget;

    if (!healthyArmed) {
      button.textContent = '¿Seguro? Toca otra vez';
      button.classList.add('warn');
      healthyArmed = setTimeout(() => {
        healthyArmed = null;
        button.textContent = 'Todos sanos';
        button.classList.remove('warn');
      }, 3000);
      return;
    }

    clearTimeout(healthyArmed);
    healthyArmed = null;
    button.textContent = 'Todos sanos';
    button.classList.remove('warn');

    data.s = {};
    data.x = {};
    data.t = {};
    modelStateDirty = true;
    save();
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sel != null) {
      sel = null;
      hover = null;
      render();
    }
  });
}

/* ============================================================
   RESIZE
   ============================================================ */

function resizeRenderer() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

if (window.ResizeObserver) {
  new ResizeObserver(resizeRenderer).observe(stage);
} else {
  window.addEventListener('resize', resizeRenderer);
}

window.addEventListener('resize', resizeRenderer);

/* ============================================================
   ANIMACIÓN
   ============================================================ */

function animate(time = 0) {
  requestAnimationFrame(animate);

  if (modelReady && !view.animating) {
    const idle = time - lastInteraction > 2500;
    const swayTarget = (!reduce && idle && view.mode === 'both')
      ? Math.sin(time / 1900) * 0.018
      : 0;
    modelScene.rotation.y += (swayTarget - modelScene.rotation.y) * 0.04;
  }

  if (view.animating) {
    camera.position.lerp(view.desiredPosition, 0.10);
    controls.target.lerp(view.desiredTarget, 0.10);

    if (
      camera.position.distanceTo(view.desiredPosition) < 0.05 * Math.max(modelRadius, 1) &&
      controls.target.distanceTo(view.desiredTarget) < 0.02 * Math.max(modelRadius, 1)
    ) {
      camera.position.copy(view.desiredPosition);
      controls.target.copy(view.desiredTarget);
      view.animating = false;
    }
  }

  controls.update();
  updateInteractiveGlow(time);
  renderer.render(scene, camera);
}

/* ============================================================
   INICIO
   ============================================================ */

buildChips();
buildPalette();
bindUI();
(async () => {
  await loadInitial();
  setMode(mode);
  setView('both', true);
  resizeRenderer();
  loadModel();
  animate();
})();
