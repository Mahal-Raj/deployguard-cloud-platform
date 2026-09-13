import { randomUUID } from "node:crypto";

const DEFAULT_SERVICES = [
  { name: "checkout-api", stable: "v2.8.4", candidate: null, traffic: 0, p95: 126, errorRate: 0.18, status: "healthy" },
  { name: "identity-api", stable: "v1.14.2", candidate: null, traffic: 0, p95: 88, errorRate: 0.09, status: "healthy" },
  { name: "recommendation-api", stable: "v3.6.0", candidate: null, traffic: 0, p95: 172, errorRate: 0.31, status: "healthy" }
];

export class DeploymentEngine {
  constructor() { this.reset(); }

  reset() {
    this.services = structuredClone(DEFAULT_SERVICES);
    this.events = [{ id: randomUUID(), at: new Date().toISOString(), type: "system", message: "Control plane synchronized with production" }];
    this.stats = { deployments: 47, rollbacks: 3, changeFailureRate: 6.0, leadTimeMinutes: 8.4 };
    return this.snapshot();
  }

  snapshot() {
    const active = this.services.find((service) => service.candidate);
    return {
      generatedAt: new Date().toISOString(),
      environment: "production",
      slo: { availabilityTarget: 99.9, maxP95Ms: 300, maxErrorRatePercent: 1.0 },
      services: this.services,
      activeRelease: active?.name ?? null,
      stats: this.stats,
      events: this.events.slice(0, 8)
    };
  }

  deploy(serviceName, version) {
    if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error("Version must use semantic format, for example v2.9.0");
    if (this.services.some((service) => service.candidate)) throw new Error("Only one production canary can run at a time");
    const service = this.#service(serviceName);
    if (service.stable === version) throw new Error("Candidate version must differ from stable");
    Object.assign(service, { candidate: version, traffic: 10, p95: 148, errorRate: 0.22, status: "canary" });
    this.stats.deployments += 1;
    this.#event("deploy", `${serviceName} ${version} deployed to 10% of production traffic`);
    return this.snapshot();
  }

  advance(serviceName) {
    const service = this.#active(serviceName);
    const steps = [10, 25, 50, 100];
    const next = steps[steps.indexOf(service.traffic) + 1];
    if (!next) throw new Error("Release is already fully promoted");
    service.traffic = next;
    service.p95 = Math.max(95, service.p95 - 8);
    service.errorRate = Math.max(0.08, Number((service.errorRate - 0.03).toFixed(2)));
    if (next === 100) {
      service.stable = service.candidate;
      service.candidate = null;
      service.traffic = 0;
      service.status = "healthy";
      this.#event("promote", `${serviceName} promoted after passing every SLO gate`);
    } else {
      this.#event("traffic", `${serviceName} canary traffic increased to ${next}%`);
    }
    return this.snapshot();
  }

  inject(serviceName, fault = "latency") {
    const service = this.#active(serviceName);
    if (fault === "errors") service.errorRate = 3.7;
    else service.p95 = 612;
    service.status = "degraded";
    this.#event("alert", `${serviceName} breached the ${fault === "errors" ? "error-rate" : "latency"} SLO`);
    return this.snapshot();
  }

  evaluate(serviceName) {
    const service = this.#active(serviceName);
    const reasons = [];
    if (service.p95 > 300) reasons.push(`p95 latency ${service.p95}ms > 300ms`);
    if (service.errorRate > 1) reasons.push(`error rate ${service.errorRate}% > 1%`);
    if (reasons.length) {
      const failed = service.candidate;
      Object.assign(service, { candidate: null, traffic: 0, p95: 126, errorRate: 0.18, status: "healthy" });
      this.stats.rollbacks += 1;
      this.stats.changeFailureRate = Number(((this.stats.rollbacks / this.stats.deployments) * 100).toFixed(1));
      this.#event("rollback", `${failed} rolled back automatically: ${reasons.join(", ")}`);
      return { decision: "rollback", reasons, state: this.snapshot() };
    }
    this.#event("gate", `${serviceName} passed the SLO analysis gate`);
    return { decision: "promote", reasons: [], state: this.advance(serviceName) };
  }

  #service(name) {
    const service = this.services.find((item) => item.name === name);
    if (!service) throw new Error(`Unknown service: ${name}`);
    return service;
  }
  #active(name) {
    const service = this.#service(name);
    if (!service.candidate) throw new Error(`${name} has no active canary`);
    return service;
  }
  #event(type, message) { this.events.unshift({ id: randomUUID(), at: new Date().toISOString(), type, message }); }
}
