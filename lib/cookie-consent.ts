import { z } from "zod";

export const cookieCategories = ["necessary", "functional", "analytics", "marketing"] as const;
export type CookieCategory = (typeof cookieCategories)[number];
export type CookieChoices = Record<CookieCategory, boolean>;

const text = z.string().trim().min(1).max(500);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const categoryCopy = z.object({ name: text, description: text });
const copySchema = z.object({
  title: text, description: text, preferencesTitle: text, preferencesDescription: text,
  acceptSelected: text, acceptAll: text, rejectAll: text, preferences: text,
  savePreferences: text, reopen: text, close: text, alwaysActive: text,
  necessary: categoryCopy, functional: categoryCopy, analytics: categoryCopy, marketing: categoryCopy,
});
export type CookieCopy = z.infer<typeof copySchema>;

export const cookieConfigSchema = z.object({
  revision: z.string().min(1),
  enabled: z.boolean(),
  position: z.enum(["bottom", "center"]),
  alignment: z.enum(["left", "center", "right"]),
  showClose: z.boolean(),
  showReopen: z.boolean(),
  showPolicyLink: z.boolean(),
  showCategorySummary: z.boolean(),
  backdrop: z.boolean(),
  compact: z.boolean(),
  cornerRadius: z.number().int().min(0).max(40),
  panelColor: hex, textColor: hex, mutedColor: hex, borderColor: hex,
  primaryColor: hex, primaryTextColor: hex, secondaryColor: hex, secondaryTextColor: hex,
  accentColor: hex,
  copy: copySchema,
  translations: z.object({ fr: copySchema, de: copySchema, pt: copySchema, it: copySchema, es: copySchema }).optional(),
});

export type CookieConfig = z.infer<typeof cookieConfigSchema>;

export const defaultCookieConfig: CookieConfig = {
  revision: "1", enabled: true, position: "bottom", alignment: "center",
  showClose: false, showReopen: true, showPolicyLink: true, showCategorySummary: true,
  backdrop: false, compact: false, cornerRadius: 24,
  panelColor: "#ffffff", textColor: "#17365d", mutedColor: "#5e6d81",
  borderColor: "#d7e0eb", primaryColor: "#c83f37", primaryTextColor: "#ffffff",
  secondaryColor: "#2d61ba", secondaryTextColor: "#ffffff", accentColor: "#c83f37",
  copy: {
    title: "Your privacy, your choice",
    description: "We use essential storage to run the site. Choose whether to allow functional, analytics and marketing cookies. Optional categories stay off until you say yes.",
    preferencesTitle: "Cookie preferences",
    preferencesDescription: "Choose which categories this browser may use. You can change your choice at any time.",
    acceptSelected: "Accept selected", acceptAll: "Accept all", rejectAll: "Reject all",
    preferences: "View preferences", savePreferences: "Save preferences",
    reopen: "Cookie settings", close: "Close", alwaysActive: "Always active",
    necessary: { name: "Necessary", description: "Required for language, theme, security and saving your cookie choice." },
    functional: { name: "Functional", description: "Remembers optional conveniences such as recently selected destinations." },
    analytics: { name: "Analytics", description: "Lets Google Analytics measure visits and sessions only with your permission." },
    marketing: { name: "Marketing", description: "Allows advertising and campaign measurement, if these services are added." },
  },
  translations: {
    fr: { title: "Votre vie privée, votre choix", description: "Nous utilisons un stockage essentiel pour faire fonctionner le site. Les catégories facultatives restent désactivées sans votre accord.", preferencesTitle: "Préférences de cookies", preferencesDescription: "Choisissez les catégories autorisées sur ce navigateur. Vous pouvez modifier votre choix à tout moment.", acceptSelected: "Accepter la sélection", acceptAll: "Tout accepter", rejectAll: "Tout refuser", preferences: "Voir les préférences", savePreferences: "Enregistrer", reopen: "Paramètres des cookies", close: "Fermer", alwaysActive: "Toujours actif", necessary: { name: "Nécessaires", description: "Indispensables pour la langue, le thème, la sécurité et votre choix de cookies." }, functional: { name: "Fonctionnels", description: "Mémorisent des options pratiques, comme les destinations récentes." }, analytics: { name: "Statistiques", description: "Permettent à Google Analytics de mesurer les visites et sessions seulement avec votre accord." }, marketing: { name: "Marketing", description: "Permettent la publicité et sa mesure si ces services sont ajoutés." } },
    de: { title: "Ihre Privatsphäre, Ihre Wahl", description: "Wir nutzen notwendige Speicherung für den Betrieb der Website. Optionale Kategorien bleiben ohne Ihre Zustimmung deaktiviert.", preferencesTitle: "Cookie-Einstellungen", preferencesDescription: "Wählen Sie die erlaubten Kategorien. Sie können Ihre Wahl jederzeit ändern.", acceptSelected: "Auswahl akzeptieren", acceptAll: "Alle akzeptieren", rejectAll: "Alle ablehnen", preferences: "Einstellungen ansehen", savePreferences: "Einstellungen speichern", reopen: "Cookie-Einstellungen", close: "Schließen", alwaysActive: "Immer aktiv", necessary: { name: "Notwendig", description: "Erforderlich für Sprache, Design, Sicherheit und Ihre Cookie-Auswahl." }, functional: { name: "Funktional", description: "Speichern praktische Optionen wie zuletzt gewählte Ziele." }, analytics: { name: "Analyse", description: "Erlauben Google Analytics, Besuche und Sitzungen nur mit Ihrer Zustimmung zu messen." }, marketing: { name: "Marketing", description: "Erlauben Werbung und Erfolgsmessung, falls solche Dienste ergänzt werden." } },
    pt: { title: "A sua privacidade, a sua escolha", description: "Usamos armazenamento essencial para o funcionamento do site. As categorias opcionais ficam desligadas sem o seu consentimento.", preferencesTitle: "Preferências de cookies", preferencesDescription: "Escolha as categorias permitidas neste navegador. Pode alterar a escolha a qualquer momento.", acceptSelected: "Aceitar seleção", acceptAll: "Aceitar todos", rejectAll: "Rejeitar todos", preferences: "Ver preferências", savePreferences: "Guardar preferências", reopen: "Definições de cookies", close: "Fechar", alwaysActive: "Sempre ativo", necessary: { name: "Necessários", description: "Necessários para idioma, tema, segurança e guardar a sua escolha." }, functional: { name: "Funcionais", description: "Guardam opções úteis, como destinos recentes." }, analytics: { name: "Analíticos", description: "Permitem ao Google Analytics medir visitas e sessões apenas com o seu consentimento." }, marketing: { name: "Marketing", description: "Permitem publicidade e medição se estes serviços forem adicionados." } },
    it: { title: "La tua privacy, la tua scelta", description: "Utilizziamo solo l'archiviazione essenziale per il sito. Le categorie facoltative restano disattivate senza il tuo consenso.", preferencesTitle: "Preferenze cookie", preferencesDescription: "Scegli le categorie consentite in questo browser. Puoi cambiare idea in qualsiasi momento.", acceptSelected: "Accetta selezionati", acceptAll: "Accetta tutti", rejectAll: "Rifiuta tutti", preferences: "Vedi preferenze", savePreferences: "Salva preferenze", reopen: "Impostazioni cookie", close: "Chiudi", alwaysActive: "Sempre attivi", necessary: { name: "Necessari", description: "Necessari per lingua, tema, sicurezza e per salvare la scelta." }, functional: { name: "Funzionali", description: "Ricordano comodità come le destinazioni recenti." }, analytics: { name: "Analitici", description: "Consentono a Google Analytics di misurare visite e sessioni solo con il tuo permesso." }, marketing: { name: "Marketing", description: "Consentono pubblicità e misurazione se verranno aggiunti tali servizi." } },
    es: { title: "Tu privacidad, tu elección", description: "Usamos almacenamiento imprescindible para que funcione la web. Las categorías opcionales permanecen desactivadas hasta que las aceptes.", preferencesTitle: "Preferencias de cookies", preferencesDescription: "Elige las categorías permitidas en este navegador. Puedes cambiar tu decisión en cualquier momento.", acceptSelected: "Aceptar selección", acceptAll: "Aceptar todas", rejectAll: "Rechazar todas", preferences: "Ver preferencias", savePreferences: "Guardar preferencias", reopen: "Configuración de cookies", close: "Cerrar", alwaysActive: "Siempre activas", necessary: { name: "Necesarias", description: "Imprescindibles para idioma, tema, seguridad y guardar tu elección." }, functional: { name: "Funcionales", description: "Recuerdan opciones útiles, como los destinos recientes." }, analytics: { name: "Analíticas", description: "Permiten a Google Analytics medir visitas y sesiones solo con tu permiso." }, marketing: { name: "Marketing", description: "Permiten publicidad y medición si se incorporan esos servicios." } },
  },
};

