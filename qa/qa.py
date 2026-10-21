"""Full end-to-end QA of the live cover generator site (runs on GitHub Actions)."""
import io, json, os, re, subprocess, sys, time, zipfile, urllib.request
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

SITE = "https://platformdge.github.io/-rent-cover-generator-test/"
OUT = Path("qa/out"); OUT.mkdir(parents=True, exist_ok=True)
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
        if "r.jina.ai" in get(SITE + "?nocache=" + str(time.time())):
            break
    except Exception:
        pass
    time.sleep(10)
check("site deployed with latest code", "r.jina.ai" in get(SITE + "?n=" + str(time.time())))

# ---- find real rental channel posts with photos
posts = []
for ch in ["rentintbilisi", "rent_in_tbilisi", "rentin_tbilisi", "rent_tbilisi", "rentintbilisi_ge",
           "rentintbilisiofficial", "rent_in_tbilisi_ge", "tbilisi_rent", "rentintbilisi1"]:
    try:
        h = get(f"https://t.me/s/{ch}")
    except Exception:
        continue
    ids = re.findall(r'data-post="([^"/]+/\d+)"', h)
    if ids:
        blocks = h.split('data-post="')
        for b in blocks[1:]:
            pid = b.split('"')[0]
            if "tgme_widget_message_photo_wrap" in b and "tgme_widget_message_text" in b and re.search(r"\$|usd|лари|gel", b, re.I):
                posts.append(pid)
        print("channel", ch, "posts:", len(ids), "with photo+price:", len(posts), flush=True)
        if posts:
            break
posts = posts[-3:]
check("found real public rental channel posts", bool(posts), posts)
links = [f"https://t.me/{p}" for p in posts] or ["https://t.me/durov/406"]

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
    check("UI is in English", page.inner_text("#go") == "Generate" and "Watermark photos" in page.content())
    page.screenshot(path=OUT / "01_desktop.png", full_page=True)

    # 2. link → real post
    for n, link in enumerate(links):
        page.fill("#link", link)
        page.click("#go")
        try:
            page.wait_for_function("!document.getElementById('go').disabled", timeout=90000)
        except Exception:
            pass
        page.wait_for_timeout(2000)
        st = page.inner_text("#status")
        vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
        thumbs = page.locator("#thumbs button").count()
        text = page.input_value("#ptext")
        has_photo = page.evaluate("!!state.photo")
        ok = bool(text) and bool(vals["price"]) and has_photo
        check(f"link fetch {link}", ok, f"status={st!r} fields={vals} thumbs={thumbs} photo={has_photo} text={text[:150]!r}")
        canvas_png(page, "cv", OUT / f"02_link_cover_{n}.png")
        canvas_png(page, "yt", OUT / f"02_link_youtube_{n}.png")

    # 3. manual text — exclusive
    page.click("#manual summary") if not page.evaluate("document.getElementById('manual').open") else None
    page.fill("#ptext", "🔥 ЭКСКЛЮЗИВ 🔥\n#Надзаладеви\nСдается 2-х комнатная квартира, 52 кв.м\n💰 Цена: 370$")
    page.click("#parse"); page.wait_for_timeout(800)
    vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
    ex = page.get_attribute("#exYes", "aria-pressed")
    check("manual parse (RU, exclusive)", vals == {"price": "370$", "district": "Nadzaladevi", "area": "52", "beds": "1 BEDROOM"} and ex == "true", f"{vals} ex={ex}")
    img = canvas_png(page, "cv", OUT / "03_exclusive.png")
    r, g, b = img.getpixel((60, 884))
    check("exclusive ribbon drawn", r > 200 and g < 100, (r, g, b))

    # 4. manual — non exclusive EN
    page.fill("#ptext", "For rent: 1 bedroom apartment in Sololaki\nArea: 40 m2\nPrice 450 USD")
    page.click("#parse"); page.wait_for_timeout(800)
    vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
    img = canvas_png(page, "cv", OUT / "04_non_exclusive.png")
    r, g, b = img.getpixel((60, 884))
    check("manual parse (EN, not exclusive)", vals == {"price": "450$", "district": "Sololaki", "area": "40", "beds": "1 BEDROOM"} and page.get_attribute("#exNo", "aria-pressed") == "true", vals)
    check("no ribbon when not exclusive", not (r > 200 and g < 100), (r, g, b))

    # 5. Georgian text
    page.fill("#ptext", "ექსკლუზიური! ვაკე, 2 საძინებელი, 90 კვ.მ, $900")
    page.click("#parse"); page.wait_for_timeout(500)
    vals = {k: field(page, k) for k in ("price", "district", "area", "beds")}
    check("manual parse (GE)", vals == {"price": "900$", "district": "Vake", "area": "90", "beds": "2 BEDROOMS"}, vals)

    # 6. manual edits update both images
    page.fill("#price", "1250"); page.fill("#district", "Saburtalo"); page.wait_for_timeout(1200)
    st = page.evaluate("[state.price, state.district]")
    check("editing fields updates covers", st == ["1250$", "Saburtalo"], st)
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
    check("folder name = district + price", fname == "Saburtalo 1250$", fname)
    with page.expect_download(timeout=30000) as d:
        page.click("#wmZip")
    zp = OUT / "folder.zip"; d.value.save_as(zp)
    names = sorted(zipfile.ZipFile(zp).namelist())
    exp = sorted([f"Saburtalo 1250$/Saburtalo 1250$ {i}.jpg" for i in range(1, 9)] + ["Saburtalo 1250$/Saburtalo 1250$ cover.png", "Saburtalo 1250$/Saburtalo 1250$ youtube.jpg"])
    check("Save as folder: zip with 8 photos + cover + YouTube", names == exp and d.value.suggested_filename == "Saburtalo 1250$.zip", names)
    check("Save to folder on computer button (Chrome)", page.is_visible("#wmDir"))
    check("Download all button", page.is_visible("#wmAll"))

    # 11. private channel / bad link messages
    page.fill("#link", "https://t.me/c/12345/67"); page.click("#go"); page.wait_for_timeout(1500)
    check("private channel link message", "private channel" in page.inner_text("#status"), page.inner_text("#status"))
    page.fill("#link", "hello"); page.click("#go"); page.wait_for_timeout(1000)
    check("bad link message", "t.me/channel" in page.inner_text("#status"), page.inner_text("#status"))

    check("no JavaScript errors", not errors, errors[:5])

    # 12. mobile
    m = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    mp = m.new_page(); mp.goto(SITE, wait_until="networkidle"); mp.wait_for_timeout(1500)
    sw = mp.evaluate("document.documentElement.scrollWidth")
    check("mobile: no horizontal scroll", sw <= 390, sw)
    mp.screenshot(path=OUT / "12_mobile.png", full_page=True)
    br.close()

# ---- Python CLI
try:
    r = subprocess.run([sys.executable, "cover.py", links[0], "--out", str(OUT / "13_cli.png")], capture_output=True, text=True, timeout=120)
    ok = r.returncode == 0 and Image.open(OUT / "13_cli.png").size == (1080, 1080)
    check("Python CLI from link", ok, r.stdout + r.stderr)
except Exception as e:
    check("Python CLI from link", False, e)

Path("qa/out/report.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
passed = sum(r["ok"] for r in results)
Path("qa/out/summary.txt").write_text(f"{passed}/{len(results)} passed\n" + "\n".join(("PASS " if r["ok"] else "FAIL ") + r["test"] + " — " + r["detail"] for r in results))
print(f"{passed}/{len(results)} passed")
