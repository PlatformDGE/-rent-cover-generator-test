#!/usr/bin/env python3
# Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
"""
Telegram-бот: оператор присылает ссылку на пост ИЛИ пересылает сам пост —
бот отвечает готовой обложкой 1080x1080.

    TELEGRAM_BOT_TOKEN=123:ABC python bot.py

Поправить поле: ответьте на картинку бота строкой вида
    price=450 district=Vake area=40 bedrooms=1 exclusive=yes
"""
import io
import os
import re
import time

import requests

import cover

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or exit("Нужен TELEGRAM_BOT_TOKEN")
API = f"https://api.telegram.org/bot{TOKEN}"
FILE_API = f"https://api.telegram.org/file/bot{TOKEN}"

# message_id картинки бота -> исходные данные (для правок ответом)
history: dict[int, dict] = {}


def tg(method, **kw):
    r = requests.post(f"{API}/{method}", timeout=60, **kw)
    return r.json()


def send_text(chat, text):
    tg("sendMessage", data={"chat_id": chat, "text": text})


def download_photo(photos) -> bytes:
    file_id = max(photos, key=lambda p: p.get("file_size", 0))["file_id"]
    path = tg("getFile", data={"file_id": file_id})["result"]["file_path"]
    return requests.get(f"{FILE_API}/{path}", timeout=60).content


def parse_overrides(text: str) -> dict:
    out = {}
    for k, v in re.findall(r"(price|district|area|bedrooms|exclusive)\s*[=:]\s*(\S+)", text, re.I):
        out[k.lower()] = v
    return out


def make_and_send(chat, src: dict, reply_to=None):
    try:
        img, lst = cover.build(
            link=src.get("link"), text=src.get("text"), photo=src.get("photo"),
            price=src.get("price"), district=src.get("district"), area=src.get("area"),
            bedrooms=src.get("bedrooms"), exclusive=src.get("exclusive", "auto"),
        )
    except SystemExit as e:
        return send_text(chat, str(e))
    except Exception as e:  # noqa
        return send_text(chat, f"Ошибка: {e}")

    buf = io.BytesIO()
    img.save(buf, "PNG")
    caption = (
        f"Цена: {lst.price or '—'} | Эксклюзив: {'да' if lst.exclusive else 'нет'}\n"
        f"Район: {lst.district or '—'} | {lst.area or '—'} м² | {lst.bedrooms or '—'}\n"
        "Поправить: ответьте на картинку, напр. «district=Vake price=500»"
    )
    res = tg("sendDocument", data={"chat_id": chat, "caption": caption},
             files={"document": ("cover.png", buf.getvalue(), "image/png")})
    if res.get("ok"):
        history[res["result"]["message_id"]] = src


def handle(msg):
    chat = msg["chat"]["id"]
    text = msg.get("text") or msg.get("caption") or ""

    if text.startswith("/start"):
        return send_text(chat, "Пришлите ссылку на пост из канала или перешлите сам пост — сделаю обложку.")

    # правка ответом на картинку бота
    rep = msg.get("reply_to_message")
    if rep and rep.get("message_id") in history:
        src = dict(history[rep["message_id"]])
        src.update(parse_overrides(text))
        return make_and_send(chat, src)

    link = re.search(r"https?://t(?:elegram)?\.me/\S+", text)
    if msg.get("photo") or (msg.get("forward_origin") or msg.get("forward_from_chat")):
        # пересланный пост: текст и фото берём прямо из сообщения
        src = {"text": text, **parse_overrides(text)}
        if msg.get("photo"):
            src["photo"] = download_photo(msg["photo"])
        elif link:
            src["link"] = link.group(0)
        return make_and_send(chat, src)

    if link:
        return make_and_send(chat, {"link": link.group(0), **parse_overrides(text)})

    send_text(chat, "Нужна ссылка вида https://t.me/канал/123 или пересланный пост.")


def main():
    offset = 0
    print("bot started")
    while True:
        try:
            upd = tg("getUpdates", data={"offset": offset, "timeout": 50})
            for u in upd.get("result", []):
                offset = u["update_id"] + 1
                if "message" in u:
                    handle(u["message"])
        except Exception as e:  # noqa
            print("error:", e)
            time.sleep(3)


if __name__ == "__main__":
    main()
