/**
 * Fase L / L5 — Entrenamiento LoRA local (opt-in), orquestador.
 *
 * El Studio NO embebe ai-toolkit/kohya. Materializa el pack L0 a disco y,
 * si hay comando/GPU tooling configurado, lanza el proceso externo.
 *
 * Requiere:
 *   ENABLE_LOCAL_LORA_TRAIN=1
 * Opcional para spawn:
 *   LOCAL_LORA_TRAIN_CMD="python run.py {config}"   (placeholders: {workDir} {config} {personaId} {trigger})
 *   AI_TOOLKIT_DIR=/path/to/ai-toolkit              (cwd + default: python run.py {config})
 *
 * Sin flag → isLocalTrainEnabled() false; path free (JSON + Colab L1 + Pollinations) intacto.
 *
 * @see docs/lora/L5_LOCAL_TRAIN.md
 * @see ROADMAP.md — Fase L / L5
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DATA_DIR, ensureDir } = require('./paths');

/** @type {Map<string, { personaId: string, pid: number|null, child: import('child_process').ChildProcess|null, exitCode: number|null, startedAt: string, workDir: string, logTail: string[] }>} */
const jobs = new Map();

function flagOn(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Explicit opt-in — having AI_TOOLKIT_DIR alone must NOT enable local train. */
function isLocalTrainEnabled(env = process.env) {
  return flagOn(env.ENABLE_LOCAL_LORA_TRAIN);
}

function getTrainCmdTemplate(env = process.env) {
  return String(env.LOCAL_LORA_TRAIN_CMD || '').trim() || null;
}

function getAiToolkitDir(env = process.env) {
  const d = String(env.AI_TOOLKIT_DIR || '').trim();
  return d ? path.resolve(d) : null;
}

/** True when we can spawn an external trainer (not just materialize). */
function canSpawnTrainer(env = process.env) {
  if (!isLocalTrainEnabled(env)) return false;
  return !!(getTrainCmdTemplate(env) || getAiToolkitDir(env));
}

function personaTrainRoot(personaId) {
  return path.join(DATA_DIR, 'loras', String(personaId), 'train_jobs');
}

/**
 * Reescribe folder_path / training_folder del YAML L0 a rutas absolutas
 * para que ai-toolkit pueda correr con cwd distinto al workDir.
 */
function absolutizeAiToolkitYaml(yamlText, { datasetAbs, outputAbs }) {
  let out = String(yamlText || '');
  // folder_path: "dataset"  → absolute
  out = out.replace(
    /(folder_path:\s*)(["']?)dataset\2/,
    `$1"${datasetAbs.replace(/\\/g, '/')}"`
  );
  out = out.replace(
    /(training_folder:\s*)(["']?)output\2/,
    `$1"${outputAbs.replace(/\\/g, '/')}"`
  );
  return out;
}

/**
 * Escribe dataset + config + README del pack L0 bajo workDir.
 * @returns {{ workDir: string, configAbs: string, datasetAbs: string, outputAbs: string, imageCount: number, triggerToken: string }}
 */
function materializePack(pack, { rootDir, workDir }) {
  if (!pack || !Array.isArray(pack.datasetItems)) {
    throw new Error('pack L0 inválido');
  }
  ensureDir(workDir);
  const datasetAbs = path.join(workDir, 'dataset');
  const outputAbs = path.join(workDir, 'output');
  const configDir = path.join(workDir, 'config');
  ensureDir(datasetAbs);
  ensureDir(outputAbs);
  ensureDir(configDir);

  let imageCount = 0;
  for (const item of pack.datasetItems) {
    const srcAbs = path.isAbsolute(item.srcRelPath)
      ? item.srcRelPath
      : path.join(rootDir, item.srcRelPath);
    if (!fs.existsSync(srcAbs)) continue;
    fs.copyFileSync(srcAbs, path.join(datasetAbs, item.imageName));
    fs.writeFileSync(path.join(datasetAbs, item.captionName), `${item.caption}\n`, 'utf8');
    imageCount += 1;
  }
  if (imageCount < 1) {
    throw new Error('No hay imágenes en el vault para materializar (genera variantes primero).');
  }

  let configAbs = path.join(configDir, 'ai-toolkit-flux.yaml');
  for (const f of pack.textFiles || []) {
    const name = f.name;
    const dest = path.join(workDir, name);
    ensureDir(path.dirname(dest));
    let content = f.content;
    if (name === 'config/ai-toolkit-flux.yaml' || name.endsWith('ai-toolkit-flux.yaml')) {
      content = absolutizeAiToolkitYaml(content, { datasetAbs, outputAbs });
      configAbs = dest;
    }
    fs.writeFileSync(dest, content, 'utf8');
  }

  return {
    workDir,
    configAbs,
    datasetAbs,
    outputAbs,
    imageCount,
    triggerToken: pack.triggerToken
  };
}

function expandCmd(template, vars) {
  return String(template)
    .replace(/\{workDir\}/g, vars.workDir)
    .replace(/\{config\}/g, vars.configAbs)
    .replace(/\{personaId\}/g, vars.personaId)
    .replace(/\{trigger\}/g, vars.triggerToken);
}

/**
 * Parsea comando shell simple en argv (sin shell) — split por espacios respetando comillas.
 */
function parseArgv(cmd) {
  const parts = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) {
    parts.push(m[1] ?? m[2] ?? m[3]);
  }
  if (!parts.length) throw new Error('LOCAL_LORA_TRAIN_CMD vacío tras expandir');
  return { file: parts[0], args: parts.slice(1) };
}

function buildSpawnSpec({ workDir, configAbs, personaId, triggerToken }, env = process.env) {
  const toolkit = getAiToolkitDir(env);
  const tmpl = getTrainCmdTemplate(env);
  const vars = { workDir, configAbs, personaId: String(personaId), triggerToken: triggerToken || '' };

  if (tmpl) {
    const expanded = expandCmd(tmpl, vars);
    const { file, args } = parseArgv(expanded);
    return {
      file,
      args,
      cwd: toolkit || workDir,
      commandPreview: expanded
    };
  }
  if (toolkit) {
    return {
      file: process.env.LOCAL_LORA_PYTHON || 'python',
      args: ['run.py', configAbs],
      cwd: toolkit,
      commandPreview: `python run.py ${configAbs}`
    };
  }
  return null;
}

function jobKey(personaId) {
  return String(personaId);
}

function getJob(personaId) {
  return jobs.get(jobKey(personaId)) || null;
}

function clearJob(personaId) {
  const j = jobs.get(jobKey(personaId));
  if (j?.child && j.exitCode == null) {
    try { j.child.kill('SIGTERM'); } catch (_) {}
  }
  jobs.delete(jobKey(personaId));
}

/**
 * Lanza el trainer externo. Inyectable `spawnImpl` para tests.
 * @returns {{ jobId: string, pid: number|null, commandPreview: string, workDir: string }}
 */
function startTrainProcess({
  personaId,
  workDir,
  configAbs,
  triggerToken,
  spawnImpl = spawn,
  env = process.env
}) {
  const spec = buildSpawnSpec({ workDir, configAbs, personaId, triggerToken }, env);
  if (!spec) {
    throw new Error(
      'Sin LOCAL_LORA_TRAIN_CMD ni AI_TOOLKIT_DIR: solo materialización. Configura uno para spawn (docs/lora/L5_LOCAL_TRAIN.md).'
    );
  }

  // Un job activo por persona
  const prev = getJob(personaId);
  if (prev && prev.exitCode == null && prev.child) {
    throw new Error('Ya hay un entrenamiento local en curso para esta persona. Sincroniza o espera.');
  }

  const child = spawnImpl(spec.file, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const entry = {
    personaId: String(personaId),
    pid: child.pid || null,
    child,
    exitCode: null,
    startedAt: new Date().toISOString(),
    workDir,
    logTail: []
  };

  const pushLog = (buf) => {
    const line = String(buf || '').trim();
    if (!line) return;
    entry.logTail.push(line.slice(0, 400));
    if (entry.logTail.length > 40) entry.logTail.shift();
  };
  if (child.stdout) child.stdout.on('data', pushLog);
  if (child.stderr) child.stderr.on('data', pushLog);
  child.on('error', (err) => {
    entry.exitCode = entry.exitCode ?? 1;
    pushLog(`spawn error: ${err.message}`);
  });
  child.on('close', (code) => {
    entry.exitCode = code == null ? 1 : code;
    entry.child = null;
  });

  jobs.set(jobKey(personaId), entry);
  return {
    jobId: jobKey(personaId),
    pid: entry.pid,
    commandPreview: spec.commandPreview,
    workDir
  };
}

/**
 * Busca el .safetensors más reciente bajo outputAbs (recursivo, profundidad limitada).
 */
function findLatestWeights(outputAbs, { maxDepth = 4 } = {}) {
  if (!outputAbs || !fs.existsSync(outputAbs)) return null;
  let best = null;
  let bestMtime = 0;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
      } else if (ent.isFile() && /\.safetensors$/i.test(ent.name)) {
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs >= bestMtime) {
            bestMtime = st.mtimeMs;
            best = full;
          }
        } catch (_) {}
      }
    }
  }
  walk(outputAbs, 0);
  return best;
}

