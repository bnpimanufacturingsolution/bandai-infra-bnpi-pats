/**
 * Apply PROD > UAT > DEV resource tiers to GitOps runtime overlays.
 * Idempotent: safe to re-run. Values match the boss-approved tier table exactly.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();

/** @typedef {{cpuReq:string,memReq:string,cpuLim:string,memLim:string,nodeOptions?:string}} Res */

/** @type {Record<string,{priority:string,api:Res,app:Res,emp:Res,pg:Res,watcher?:Res}>} */
const T = {
  prod: {
    priority: "project-truth-prod",
    api: {
      cpuReq: "1000m",
      memReq: "1536Mi",
      cpuLim: "2000m",
      memLim: "3072Mi",
      nodeOptions: "--max-old-space-size=2048",
    },
    app: { cpuReq: "100m", memReq: "128Mi", cpuLim: "500m", memLim: "512Mi" },
    emp: { cpuReq: "50m", memReq: "64Mi", cpuLim: "250m", memLim: "256Mi" },
    pg: { cpuReq: "500m", memReq: "1024Mi", cpuLim: "1500m", memLim: "2048Mi" },
  },
  uat: {
    priority: "project-truth-uat",
    api: {
      cpuReq: "500m",
      memReq: "768Mi",
      cpuLim: "1000m",
      memLim: "1536Mi",
      nodeOptions: "--max-old-space-size=1024",
    },
    app: { cpuReq: "100m", memReq: "128Mi", cpuLim: "400m", memLim: "384Mi" },
    emp: { cpuReq: "50m", memReq: "64Mi", cpuLim: "200m", memLim: "256Mi" },
    pg: { cpuReq: "300m", memReq: "512Mi", cpuLim: "800m", memLim: "1024Mi" },
  },
  dev: {
    priority: "project-truth-dev",
    api: {
      cpuReq: "250m",
      memReq: "512Mi",
      cpuLim: "1500m",
      memLim: "2048Mi",
      nodeOptions: "--max-old-space-size=1536",
    },
    app: { cpuReq: "50m", memReq: "64Mi", cpuLim: "300m", memLim: "256Mi" },
    emp: { cpuReq: "50m", memReq: "64Mi", cpuLim: "200m", memLim: "256Mi" },
    pg: { cpuReq: "250m", memReq: "512Mi", cpuLim: "800m", memLim: "1536Mi" },
    watcher: {
      cpuReq: "100m",
      memReq: "128Mi",
      cpuLim: "500m",
      memLim: "512Mi",
    },
  },
};

function resYaml(r, indent = "          ") {
  return (
    `${indent}resources:\n` +
    `${indent}  requests:\n` +
    `${indent}    cpu: "${r.cpuReq}"\n` +
    `${indent}    memory: ${r.memReq}\n` +
    `${indent}  limits:\n` +
    `${indent}    cpu: "${r.cpuLim}"\n` +
    `${indent}    memory: ${r.memLim}\n`
  );
}

function stripPrevious(text) {
  text = text.replace(/^\s*priorityClassName: project-truth-\w+\r?\n/gm, "");
  text = text.replace(
    /^\s*- name: NODE_OPTIONS\r?\n\s+value: "?--max-old-space-size=\d+"?\r?\n/gm,
    ""
  );
  text = text.replace(
    /^\s*resources:\r?\n\s*requests:\r?\n\s*cpu: "?[^"\n]+"?\r?\n\s*memory: [^\n]+\r?\n\s*limits:\r?\n\s*cpu: "?[^"\n]+"?\r?\n\s*memory: [^\n]+\r?\n/gm,
    ""
  );
  return text;
}

function injectAfterImagePull(text, uniqueContextBeforePull, resources) {
  const needle = uniqueContextBeforePull + "          imagePullPolicy: Never\n";
  const alt = uniqueContextBeforePull + "          imagePullPolicy: Never\r\n";
  if (text.includes(needle)) {
    return text.replace(needle, needle + resYaml(resources));
  }
  if (text.includes(alt)) {
    return text.replace(alt, alt + resYaml(resources));
  }
  console.error("MISS imagePull inject near:", uniqueContextBeforePull.slice(0, 80));
  process.exitCode = 1;
  return text;
}

function injectPriorityAfterPodSpec(text, deployName, priority) {
  const re = new RegExp(
    `(name: ${deployName}\\r?\\n[\\s\\S]*?\\r?\\n    spec:\\r?\\n)(      (?:securityContext|initContainers|containers):)`,
    "m"
  );
  if (!re.test(text)) {
    console.error("MISS priority for", deployName);
    process.exitCode = 1;
    return text;
  }
  return text.replace(re, `$1      priorityClassName: ${priority}\n$2`);
}

