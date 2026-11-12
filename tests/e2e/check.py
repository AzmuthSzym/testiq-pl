"""Przejście testów w Chromium: wysyłka wyniku, porównanie z innymi, zrzuty.

Uruchamiane przez run.sh (strona pod http://site:8000, API pod http://api:8000).
"""

import json
import sys

from playwright.sync_api import sync_playwright

SITE = "http://site:8000"
API = "http://api:8000"
failures = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def with_api(context):
    # config.js wskazuje na API w sieci testowej
    context.route("**/assets/config.js", lambda route: route.fulfill(
        content_type="application/javascript",
        body=f"window.TESTIQ_CONFIG = {{ apiUrl: '{API}' }};"))


def new_page(browser, **kw):
    context = browser.new_context(**kw)
    with_api(context)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    return context, page, errors


def play_cube(page, correct_count, consent=True, keyboard=False):
    page.goto(f"{SITE}/kostka/")
    if consent:
        page.check("#consent")
    page.fill("#by", "1990")
    page.click("#start")
    answers = page.evaluate("CubeCore.generateItems('kostka-v2', 20, {version: 2}).map(i => i.answer)")
    for i, ans in enumerate(answers):
        choice = ans if i < correct_count else (ans + 1) % 6
        page.wait_for_selector(f"text=Zadanie {i + 1} z 20")
        if keyboard:
            page.keyboard.press("ABCDEF"[choice])
        else:
            page.locator(".options .opt").nth(choice).click()
    page.wait_for_selector("text=Wynik")


def play_runner(page, path, answers_js, keyboard=False, correct_count=None):
    """Przechodzi test zbudowany na TestRunner: odpowiedzi z generatora w przeglądarce."""
    page.goto(f"{SITE}/{path}/")
    page.check("#consent")
    page.click("#start")
    answers = page.evaluate(answers_js)
    for i, ans in enumerate(answers):
        page.wait_for_function(f"document.getElementById('count') && document.getElementById('count').textContent === 'Zadanie {i + 1} z {len(answers)}'")
        choice = ans if correct_count is None or i < correct_count else (ans + 1) % 8
        if keyboard:
            page.keyboard.press("ABCDEFGH"[choice])
        else:
            page.locator("#item .opt").nth(choice).click()
    page.wait_for_selector("text=Wynik")
    return answers


