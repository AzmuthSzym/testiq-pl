"""Symulacja: od jakiego N kalibracja 2PL ma sens (PROGRESS.md, 4.2).

  python analysis/simulate_recovery.py > analysis/wyniki/odtwarzanie_2pl.md
"""
import sys

from testiq_analysis.irt import recovery_study

K = int(sys.argv[1]) if len(sys.argv) > 1 else 16
REPS = int(sys.argv[2]) if len(sys.argv) > 2 else 8
rows = recovery_study([100, 250, 500, 1000, 2000], K, REPS, seed=2026)
print(f"# Odtwarzanie parametrów 2PL: {K} zadań, {REPS} powtórzeń na N\n")
print("Prawdziwe parametry: a = exp(N(0; 0,3)) (ok. 0,5–2), b ~ N(0; 1), θ ~ N(0; 1).\n")
print("| N | RMSE a | RMSE b | r(â, a) | r(b̂, b) | r(θ̂, θ) |")
print("|---|---|---|---|---|---|")
for r in rows:
    print(f"| {r['N']} | {r['rmse_a']:.3f} | {r['rmse_b']:.3f} | {r['r_a']:.2f} | {r['r_b']:.2f} | {r['r_theta']:.2f} |")
