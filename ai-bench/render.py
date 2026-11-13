"""Zrzuty ekranu zadań, tak jak zrobiłby je ktoś, kto chce zapytać AI.

Przechodzi prawdziwe strony testów w Chromium (te same zadania co dla
uczestników), przed każdą odpowiedzią robi zrzut obszaru z zadaniem i zapisuje
klucz odpowiedzi z generatora. Odpowiada poprawnie, żeby przejść dalej.

Uruchamiane przez run.sh render (strona pod http://site:8000).
Wynik: /out/img/<test>-<nr>.png i /out/items.json.
"""

import json
import os

from playwright.sync_api import sync_playwright

SITE = "http://site:8000"
OUT = "/out"

TESTS = [
    # (ścieżka, id wersji, wyrażenie JS z kluczem i poziomem, rodzaj odpowiedzi, liczba opcji)
    ("kostka", "kostka-v2", "CubeCore.generateItems('kostka-v2', 20, {version: 2}).map(i => [i.answer, i.moves.length])", "choice", 6),
    ("matryce", "matryce-v1", "MatrixCore.generateItems('matryce-v1', 16).map(i => [i.answer, i.level])", "choice", 8),
    ("ciagi", "ciagi-v1", "SeriesCore.generateItems('ciagi-v1', 16).map(i => [i.answer, i.level])", "number", None),
]
LETTERS = "ABCDEFGH"


def instructions(page):
    """Tekst instrukcji z ekranu startowego (bez formularza i przykładu)."""
    return page.evaluate("""() => {
        const app = document.getElementById('app');
        const out = [];
        for (const el of app.children) {
            if (el.tagName === 'H2') break;          // „Przykład” albo „Zanim zaczniesz”
            const t = el.innerText.trim();
            if (t) out.push(t);
        }
        return out.join('\\n\\n');
    }""")


def main():
    os.makedirs(f"{OUT}/img", exist_ok=True)
    items = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for path, test_id, key_js, kind, n_opt in TESTS:
            ctx = browser.new_context(viewport={"width": 1000, "height": 900}, device_scale_factor=1)
            page = ctx.new_page()
            page.goto(f"{SITE}/{path}/")
            instr = instructions(page)
            page.click("#start")
            answers = page.evaluate(key_js)
            question = None
            for i, (ans, level) in enumerate(answers):
                page.wait_for_function(
                    f"document.getElementById('count').textContent === 'Zadanie {i + 1} z {len(answers)}'")
                page.wait_for_timeout(250)  # rysunek gotowy
                question = page.text_content(".question").strip()
                img = f"{test_id}-{i + 1:02d}.png"
                # pasek z zegarem, pytanie i zadanie: to, co widać na zdjęciu ekranu
                page.locator("#app").screenshot(path=f"{OUT}/img/{img}")
                items.append({
                    "id": f"{test_id}-{i + 1:02d}", "test": test_id, "item": i + 1, "image": img,
                    "level": level, "kind": kind, "options": n_opt, "question": question, "instructions": instr,
                    "answer": LETTERS[ans] if kind == "choice" else ans,
                })
                if kind == "choice":
                    page.keyboard.press(LETTERS[ans])
                else:
                    page.fill("#ans-test", str(ans))
                    page.keyboard.press("Enter")
            ctx.close()
            print(f"{test_id}: {len(answers)} zadań")
        browser.close()
    with open(f"{OUT}/items.json", "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