export const defaultCookieChoices: CookieChoices = {
  necessary: true, functional: false, analytics: false, marketing: false,
};

export const consentCookieName = "352flights-cookie-consent";
export const consentEventName = "352flights:consent-changed";
export const cookieConfigReadyEvent = "352flights:cookie-config-ready";
export const openCookiePreferencesEvent = "352flights:open-cookie-preferences";
export type CookieDecision = "reject" | "close" | "selected" | "all";

export function readCookieChoices(): CookieChoices {
  if (typeof document === "undefined") return defaultCookieChoices;
  try {
    const value = document.cookie.split("; ").find((item) => item.startsWith(`${consentCookieName}=`))?.split("=")[1];
    if (!value) return defaultCookieChoices;
    const parsed = JSON.parse(decodeURIComponent(value));
    return {
      necessary: true,
      functional: parsed.functional === true,
      analytics: parsed.analytics === true,
      marketing: parsed.marketing === true,
    };
  } catch { return defaultCookieChoices; }
}

export function hasCookieConsent(category: CookieCategory): boolean {
  return category === "necessary" || readCookieChoices()[category];
}

export function saveCookieChoices(choices: CookieChoices, revision: string, decision: CookieDecision = "selected") {
  const saved = { ...choices, necessary: true, revision, decision };
  document.cookie = `${consentCookieName}=${encodeURIComponent(JSON.stringify(saved))}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  if (!saved.functional) localStorage.removeItem("352flights-recent-destinations-v1");
  window.dispatchEvent(new CustomEvent(consentEventName, { detail: saved }));
}

export function readCookieDecision(): CookieDecision | null {
  if (typeof document === "undefined") return null;
  try {
    const value = document.cookie.split("; ").find((item) => item.startsWith(`${consentCookieName}=`))?.split("=")[1];
    const decision = value ? JSON.parse(decodeURIComponent(value)).decision : null;
    return decision === "reject" || decision === "close" || decision === "selected" || decision === "all" ? decision : null;
  } catch { return null; }
}

export function readConsentRevision(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const value = document.cookie.split("; ").find((item) => item.startsWith(`${consentCookieName}=`))?.split("=")[1];
    return value ? String(JSON.parse(decodeURIComponent(value)).revision ?? "") : null;
  } catch { return null; }
}
