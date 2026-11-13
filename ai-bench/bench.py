"""Czy AI rozwiąże nasze zadania ze zrzutu ekranu?

Każde zadanie (obraz z render.py) idzie do modelu razem z instrukcją testu,
czyli w najkorzystniejszych dla AI warunkach: ktoś przepisał instrukcję i
wysłał zdjęcie zadania. Każde zadanie REPS razy (model nie jest deterministyczny).

  python bench.py estimate   tokeny wejścia i szacowany koszt (bez wysyłania)
  python bench.py submit     wysyła partię (Message Batches API, 50% taniej)
  python bench.py collect    pobiera wyniki, zapisuje out/results.jsonl i wyniki.md

Klucz z ANTHROPIC_API_KEY. Bez mechanizmu „fallback” na inny model: mierzymy
jeden konkretny model, a odmowę odpowiedzi liczymy osobno.
"""

import base64
import json
import re
import sys
from collections import defaultdict

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

MODEL = "claude-opus-5-5"
EFFORT = "high"
REPS = 3
MAX_TOKENS = 32000
# cennik Claude Opus 5.5 (USD za 1M tokenów), partia: połowa ceny
PRICE_IN, PRICE_OUT, BATCH = 4.00, 20.00, 0.5
OUT = "out"

client = anthropic.Anthropic()


def load_items():
    with open(f"{OUT}/items.json", encoding="utf-8") as f:
        return json.load(f)


def prompt(item):
    if item["kind"] == "choice":
        how = (f"Odpowiedzi są oznaczone literami A–{'ABCDEFGH'[item['options'] - 1]}. "
               "Na końcu napisz w osobnej linii: ODPOWIEDŹ: <litera>")
    else:
        how = "Odpowiedzią jest liczba całkowita. Na końcu napisz w osobnej linii: ODPOWIEDŹ: <liczba>"
    return (f"To zadanie z testu zdolności. Instrukcja testu:\n\n{item['instructions']}\n\n"
            f"Na zrzucie ekranu jest jedno zadanie. Pytanie: {item['question']}\n{how}")


def params(item):
    with open(f"{OUT}/img/{item['image']}", "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": EFFORT},
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}},
            {"type": "text", "text": prompt(item)},
        ]}],
    }


def estimate(items):
    per_test = defaultdict(list)
    for it in items:
        per_test[it["test"]].append(it)
    total_in = 0
    for test, its in per_test.items():
        p = params(its[0])
        n = client.messages.count_tokens(model=p["model"], messages=p["messages"],
                                         thinking=p["thinking"]).input_tokens
        total_in += n * len(its) * REPS
        print(f"{test}: {len(its)} zadań × {REPS}, ok. {n} tokenów wejścia na zadanie")
    calls = len(items) * REPS
    cost_in = total_in / 1e6 * PRICE_IN * BATCH
    for out_avg in (3000, 8000, 15000):
        cost = cost_in + calls * out_avg / 1e6 * PRICE_OUT * BATCH
        print(f"przy średnio {out_avg} tokenach odpowiedzi (z myśleniem): ok. ${cost:.2f}")
    print(f"maksimum (każda odpowiedź do limitu {MAX_TOKENS}): "
          f"${cost_in + calls * MAX_TOKENS / 1e6 * PRICE_OUT * BATCH:.2f}")


def submit(items):
    reqs = [Request(custom_id=f"{it['id']}-r{r}", params=MessageCreateParamsNonStreaming(**params(it)))
            for it in items for r in range(REPS)]
    batch = client.messages.batches.create(requests=reqs)
    with open(f"{OUT}/batch.json", "w") as f:
        json.dump({"id": batch.id, "model": MODEL, "effort": EFFORT, "reps": REPS}, f)
    print(f"Partia {batch.id}: {len(reqs)} zapytań, status {batch.processing_status}")


def parse(text, kind):
    m = re.findall(r"ODPOWIED[ŹZ]\s*:\s*\**\s*([A-H]|[−-]?\d+)", text, re.IGNORECASE)
    if not m:
        return None
    a = m[-1].replace("−", "-")
    return a.upper() if kind == "choice" else int(a)


