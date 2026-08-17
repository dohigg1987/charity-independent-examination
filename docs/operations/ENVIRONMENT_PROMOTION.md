# Environment promotion

Clarity IE promotes one immutable commit through four isolated environments. Development data never flows forward. Production data never flows backward; sanitized fixtures are generated separately.

| Stage | Evidence required to exit |
|---|---|
| dev | CI, migration, health, authentication and tenant-boundary checks |
| test | regression suite and tester acceptance against stable fixtures |
| preprod | production-shaped rehearsal, restore rehearsal evidence and release approval |
| production | health assurance, monitored canary, release record and rollback target |

Normal releases use `.github/workflows/promote.yml` and the exact 40-character SHA. Emergency rollback restores a previously healthy Worker version. If a schema change caused the incident, stop writes where necessary and follow the Neon recovery procedure; never assume code rollback reverses database changes.