def seed(page, n):
    for i in range(n):
        body = {
            "test": "kostka-v2", "version": 1, "participant": f"seed-participant-{i:04d}",
            "startedAt": "2026-11-12T10:00:00Z", "durationMs": 300000, "timedOut": False,
            "meta": {"birthYear": None, "education": None, "consent": True},
            "responses": [{"item": k + 1, "correct": k < (i % 21), "ms": 4000, "choice": 0, "moves": 1}
                          for k in range(20)],
        }
        r = page.request.post(f"{API}/api/results", data=json.dumps(body),
                              headers={"Content-Type": "application/json"})
        assert r.status in (200, 201), r.status


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 1. Pierwszy uczestnik: wynik wysłany, za mało danych na rozkład.
        ctx, page, errors = new_page(browser, viewport={"width": 1000, "height": 900})
        page.goto(f"{SITE}/kostka/")
        page.screenshot(path="/out/kostka-intro-desktop.png", full_page=True)
        play_cube(page, 12)
        page.wait_for_selector("#compare >> text=Zbieramy dane")
        check("na razie: 1" in page.inner_text("#compare"), "pierwszy wynik zapisany w API")
        page.screenshot(path="/out/kostka-wynik-malo-danych.png", full_page=True)
        check(not errors, f"bez błędów JS: {errors}")
        ctx.close()

        # 2. Bez zgody nic nie idzie do API.
        ctx, page, errors = new_page(browser)
        sent = []
        page.on("request", lambda r: r.method == "POST" and sent.append(r.url))
        play_cube(page, 5, consent=False)
        page.wait_for_timeout(500)
        check(not sent, "bez zgody brak wysyłki")
        ctx.close()

        # 3. Po 30+ osobach: rozkład i centyl (1 + 35 + ten uczestnik = 37;
        #    wynik bez zgody nie trafił do bazy).
        ctx, page, errors = new_page(browser, viewport={"width": 1000, "height": 900})
        seed(page, 35)
        play_cube(page, 15)
        page.wait_for_selector("svg.hist")
        text = page.inner_text("#compare")
        check("wyższy niż u około" in text and "Próba: 37 osób" in text, "rozkład i centyl widoczne")
        check(page.locator("svg.hist rect.mine").count() == 1, "twój wynik wyróżniony")
        page.screenshot(path="/out/kostka-wynik-rozklad.png", full_page=True)
        ctx.close()

        # 4. Klawiatura, podwójne kliknięcie, ostrzeżenie przed opuszczeniem.
        ctx, page, errors = new_page(browser)
        page.goto(f"{SITE}/kostka/")
        page.keyboard.press("c")
        note = page.text_content("#exnote")
        check(note.startswith("Dobrze") or note.startswith("Poprawna odpowiedź to"),
              f"przykład działa z klawiatury: {note[:40]}")
        page.click("#start")
        page.wait_for_selector("text=Zadanie 1 z 20")
        page.locator(".options .opt").nth(0).dblclick()
        page.wait_for_selector("text=Zadanie 2 z 20")
        page.wait_for_timeout(400)
        check(page.text_content("#count") == "Zadanie 2 z 20", f"podwójne kliknięcie = jedna odpowiedź ({page.text_content('#count')})")
        page.keyboard.press("b")
        page.wait_for_selector("text=Zadanie 3 z 20")
        page.keyboard.press("4")
        page.wait_for_selector("text=Zadanie 4 z 20")
        check(True, "odpowiedzi klawiszami B i 4")
        dialogs = []
        page.on("dialog", lambda d: (dialogs.append(d.type), d.dismiss()))
        page.close(run_before_unload=True)
        ctx.pages[0].wait_for_timeout(500) if ctx.pages else None
        check(dialogs == ["beforeunload"], f"ostrzeżenie przed opuszczeniem testu: {dialogs}")
        ctx.close()
        ctx, page, errors = new_page(browser)
        play_cube(page, 3, keyboard=True)
        dialogs = []
        page.on("dialog", lambda d: (dialogs.append(d.type), d.dismiss()))
        page.close(run_before_unload=True)
        check(dialogs == [], "po teście bez ostrzeżenia")
        ctx.close()

        # 5. Wąski telefon (360 px), zadanie z 4 ruchami: wszystko w jednym rzędzie.
        ctx, page, errors = new_page(browser, viewport={"width": 360, "height": 780}, device_scale_factor=2)
        page.goto(f"{SITE}/kostka/")
        page.click("#start")
        for i in range(15):
            page.wait_for_selector(f"text=Zadanie {i + 1} z 20")
            page.keyboard.press("a")
        page.wait_for_selector("text=Zadanie 16 z 20")
        tops = page.eval_on_selector_all(".stem figure", "fs => fs.map(f => Math.round(f.getBoundingClientRect().top))")
        check(len(tops) == 5 and len(set(tops)) <= 2, f"kostka i 4 ruchy w jednym rzędzie: {tops}")
        width = page.evaluate("document.documentElement.scrollWidth")
        check(width <= 360, f"bez przewijania w poziomie na 360 px ({width}px)")
        page.screenshot(path="/out/kostka-4-ruchy-360.png", full_page=True)
        ctx.close()

        # 6. Telefon w ciemnym motywie: zrzuty do obejrzenia.
        ctx, page, errors = new_page(browser, viewport={"width": 390, "height": 844},
                                     color_scheme="dark", device_scale_factor=2)
        page.goto(f"{SITE}/kostka/")
        page.screenshot(path="/out/kostka-intro-telefon-ciemny.png", full_page=True)
        page.click("#start")
        page.wait_for_selector("text=Zadanie 1 z 20")
        page.screenshot(path="/out/kostka-zadanie-telefon-ciemny.png", full_page=True)
        width = page.evaluate("document.documentElement.scrollWidth")
        check(width <= 390, f"bez przewijania w poziomie na telefonie ({width}px)")
        ctx.close()

        # 7. Matryce: przejście, wynik, zrzuty (komputer i telefon w ciemnym motywie).
        ctx, page, errors = new_page(browser, viewport={"width": 1000, "height": 1100})
        page.goto(f"{SITE}/matryce/")
        page.screenshot(path="/out/matryce-intro.png", full_page=True)
        page.locator("#example .opt").nth(0).click()
        check(page.locator("#example .opt.right").count() == 1, "matryce: przykład pokazuje poprawną odpowiedź")
        page.check("#consent")
        page.click("#start")
        page.wait_for_selector("text=Zadanie 1 z 16")
        page.screenshot(path="/out/matryce-zadanie-1.png", full_page=True)
        answers = page.evaluate("MatrixCore.generateItems('matryce-v1', 16).map(i => i.answer)")
        for i, ans in enumerate(answers):
            page.wait_for_function(f"document.getElementById('count').textContent === 'Zadanie {i + 1} z 16'")
            if i == 13:
                page.screenshot(path="/out/matryce-zadanie-14.png", full_page=True)
            page.keyboard.press("ABCDEFGH"[ans if i < 10 else (ans + 1) % 8])
        page.wait_for_selector("#compare >> text=Zbieramy dane")
        check(page.text_content(".score").strip().startswith("10"), f"matryce: wynik 10 ({page.text_content('.score').strip()})")
        page.screenshot(path="/out/matryce-wynik.png", full_page=True)
        check(not errors, f"matryce: bez błędów JS: {errors}")
        ctx.close()
        ctx, page, errors = new_page(browser, viewport={"width": 360, "height": 780}, color_scheme="dark", device_scale_factor=2)
        page.goto(f"{SITE}/matryce/")
        page.click("#start")
        for i in range(13):
            page.wait_for_function(f"document.getElementById('count').textContent === 'Zadanie {i + 1} z 16'")
            page.keyboard.press("a")
        page.wait_for_function("document.getElementById('count').textContent === 'Zadanie 14 z 16'")
        page.screenshot(path="/out/matryce-telefon-ciemny.png", full_page=True)
        width = page.evaluate("document.documentElement.scrollWidth")
        check(width <= 360, f"matryce: bez przewijania w poziomie na 360 px ({width}px)")
        ctx.close()

        browser.close()
    print("E2E " + ("PASSED" if not failures else f"FAILED ({len(failures)})"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
