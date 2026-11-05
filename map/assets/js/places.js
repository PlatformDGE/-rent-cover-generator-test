// Made with Claude (Anthropic) · © Homes in Georgia · Created by Irakli Kvirkvelia
// One dictionary of districts, towns and metro stations in EN / RU / KA.
// Listings keep the English name as their value (filters and links use it);
// placeName() only changes what the visitor reads. Unknown names show as they are.
import { getLang } from './i18n.js';

// English spellings that mean the same place → one canonical English name.
export const PLACE_ALIASES = {
  'Digomi': 'Dighomi', 'Didi Digomi': 'Didi Dighomi', 'Digomi Massive': 'Dighomi Massive', 'Digomi 1-9': 'Dighomi 1-9',
  'Temka': 'Temqa', 'Temuka': 'Temqa', 'Out Of Town': 'Out of town', 'Voroncov': 'Vorontsov', 'Tskhneti': 'Tskneti',
  'Mukhiani': 'Mukhiani', 'Mukhyani': 'Mukhiani', 'Vazha Pshavela': 'Vazha-Pshavela',
};
export const canonicalPlace = name => PLACE_ALIASES[name] || name;

const P = {
  // districts and towns
  'Saburtalo': ['Сабуртало', 'საბურთალო'],
  'Vake': ['Ваке', 'ვაკე'],
  'Sololaki': ['Сололаки', 'სოლოლაკი'],
  'Vera': ['Вера', 'ვერა'],
  'Chugureti': ['Чугурети', 'ჩუღურეთი'],
  'Didi Dighomi': ['Диди Дигоми', 'დიდი დიღომი'],
  'Dighomi': ['Дигоми', 'დიღომი'],
  'Dighomi Massive': ['Дигомский массив', 'დიღმის მასივი'],
  'Dighomi 1-9': ['Дигоми 1–9', 'დიღომი 1–9'],
  'Ortachala': ['Ортачала', 'ორთაჭალა'],
  'Mtatsminda': ['Мтацминда', 'მთაწმინდა'],
  'Lisi': ['Лиси', 'ლისი'],
  'Gldani': ['Глдани', 'გლდანი'],
  'Didube': ['Дидубе', 'დიდუბე'],
  'Tskneti': ['Цхнети', 'წყნეთი'],
  'Isani': ['Исани', 'ისანი'],
  'Krtsanisi': ['Крцаниси', 'კრწანისი'],
  'Old Tbilisi': ['Старый Тбилиси', 'ძველი თბილისი'],
  'Avlabari': ['Авлабари', 'ავლაბარი'],
  'Nadzaladevi': ['Надзаладеви', 'ნაძალადევი'],
  'Bagebi': ['Багеби', 'ბაგები'],
  'Samgori': ['Самгори', 'სამგორი'],
  'Varketili': ['Варкетили', 'ვარკეთილი'],
  'Nutsubidze': ['Нуцубидзе', 'ნუცუბიძე'],
  'Vorontsov': ['Воронцов', 'ვორონცოვი'],
  'Vashlijvari': ['Вашлиджвари', 'ვაშლიჯვარი'],
  'Shindisi': ['Шиндиси', 'შინდისი'],
  'Temqa': ['Темка', 'თემქა'],
  'Mukhiani': ['Мухиани', 'მუხიანი'],
  'Vazisubani': ['Вазисубани', 'ვაზისუბანი'],
  'Kiketi': ['Кикети', 'კიკეთი'],
  'Tsavkisi': ['Цавкиси', 'წავკისი'],
  'Napetvrebi': ['Напетвреби', 'ნაფეტვრები'],
  'Saguramo': ['Сагурамо', 'საგურამო'],
  'Mtskheta': ['Мцхета', 'მცხეთა'],
  'Rustavi': ['Рустави', 'რუსთავი'],
  'Batumi': ['Батуми', 'ბათუმი'],
  'Kobuleti': ['Кобулети', 'ქობულეთი'],
  'Shekvetili': ['Шекветили', 'შეკვეთილი'],
  'Borjomi': ['Боржоми', 'ბორჯომი'],
  'Gudauri': ['Гудаури', 'გუდაური'],
  'Bakuriani': ['Бакуриани', 'ბაკურიანი'],
  'Out of town': ['За городом', 'ქალაქგარეთ'],
  // metro stations
  'Rustaveli': ['Руставели', 'რუსთაველი'],
  'Liberty Square': ['Площадь Свободы', 'თავისუფლების მოედანი'],
  'Technical University': ['Технический университет', 'ტექნიკური უნივერსიტეტი'],
  'Medical University': ['Медицинский университет', 'სამედიცინო უნივერსიტეტი'],
  'State University': ['Государственный университет', 'სახელმწიფო უნივერსიტეტი'],
  'Delisi': ['Делиси', 'დელისი'],
  'Vazha-Pshavela': ['Важа-Пшавела', 'ვაჟა-ფშაველა'],
  'Sarajishvili': ['Сараджишвили', 'სარაჯიშვილი'],
  'Marjanishvili': ['Марджанишвили', 'მარჯანიშვილი'],
  '300 Aragveli': ['300 Арагвели', '300 არაგველი'],
  'Station Square': ['Вокзальная площадь', 'სადგურის მოედანი'],
  'Akhmeteli Theatre': ['Театр Ахметели', 'ახმეტელის თეატრი'],
  'Tsereteli': ['Церетели', 'წერეთელი'],
  'Grmagele': ['Грмагеле', 'ღრმაღელე'],
  'Guramishvili': ['Гурамишвили', 'გურამიშვილი'],
  'Gotsiridze': ['Гоциридзе', 'გოცირიძე'],
  'Elektrodepo': ['Электродепо', 'ელექტროდეპო'],
  'Zahesi': ['Загэс', 'ზაჰესი'],
  'Nadzaladevi Metro': ['Надзаладеви', 'ნაძალადევი'],
};

export function placeName(name, lang = getLang()) {
  if (!name) return '';
  const key = canonicalPlace(name);
  const row = P[key];
  if (!row || lang === 'en') return key;
  return lang === 'ru' ? row[0] : row[1];
}

// Every spelling of a place, for search: "Сабуртало", "საბურთალო" and "Saburtalo" all find it.
export const placeSearchText = name => { const key = canonicalPlace(name); const row = P[key]; return row ? [key, ...row].join(' ') : key || ''; };
