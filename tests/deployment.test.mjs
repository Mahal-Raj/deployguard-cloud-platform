import test from "node:test";
import assert from "node:assert/strict";
import { DeploymentEngine } from "../src/domain.mjs";

test("promotes a healthy release through every canary stage", () => {
  const engine = new DeploymentEngine();
  engine.deploy("checkout-api", "v2.9.0");
  assert.equal(engine.snapshot().services[0].traffic, 10);
  assert.equal(engine.evaluate("checkout-api").decision, "promote");
  assert.equal(engine.snapshot().services[0].traffic, 25);
  engine.evaluate("checkout-api"); engine.evaluate("checkout-api");
  assert.equal(engine.snapshot().services[0].stable, "v2.9.0");
});

test("automatically rolls back an SLO breach", () => {
  const engine = new DeploymentEngine();
  engine.deploy("identity-api", "v1.15.0");
  engine.inject("identity-api", "errors");
  const result = engine.evaluate("identity-api");
  assert.equal(result.decision, "rollback");
  assert.equal(engine.snapshot().services[1].candidate, null);
  assert.match(engine.snapshot().events[0].message, /rolled back automatically/);
});

test("rejects invalid versions and concurrent production canaries", () => {
  const engine = new DeploymentEngine();
  assert.throws(() => engine.deploy("checkout-api", "latest"), /semantic/);
  engine.deploy("checkout-api", "v2.9.0");
  assert.throws(() => engine.deploy("identity-api", "v1.15.0"), /one production canary/);
});
