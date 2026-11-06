/**
 * حساب مواقيت الصلاة والتقويم الهجري محليًا على الجهاز
 * (خوارزمية Solar Position / Astronomical Almanac — لا تحتاج أي خدمة خارجية).
 * الطريقة الافتراضية: الهيئة المصرية العامة للمساحة (19.5° / 17.5°).
 */

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export const PRAYERS: Array<{ key: PrayerKey; label: string; emoji: string }> = [
  { key: "fajr", label: "الفجر", emoji: "🌙" },
  { key: "dhuhr", label: "الظهر", emoji: "☀️" },
  { key: "asr", label: "العصر", emoji: "🌤️" },
  { key: "maghrib", label: "المغرب", emoji: "🌇" },
  { key: "isha", label: "العشاء", emoji: "🌙" },
];

export type MethodKey = "egyptian" | "mwl" | "umm_al_qura" | "isna" | "karachi" | "dubai";

export const METHODS: Array<{ key: MethodKey; label: string; fajr: number; isha: number; ishaInterval?: number }> = [
  { key: "egyptian", label: "الهيئة المصرية العامة للمساحة", fajr: 19.5, isha: 17.5 },
  { key: "mwl", label: "رابطة العالم الإسلامي", fajr: 18, isha: 17 },
  { key: "umm_al_qura", label: "أم القرى — مكة المكرمة", fajr: 18.5, isha: 0, ishaInterval: 90 },
  { key: "isna", label: "الجمعية الإسلامية بأمريكا الشمالية", fajr: 15, isha: 15 },
  { key: "karachi", label: "جامعة العلوم الإسلامية بكراتشي", fajr: 18, isha: 18 },
  { key: "dubai", label: "الإمارات — دبي", fajr: 18.2, isha: 18.2 },
];

export type CityPreset = { name: string; country: string; lat: number; lng: number; tz: number };

/** مدن جاهزة + إمكانية تحديد الموقع تلقائيًا. */
export const CITIES: CityPreset[] = [
  { name: "القاهرة", country: "مصر", lat: 30.0444, lng: 31.2357, tz: 2 },
  { name: "الجيزة", country: "مصر", lat: 30.0131, lng: 31.2089, tz: 2 },
  { name: "الإسكندرية", country: "مصر", lat: 31.2001, lng: 29.9187, tz: 2 },
  { name: "المنصورة", country: "مصر", lat: 31.0409, lng: 31.3785, tz: 2 },
  { name: "أسيوط", country: "مصر", lat: 27.1809, lng: 31.1837, tz: 2 },
  { name: "الأقصر", country: "مصر", lat: 25.6872, lng: 32.6396, tz: 2 },
  { name: "أسوان", country: "مصر", lat: 24.0889, lng: 32.8998, tz: 2 },
  { name: "الرياض", country: "السعودية", lat: 24.7136, lng: 46.6753, tz: 3 },
  { name: "جدة", country: "السعودية", lat: 21.4858, lng: 39.1925, tz: 3 },
  { name: "مكة المكرمة", country: "السعودية", lat: 21.3891, lng: 39.8579, tz: 3 },
  { name: "دبي", country: "الإمارات", lat: 25.2048, lng: 55.2708, tz: 4 },
  { name: "أبو ظبي", country: "الإمارات", lat: 24.4539, lng: 54.3773, tz: 4 },
  { name: "الدوحة", country: "قطر", lat: 25.2854, lng: 51.531, tz: 3 },
  { name: "الكويت", country: "الكويت", lat: 29.3759, lng: 47.9774, tz: 3 },
  { name: "المنامة", country: "البحرين", lat: 26.2285, lng: 50.586, tz: 3 },
  { name: "مسقط", country: "عُمان", lat: 23.588, lng: 58.3829, tz: 4 },
  { name: "عمّان", country: "الأردن", lat: 31.9539, lng: 35.9106, tz: 3 },
  { name: "بيروت", country: "لبنان", lat: 33.8938, lng: 35.5018, tz: 3 },
  { name: "دمشق", country: "سوريا", lat: 33.5138, lng: 36.2765, tz: 3 },
  { name: "بغداد", country: "العراق", lat: 33.3152, lng: 44.3661, tz: 3 },
  { name: "الخرطوم", country: "السودان", lat: 15.5007, lng: 32.5599, tz: 2 },
  { name: "تونس", country: "تونس", lat: 36.8065, lng: 10.1815, tz: 1 },
  { name: "الجزائر", country: "الجزائر", lat: 36.7538, lng: 3.0588, tz: 1 },
  { name: "الدار البيضاء", country: "المغرب", lat: 33.5731, lng: -7.5898, tz: 1 },
  { name: "طرابلس", country: "ليبيا", lat: 32.8872, lng: 13.1913, tz: 2 },
  { name: "صنعاء", country: "اليمن", lat: 15.3694, lng: 44.191, tz: 3 },
  { name: "إستانبول", country: "تركيا", lat: 41.0082, lng: 28.9784, tz: 3 },
  { name: "لندن", country: "بريطانيا", lat: 51.5074, lng: -0.1278, tz: 0 },
  { name: "برلين", country: "ألمانيا", lat: 52.52, lng: 13.405, tz: 1 },
  { name: "نيويورك", country: "أمريكا", lat: 40.7128, lng: -74.006, tz: -5 },
];

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const sin = (d: number) => Math.sin(rad(d));
const cos = (d: number) => Math.cos(rad(d));
const tan = (d: number) => Math.tan(rad(d));
const asin = (x: number) => deg(Math.asin(x));
const acos = (x: number) => deg(Math.acos(Math.min(1, Math.max(-1, x))));
const atan2 = (y: number, x: number) => deg(Math.atan2(y, x));

