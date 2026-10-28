#!/usr/bin/env python3
# Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
"""
Генератор квадратной обложки (1080x1080) для Instagram / Facebook
из поста в Telegram-канале.

    python cover.py https://t.me/<channel>/<id>
    python cover.py --text post.txt --photo photo.jpg
    python cover.py <link> --price 450 --district Sololaki --area 40 --bedrooms 1 --exclusive yes

Достаёт из текста поста: цену, эксклюзив, район, площадь, спальни.
Любое поле можно переопределить флагом.
"""
from __future__ import annotations

import argparse
import html
import io
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

try:  # HEIC/HEIF (iPhone photos)
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent
FONTS_DIR = ROOT / "fonts"

# ---------------------------------------------------------------- стиль
SIZE = 1080
NAVY = (36, 51, 96)
RED = (224, 70, 74)
WHITE = (255, 255, 255)
BAND_RGBA = (120, 120, 120, 200)

HEADER_H = 256          # синяя шапка
BAND_Y0, BAND_Y1 = 256, 412   # серая полоса с иконками
ICON_Y = 313
ICON_R = 46
ICON_XS = (226, 540, 854)
LABEL_Y = 386
RIBBON_Y0, RIBBON_Y1 = 856, 912
RIBBON_TEXT_X = 209

BEBAS_URLS = [
    "https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf",
    "https://raw.githubusercontent.com/dharmatype/Bebas-Neue/master/fonts/BebasNeue(2018)ByDhamraType/ttf/BebasNeue-Regular.ttf",
]
FALLBACK_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]
SERIF_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
    "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
]

# ---------------------------------------------------------------- районы Тбилиси
# каноническое имя -> варианты написания (рус / eng / груз / хэштеги)
DISTRICTS: dict[str, list[str]] = {
    "Didi Dighomi": ["диди дигоми", "didi dighomi", "didi digomi", "დიდი დიღომი"],
    "Old Tbilisi": ["старый тбилиси", "old tbilisi", "ძველი თბილისი", "старый город", "old town"],
    "Nutsubidze Plateau": ["нуцубидзе", "nutsubidze", "ნუცუბიძე"],
    "Vake": ["ваке", "vake", "ვაკე"],
    "Saburtalo": ["сабуртало", "saburtalo", "საბურთალო"],
    "Vera": ["вера", "vera", "ვერა"],
    "Mtatsminda": ["мтацминда", "mtatsminda", "მთაწმინდა"],
    "Sololaki": ["сололаки", "sololaki", "სოლოლაკი"],
    "Abanotubani": ["абанотубани", "abanotubani", "აბანოთუბანი"],
    "Avlabari": ["авлабар", "avlabari", "avlabar", "ავლაბარი"],
    "Chugureti": ["чугурети", "chugureti", "chughureti", "ჩუღურეთი"],
    "Marjanishvili": ["марджанишвили", "marjanishvili", "მარჯანიშვილი"],
    "Didube": ["дидубе", "didube", "დიდუბე"],
    "Dighomi": ["дигоми", "dighomi", "digomi", "დიღომი"],
    "Nadzaladevi": ["надзаладеви", "nadzaladevi", "ნაძალადევი"],
    "Gldani": ["глдани", "gldani", "გლდანი"],
    "Isani": ["исани", "isani", "ისანი"],
    "Samgori": ["самгори", "samgori", "სამგორი"],
    "Krtsanisi": ["крцаниси", "krtsanisi", "კრწანისი"],
    "Ortachala": ["ортачала", "ortachala", "ორთაჭალა"],
    "Vazisubani": ["вазисубани", "vazisubani", "ვაზისუბანი"],
    "Varketili": ["варкетили", "varketili", "ვარკეთილი"],
    "Lisi": ["лиси", "lisi", "ლისი"],
    "Bagebi": ["багеби", "bagebi", "ბაგები"],
    "Tskneti": ["цхнети", "tskneti", "წყნეთი"],
    "Vashlijvari": ["вашлиджвари", "vashlijvari", "ვაშლიჯვარი"],
    "Delisi": ["делиси", "delisi", "დელისი"],
    "Vedzisi": ["ведзиси", "vedzisi", "ვეძისი"],
    "Mukhiani": ["мухиани", "mukhiani", "მუხიანი"],
    "Temka": ["темка", "temka", "თემქა"],
    "Ponichala": ["поничала", "ponichala", "ფონიჭალა"],
    "Kukia": ["кукия", "kukia", "კუკია"],
    "Elia": ["элия", "elia", "ელია"],
    "Lilo": ["лило", "lilo", "ლილო"],
}