/**
 * Copia pesos a DATA_DIR/loras/<personaId>/ y opcionalmente a *_LORAS_DIR.
 * @returns {{ weightsRel: string, destName: string, destAbs: string }}
 */
function promoteWeights(personaId, weightsAbs, { destName } = {}) {
  const personaLoraDir = path.join(DATA_DIR, 'loras', String(personaId));
  ensureDir(personaLoraDir);
  const base = destName || path.basename(weightsAbs);
  const safe = String(base).replace(/[^a-zA-Z0-9._-]/g, '_');
  const name = safe.toLowerCase().endsWith('.safetensors') ? safe : `${safe}.safetensors`;
  const destAbs = path.join(personaLoraDir, name);
  fs.copyFileSync(weightsAbs, destAbs);

  const comfyLorasDir = (process.env.COMFYUI_LORAS_DIR || '').trim();
  if (comfyLorasDir) {
    ensureDir(comfyLorasDir);
    fs.copyFileSync(destAbs, path.join(comfyLorasDir, name));
  }
  const a1111LorasDir = (process.env.A1111_LORAS_DIR || process.env.FORGE_LORAS_DIR || '').trim();
  if (a1111LorasDir) {
    ensureDir(a1111LorasDir);
    fs.copyFileSync(destAbs, path.join(a1111LorasDir, name));
  }

  const weightsRel = path.join('loras', String(personaId), name).replace(/\\/g, '/');
  return { weightsRel, destName: name, destAbs };
}