/** Julian day for a Gregorian date at 00:00 UTC. */
/** الطريقة المناسبة لكل بلد (بند 11: كل بلد بوقتها الفعلي). */
/**
 * التوقيت الصيفي لكل مدينة — بنحسبه من قاعدة IANA الحقيقية بدل رقم ثابت،
 * لأن أرقام ثابتة بتغلط ساعة كاملة في المغرب وأوروبا وأمريكا وقت الصيف.
 * ولو المنطقة مش معروفة، بنستخدم فرق توقيت الجهاز نفسه.
 */
const TZ_BY_COUNTRY: Record<string, string> = {
  مصر: "Africa/Cairo",
  السعودية: "Asia/Riyadh",
  الإمارات: "Asia/Dubai",
  قطر: "Asia/Qatar",
  الكويت: "Asia/Kuwait",
  البحرين: "Asia/Bahrain",
  عمان: "Asia/Muscat",
  الأردن: "Asia/Amman",
  لبنان: "Asia/Beirut",
  سوريا: "Asia/Damascus",
  العراق: "Asia/Baghdad",
  فلسطين: "Asia/Gaza",
  اليمن: "Asia/Aden",
  السودان: "Africa/Khartoum",
  ليبيا: "Africa/Tripoli",
  تونس: "Africa/Tunis",
  الجزائر: "Africa/Algiers",
  المغرب: "Africa/Casablanca",
  موريتانيا: "Africa/Nouakchott",
  تركيا: "Europe/Istanbul",
  "المملكة المتحدة": "Europe/London",
  فرنسا: "Europe/Paris",
  ألمانيا: "Europe/Berlin",
  إسبانيا: "Europe/Madrid",
  إيطاليا: "Europe/Rome",
  هولندا: "Europe/Amsterdam",
  بلجيكا: "Europe/Brussels",
  السويد: "Europe/Stockholm",
  النرويج: "Europe/Oslo",
  الدنمارك: "Europe/Copenhagen",
  النمسا: "Europe/Vienna",
  سويسرا: "Europe/Zurich",
  اليونان: "Europe/Athens",
  روسيا: "Europe/Moscow",
  أوكرانيا: "Europe/Kyiv",
  كندا: "America/Toronto",
  "الولايات المتحدة": "America/New_York",
  البرازيل: "America/Sao_Paulo",
  أستراليا: "Australia/Sydney",
  ماليزيا: "Asia/Kuala_Lumpur",
  إندونيسيا: "Asia/Jakarta",
  باكستان: "Asia/Karachi",
  الهند: "Asia/Kolkata",
  بنغلاديش: "Asia/Dhaka",
  نيجيريا: "Africa/Lagos",
  كينيا: "Africa/Nairobi",
  "جنوب أفريقيا": "Africa/Johannesburg",
  إثيوبيا: "Africa/Addis_Ababa",
  الصومال: "Africa/Mogadishu",
  السنغال: "Africa/Dakar",
  اليابان: "Asia/Tokyo",
  الصين: "Asia/Shanghai",
};
/** فرق التوقيت الفعلي (بالساعات) لمدينة معيّنة في لحظة معيّنة، مع التوقيت الصيفي. */
export function cityTzOffset(country: string, date: Date = new Date()): number {
  const zone = TZ_BY_COUNTRY[country];
  if (zone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(date);
      const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
      const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
      return Math.round(((asUtc - date.getTime()) / 3600000) * 100) / 100;
    } catch {
      // لو الجهاز مش داعم للمنطقة، بنكمل للاحتياطي
    }
  }
  return -date.getTimezoneOffset() / 60;
}
/**
 * بيحوّل لحظة مطلقة إلى «ساعة حيطة» بتوقيت المدينة: بنرجع Date مصطنع
 * حقوله UTC مساوية لساعة المدينة، عشان العرض (getUTCHours) يطلع صح مهما كان توقيت الجهاز.
 */