function injectNodeOptionsOnApi(text, envName, nodeOptions) {
  // Only the bnpi-pats-api Deployment, not the db-init Job (which also has APP_ENV).
  const re = new RegExp(
    `(name: bnpi-pats-api\\r?\\n[\\s\\S]*?- name: APP_ENV\\r?\\n\\s+value: ${envName}\\r?\\n)(            - name: )`,
    "m"
  );
  if (!re.test(text)) {
    console.error("MISS APP_ENV under bnpi-pats-api for", envName);
    process.exitCode = 1;
    return text;
  }
  return text.replace(
    re,
    `$1            - name: NODE_OPTIONS\n              value: ${nodeOptions}\n$2`
  );
}

function ensureKustomizationPriority(env) {
  const file = path.join(
    root,
    "gitops",
    "runtime-k8s",
    "overlays",
    env,
    "kustomization.yaml"
  );
  let k = fs.readFileSync(file, "utf8");
  if (k.includes("priority-classes.yaml")) {
    return;
  }
  if (k.includes("resources:\n  - runtime.yaml\n")) {
    k = k.replace(
      "resources:\n  - runtime.yaml\n",
      "resources:\n  - ../../base/priority-classes.yaml\n  - runtime.yaml\n"
    );
  } else if (k.includes("resources:\r\n  - runtime.yaml\r\n")) {
    k = k.replace(
      "resources:\r\n  - runtime.yaml\r\n",
      "resources:\r\n  - ../../base/priority-classes.yaml\r\n  - runtime.yaml\r\n"
    );
  } else {
    console.error("MISS resources list in", file);
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(file, k);
  console.log("updated", env, "kustomization");
}

function patchFile(env) {
  const file = path.join(
    root,
    "gitops",
    "runtime-k8s",
    "overlays",
    env,
    "runtime.yaml"
  );
  let text = fs.readFileSync(file, "utf8");
  text = stripPrevious(text);
  const t = T[env];

  text = injectAfterImagePull(
    text,
    `        - name: postgres\n          image: postgres:16-alpine\n`,
    t.pg
  );
  text = injectPriorityAfterPodSpec(text, "bnpi-pats-postgres", t.priority);

  text = injectAfterImagePull(
    text,
    `        - name: api\n          image: bnpi-pats-api-local:develop\n`,
    t.api
  );
  text = injectPriorityAfterPodSpec(text, "bnpi-pats-api", t.priority);
  text = injectNodeOptionsOnApi(text, env, t.api.nodeOptions);

  text = injectAfterImagePull(
    text,
    `        - name: app\n          image: bnpi-pats-app-local:develop\n`,
    t.app
  );
  text = injectPriorityAfterPodSpec(text, "bnpi-pats-app", t.priority);

  text = injectAfterImagePull(
    text,
    `        - name: app\n          image: bnpi-pats-emp-app-local:develop\n`,
    t.emp
  );
  text = injectPriorityAfterPodSpec(text, "bnpi-pats-emp-app", t.priority);

  if (t.watcher && text.includes("name: bnpi-pats-hikvision-watcher")) {
    text = injectAfterImagePull(
      text,
      `        - name: watcher\n          image: bnpi-pats-api-db-init:develop\n`,
      t.watcher
    );
    text = injectPriorityAfterPodSpec(
      text,
      "bnpi-pats-hikvision-watcher",
      t.priority
    );
  }

  fs.writeFileSync(file, text);
  const expectedPriority = env === "dev" ? 5 : 4;
  const expectedResources = env === "dev" ? 5 : 4;
  const checks = {
    priority: (text.match(/priorityClassName:/g) || []).length,
    resources: (text.match(/^\s+resources:/gm) || []).length,
    nodeOptions: (text.match(/NODE_OPTIONS/g) || []).length,
  };
  console.log(env, checks);
  if (
    checks.priority < expectedPriority ||
    checks.resources < expectedResources ||
    checks.nodeOptions < 1
  ) {
    console.error("INCOMPLETE", env, checks, {
      expectedPriority,
      expectedResources,
    });
    process.exitCode = 1;
  }
}

const basePc = path.join(
  root,
  "gitops",
  "runtime-k8s",
  "base",
  "priority-classes.yaml"
);
if (!fs.existsSync(basePc)) {
  console.error("missing", basePc);
  process.exit(1);
}

for (const env of ["prod", "uat", "dev"]) {
  ensureKustomizationPriority(env);
  patchFile(env);
}

if (process.exitCode) {
  console.error("apply-env-resource-tiers failed");
  process.exit(process.exitCode);
}
console.log("done");