/**
 * Estado del job en memoria + disco.
 * @returns {{ running: boolean, exitCode: number|null, weightsAbs: string|null, workDir: string|null, logTail: string[] }}
 */
function pollTrainJob(personaId, { outputAbs } = {}) {
  const j = getJob(personaId);
  const workDir = j?.workDir || null;
  const out = outputAbs || (workDir ? path.join(workDir, 'output') : null);
  const weightsAbs = out ? findLatestWeights(out) : null;
  return {
    running: !!(j && j.exitCode == null && j.child),
    exitCode: j ? j.exitCode : null,
    pid: j?.pid || null,
    weightsAbs,
    workDir,
    logTail: j?.logTail ? j.logTail.slice(-10) : [],
    startedAt: j?.startedAt || null
  };
}

/** Map process state → persona_loras.status */
function mapLocalTrainStatus(poll) {
  if (!poll) return 'failed';
  if (poll.running) return 'training';
  if (poll.exitCode === 0 && poll.weightsAbs) return 'ready';
  if (poll.exitCode === 0 && !poll.weightsAbs) return 'failed'; // éxito sin pesos
  if (poll.exitCode != null && poll.exitCode !== 0) return 'failed';
  if (poll.weightsAbs) return 'ready'; // pesos aparecieron sin job en memoria
  return 'training';
}

/** Test helper */
function _resetJobsForTests() {
  for (const id of [...jobs.keys()]) clearJob(id);
}

module.exports = {
  isLocalTrainEnabled,
  canSpawnTrainer,
  getTrainCmdTemplate,
  getAiToolkitDir,
  personaTrainRoot,
  absolutizeAiToolkitYaml,
  materializePack,
  buildSpawnSpec,
  startTrainProcess,
  findLatestWeights,
  promoteWeights,
  pollTrainJob,
  mapLocalTrainStatus,
  getJob,
  clearJob,
  _resetJobsForTests
};