export function cityWallClock(instant: Date, offsetHours: number): Date {
  return new Date(instant.getTime() + offsetHours * 3600000);
}
export function methodForCountry(country: string): MethodKey {
  if (/الإمارات|امارات|UAE|Emirates/i.test(country)) return "dubai";
  if (/السعودية|Saudi/i.test(country)) return "umm_al_qura";
  if (/مصر|Egypt/i.test(country)) return "egyptian";
  if (/باكستان|الهند|بنغلاديش|Pakistan|India|Bangladesh/i.test(country)) return "karachi";
  if (/أمريكا|كندا|USA|Canada/i.test(country)) return "isna";
  return "mwl";
}
export function julianDay(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

/** تقويم هجري (الخوارزمية الحسابية الكويتية — انحراف يوم واحد كحد أقصى). */
export function hijriDate(date: Date): { day: number; month: number; year: number; label: string } {
  const jd = Math.floor(julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate())) + 1;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  let l2 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  l2 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l2) / 709);
  const day = l2 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  const months = [
    "محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة",
    "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
  ];
  const safeMonth = Math.min(12, Math.max(1, month));
  return { day, month: safeMonth, year, label: `${day} ${months[safeMonth - 1]} ${year} هـ` };
}

export type PrayerTimes = Record<PrayerKey, Date>;

/**
 * حساب مواقيت الصلاة ليوم معين.
 * @param tzOffset ساعات فرق التوقيت عن UTC (+2 للقاهرة صيفًا/شتاءً تقريبًا)
 */