def collect(items):
    with open(f"{OUT}/batch.json") as f:
        meta = json.load(f)
    batch = client.messages.batches.retrieve(meta["id"])
    c = batch.request_counts
    print(f"Status: {batch.processing_status} (gotowe {c.succeeded}, błędy {c.errored}, w toku {c.processing})")
    if batch.processing_status != "ended":
        return
    by_id = {it["id"]: it for it in items}
    rows = []
    for res in client.messages.batches.results(meta["id"]):
        item = by_id[res.custom_id.rsplit("-r", 1)[0]]
        row = {"id": res.custom_id, "test": item["test"], "item": item["item"], "level": item["level"],
               "key": item["answer"], "status": res.result.type}
        if res.result.type == "succeeded":
            msg = res.result.message
            text = "".join(b.text for b in msg.content if b.type == "text")
            row.update(stop=msg.stop_reason, answer=parse(text, item["kind"]),
                       input_tokens=msg.usage.input_tokens, output_tokens=msg.usage.output_tokens,
                       text=text[-400:])
            row["correct"] = row["answer"] == item["answer"]
        rows.append(row)
    with open(f"{OUT}/results.jsonl", "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    report(rows, meta)


def report(rows, meta):
    ok = [r for r in rows if r["status"] == "succeeded"]
    cost = sum(r["input_tokens"] / 1e6 * PRICE_IN + r["output_tokens"] / 1e6 * PRICE_OUT for r in ok) * BATCH
    chance = {"kostka-v2": "1/6 ≈ 17%", "matryce-v1": "1/8 ≈ 13%", "ciagi-v1": "≈ 0%"}
    lines = [
        "# Jak AI rozwiązuje nasze zadania",
        "",
        f"Model: `{meta['model']}` (wysiłek `{meta['effort']}`, myślenie adaptacyjne), "
        f"każde zadanie {meta['reps']} razy. Wejście: zrzut ekranu zadania z prawdziwej strony "
        "i pełna instrukcja testu, czyli warunki najkorzystniejsze dla ściągającego.",
        f"Zapytań: {len(rows)}, udanych: {len(ok)}, koszt: ${cost:.2f}.",
        "",
        "| Test | Poprawne | Zgadywanie | Brak odpowiedzi / odmowa | Śr. tokeny odpowiedzi |",
        "|---|---|---|---|---|",
    ]
    by_test = defaultdict(list)
    for r in ok:
        by_test[r["test"]].append(r)
    for test, rs in by_test.items():
        acc = sum(r["correct"] for r in rs) / len(rs)
        none = sum(r["answer"] is None for r in rs)
        tok = sum(r["output_tokens"] for r in rs) / len(rs)
        lines.append(f"| {test} | {acc:.0%} | {chance.get(test, '')} | {none} | {tok:.0f} |")
    lines += ["", "## Według poziomu trudności", "",
              "| Test | Poziom | Poprawne |", "|---|---|---|"]
    for test, rs in by_test.items():
        levels = defaultdict(list)
        for r in rs:
            levels[r["level"]].append(r["correct"])
        for lv in sorted(levels):
            v = levels[lv]
            lines.append(f"| {test} | {lv} | {sum(v)}/{len(v)} ({sum(v) / len(v):.0%}) |")
    lines += ["", "## Zgodność między powtórzeniami", "",
              "Odsetek zadań, które model rozwiązał we wszystkich / w żadnym z powtórzeń.", "",
              "| Test | Zawsze dobrze | Nigdy dobrze |", "|---|---|---|"]
    for test, rs in by_test.items():
        per_item = defaultdict(list)
        for r in rs:
            per_item[r["item"]].append(r["correct"])
        n = len(per_item)
        lines.append(f"| {test} | {sum(all(v) for v in per_item.values()) / n:.0%} | "
                     f"{sum(not any(v) for v in per_item.values()) / n:.0%} |")
    with open("wyniki.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    items = load_items()
    {"estimate": estimate, "submit": submit, "collect": collect}.get(cmd, lambda _: print(__doc__))(items)
