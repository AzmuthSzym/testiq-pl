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


def answer_assist(page, assist):
    """Pytanie po teście o pomoc (pokazywane tylko, gdy wynik idzie do API)."""
    page.wait_for_selector("text=Ostatnie pytanie")
    page.check(f'input[name="assist"][value="{assist}"]')
    page.click("#assist-ok")


def play_cube(page, correct_count, consent=True, keyboard=False, assist="nie", leave_at=None):
    page.goto(f"{SITE}/kostka/")
    if consent:
        page.check("#consent")
    page.fill("#by", "1990")
    page.select_option("#sex", "k")
    page.select_option("#lang", "pl")
    page.select_option("#country", "pl")
    page.click("#start")
    answers = page.evaluate("CubeCore.generateItems('kostka-v2', 20, {version: 2}).map(i => i.answer)")
    for i, ans in enumerate(answers):
        choice = ans if i < correct_count else (ans + 1) % 6
        page.wait_for_selector(f"text=Zadanie {i + 1} z 20")
        if i == leave_at:
            # wyjście z okna na chwilę (np. do czatu z AI) i powrót
            page.evaluate("window.dispatchEvent(new Event('blur'))")
            page.wait_for_timeout(300)
            page.evaluate("window.dispatchEvent(new Event('focus'))")
        if keyboard:
            page.keyboard.press("ABCDEF"[choice])
        else:
            page.locator(".options .opt").nth(choice).click()
    if consent:
        answer_assist(page, assist)
    page.wait_for_selector("h1 >> text=Obracanie kostki")


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
    answer_assist(page, "nie")
    page.wait_for_selector(".kicker >> text=Wynik")
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
        posted = []
        page.on("request", lambda r: r.method == "POST" and posted.append(json.loads(r.post_data)))
        play_cube(page, 12)
        page.wait_for_selector("#compare >> text=Zbieramy dane")
        check("na razie: 1" in page.inner_text("#compare"), "pierwszy wynik zapisany w API")
        meta = posted[0]["meta"] if posted else {}
        check(meta.get("sex") == "k" and meta.get("nativeLang") == "pl" and meta.get("country") == "pl",
              f"płeć, język i kraj wysłane: {meta}")
        page.screenshot(path="/out/kostka-wynik-malo-danych.png", full_page=True)
        check(not errors, f"bez błędów JS: {errors}")
        ctx.close()

        # 1b. Pomoc AI i wyjście z karty: wynik zapisany, ale nie wchodzi do norm.
        ctx, page, errors = new_page(browser)
        posted = []
        page.on("request", lambda r: r.method == "POST" and posted.append(json.loads(r.post_data)))
        play_cube(page, 20, assist="ai", leave_at=3)
        page.wait_for_selector("#compare >> text=Zbieramy dane")
        body = posted[0] if posted else {"meta": {}, "responses": []}
        away = [r for r in body["responses"] if r.get("away")]
        check(body["meta"].get("assist") == "ai", "odpowiedź o pomocy wysłana")
        check(len(away) == 1 and away[0]["item"] == 4 and away[0]["awayMs"] >= 250,
              f"wyjście z okna zapisane przy zadaniu 4: {away}")
        norms = page.request.get(f"{API}/api/norms/kostka-v2").json()
        check(norms["n"] == 1 and norms["excluded"] == 1, f"test z pomocą AI poza normami: n={norms['n']}, excluded={norms['excluded']}")
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
        page.wait_for_selector("text=Ostatnie pytanie")
        page.screenshot(path="/out/pytanie-o-pomoc.png", full_page=True)
        answer_assist(page, "nie")
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

        # 8. Ciągi: odpowiedź wpisywana, „Nie wiem”, błędny format, telefon.
        ctx, page, errors = new_page(browser, viewport={"width": 1000, "height": 900})
        page.goto(f"{SITE}/ciagi/")
        page.fill("#ans-ex", "abc")
        page.press("#ans-ex", "Enter")
        check("liczbę całkowitą" in page.text_content("#example .err"), "ciągi: komunikat przy złym formacie")
        page.fill("#ans-ex", "1")
        page.press("#ans-ex", "Enter")
        check(page.text_content("#exnote").startswith(("Dobrze", "Poprawna")), "ciągi: przykład ocenia odpowiedź")
        page.check("#consent")
        page.click("#start")
        answers = page.evaluate("SeriesCore.generateItems('ciagi-v1', 16).map(i => i.answer)")
        for i, ans in enumerate(answers):
            page.wait_for_function(f"document.getElementById('count').textContent === 'Zadanie {i + 1} z 16'")
            if i == 0:
                page.screenshot(path="/out/ciagi-zadanie.png", full_page=True)
            if i < 9:
                page.keyboard.type(str(ans).replace("-", "−"))  # minus typograficzny też działa
                page.keyboard.press("Enter")
            elif i < 12:
                page.fill("#ans-test", str(ans + 1))
                page.click("#item button[type=submit]")
            else:
                page.click("#item [data-skip]")
        answer_assist(page, "nie")
        page.wait_for_selector("#compare >> text=Zbieramy dane")
        check(page.text_content(".score").strip().startswith("9"), f"ciągi: wynik 9 ({page.text_content('.score').strip()})")
        page.screenshot(path="/out/ciagi-wynik.png", full_page=True)
        check(not errors, f"ciągi: bez błędów JS: {errors}")
        ctx.close()
        ctx, page, errors = new_page(browser, viewport={"width": 360, "height": 780}, color_scheme="dark", device_scale_factor=2)
        page.goto(f"{SITE}/ciagi/")
        page.click("#start")
        for i in range(9):
            page.wait_for_function(f"document.getElementById('count').textContent === 'Zadanie {i + 1} z 16'")
            page.click("#item [data-skip]")
        page.wait_for_function("document.getElementById('count').textContent === 'Zadanie 10 z 16'")
        page.screenshot(path="/out/ciagi-telefon-ciemny.png", full_page=True)
        width = page.evaluate("document.documentElement.scrollWidth")
        check(width <= 360, f"ciągi: bez przewijania w poziomie na 360 px ({width}px)")
        ctx.close()

        # 9. Pamięć robocza: cyfry pokazywane po kolei, odpowiedź, reguła przerwania.
        ctx, page, errors = new_page(browser, viewport={"width": 1000, "height": 900})
        page.goto(f"{SITE}/pamiec/")
        page.wait_for_selector("#example .digit-stage.on", timeout=5000)
        page.screenshot(path="/out/pamiec-cyfra.png", full_page=True)
        page.wait_for_selector("#dig-ex", timeout=10000)
        ex = page.evaluate("MemoryCore.generateItems('pamiec-przyklad')[0].answer")
        for d in ex:
            page.click(f"#example .keypad [data-d='{d}']")
        page.click("#example .keypad button[type=submit]")
        check(page.text_content("#exnote").startswith("Dobrze"), "pamięć: przykład z klawiatury ekranowej")
        page.check("#consent")
        page.click("#start")
        items = page.evaluate("MemoryCore.generateItems('pamiec-v1').map(i => i.answer)")
        # część 1: długości 3–5 dobrze, 6 obie źle -> przeskok do części 2;
        # część 2: długość 2 dobrze, 3 obie źle -> koniec
        plan = {0: True, 1: True, 2: True, 3: True, 4: True, 5: True, 6: False, 7: False, 14: True, 15: True, 16: False, 17: False}
        seen = []
        for idx, ok in plan.items():
            page.wait_for_function(f"document.getElementById('count') && document.getElementById('count').textContent === 'Zadanie {idx + 1} z 28'", timeout=20000)
            seen.append(idx)
            page.wait_for_selector("#dig-test", timeout=20000)
            page.fill("#dig-test", items[idx] if ok else "1")
            page.press("#dig-test", "Enter")
        answer_assist(page, "nie")
        page.wait_for_selector("#compare >> text=Zbieramy dane", timeout=20000)
        txt = page.text_content("main")
        check("w przód 5" in txt and "wspak 2" in txt, "pamięć: zakresy 5 i 2 po regule przerwania")
        check(page.text_content(".score").strip().startswith("8"), f"pamięć: wynik 8 ({page.text_content('.score').strip()})")
        page.screenshot(path="/out/pamiec-wynik.png", full_page=True)
        check(not errors, f"pamięć: bez błędów JS: {errors}")
        ctx.close()

        # 10. Słownictwo: bez zatwierdzonych zadań „w przygotowaniu”; z przykładowym
        #     bankiem (sztuczne słowa, tylko w teście) przejście testu.
        ctx, page, errors = new_page(browser)
        page.goto(f"{SITE}/slownictwo/")
        page.wait_for_selector("text=Test w przygotowaniu")
        check(True, "słownictwo: bez zatwierdzonych zadań test niedostępny")
        ctx.close()
        bank = [{"band": b, "pos": "rzeczownik", "word": f"słowo{b}{k}", "synonym": f"synonim{b}{k}",
                 "distractors": [f"inne{b}{k}{d}" for d in range(4)]} for b in (1, 2, 3, 4) for k in range(6)]
        ctx, page, errors = new_page(browser, viewport={"width": 390, "height": 844}, color_scheme="dark", device_scale_factor=2)
        ctx.route("**/slownictwo/items.json", lambda route: route.fulfill(
            content_type="application/json", body=json.dumps({"notice": "test", "items": bank})))
        page.goto(f"{SITE}/slownictwo/")
        page.check("#consent")
        page.click("#start")
        for i in range(20):
            page.wait_for_function(f"document.getElementById('count').textContent === 'Zadanie {i + 1} z 20'")
            if i == 0:
                page.screenshot(path="/out/slownictwo-telefon-ciemny.png", full_page=True)
            word = page.text_content(".vocab-word")
            target = word.replace("słowo", "synonim")
            opts = page.locator(".vocab-opt")
            idx = [k for k in range(5) if target in opts.nth(k).text_content()][0]
            page.keyboard.press("ABCDE"[idx if i < 12 else (idx + 1) % 5])
        answer_assist(page, "nie")
        page.wait_for_selector("#compare >> text=Zbieramy dane")
        check(page.text_content(".score").strip().startswith("12"), f"słownictwo: wynik 12 ({page.text_content('.score').strip()})")
        check(not errors, f"słownictwo: bez błędów JS: {errors}")
        ctx.close()

        # 11. Wynik łączny na stronie głównej i IQ na ekranie wyniku (normy z API
        #     podstawione: N = 200, rzetelność 0,8 -> estymacja wstępna).
        ctx, page, errors = new_page(browser, viewport={"width": 1000, "height": 1000})
        fake = {"n": 200, "mean": 10, "sd": 3, "sem": 0.2, "reliability": 0.8, "byAge": [],
                "distribution": [1] * 21, "test": "x", "maxScore": 20, "sample": "test"}
        ctx.route("**/api/norms/**", lambda route: route.fulfill(content_type="application/json", body=json.dumps(fake)))
        page.goto(f"{SITE}/")
        check(page.locator("#profile").is_hidden(), "profil ukryty, gdy nie ma wyników")
        for tid, score in [("matryce-v1", 13), ("ciagi-v1", 13)]:
            res = {"test": tid, "meta": {"birthYear": None}, "responses": [{"item": i + 1, "correct": i < score, "ms": 5000} for i in range(16)]}
            page.evaluate(f"localStorage.setItem('testiq-last-{tid}', {json.dumps(json.dumps(res))})")
        page.goto(f"{SITE}/")
        page.wait_for_selector("text=Ogólna zdolność")
        txt = page.text_content("#profile")
        check("115" in txt and "Z 2 testów" in txt, "wynik łączny z dwóch testów")
        page.screenshot(path="/out/profil.png", full_page=True)
        play_cube(page, 13)
        page.wait_for_selector("text=Estymacja wstępna")
        check("IQ około 115" in page.text_content("#compare"), "IQ na ekranie wyniku (13 pkt przy średniej 10, SD 3)")
        page.screenshot(path="/out/kostka-iq.png", full_page=True)
        check(not errors, f"profil: bez błędów JS: {errors}")
        ctx.close()

        # 12. Strony tekstowe i brak zapytań do zewnętrznych serwerów (prywatność:
        #     czcionki lokalne, bez analityki): każde zapytanie idzie do site albo api.
        ctx, page, errors = new_page(browser, viewport={"width": 390, "height": 844}, device_scale_factor=2)
        hosts = set()
        page.on("request", lambda r: hosts.add(r.url.split("/")[2]))
        for path in ["", "metodologia/", "prywatnosc/", "zrodla/", "kostka/", "matryce/", "ciagi/", "pamiec/", "slownictwo/"]:
            page.goto(f"{SITE}/{path}")
            page.wait_for_load_state("networkidle")
            width = page.evaluate("document.documentElement.scrollWidth")
            check(width <= 390, f"/{path}: bez przewijania w poziomie ({width}px)")
            check(page.locator("footer .footnav a").count() == 3, f"/{path}: linki w stopce")
        page.goto(f"{SITE}/metodologia/")
        page.screenshot(path="/out/metodologia-telefon.png", full_page=True)
        fonts = page.evaluate("document.fonts.check('16px \"EB Garamond\"') && document.fonts.check('12px Inter')")
        check(fonts, "czcionki wczytane lokalnie")
        check(hosts <= {"site:8000", "api:8000"}, f"tylko własne serwery: {sorted(hosts)}")
        check(not errors, f"strony: bez błędów JS: {errors}")
        ctx.close()

        browser.close()
    print("E2E " + ("PASSED" if not failures else f"FAILED ({len(failures)})"))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
