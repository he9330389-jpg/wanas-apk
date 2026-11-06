import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * لغة واجهة ونس — عربي / إنجليزي / فرنسي / ألماني (بند 13 من ملاحظات المستخدم).
 * - الاختيار بيتحفظ على الجهاز (AsyncStorage) وبيتزامن مع `profiles.lang`.
 * - `t("key")` بترجع النص بلغة الواجهة، ولو المفتاح مش موجود بترجع العربي أو المفتاح نفسه.
 * - `dir` بترجع اتجاه الواجهة، والعربي هو الوحيد RTL.
 */
export type UiLang = "ar" | "en" | "fr" | "de";

export const UI_LANGS: { code: UiLang; label: string; native: string }[] = [
  { code: "ar", label: "العربي", native: "العربية" },
  { code: "en", label: "الإنجليزي", native: "English" },
  { code: "fr", label: "الفرنسي", native: "Français" },
  { code: "de", label: "الألماني", native: "Deutsch" },
];

type Dict = Record<string, string>;

const ar: Dict = {
  "tab.home": "الرئيسية",
  "tab.video": "فيديو",
  "tab.councils": "المجالس",
  "tab.chat": "الونسة",
  "tab.profile": "الملف",
  "home.hello": "هتونسنا النهارده؟",
  "home.stories": "القصص",
  "home.allStories": "كل القصص",
  "home.yourStory": "قصتك",
  "home.feed": "آخر الأخبار",
  "home.composerHint": "ايش ونستك النهارده؟",
  "home.live": "لايف",
  "home.mentionFriends": "منشن أصدقاء",
  "home.feeling": "شعور",
  "home.subs": "اشتراكاتك",
  "home.empty": "مفيش منشورات لسه — ابدأ أول منشور واجمع الونس.",
  "home.loadError": "تعذّر تحميل الموجز — اسحب لتحديث الصفحة",
  "video.title": "فيديو",
  "video.stories": "القصص",
  "video.upload": "ارفع فيديو",
  "video.publicStories": "قصص عامة",
  "video.empty": "مفيش فيديوهات لسه — ارفع أول فيديو وخلّي الناس تتفرج.",
  "councils.title": "المجالس",
  "councils.create": "أنشئ مجلس",
  "chat.title": "الونسة",
  "profile.title": "الملف الشخصي",
  "settings.title": "الإعدادات والخصوصية",
  "settings.appearance": "المظهر",
  "settings.light": "فاتح",
  "settings.dark": "داكن",
  "settings.language": "اللغة",
  "settings.languageHint": "لما تختار لغة، واجهة البرنامج كلها بتتحول لها.",
  "post.new": "منشور جديد",
  "post.publish": "انشر",
  "post.published": "تم النشر",
  "post.comments": "التعليقات",
  "post.writeComment": "اكتب تعليق…",
  "post.voice": "صوت",
  "post.sticker": "ستيكر",
  "post.image": "صورة",
  "post.video": "فيديو",
  "common.back": "رجوع",
  "common.cancel": "إلغاء",
  "common.save": "احفظ",
  "common.delete": "احذف",
  "common.send": "إرسال",
  "common.loading": "بنجهّز…",
  "common.error": "حصلت مشكلة — جرّب تاني",
  "common.retry": "جرّب تاني",
  "common.search": "بحث",
  "common.mentions": "المنشن",
  "common.settings": "الإعدادات",
  "common.notifications": "الإشعارات",
  "prayer.title": "مواقيت الصلاة",
  "council.end": "إنهاء الجلسة",
  "council.deleteRoom": "حذف الغرفة",
  "account.username": "اليوزر نيم",
  "account.displayName": "الاسم الظاهر",
  "account.bio": "النبذة",
  "account.saveEdits": "احفظ التعديلات",
};

