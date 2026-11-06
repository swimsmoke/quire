# Browser E2E: sign in (simulated), claim test funds, quote, review, confirm a trade, check portfolio.
# Run with the API and web app up:  pip install playwright && playwright install chromium && python apps/web/e2e/trade_flow.py
import os; os.makedirs("e2e-shots", exist_ok=True)
import re, sys
from playwright.sync_api import sync_playwright, expect

import os
BASE = os.environ.get("QUIRE_WEB_URL", "http://localhost:3000")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1360, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))

    pg.goto(BASE + "/"); pg.wait_for_timeout(1800)
    pg.screenshot(path="e2e-shots/home.png", full_page=True)
    pg.goto(BASE + "/markets"); pg.screenshot(path="e2e-shots/markets.png", full_page=True)
    pg.goto(BASE + "/agents"); pg.screenshot(path="e2e-shots/agents.png", full_page=True)
    pg.goto(BASE + "/how-it-works"); pg.screenshot(path="e2e-shots/how.png", full_page=True)

    # sign in with a simulated account
    pg.goto(BASE + "/markets/eth-glamsterdam-mainnet")
    pg.get_by_role("button", name="Sign in").click()
    pg.get_by_placeholder("ada").fill("uitester")
    pg.get_by_role("button", name="Sign in with simulated account").click()
    expect(pg.get_by_text("uitester.sim")).to_be_visible()
    pg.get_by_role("button", name="Get 1,000 test qUSD").click()
    expect(pg.get_by_text(re.compile("Added 1,000 test qUSD|already claimed"))).to_be_visible()

    before = pg.locator("span.tabular.text-ledger").first.inner_text()
    pg.get_by_role("button", name=re.compile("^No")).first.click()
    pg.locator('input[inputmode="decimal"]').fill("150")
    expect(pg.get_by_text("You receive")).to_be_visible(timeout=5000)
    pg.screenshot(path="e2e-shots/claim-quote.png", full_page=True)
    pg.get_by_role("button", name="Review buy").click()
    pg.get_by_role("button", name="Confirm buy").click()
    status = pg.get_by_role("status")
    expect(status).to_contain_text("Bought", timeout=8000)
    print("RESULT:", status.inner_text())
    pg.wait_for_timeout(1500)
    after = pg.locator("span.tabular.text-ledger").first.inner_text()
    print("yes% before/after:", before, after)
    pg.screenshot(path="e2e-shots/claim-after.png", full_page=True)

    pg.goto(BASE + "/portfolio"); pg.wait_for_timeout(1200)
    pg.screenshot(path="e2e-shots/portfolio.png", full_page=True)
    print("portfolio has position:", pg.get_by_text("Will Ethereum activate").count() > 0)

    m = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True)
    mp = m.new_page()
    mp.goto(BASE + "/"); mp.wait_for_timeout(1800); mp.screenshot(path="e2e-shots/m-home.png", full_page=True)
    mp.goto(BASE + "/markets/eth-glamsterdam-mainnet"); mp.wait_for_timeout(800); mp.screenshot(path="e2e-shots/m-claim.png", full_page=True)
    mp.goto(BASE + "/markets"); mp.screenshot(path="e2e-shots/m-markets.png", full_page=True)
    print("console errors:", errors[:5])
    b.close()
