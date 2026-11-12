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
    answers = page.evaluate("CubeCore.generateItems('kostka-v1', 20).map(i => i.answer)")
    for i, ans in enumerate(answers):
        choice = ans if i < correct_count else (ans + 1) % 6
        page.wait_for_selector(f"text=Zadanie {i + 1} z 20")
        if keyboard:
            page.keyboard.press("ABCDEF"[choice])
        else:
            page.locator(".options .opt").nth(choice).click()
    page.wait_for_selector("text=Wynik")


def seed(page, n):
    for i in range(n):
        body = {
            "test": "kostka-v1", "version": 1, "participant": f"seed-participant-{i:04d}",
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
        page.wait_for_selector("text=Zbieramy dane")
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

        # 4. Telefon w ciemnym motywie: zrzuty do obejrzenia.
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

        browser.close()
    print("E2E " + ("PASSED" if not failures else f"FAILED ({len(failures)})"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