const en: Dict = {
  "tab.home": "Home",
  "tab.video": "Video",
  "tab.councils": "Councils",
  "tab.chat": "Chat",
  "tab.profile": "Profile",
  "home.hello": "How's your day?",
  "home.stories": "Stories",
  "home.allStories": "All stories",
  "home.yourStory": "Your story",
  "home.feed": "Latest news",
  "home.composerHint": "What's on your mind?",
  "home.live": "Live",
  "home.mentionFriends": "Mention friends",
  "home.feeling": "Feeling",
  "home.subs": "Your subscriptions",
  "home.empty": "No posts yet — be the first.",
  "home.loadError": "Couldn't load the feed — pull to refresh",
  "video.title": "Video",
  "video.stories": "Stories",
  "video.upload": "Upload video",
  "video.publicStories": "Public stories",
  "video.empty": "No videos yet — upload the first one.",
  "councils.title": "Councils",
  "councils.create": "Create a council",
  "chat.title": "Chat",
  "profile.title": "Profile",
  "settings.title": "Settings & privacy",
  "settings.appearance": "Appearance",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.language": "Language",
  "settings.languageHint": "Choosing a language switches the whole app.",
  "post.new": "New post",
  "post.publish": "Publish",
  "post.published": "Published",
  "post.comments": "Comments",
  "post.writeComment": "Write a comment…",
  "post.voice": "Voice",
  "post.sticker": "Sticker",
  "post.image": "Photo",
  "post.video": "Video",
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.send": "Send",
  "common.loading": "Loading…",
  "common.error": "Something went wrong — try again",
  "common.retry": "Retry",
  "common.search": "Search",
  "common.mentions": "Mentions",
  "common.settings": "Settings",
  "common.notifications": "Notifications",
  "prayer.title": "Prayer times",
  "council.end": "End session",
  "council.deleteRoom": "Delete room",
  "account.username": "Username",
  "account.displayName": "Display name",
  "account.bio": "Bio",
  "account.saveEdits": "Save changes",
};

const fr: Dict = {
  "tab.home": "Accueil",
  "tab.video": "Vidéo",
  "tab.councils": "Conseils",
  "tab.chat": "Discussions",
  "tab.profile": "Profil",
  "home.hello": "Comment ça va ?",
  "home.stories": "Stories",
  "home.allStories": "Toutes les stories",
  "home.yourStory": "Votre story",
  "home.feed": "Dernières nouvelles",
  "home.composerHint": "Quoi de neuf ?",
  "home.live": "Live",
  "home.mentionFriends": "Mentionner des amis",
  "home.feeling": "Humeur",
  "home.subs": "Vos abonnements",
  "home.empty": "Aucune publication pour l'instant.",
  "home.loadError": "Impossible de charger le fil — actualisez",
  "video.title": "Vidéo",
  "video.stories": "Stories",
  "video.upload": "Publier une vidéo",
  "video.publicStories": "Stories publiques",
  "video.empty": "Aucune vidéo pour l'instant.",
  "councils.title": "Conseils",
  "councils.create": "Créer un conseil",
  "chat.title": "Discussions",
  "profile.title": "Profil",
  "settings.title": "Paramètres et confidentialité",
  "settings.appearance": "Apparence",
  "settings.light": "Clair",
  "settings.dark": "Sombre",
  "settings.language": "Langue",
  "settings.languageHint": "Choisir une langue traduit toute l'application.",
  "post.new": "Nouvelle publication",
  "post.publish": "Publier",
  "post.published": "Publié",
  "post.comments": "Commentaires",
  "post.writeComment": "Écrire un commentaire…",
  "post.voice": "Voix",
  "post.sticker": "Sticker",
  "post.image": "Photo",
  "post.video": "Vidéo",
  "common.back": "Retour",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.delete": "Supprimer",
  "common.send": "Envoyer",
  "common.loading": "Chargement…",
  "common.error": "Une erreur est survenue",
  "common.retry": "Réessayer",
  "common.search": "Recherche",
  "common.mentions": "Mentions",
  "common.settings": "Paramètres",
  "common.notifications": "Notifications",
  "prayer.title": "Horaires de prière",
  "council.end": "Terminer la session",
  "council.deleteRoom": "Supprimer la salle",
  "account.username": "Nom d'utilisateur",
  "account.displayName": "Nom affiché",
  "account.bio": "Bio",
  "account.saveEdits": "Enregistrer",
};

