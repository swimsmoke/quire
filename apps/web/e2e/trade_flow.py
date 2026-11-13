# Browser E2E for the web app (API + web must be running).
#   pip install playwright && playwright install chromium
#   python apps/web/e2e/trade_flow.py
# Covers: simulated sign-in sheet, test funds, quick amounts, live quote, review sheet,
# confirm, filled state, chart scrubbing, theme toggle persistence, light/dark screenshots,
# and asking a question: existing claim found, new market opened from the practice balance.
import os, re, uuid
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("QUIRE_WEB_URL", "http://localhost:3000")
OUT = "e2e-shots"; os.makedirs(OUT, exist_ok=True)
handle = "e2e" + uuid.uuid4().hex[:8]

with sync_playwright() as p:
    b = p.chromium.launch()
    errs = []
    pg = b.new_page(viewport={"width": 1360, "height": 900}, color_scheme="light")
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/markets/open-model-arc-agi-2-85")
    pg.get_by_role("button", name="Sign in").click()
    pg.get_by_placeholder("ada").fill(handle)
    pg.get_by_role("button", name="Continue").click()
    pg.get_by_role("button", name="Get 1,000 test NEAR").click()
    pg.get_by_role("button", name="+50").click(); pg.get_by_role("button", name="+50").click()
    expect(pg.locator("#amt")).to_have_value("100")
    expect(pg.get_by_text("You receive").first).to_be_visible(timeout=5000)
    pg.get_by_role("button", name="Review buy").click()
    pg.get_by_role("button", name="Confirm buy").click()
    status = pg.get_by_role("status"); expect(status).to_contain_text("Bought", timeout=8000)
    print("trade:", status.inner_text())
    pg.screenshot(path=f"{OUT}/filled.png")
    pg.get_by_role("button", name="Done").click()

    chart = pg.locator('[role="img"][aria-label^="Yes probability chart"]'); chart.scroll_into_view_if_needed(); box = chart.bounding_box()
    pg.mouse.move(box["x"] + 5, box["y"] + 5); pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=6)
    expect(pg.get_by_text(re.compile("Yes probability at")).first).to_be_visible()

    toggle = pg.get_by_role("button", name=re.compile("^Theme:"))
    toggle.click(); toggle.click()  # dark (default) -> system -> light
    pg.reload(); assert pg.evaluate("document.documentElement.dataset.theme") == "light"

    pg.goto(BASE + "/portfolio"); expect(pg.get_by_text("Will an open-weights AI model").first).to_be_visible()
    for scheme in ["light", "dark"]:
        m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=scheme)
        m.goto(BASE + "/markets/btc-above-150k"); m.wait_for_timeout(1200); m.screenshot(path=f"{OUT}/mobile-claim-{scheme}.png")

    # Ask: an existing claim is found however it's worded; a new one can be opened
    pg.goto(BASE + "/ask?q=" + "is bitcoin going over 150k")
    expect(pg.get_by_text("Already on Quire")).to_be_visible(timeout=8000)
    expect(pg.get_by_role("link", name=re.compile("Bitcoin trade above"))).to_be_visible()
    question = f"Will a volcano erupt in Iceland during the {handle} test?"
    pg.get_by_label("Your question").fill(question)
    expect(pg.get_by_text(re.compile("Nobody has asked this yet|None of these is your question"))).to_be_visible(timeout=8000)
    pg.get_by_role("button", name="Write it myself").click()
    pg.get_by_label("What it's about").fill("Volcanism of Iceland")
    pg.get_by_label("Category").select_option("science")
    pg.get_by_label("What it means").fill("Whether an eruption starts anywhere in Iceland.")
    pg.get_by_label("What would make it Yes").fill("The Icelandic Met Office reports a new eruption.")
    pg.get_by_role("button", name="Open market").click()
    pg.wait_for_url(re.compile(r"/markets/.*\?new=1"), timeout=10000)
    expect(pg.get_by_role("heading", name=re.compile("volcano erupt"))).to_be_visible()
    pg.screenshot(path=f"{OUT}/new-claim.png")
    pg.goto(BASE + "/leaderboard"); expect(pg.get_by_role("table")).to_be_visible()

    assert not errs, errs
    print("ok")
    b.close()