# ================================================================ данные
@dataclass
class Listing:
    price: str | None = None          # "370$"
    exclusive: bool = False
    district: str | None = None
    area: str | None = None           # "52"
    bedrooms: str | None = None       # "1 BEDROOM" / "STUDIO"
    text: str = ""
    photo_urls: list[str] = field(default_factory=list)


# ================================================================ Telegram
def parse_tg_link(link: str) -> tuple[str, str]:
    m = re.search(r"t(?:elegram)?\.me/(?:s/)?([A-Za-z0-9_]{4,})/(\d+)", link)
    if not m:
        if re.search(r"t\.me/c/\d+", link):
            raise SystemExit(
                "Это ссылка на закрытый канал (t.me/c/...). Telegram не отдаёт такие посты по ссылке.\n"
                "Перешлите пост боту (bot.py) или запустите с --text и --photo."
            )
        raise SystemExit(f"Не похоже на ссылку на пост Telegram: {link}")
    return m.group(1), m.group(2)


def _html_to_text(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    return html.unescape(fragment).strip()


def fetch_tg_post(link: str) -> Listing:
    channel, post_id = parse_tg_link(link)
    url = f"https://t.me/{channel}/{post_id}?embed=1&mode=tme"
    r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    r.raise_for_status()
    page = r.text

    text = ""
    m = re.search(r'<div class="tgme_widget_message_text js-message_text"[^>]*>(.*?)</div>', page, flags=re.S)
    if m:
        text = _html_to_text(m.group(1))

    photos = re.findall(
        r'tgme_widget_message_photo_wrap[^>]*?background-image:url\(\'([^\']+)\'\)', page
    )
    if not photos:
        photos = re.findall(r"background-image:url\('(https://cdn[^']+)'\)", page)
    if not photos:
        og = re.search(r'<meta property="og:image" content="([^"]+)"', page)
        if og:
            photos = [og.group(1)]

    if not text and not photos:
        raise SystemExit("Не удалось прочитать пост: канал закрыт или пост удалён.")
    return Listing(text=text, photo_urls=photos)


# ================================================================ разбор текста
def _num(s: str) -> str:
    s = s.replace("\u00a0", " ").strip()
    digits = re.sub(r"[^\d]", "", s)
    return digits.lstrip("0") or "0"


def extract(text: str) -> Listing:
    low = text.lower()
    out = Listing(text=text)

    # --- эксклюзив
    out.exclusive = bool(re.search(r"эксклюзив|exclusive|ექსკლუზ", low))

    # --- цена: сначала строки со словом «цена/price», потом весь текст
    num = r"(\d{1,3}(?:[ \u00a0.,]\d{3})+|\d{2,6})"
    pats = [
        (rf"\$\s*{num}", "$"),
        (rf"{num}\s*(?:\$|usd|долл|дол\.?|у\.?е)", "$"),
        (rf"{num}\s*(?:₾|gel|лари|lari|ლარ)", " GEL"),
        (rf"(?:₾|gel)\s*{num}", " GEL"),
        (rf"{num}\s*(?:€|eur|евро)", "€"),
    ]
    price_lines = [ln for ln in low.splitlines() if re.search(r"цена|стоимость|price|ფას|rent|аренд", ln)]
    for scope in (price_lines, [low]):
        found = None
        for chunk in scope:
            for pat, cur in pats:
                m = re.search(pat, chunk)
                if m:
                    found = (_num(m.group(1)), cur)
                    break
            if found:
                break
        if found:
            out.price = f"{found[0]}{found[1]}"
            break

    # --- площадь
    m = re.search(
        r"(\d{2,4}(?:[.,]\d+)?)\s*(?:м²|м2|м\^2|кв\.?\s*м\w*|кв\.?(?=\s|$|[,.;])|квадрат\w*|m²|m2|sq\.?\s*m|sqm|კვ\.?\s*მ?)",
        low,
    )
    if not m:
        m = re.search(r"(?:площадь|area|ფართ\w*)\s*[:\-–]?\s*(\d{2,4}(?:[.,]\d+)?)", low)
    if m:
        out.area = m.group(1).replace(",", ".").rstrip("0").rstrip(".") if "." in m.group(1) or "," in m.group(1) else m.group(1)

    # --- спальни
    beds = None
    m = re.search(r"(\d+)\s*[-‑]?\s*(?:x\s*)?(?:bed(?:room)?s?|спальн\w*|საძინებ\w*)", low)
    if m:
        beds = int(m.group(1))
    elif re.search(r"студи|studio|სტუდიო", low):
        beds = 0
    else:
        m = re.search(r"(\d+)\s*[-‑]?\s*(?:х|ти|ми|ух|ех)?\s*[-‑]?\s*(?:комн\w*|room\w*|ოთახ\w*)", low)
        if m:
            rooms = int(m.group(1))
            # в Грузии «2 комнаты» = гостиная + 1 спальня
            beds = max(rooms - 1, 0)
    if beds is not None:
        out.bedrooms = "STUDIO" if beds == 0 else f"{beds} BEDROOM" + ("S" if beds > 1 else "")

    # --- район: самое раннее упоминание, хэштеги в приоритете
    best = None  # (priority, pos, name)
    for name, variants in DISTRICTS.items():
        for v in variants:
            for m in re.finditer(rf"(?<![\w]){re.escape(v)}\w{{0,3}}(?![\w])", low):
                pri = 0 if m.start() > 0 and low[m.start() - 1] == "#" else 1
                cand = (pri, m.start(), -len(v), name)
                if best is None or cand < best:
                    best = cand
    if best:
        out.district = best[3]
    return out


# ================================================================ шрифты
def bebas_path() -> str | None:
    p = FONTS_DIR / "BebasNeue-Regular.ttf"
    if p.exists() and p.stat().st_size > 10_000:
        return str(p)
    FONTS_DIR.mkdir(exist_ok=True)
    for url in BEBAS_URLS:
        try:
            r = requests.get(url, timeout=20)
            if r.ok and r.content[:4] in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
                p.write_bytes(r.content)
                return str(p)
        except requests.RequestException:
            pass
    return None


def load_font(size: int, serif: bool = False) -> ImageFont.FreeTypeFont:
    paths = SERIF_FONTS if serif else ([bebas_path()] + FALLBACK_FONTS)
    for p in paths:
        if p and os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def _is_bebas(font) -> bool:
    return "Bebas" in (getattr(font, "path", "") or "")


def draw_spaced(draw, xy, text, font, fill, spacing=0, anchor="ls"):
    """Текст с межбуквенным интервалом. anchor: l/m по x, s по y (baseline)."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x, y = xy
    if anchor[0] == "m":
        x -= total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill, anchor="ls")
        x += w + spacing
    return total


def fit_font(text, max_w, start, serif=False, spacing=0):
    size = start
    tmp = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    while size > 12:
        f = load_font(size, serif)
        w = sum(tmp.textlength(c, font=f) for c in text) + spacing * (len(text) - 1)
        if w <= max_w:
            return f
        size -= 2
    return load_font(size, serif)


# ================================================================ иконки
def icon(kind: str, r: int = ICON_R) -> Image.Image:
    S = 4
    d = r * 2 * S
    im = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    g.ellipse((0, 0, d - 1, d - 1), fill=RED)
    c = d / 2
    w = int(3 * S)
    if kind == "pin":
        # основание
        g.ellipse((c - 26 * S, c + 18 * S, c + 26 * S, c + 34 * S), outline=WHITE, width=w)
        g.ellipse((c - 26 * S + w, c + 18 * S + w, c + 26 * S - w, c + 34 * S - w), fill=WHITE)
        # капля
        top = c - 34 * S
        rr = 18 * S
        g.ellipse((c - rr, top, c + rr, top + 2 * rr), fill=WHITE)
        g.polygon([(c - rr * 0.86, top + rr * 1.5), (c + rr * 0.86, top + rr * 1.5), (c, c + 24 * S)], fill=WHITE)
        g.ellipse((c - rr + w, top + w, c + rr - w, top + 2 * rr - w), fill=RED)
        g.polygon([(c - rr * 0.86 + w, top + rr * 1.5), (c + rr * 0.86 - w, top + rr * 1.5), (c, c + 24 * S - 2 * w)], fill=RED)
        g.ellipse((c - 7 * S, top + rr - 7 * S, c + 7 * S, top + rr + 7 * S), outline=WHITE, width=w)
    elif kind == "m2":
        f = load_font(40 * S, serif=True)
        fs = load_font(17 * S, serif=True)
        g.text((c - 4 * S, c + 14 * S), "m", font=f, fill=WHITE, anchor="ms")
        g.text((c + 22 * S, c - 6 * S), "2", font=fs, fill=WHITE, anchor="ms")
    elif kind == "bed":
        x0, x1 = c - 34 * S, c + 34 * S
        g.rectangle((x0, c - 26 * S, x0 + 5 * S, c + 24 * S), fill=WHITE)      # изголовье
        g.rectangle((x1 - 5 * S, c - 8 * S, x1, c + 24 * S), fill=WHITE)      # изножье
        g.rounded_rectangle((x0 + 9 * S, c - 18 * S, x0 + 29 * S, c - 6 * S), 3 * S, fill=WHITE)  # подушки
        g.rounded_rectangle((x0 + 33 * S, c - 18 * S, x0 + 53 * S, c - 6 * S), 3 * S, fill=WHITE)
        g.rectangle((x0, c - 2 * S, x1, c + 12 * S), fill=WHITE)               # матрас
        g.rectangle((x0, c + 12 * S, x1, c + 16 * S), fill=RED)
        g.rectangle((x0, c + 16 * S, x1, c + 20 * S), fill=WHITE)
    return im.resize((r * 2, r * 2), Image.LANCZOS)


# ================================================================ рендер
def load_photo(src: str | bytes | None) -> Image.Image:
    if src is None:
        return Image.new("RGB", (SIZE, SIZE), (200, 200, 200))
    if isinstance(src, bytes):
        data = src
    elif re.match(r"https?://", src):
        r = requests.get(src, timeout=30, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.content
    else:
        data = Path(src).read_bytes()
    im = Image.open(io.BytesIO(data))
    return ImageOps.exif_transpose(im).convert("RGB")


def render(lst: Listing, photo: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (SIZE, SIZE), NAVY)

    # фото: на всё под шапкой
    ph = ImageOps.fit(photo, (SIZE, SIZE - HEADER_H), Image.LANCZOS, centering=(0.5, 0.5))
    canvas.paste(ph, (0, HEADER_H))

    # серая полоса
    over = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(over)
    od.rectangle((0, BAND_Y0, SIZE, BAND_Y1), fill=BAND_RGBA)
    if lst.exclusive:
        od.rectangle((0, RIBBON_Y0, SIZE, RIBBON_Y1), fill=RED + (255,))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), over)
    d = ImageDraw.Draw(canvas)

    bebas = _is_bebas(load_font(20))

    # цена
    price = (lst.price or "").upper()
    if price:
        pf = fit_font(price, 900, 250 if bebas else 170)
        base = 194 if lst.exclusive else 204
        draw_spaced(d, (SIZE / 2, base), price, pf, WHITE, spacing=6 if bebas else 2, anchor="ms")

    # EXCLUSIVE под ценой
    if lst.exclusive:
        ef = load_font(32 if bebas else 22)
        w = draw_spaced(d, (SIZE / 2, 238), "EXCLUSIVE", ef, WHITE, spacing=3, anchor="ms")
        d.rectangle((SIZE / 2 - w / 2, 244, SIZE / 2 + w / 2, 247), fill=RED)

    # иконки + подписи
    labels = [
        (lst.district or "").upper(),
        (lst.area or "").upper(),
        (lst.bedrooms or "").upper(),
    ]
    for x, kind, label in zip(ICON_XS, ("pin", "m2", "bed"), labels):
        ic = icon(kind)
        canvas.alpha_composite(ic, (int(x - ICON_R), int(ICON_Y - ICON_R)))
        if label:
            lf = fit_font(label, 320, 40 if bebas else 28, spacing=2)
            draw_spaced(d, (x, LABEL_Y + 14), label, lf, WHITE, spacing=2, anchor="ms")

    # красная лента
    if lst.exclusive:
        rf = load_font(42 if bebas else 28)
        mid = (RIBBON_Y0 + RIBBON_Y1) / 2
        draw_spaced(d, (RIBBON_TEXT_X, mid + (15 if bebas else 10)), "EXCLUSIVE APARTMENT", rf, WHITE, spacing=4, anchor="ls")

    return canvas.convert("RGB")


# ================================================================ CLI
def build(link: str | None = None, text: str | None = None, photo: str | bytes | None = None,
          price=None, district=None, area=None, bedrooms=None, exclusive: str = "auto") -> tuple[Image.Image, Listing]:
    photo_urls: list[str] = []
    if link:
        post = fetch_tg_post(link)
        text = (text or "") + "\n" + post.text
        photo_urls = post.photo_urls
    lst = extract(text or "")
    lst.photo_urls = photo_urls

    if price:
        price = str(price).strip()
        lst.price = price if re.search(r"[$₾€]|gel|usd", price, re.I) else f"{_num(price)}$"
    if district:
        lst.district = district
    if area:
        lst.area = re.sub(r"[^\d.]", "", str(area))
    if bedrooms:
        b = str(bedrooms).strip()
        if b.isdigit():
            n = int(b)
            b = "STUDIO" if n == 0 else f"{n} BEDROOM" + ("S" if n > 1 else "")
        lst.bedrooms = b
    if exclusive in ("yes", "true", "1", "да"):
        lst.exclusive = True
    elif exclusive in ("no", "false", "0", "нет"):
        lst.exclusive = False

    src = photo if photo is not None else (photo_urls[0] if photo_urls else None)
    img = render(lst, load_photo(src))
    return img, lst


def main(argv=None):
    ap = argparse.ArgumentParser(description="Обложка 1080x1080 из поста Telegram")
    ap.add_argument("link", nargs="?", help="ссылка https://t.me/<канал>/<номер>")
    ap.add_argument("--text", help="файл с текстом поста (вместо ссылки)")
    ap.add_argument("--photo", help="фото (файл или URL) — вместо фото из поста")
    ap.add_argument("--price")
    ap.add_argument("--district")
    ap.add_argument("--area")
    ap.add_argument("--bedrooms")
    ap.add_argument("--exclusive", default="auto", choices=["auto", "yes", "no"])
    ap.add_argument("--out", help="куда сохранить PNG")
    a = ap.parse_args(argv)

    if not a.link and not a.text:
        ap.error("нужна ссылка или --text")
    text = Path(a.text).read_text(encoding="utf-8") if a.text else None
    img, lst = build(a.link, text, a.photo, a.price, a.district, a.area, a.bedrooms, a.exclusive)

    out = a.out
    if not out:
        name = "cover"
        if a.link:
            ch, pid = parse_tg_link(a.link)
            name = f"{ch}_{pid}"
        out = str(ROOT / "covers" / f"{name}.png")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)

    print(f"price:     {lst.price}")
    print(f"exclusive: {lst.exclusive}")
    print(f"district:  {lst.district}")
    print(f"area:      {lst.area}")
    print(f"bedrooms:  {lst.bedrooms}")
    print(f"saved:     {out}")
    missing = [k for k in ("price", "district", "area", "bedrooms") if not getattr(lst, k)]
    if missing:
        print("ВНИМАНИЕ: не найдено в тексте: " + ", ".join(missing) + " — укажите флагами", file=sys.stderr)
    return out


if __name__ == "__main__":
    main()