export function prayerTimes(
  date: Date,
  lat: number,
  lng: number,
  methodKey: MethodKey = "egyptian",
  asrHanafi = false,
  tzOffset = 2,
): PrayerTimes {
  const method = METHODS.find((m) => m.key === methodKey) ?? METHODS[0];
  // تاريخ اليوم المدني في المدينة نفسها (مش في جهاز المستخدم) — أساس الحساب كله
  const local = cityWallClock(date, tzOffset);
  const jd0 = julianDay(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());

  // معادلة الزمن وميل الشمس (خوارزمية PrayTimes — دقة دقيقة واحدة تقريبًا)
  const sunPosition = (jd: number) => {
    const d = jd - 2451545.0;
    const g = ((357.529 + 0.98560028 * d) % 360 + 360) % 360;
    const q = ((280.459 + 0.98564736 * d) % 360 + 360) % 360;
    const L = ((q + 1.915 * sin(g) + 0.02 * sin(2 * g)) % 360 + 360) % 360;
    const e = 23.439 - 0.00000036 * d;
    const decl = asin(sin(e) * sin(L));
    const ra = ((atan2(cos(e) * sin(L), cos(L)) / 15) + 24) % 24;
    const eqt = q / 15 - ra;
    return { decl, eqt };
  };

  // منتصف الظهر الشمسي (يولياني)
  const midDay = (jd: number) => {
    const { eqt } = sunPosition(jd);
    return jd + (12 - eqt) / 24;
  };

  const sunAngleTime = (jd: number, angle: number, beforeNoon: boolean) => {
    const { decl } = sunPosition(jd);
    const ratio = (sin(-angle) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl));
    if (ratio < -1 || ratio > 1) return NaN;
    const ha = acos(ratio) / 15;
    return midDay(jd) + (beforeNoon ? -ha : ha) / 24;
  };

  // مرجع الظهر الفلكي: منتصف نهار UTC لهذا اليوم مع تصحيح خط الطول
  const jd = jd0 + 0.5 - lng / (15 * 24);
  const dhuhrJd = midDay(jd) + 1 / (24 * 60); // دقيقة احتياطية بعد الزوال
  const { decl } = sunPosition(jd);
  const shadow = asrHanafi ? 2 : 1;
  // ارتفاع الشمس وقت العصر موجب (الظل = ظل الزوال × shadow)
  const asrAngle = deg(Math.atan(1 / (shadow + tan(Math.abs(lat - decl)))));
  const asrAltitude = lat >= 0 ? asrAngle : -asrAngle;
  const asrHourAngle = acos((sin(asrAltitude) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl))) / 15;
  const asrJd = midDay(jd) + asrHourAngle / 24;

  const fajrJd = sunAngleTime(jd, method.fajr, true);
  const sunriseJd = sunAngleTime(jd, 0.833, true);
  const maghribJd = sunAngleTime(jd, 0.833, false);
  const ishaJd = method.ishaInterval ? maghribJd + method.ishaInterval / (24 * 60) : sunAngleTime(jd, method.isha, false);

  // تحويل اليولياني إلى وقت UTC ثم إلى التوقيت المحلي
  const toDate = (j: number) => {
    // لحظة حقيقية (UTC) محفوظة كما هي؛ العرض بيستخدم displayClock() بتوقيت المدينة
    return new Date((j - 2440587.0) * 86400000);
  };
  void sunriseJd;

  return {
    fajr: toDate(fajrJd),
    dhuhr: toDate(dhuhrJd),
    asr: toDate(asrJd),
    maghrib: toDate(maghribJd),
    isha: toDate(ishaJd),
  };
}

/** الموعد القادم من بين الصلوات المفعّلة، أو null لو انتهى اليوم. */
export function nextPrayer(
  times: PrayerTimes,
  enabled: Record<PrayerKey, boolean>,
  now: Date = new Date(),
): { key: PrayerKey; at: Date; label: string; emoji: string } | null {
  for (const p of PRAYERS) {
    if (!enabled[p.key]) continue;
    if (times[p.key].getTime() > now.getTime()) {
      return { key: p.key, at: times[p.key], label: p.label, emoji: p.emoji };
    }
  }
  return null;
}

/** ساعة/دقيقة بتوقيت المدينة (مش توقيت الجهاز). */
export function displayClock(date: Date, offsetHours: number): { h: number; m: number } {
  const wall = cityWallClock(date, offsetHours);
  return { h: wall.getUTCHours(), m: wall.getUTCMinutes() };
}
/** نص الساعة بتوقيت المدينة — نفس اللي هيظهر في شاشة الصلاة وفي العداد. */
export function formatClock(date: Date, offsetHours?: number): string {
  const { h, m: mRaw } = offsetHours === undefined ? { h: date.getHours(), m: date.getMinutes() } : displayClock(date, offsetHours);
  const m = mRaw.toString().padStart(2, "0");
  const suffix = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export function isQuietNow(
  times: PrayerTimes,
  enabled: Record<PrayerKey, boolean>,
  quietMinutes: number,
  now: Date = new Date(),
): { active: boolean; key?: PrayerKey; endsAt?: Date } {
  for (const p of PRAYERS) {
    if (!enabled[p.key]) continue;
    const start = times[p.key].getTime();
    const end = start + quietMinutes * 60_000;
    if (now.getTime() >= start && now.getTime() < end) {
      return { active: true, key: p.key, endsAt: new Date(end) };
    }
  }
  return { active: false };
}
