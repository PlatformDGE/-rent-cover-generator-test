// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
/**
 * Анкета клиента → Google-таблица + уведомление в Telegram-группу операторов.
 * Вставьте этот код в Google Таблицу: Расширения → Apps Script. Инструкция: anketa/SETUP.md
 */

// ===== НАСТРОЙКИ =====
const BOT_TOKEN = 'ВСТАВЬТЕ_ТОКЕН_БОТА';      // от @BotFather
const CHAT_ID   = 'ВСТАВЬТЕ_ID_ГРУППЫ';        // узнать: запустите функцию findChatId (см. SETUP.md)
const SHEET     = 'Заявки';

const COLUMNS = [
  ['n', '№'], ['time', 'Дата'], ['status', 'Статус'], ['agent', 'Агент'],
  ['flat', 'Квартира'], ['name', 'Имя'], ['contact', 'Контакт'], ['lang', 'Язык'],
  ['country', 'Страна / гражданство'], ['job', 'Род деятельности'],
  ['people', 'Проживающих'], ['kids', 'Дети'], ['pets', 'Животные'],
  ['term', 'Срок аренды'], ['date', 'Дата заселения'], ['view', 'Удобное время показа'],
  ['wish', 'Особые требования'], ['operator', 'Оператор (ссылка)'],
];
const STATUSES = ['🆕 Новая', '📨 Передана агенту', '📅 Показ назначен', '✅ Заселился', '❌ Отказ'];

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const sh = getSheet_();
  const n = Math.max(sh.getLastRow(), 1); // номер заявки = номер строки без заголовка
  d.n = n;
  d.time = new Date();
  d.status = STATUSES[0];
  d.agent = '';
  d.lang = (d.lang || '').toUpperCase();
  sh.appendRow(COLUMNS.map(([k]) => d[k] || ''));
  const row = sh.getLastRow();
  sh.getRange(row, 3).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  notify_(d, row);
  return ContentService.createTextOutput('ok');
}

function notify_(d, row) {
  if (!BOT_TOKEN || BOT_TOKEN.startsWith('ВСТАВЬТЕ')) return;
  const esc = s => String(s || '—').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const tgNick = /^@?[A-Za-z][A-Za-z0-9_]{4,}$/.test(d.contact || '') ? d.contact.replace('@', '') : '';
  const lines = [
    `🆕 <b>Заявка №${d.n}</b> · ${d.lang}`,
    d.flat ? `🏠 <a href="${d.flat}">Квартира</a>` : '🏠 Квартира: не указана',
    `👤 ${esc(d.name)} · ${tgNick ? '@' + tgNick : esc(d.contact)}`,
    '',
    `🌍 ${esc(d.country)}`,
    `💼 ${esc(d.job)}`,
    `👥 ${esc(d.people)}`,
    `👶 Дети: ${esc(d.kids)}`,
    `🐾 Животные: ${esc(d.pets)}`,
    `⏳ Срок: ${esc(d.term)}`,
    `📦 Заселение: ${esc(d.date)}`,
    `👀 Показ: ${esc(d.view)}`,
    `✨ Пожелания: ${esc(d.wish)}`,
  ];
  const buttons = [];
  if (tgNick) buttons.push({ text: '💬 Написать клиенту', url: `https://t.me/${tgNick}` });
  buttons.push({ text: '📊 Таблица', url: SpreadsheetApp.getActive().getUrl() + '#gid=' + getSheet_().getSheetId() + '&range=A' + row });
  UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: CHAT_ID, text: lines.join('\n'), parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: { inline_keyboard: [buttons] },
    }),
  });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(COLUMNS.map(([, title]) => title));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#032D6A').setFontColor('#ffffff');
    sh.setColumnWidths(1, COLUMNS.length, 160);
    sh.setColumnWidth(1, 50);
  }
  return sh;
}

/** Запустите один раз после того, как добавили бота в группу и написали там любое сообщение. */
function findChatId() {
  const r = JSON.parse(UrlFetchApp.fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`).getContentText());
  const chats = {};
  (r.result || []).forEach(u => {
    const c = (u.message || u.my_chat_member || u.channel_post || {}).chat;
    if (c) chats[c.id] = c.title || c.username || c.first_name;
  });
  Logger.log(Object.keys(chats).length ? chats : 'Пусто: добавьте бота в группу и напишите там сообщение, затем запустите снова');
}

/** Проверка без формы: создаёт тестовую заявку. */
function testSubmit() {
  doPost({ postData: { contents: JSON.stringify({
    lang: 'ru', flat: 'https://t.me/rent_tbilisi_ge/511488', name: 'Тест', contact: '@test',
    country: 'Россия', job: 'IT / удалённая работа', people: '2 — пара', kids: 'Нет', pets: 'Нет',
    term: '12 месяцев', date: 'Как можно скорее', view: 'Завтра; вечер', wish: 'Нет',
  }) } });
}
