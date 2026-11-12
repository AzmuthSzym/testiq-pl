"""Raport analizy jednego testu z bazy API.

  python analysis/report.py --db deploy/data/results.db --test matryce-v1 --items 16 --guess 0.125

Wypisuje: N, statystyki zadań, rzetelność (alfa, omega), flagi braku
zaangażowania, a od N ≥ --irt-min kalibrację 2PL. Opcjonalnie eksport CSV.
Uruchamianie w Dockerze: analysis/run.sh (bez instalowania niczego na serwerze).
"""

import argparse
import sys

import numpy as np

from testiq_analysis import careless, data, irt, items


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--test", required=True)
    ap.add_argument("--items", type=int, required=True)
    ap.add_argument("--guess", type=float, default=0.0, help="szansa zgadnięcia (np. 1/8 dla matryc)")
    ap.add_argument("--fast-ms", type=float, default=1500)
    ap.add_argument("--irt-min", type=int, default=500, help="minimalne N do kalibracji 2PL (PROGRESS.md, 4.2)")
    ap.add_argument("--csv", help="eksport odpowiedzi do pliku CSV")
    args = ap.parse_args(argv)

    d = data.load(args.db, args.test, args.items)
    n = len(d.participants)
    print(f"Test {args.test}: N = {n} (pierwsze podejścia)")
    if args.csv:
        data.export_csv(d, args.csv)
        print(f"Eksport: {args.csv}")
    if n < 10:
        print("Za mało danych do analizy.")
        return 0

    fl = careless.flags(d.responses, d.times_ms, d.choices, args.guess, fast_ms=args.fast_ms)
    excl = np.array([f["wyklucz"] for f in fl])
    print(f"Brak zaangażowania (≥ 2 flagi): {excl.sum()} osób ({excl.mean():.0%})")
    for key in ["szybkie", "ta_sama_opcja", "bledy_guttmana", "wynik_losowy"]:
        print(f"  {key}: {sum(f[key] for f in fl)}")
    x = d.responses[~excl]

    total = np.nan_to_num(x).sum(axis=1)
    print(f"Wynik surowy: średnia {total.mean():.2f}, SD {total.std(ddof=1):.2f}")
    alpha = items.cronbach_alpha(x)
    print(f"Rzetelność: alfa Cronbacha {alpha:.3f}, omega McDonalda {items.mcdonald_omega(x):.3f}")
    print(f"Błąd standardowy pomiaru (wynik surowy): {items.sem_raw(x, alpha):.2f} pkt")
    print("\nZadanie  trudność p  korelacja z resztą  alfa bez zadania")
    for s in items.item_stats(x):
        warn = "  <- słabe" if (s["korelacja_z_reszta"] or 0) < 0.15 else ""
        print(f"{s['zadanie']:>7}  {s['trudnosc_p']:>10.2f}  {s['korelacja_z_reszta']:>18.2f}  {s['alfa_bez_zadania']:>16.3f}{warn}")

    if len(x) >= args.irt_min:
        fit = irt.fit_2pl(x)
        print(f"\nKalibracja 2PL ({fit['iterations']} iteracji, zbieżność: {fit['converged']})")
        print("Zadanie        a        b")
        for j, (a, b) in enumerate(zip(fit["a"], fit["b"])):
            print(f"{j + 1:>7}  {a:>7.2f}  {b:>7.2f}")
    else:
        print(f"\nKalibracja 2PL: za mało danych ({len(x)} < {args.irt_min}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
