import assert from "node:assert/strict";
import test from "node:test";
import { planRulePublication, ruleSeriesIssues } from "../lib/rule-series.ts";

const historical = {
  id: 1,
  version: "CCEW-1",
  status: "PUBLISHED",
  effectiveFrom: "2020-01-01",
  effectiveTo: "2025-12-31",
};
const current = {
  id: 2,
  version: "CCEW-2",
  status: "PUBLISHED",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

test("a continuous published rule series has no exception", () => {
  assert.deepEqual(ruleSeriesIssues([current, historical]), []);
});

test("rule coverage reports gaps and overlaps", () => {
  assert.match(
    ruleSeriesIssues([
      { ...historical, effectiveTo: "2025-12-20" },
      current,
    ])[0],
    /coverage gap/,
  );
  assert.match(
    ruleSeriesIssues([
      { ...historical, effectiveTo: "2026-01-02" },
      current,
    ])[0],
    /overlaps/,
  );
});

test("publication closes the latest open predecessor on the prior day", () => {
  const result = planRulePublication(
    {
      id: 3,
      version: "CCEW-3",
      status: "DRAFT",
      effectiveFrom: "2027-04-01",
      effectiveTo: null,
    },
    [historical, current],
  );
  assert.deepEqual(result, {
    predecessorId: 2,
    predecessorEffectiveTo: "2027-03-31",
  });
});

test("publication rejects duplicate versions and out-of-order dates", () => {
  assert.throws(
    () =>
      planRulePublication(
        {
          id: 3,
          version: "ccew-2",
          status: "DRAFT",
          effectiveFrom: "2027-01-01",
          effectiveTo: null,
        },
        [historical, current],
      ),
    /unique/,
  );
  assert.throws(
    () =>
      planRulePublication(
        {
          id: 3,
          version: "CCEW-3",
          status: "DRAFT",
          effectiveFrom: "2025-06-01",
          effectiveTo: null,
        },
        [historical, current],
      ),
    /conflicts/,
  );
});

