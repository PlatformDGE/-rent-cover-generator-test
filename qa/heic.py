# Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
"""HEIC test: real Chromium (no native HEIC) on the live site + Python script."""
import subprocess, sys, time, urllib.request, zipfile
from pathlib import Path
from PIL import Image
from pillow_heif import register_heif_opener
from playwright.sync_api import sync_playwright
register_heif_opener()
SITE = "https://platformdge.github.io/-rent-cover-generator-test/"
OUT = Path("qa/heic_out"); OUT.mkdir(parents=True, exist_ok=True)
res = []
def check(n, ok, d=""):
    res.append(("PASS " if ok else "FAIL ") + n + (" — " + str(d)[:300] if d != "" else "")); print(res[-1], flush=True)

for _ in range(36):
    h = urllib.request.urlopen(urllib.request.Request(SITE + "?n=" + str(time.time()), headers={"User-Agent": "x"})).read().decode()
    if "heic2any" in h: break
    time.sleep(10)
check("site has HEIC support deployed", "heic2any" in h)

imgs = Path("qa/heic_imgs"); imgs.mkdir(exist_ok=True)
for i, (w, hh, col) in enumerate([(4032, 3024, (200, 60, 60)), (3024, 4032, (60, 160, 70)), (1600, 1200, (50, 80, 200))]):
    Image.new("RGB", (w, hh), col).save(imgs / f"IMG_{i+1}.HEIC", quality=85)
Image.new("RGB", (1600, 1200), (120, 120, 40)).save(imgs / "IMG_4.jpg")
check("HEIC test files created", (imgs / "IMG_1.HEIC").read_bytes()[4:8] == b"ftyp")

with sync_playwright() as p:
    br = p.chromium.launch()
    pg = br.new_context(accept_downloads=True).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(SITE + "?t=" + str(time.time()), wait_until="networkidle"); pg.wait_for_timeout(1500)
    native = pg.evaluate("""fetch('data:image/heic;base64,AA').then(()=>0).catch(()=>0)""")
    # cover photo upload
    pg.set_input_files("#upload", str(imgs / "IMG_1.HEIC"))
    pg.wait_for_function("document.getElementById('status').textContent.includes('Photo replaced') || document.getElementById('status').classList.contains('err')", timeout=90000)
    st = pg.inner_text("#status")
    px = pg.evaluate("(()=>{const d=document.getElementById('cv').getContext('2d').getImageData(540,700,1,1).data;return [d[0],d[1],d[2]]})()")
    check("cover: HEIC photo uploads", "Photo replaced" in st and px[0] > 170 and px[1] < 100, f"{st} px={px}")
    # watermark batch: 3 HEIC + 1 JPG
    pg.set_input_files("#wmFiles", [str(imgs / f) for f in ["IMG_1.HEIC", "IMG_2.HEIC", "IMG_3.HEIC", "IMG_4.jpg"]])
    pg.wait_for_function("document.getElementById('wmStatus').textContent.startsWith('Done') || document.getElementById('wmStatus').textContent.startsWith(\"Couldn't\")", timeout=180000)
    st = pg.inner_text("#wmStatus")
    sizes = pg.evaluate("Promise.all(wmResults.map(r=>createImageBitmap(r.blob).then(b=>[b.width,b.height])))")
    check("watermark: 3 HEIC + 1 JPG processed", st.startswith("Done: 4") and "Not opened" not in st, st)
    check("watermark: sizes/orientation kept", sizes == [[2560, 1920], [1920, 2560], [1600, 1200], [1600, 1200]], sizes)
    names = pg.evaluate("wmResults.map(r=>r.name)")
    check("watermark: output names are .jpg", all(n.endswith(".jpg") for n in names), names)
    with pg.expect_download(timeout=60000) as d:
        pg.click("#wmZip")
    d.value.save_as(OUT / "f.zip")
    zn = [n for n in zipfile.ZipFile(OUT / "f.zip").namelist() if not n.endswith("/")]
    check("folder zip has 4 photos + 2 covers", len(zn) == 6, zn)
    pg.screenshot(path=OUT / "page.png", full_page=True)
    check("no JS errors", not errs, errs[:3])
    br.close()

r = subprocess.run([sys.executable, "cover.py", "--text", "/dev/stdin", "--photo", str(imgs / "IMG_2.HEIC"), "--out", str(OUT / "cli.png")],
                   input="Ваке 2 спальни 80 м² 900$", capture_output=True, text=True)
ok = r.returncode == 0 and Image.open(OUT / "cli.png").getpixel((540, 700))[1] > 120
check("Python script: HEIC photo", ok, (r.stdout + r.stderr)[-300:])
(OUT / "summary.txt").write_text(f"{sum(x.startswith('PASS') for x in res)}/{len(res)} passed\n" + "\n".join(res))
