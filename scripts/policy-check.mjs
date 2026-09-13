import { readFile } from "node:fs/promises";
const files=["Dockerfile","deploy/helm/deployguard/templates/deployment.yaml","deploy/helm/deployguard/templates/networkpolicy.yaml"];
const content=(await Promise.all(files.map(f=>readFile(f,"utf8")))).join("\n");
const checks=[
  ["non-root container",/runAsNonRoot:\s*true/],
  ["read-only filesystem",/readOnlyRootFilesystem:\s*true/],
  ["CPU and memory limits",/limits:[\s\S]*cpu:[\s\S]*memory:/],
  ["liveness probe",/livenessProbe:/],
  ["readiness probe",/readinessProbe:/],
  ["network policy",/kind:\s*NetworkPolicy/],
  ["pinned runtime image",/FROM node:22-alpine/]
];
let failed=false;for(const [name,rule] of checks){const ok=rule.test(content);console.log(`${ok?"PASS":"FAIL"} ${name}`);failed ||= !ok}if(failed)process.exit(1);
