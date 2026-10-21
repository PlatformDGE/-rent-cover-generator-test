"""Full end-to-end QA of the live cover generator site (runs on GitHub Actions)."""
import io, json, os, re, subprocess, sys, time, zipfile, urllib.request
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

SITE = "https://platformdge.github.io/-rent-cover-generator-test/"
OUT = Path("qa/out6"); OUT.mkdir(parents=True, exist_ok=True)
results = []

def check(name, ok, detail=""):
    results.append({"test": name, "ok": bool(ok), "detail": str(detail)[:500]})
    print(("PASS " if ok else "FAIL ") + name + (" — " + str(detail)[:200] if detail else ""), flush=True)

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")

# ---- wait for the fresh deploy
for _ in range(36):
    try:
        if 'comma?182:194' in get(SITE + "?nocache=" + str(time.time())):
            break
    except Exception:
        pass
    time.sleep(10)
check("site deployed with latest code", 'comma?182:194' in get(SITE + "?n=" + str(time.time())))

# ---- test images
TEST = Path("qa/imgs"); TEST.mkdir(exist_ok=True)
for i in range(8):
    w, h = [(1600, 1200), (1200, 1600), (1080, 1080), (4032, 3024)][i % 4]
    im = Image.new("RGB", (w, h), (60 + i * 20, 90, 140 - i * 10))
    im.save(TEST / f"room{i+1}.jpg", quality=90)

def canvas_png(page, cid, path):
    data = page.evaluate(f"document.getElementById('{cid}').toDataURL('image/png')")
    import base64
    b = base64.b64decode(data.split(",")[1]); Path(path).write_bytes(b)
    return Image.open(io.BytesIO(b)).convert("RGB")

