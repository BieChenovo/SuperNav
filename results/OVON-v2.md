# OVON v2 results

240/240 unique task/executor records independently scored. All eight original GPU stress workloads restored and verified.

| Method | Distance | Episodes | Baseline SR | v2 SR | Change (pp) | v2 SPL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ovon_geo | 0.25 m | 120 | 51.67% | 44.17% | -7.50 | 0.2750 |
| ovon_geo | 1 m | 120 | 65.00% | 60.83% | -4.17 | 0.3639 |
| ovon_learned | 0.25 m | 120 | 51.67% | 57.50% | +5.83 | 0.1412 |
| ovon_learned | 1 m | 120 | 63.33% | 66.67% | +3.33 | 0.1602 |

Same 120 episodes per method, original Skills and stopping rules. Geo changes prompt/tool consistency only; Learned applies 0.1/3 through the repaired parameter binding. Request capacity remains 8 MiB. OVON MTU3D replica credits applied consistently. Baseline uses an older recorded Codex CLI; this remains a comparison limitation.

## Learned comparison with the paper

Verified against [SuperNav v1, Table 2 and Appendix C.3](https://arxiv.org/html/2610.12126v1#S4.T2) on 2026-10-27. The paper describes a local stop probability threshold of 0.1 and a prefix of three predicted displacement increments.

| Distance | Previous local SR | v2 SR | Paper SR | v2 minus paper (pp) | v2 SPL | Paper SPL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.25 m | 51.67% (62/120) | 57.50% (69/120) | 65.00% (78/120) | -7.50 | 0.1412 | 0.1355 |
| 1 m | 63.33% (76/120) | 66.67% (80/120) | 70.83% (85/120) | -4.17 | 0.1602 | 0.1443 |

The repaired binding was observed in all 1,576 recorded controller entries across 120 Learned episodes, using 0.1/3. This confirms that the configured parameters reached the controller. The single paired evaluation supports retaining the change, but does not establish that the parameters are optimal or that all paper differences are resolved.

After this evaluation, the working directory's Geo prompt changes were reverted at the user's request. This report, its manifest, frozen source and scored trajectories continue to describe the evaluated version before that rollback. No new evaluation was started. Verification: `../checks/geo_rollback.json`.
