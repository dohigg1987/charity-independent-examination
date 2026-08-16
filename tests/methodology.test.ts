import assert from "node:assert/strict";
import test from "node:test";
import { directions, programmeForJurisdiction } from "../lib/work-programme";

test("the controlled programme contains all 13 Charity Commission Directions", () => {
  assert.deepEqual(
    directions.map((direction) => direction.id),
    Array.from({ length: 13 }, (_, index) => index + 1),
  );
});

test("every Direction has an objective, applicability rule and procedures", () => {
  for (const direction of directions) {
    assert.ok(direction.objective.length > 20);
    assert.ok(direction.applies.length > 0);
    assert.ok(direction.procedures.length >= 4);
  }
});

test("the programme remains limited-assurance oriented", () => {
  const programme = JSON.stringify(directions).toLowerCase();
  assert.match(programme, /analytical/);
  assert.doesNotMatch(programme, /true and fair opinion/);
  assert.doesNotMatch(programme, /reasonable assurance/);
});

test("Scotland and Northern Ireland load jurisdiction-neutral regulatory areas", () => {
  for (const jurisdiction of ["SCOTLAND", "NORTHERN_IRELAND"]) {
    const programme = programmeForJurisdiction(jurisdiction);
    assert.equal(programme.length, 13);
    assert.match(JSON.stringify(programme).toLowerCase(), /limited-assurance|analytical/);
    assert.doesNotMatch(JSON.stringify(programme), /CC32/);
  }
});