def field(page, i): return page.input_value(f"#{i}")

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(accept_downloads=True, viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(SITE + "?t=" + str(time.time()), wait_until="networkidle")
    page.wait_for_timeout(1500)

    # 1. initial render
    sz = page.evaluate("[document.getElementById('out').naturalWidth, document.getElementById('out').naturalHeight, document.getElementById('ytOut').naturalWidth, document.getElementById('ytOut').naturalHeight]")
    check("example cover renders 1080x1080 + YouTube 1280x720", sz == [1080, 1080, 1280, 720], sz)
    check("Bebas Neue font loaded", page.evaluate("document.fonts.check('40px \"Bebas Neue\"')"))
    check("UI in English, no Telegram link field", page.inner_text("#parse") == "Read text" and "Watermark photos" in page.content() and page.locator("#link").count() == 0 and "Telegram" not in page.inner_text("body"))
    page.screenshot(path=OUT / "01_desktop.png", full_page=True)

    # 3. manual text — exclusive
    page.fill("#ptext", "🔥 ЭКСКЛЮЗИВ 🔥\n#Надзаладеви\nСдается 2-х комнатная квартира, 52 кв.м\n💰 Цена: 370$")
    page.click("#parse"); page.wait_for_timeout(800)
    vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
    ex = page.get_attribute("#exYes", "aria-pressed")
    check("manual parse (RU, exclusive)", vals == {"price": "370$", "district": "Nadzaladevi", "area": "52", "beds": "1 BEDROOM"} and ex == "true", f"{vals} ex={ex}")
    img = canvas_png(page, "cv", OUT / "03_exclusive.png")
    r, g, b = img.getpixel((60, 884))
    check("exclusive ribbon drawn", r > 200 and g < 100, (r, g, b))
    y = canvas_png(page, "yt", OUT / "03_youtube_exclusive.png")
    ul = y.getpixel((326, 85)); top = max(y.getpixel((x, 70))[1] for x in range(250, 400))
    check("YouTube: EXCLUSIVE at top with red line when exclusive", ul[0] > 200 and ul[1] < 100 and top > 200, (ul, top))
    logo = max((y.getpixel((x, yy)) for x in range(270, 360) for yy in range(610, 690)), key=lambda p: p[1])
    check("YouTube: logo is white", logo[0] > 220 and logo[1] > 220 and logo[2] > 220, logo)
    rb = y.getpixel((660, 597))
    check("YouTube: no ribbon on photo (as in sample)", not (rb[0] > 200 and rb[1] < 100), rb)

    # 4. manual — non exclusive EN
    page.fill("#ptext", "For rent: 1 bedroom apartment in Sololaki\nArea: 40 m2\nPrice 450 USD")
    page.click("#parse"); page.wait_for_timeout(800)
    vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
    img = canvas_png(page, "cv", OUT / "04_non_exclusive.png")
    r, g, b = img.getpixel((60, 884))
    check("manual parse (EN, not exclusive)", vals == {"price": "450$", "district": "Sololaki", "area": "40", "beds": "1 BEDROOM"} and page.get_attribute("#exNo", "aria-pressed") == "true", vals)
    check("no ribbon when not exclusive", not (r > 200 and g < 100), (r, g, b))
    y = canvas_png(page, "yt", OUT / "04_youtube_non_exclusive.png")
    ul = y.getpixel((326, 85))
    check("YouTube: no EXCLUSIVE when not exclusive", not (ul[0] > 200 and ul[1] < 100), ul)

    # 5. Georgian text
    page.fill("#ptext", "ექსკლუზიური! ვაკე, 2 საძინებელი, 90 კვ.მ, $900")
    page.click("#parse"); page.wait_for_timeout(500)
    vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
    check("manual parse (GE)", vals == {"price": "900$", "district": "Vake", "area": "90", "beds": "2 BEDROOMS"}, vals)

    # 6. manual edits update both images
    page.fill("#price", "1250"); page.fill("#district", "Saburtalo"); page.wait_for_timeout(1200)
    st = page.evaluate("[state.price, state.district]")
    check("editing fields updates covers (price gets comma)", st == ["1,250$", "Saburtalo"], st)
    page.click("#exNo"); page.wait_for_timeout(500)
    check("exclusive toggle", page.evaluate("state.exclusive") is False)
    page.click("#exYes"); page.wait_for_timeout(500)

    # 7. upload own photo for cover
    page.set_input_files("#upload", str(TEST / "room4.jpg")); page.wait_for_timeout(1500)
    img = canvas_png(page, "cv", OUT / "07_own_photo.png")
    px = img.getpixel((540, 700))
    check("own photo used in cover", abs(px[0] - 120) < 25 and abs(px[2] - 110) < 25, px)
    yt = canvas_png(page, "yt", OUT / "07_youtube.png")
    check("YouTube: navy panel + photo on right", yt.getpixel((50, 50))[2] > yt.getpixel((50, 50))[0] and abs(yt.getpixel((1000, 360))[0] - 120) < 25, (yt.getpixel((50, 50)), yt.getpixel((1000, 360))))

    # 8. download PNG link
    with page.expect_download(timeout=15000) as d:
        page.click("#dl")
    check("Download PNG works", d.value.suggested_filename.endswith(".png"), d.value.suggested_filename)
    with page.expect_download(timeout=15000) as d:
        page.click("#ytDl")
    check("Download YouTube works", d.value.suggested_filename.endswith(".jpg"), d.value.suggested_filename)

    # 9. watermark 8 photos
    page.set_input_files("#wmFiles", [str(TEST / f"room{i+1}.jpg") for i in range(8)])
    page.wait_for_function("document.getElementById('wmStatus').textContent.startsWith('Done')", timeout=60000)
    n = page.locator("#wmGrid .wmcard").count()
    check("watermark 8 photos", n == 8, page.inner_text("#wmStatus"))
    sizes = page.evaluate("Promise.all(wmResults.map(r=>createImageBitmap(r.blob).then(b=>[b.width,b.height])))")
    check("watermarked photos keep size", sizes[0] == [1600, 1200] and sizes[1] == [1200, 1600] and sizes[3] == [2560, 1920], sizes)
    blob0 = page.evaluate("wmResults[0].blob.arrayBuffer().then(b=>Array.from(new Uint8Array(b)))")
    wm = Image.open(io.BytesIO(bytes(blob0))).convert("RGB"); wm.save(OUT / "09_watermark.png")
    center = max(wm.getpixel((x, 600))[1] for x in range(500, 1100, 3))
    check("watermark visible in center", center > 180, center)
    page.screenshot(path=OUT / "09_page_after_wm.png", full_page=True)

    # 10. folder name + Save as folder (zip)
    fname = page.input_value("#folder")
    check("folder name = district + price", fname == "Saburtalo 1,250$", fname)
    with page.expect_download(timeout=30000) as d:
        page.click("#wmZip")
    zp = OUT / "folder.zip"; d.value.save_as(zp)
    names = sorted(n for n in zipfile.ZipFile(zp).namelist() if not n.endswith("/"))
    F = "Saburtalo 1,250$"
    exp = sorted([f"{F}/{F} {i}.jpg" for i in range(1, 9)] + [f"{F}/{F} cover.png", f"{F}/{F} youtube.jpg"])
    check("Save as folder: zip with 8 photos + cover + YouTube", names == exp and d.value.suggested_filename == f"{F}.zip", names)
    check("Save to folder on computer button (Chrome)", page.is_visible("#wmDir"))
    check("Download all button", page.is_visible("#wmAll"))


    # 13. bedrooms singular/plural + price comma
    page.click("#tyApt"); page.wait_for_timeout(300)
    for typed, want in [("1", "1 BEDROOM"), ("2 bedroom", "2 BEDROOMS"), ("3 спальни", "3 BEDROOMS"), ("1 bedrooms", "1 BEDROOM")]:
        page.fill("#beds", typed); page.wait_for_timeout(300)
        got = page.evaluate("fmtBeds(state.bedrooms)")
        check(f"bedrooms '{typed}' -> {want}", got == want, got)
    page.fill("#price", "1800"); page.wait_for_timeout(500)
    check("price 1800 -> 1,800$", page.evaluate("state.price") == "1,800$", page.evaluate("state.price"))

    # 14. commercial exclusive (Georgian text like the sample)
    page.fill("#ptext", "ექსკლუზიური! კომერციული ფართი, გლდანი, 192 კვ.მ, 1800$")
    page.click("#parse"); page.wait_for_timeout(1000)
    st = page.evaluate("[state.commercial, state.exclusive, state.price, state.district, state.area]")
    check("commercial detected from text", st == [True, True, "1,800$", "Gldani", "192"], st)
    check("Type toggle shows Commercial, bedrooms disabled", page.get_attribute("#tyCom", "aria-pressed") == "true" and page.is_disabled("#beds"))
    img = canvas_png(page, "cv", OUT / "14_commercial_exclusive.png")
    two = img.getpixel((382, 313)), img.getpixel((696, 313)), img.getpixel((854, 313))
    check("commercial: 2 icons (district, m²), no bed icon", two[0][0] > 200 and two[1][0] > 200 and two[2][0] < 200, two)
    ul = img.getpixel((540, 245))
    check("commercial: COMMERCIAL label with red line", ul[0] > 200 and ul[1] < 100, ul)
    rb = img.getpixel((60, 884))
    check("commercial exclusive: red ribbon (EXCLUSIVE PROPERTY)", rb[0] > 200 and rb[1] < 100, rb)
    canvas_png(page, "yt", OUT / "14_commercial_youtube.png")

    # 15. commercial non-exclusive
    page.fill("#ptext", "Сдается офис в Глдани 192 м2, цена 1800$")
    page.click("#parse"); page.wait_for_timeout(1000)
    img = canvas_png(page, "cv", OUT / "15_commercial.png")
    rb = img.getpixel((60, 884)); ul = img.getpixel((540, 245))
    check("commercial non-exclusive: label, no ribbon", ul[0] > 200 and not (rb[0] > 200 and rb[1] < 100), (ul, rb))
    y = canvas_png(page, "yt", OUT / "15_commercial_youtube.png")
    check("YouTube commercial: COMMERCIAL at top", y.getpixel((326, 85))[0] > 200, y.getpixel((326, 85)))

    # 16. apartment with 1,200$ and 2 bedrooms
    page.fill("#ptext", "Сдается 3-х комнатная квартира Ваке 90 кв.м 1 200 $")
    page.click("#parse"); page.wait_for_timeout(1000)
    st = page.evaluate("[state.commercial, state.price, fmtBeds(state.bedrooms)]")
    check("apartment: 1,200$ and 2 BEDROOMS", st == [False, "1,200$", "2 BEDROOMS"], st)
    canvas_png(page, "cv", OUT / "16_apartment.png")

    check("no JavaScript errors", not errors, errors[:5])

    # 12. mobile
    m = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = m.new_page(); mp.goto(SITE, wait_until="networkidle"); mp.wait_for_timeout(1500)
    sw = mp.evaluate("document.documentElement.scrollWidth")
    check("mobile: no horizontal scroll", sw <= 390, sw)
    mp.screenshot(path=OUT / "12_mobile.png", full_page=True)
    br.close()

# ---- Python CLI (text mode)
try:
    Path("qa/post.txt").write_text("ЭКСКЛЮЗИВ #Ваке 3-х комнатная 85 м² Цена: 1 200 $", encoding="utf-8")
    r = subprocess.run([sys.executable, "cover.py", "--text", "qa/post.txt", "--photo", "qa/imgs/room1.jpg", "--out", str(OUT / "13_cli.png")], capture_output=True, text=True, timeout=120)
    ok = r.returncode == 0 and "1200$" in r.stdout and "Vake" in r.stdout and Image.open(OUT / "13_cli.png").size == (1080, 1080)
    check("Python script (text mode)", ok, r.stdout + r.stderr)
except Exception as e:
    check("Python script (text mode)", False, e)

Path("qa/out6/report.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
passed = sum(r["ok"] for r in results)
Path("qa/out6/summary.txt").write_text(f"{passed}/{len(results)} passed\n" + "\n".join(("PASS " if r["ok"] else "FAIL ") + r["test"] + " — " + r["detail"] for r in results))
print(f"{passed}/{len(results)} passed")