const de: Dict = {
  "tab.home": "Start",
  "tab.video": "Video",
  "tab.councils": "Räte",
  "tab.chat": "Chat",
  "tab.profile": "Profil",
  "home.hello": "Wie geht's?",
  "home.stories": "Stories",
  "home.allStories": "Alle Stories",
  "home.yourStory": "Deine Story",
  "home.feed": "Neues",
  "home.composerHint": "Woran denkst du?",
  "home.live": "Live",
  "home.mentionFriends": "Freunde erwähnen",
  "home.feeling": "Gefühl",
  "home.subs": "Deine Abos",
  "home.empty": "Noch keine Beiträge.",
  "home.loadError": "Feed konnte nicht geladen werden",
  "video.title": "Video",
  "video.stories": "Stories",
  "video.upload": "Video hochladen",
  "video.publicStories": "Öffentliche Stories",
  "video.empty": "Noch keine Videos.",
  "councils.title": "Räte",
  "councils.create": "Rat erstellen",
  "chat.title": "Chat",
  "profile.title": "Profil",
  "settings.title": "Einstellungen & Datenschutz",
  "settings.appearance": "Erscheinungsbild",
  "settings.light": "Hell",
  "settings.dark": "Dunkel",
  "settings.language": "Sprache",
  "settings.languageHint": "Die gewählte Sprache gilt für die ganze App.",
  "post.new": "Neuer Beitrag",
  "post.publish": "Veröffentlichen",
  "post.published": "Veröffentlicht",
  "post.comments": "Kommentare",
  "post.writeComment": "Kommentar schreiben…",
  "post.voice": "Sprache",
  "post.sticker": "Sticker",
  "post.image": "Foto",
  "post.video": "Video",
  "common.back": "Zurück",
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.delete": "Löschen",
  "common.send": "Senden",
  "common.loading": "Lädt…",
  "common.error": "Etwas ist schiefgelaufen",
  "common.retry": "Erneut versuchen",
  "common.search": "Suche",
  "common.mentions": "Erwähnungen",
  "common.settings": "Einstellungen",
  "common.notifications": "Benachrichtigungen",
  "prayer.title": "Gebetszeiten",
  "council.end": "Sitzung beenden",
  "council.deleteRoom": "Raum löschen",
  "account.username": "Benutzername",
  "account.displayName": "Anzeigename",
  "account.bio": "Bio",
  "account.saveEdits": "Änderungen speichern",
};

const DICTS: Record<UiLang, Dict> = { ar, en, fr, de };
const STORAGE_KEY = "wanas.ui.lang";

type Ctx = {
  lang: UiLang;
  dir: "rtl" | "ltr";
  isRTL: boolean;
  setLang: (l: UiLang) => Promise<void>;
  t: (key: string, fallback?: string) => string;
};

const LangContext = createContext<Ctx>({
  lang: "ar",
  dir: "rtl",
  isRTL: true,
  setLang: async () => {},
  t: (key, fallback) => DICTS.ar[key] ?? fallback ?? key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLang>("ar");

  useEffect(() => {
    const t = setTimeout(async () => {
      const stored = (await AsyncStorage.getItem(STORAGE_KEY).catch(() => null)) as UiLang | null;
      if (stored && DICTS[stored]) setLangState(stored);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const setLang = useCallback(async (next: UiLang) => {
    setLangState(next);
    await AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    // بنزامن الاختيار مع الملف الشخصي (profiles.lang) لو المستخدم مسجل دخول
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (uid) await supabase.from("profiles").update({ lang: next }).eq("id", uid);
    } catch {
      // التزامن اختياري — الاختيار محفوظ على الجهاز في كل الأحوال
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      isRTL: lang === "ar",
      setLang,
      t: (key: string, fallback?: string) => DICTS[lang][key] ?? DICTS.ar[key] ?? fallback ?? key,
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
