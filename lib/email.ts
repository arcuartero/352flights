import "server-only";

import { buildEditorialSections, type EditorialSectionKey } from "@/lib/editorial-sections";
import { getResendEnv, getSiteUrl } from "@/lib/env";
import { type CampaignSendType } from "@/lib/ops-shared";

const BRAND_NAME = "+352 Flights";
const EMAIL_BG = "#eef5ff";
const EMAIL_PANEL = "#ffffff";
const EMAIL_PANEL_ALT = "#f7fbff";
const EMAIL_BORDER = "rgba(44, 95, 214, 0.14)";
const EMAIL_TEXT = "#10233f";
const EMAIL_MUTED = "#5e6f86";
const EMAIL_ACCENT = "#2f5fd6";
const EMAIL_ACCENT_SOFT = "#dfeaff";
const EMAIL_CTA = "#e5473b";
const EMAIL_CTA_TEXT = "#fff8f4";

export const emailLocales = ["en", "fr", "de", "pt", "it", "es"] as const;
export type EmailLocale = (typeof emailLocales)[number];

type RenderableDeal = {
  id: string;
  title: string;
  summary: string;
  routeLabel: string;
  routeBucket: string;
  destinationCity: string;
  destinationAirport: string;
  dealPrice: number;
  baselinePrice: number | null;
  dropRatio: number | null;
  departureDate: string | null;
  returnDate: string | null;
  tripNights: number;
  maxStops: string;
  airlineSummary: string | null;
  outboundDepartureAt: string | null;
  outboundArrivalAt: string | null;
  returnDepartureAt: string | null;
  returnArrivalAt: string | null;
  destinationStayHours: number | null;
  verifiedAt: string | null;
  bookingUrl: string | null;
};

type RenderCampaignEmailInput = {
  sendType: CampaignSendType;
  subject: string;
  previewText: string;
  managePreferencesUrl: string;
  unsubscribeUrl: string;
  deals: RenderableDeal[];
  locale?: EmailLocale | null;
};

type RenderWelcomeEmailInput = {
  email: string;
  confirmUrl: string;
  managePreferencesUrl: string;
  unsubscribeUrl: string;
  alreadyConfirmed: boolean;
  onboardingCompleted: boolean;
  locale?: EmailLocale | null;
};

type SendResendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  emailType: "campaign" | "campaign_test" | "welcome" | "ops_alert";
  sendType?: CampaignSendType;
  idempotencyKey: string;
};

type EmailCopy = {
  htmlLang: string;
  intlLocale: string;
  tagline: string;
  flexibleDates: string;
  notAvailable: string;
  verifiedRecently: string;
  verifiedJustNow: string;
  verifiedMinutesAgo: (minutes: number) => string;
  verifiedHoursAgo: (hours: number) => string;
  verifiedDaysAgo: (days: number) => string;
  stayHours: (hours: string) => string;
  stops: Record<"NON_STOP" | "ONE_STOP_OR_FEWER", string>;
  unknownStops: (value: string) => string;
  drop: (percent: number | null) => string;
  baselineStillForming: string;
  multipleCarriers: string;
  headlineFlash: string;
  headlineSingle: string;
  headlineDigest: string;
  introFlash: string;
  introDigest: string;
  emptyFlashSubject: string;
  emptyDigestSubject: string;
  emptyFlashPreview: string;
  emptyDigestPreview: string;
  singleSubject: (city: string, price: string) => string;
  multiSubject: (city: string, price: string, remaining: number) => string;
  singlePreview: (route: string, price: string) => string;
  multiPreview: (count: number, city: string, price: string) => string;
  labels: {
    price: string;
    travelDates: string;
    tripShape: string;
    airline: string;
    recentBaseline: string;
    outbound: string;
    return: string;
    timeInDestination: string;
    baseline: string;
    discount: string;
    homepage: string;
  };
  travelDateRange: (from: string, to: string) => string;
  timing: (label: string, departure: string, arrival: string) => string;
  tripShape: (nights: number, stops: string) => string;
  nights: (nights: number) => string;
  skyscannerNote: string;
  openInSkyscanner: string;
  searchInSkyscanner: string;
  editPreferences: string;
  managePreferences: string;
  unsubscribe: string;
  footerReason: string;
  editorial: Record<EditorialSectionKey, { label: string; description: string }>;
  welcome: {
    confirmedSubject: string;
    pendingSubject: string;
    confirmedPreview: string;
    pendingPreview: string;
    confirmedHeadline: string;
    pendingHeadline: string;
    confirmedIntro: string;
    pendingIntro: string;
    linkedTo: string;
    alertSetupTitle: string;
    alertSetupBody: string;
    confirmBody: string;
    primaryConfirmed: string;
    primaryPending: string;
    preferencesLink: string;
    notYouTitle: string;
    notYouBody: string;
    unsubscribeNow: string;
    alreadyConfirmed: string;
    emailLabel: string;
  };
};

const emailCopy: Record<EmailLocale, EmailCopy> = {
  en: {
    htmlLang: "en",
    intlLocale: "en-GB",
    tagline: "Cheap flights from Luxembourg, shaped around real trips.",
    flexibleDates: "Flexible dates",
    notAvailable: "n/a",
    verifiedRecently: "Verified recently",
    verifiedJustNow: "Verified just now",
    verifiedMinutesAgo: (minutes) => `Verified ${minutes} min ago`,
    verifiedHoursAgo: (hours) => `Verified ${hours}h ago`,
    verifiedDaysAgo: (days) => `Verified ${days}d ago`,
    stayHours: (hours) => `${hours}h in destination`,
    stops: { NON_STOP: "Non-stop only", ONE_STOP_OR_FEWER: "Up to 1 stop" },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null ? "below the recent baseline" : `${percent}% below the recent baseline`,
    baselineStillForming: "Baseline still forming",
    multipleCarriers: "Multiple carriers",
    headlineFlash: "A fare just moved sharply below the normal range.",
    headlineSingle: "One route in your Luxembourg profile is standing out today.",
    headlineDigest: "Here are the best Luxembourg fares that match your filters.",
    introFlash: "This fare crossed the stronger alert threshold, so we are sending it immediately.",
    introDigest: "These are the strongest fares currently sitting inside your route profile.",
    emptyFlashSubject: `${BRAND_NAME} flash alert`,
    emptyDigestSubject: `${BRAND_NAME} daily digest`,
    emptyFlashPreview: "Urgent Luxembourg flight alert.",
    emptyDigestPreview: "Fresh Luxembourg fare drops from your watchlist.",
    singleSubject: (city, price) => `${city} from ${price}`,
    multiSubject: (city, price, remaining) => `${city} from ${price} + ${remaining} more fares`,
    singlePreview: (route, price) => `${route} at ${price}.`,
    multiPreview: (count, city, price) => `${count} matching fares, led by ${city} at ${price}.`,
    labels: {
      price: "Price",
      travelDates: "Travel dates",
      tripShape: "Trip shape",
      airline: "Airline",
      recentBaseline: "Recent baseline",
      outbound: "Outbound",
      return: "Return",
      timeInDestination: "Time in destination",
      baseline: "Baseline",
      discount: "Discount",
      homepage: "Homepage",
    },
    travelDateRange: (from, to) => `${from} to ${to}`,
    timing: (label, departure, arrival) => `${label}: ${departure} -> ${arrival}`,
    tripShape: (nights, stops) => `${nights} nights · ${stops}`,
    nights: (nights) => `${nights} nights`,
    skyscannerNote:
      "Open this search in Skyscanner or your preferred booking flow while the fare is still visible.",
    openInSkyscanner: "Open in Skyscanner",
    searchInSkyscanner: "Search in Skyscanner",
    editPreferences: "Edit preferences",
    managePreferences: "Manage preferences",
    unsubscribe: "Unsubscribe",
    footerReason: "You are receiving this because you asked for Luxembourg flight deals matched to your route profile.",
    editorial: {
      fresh_price_drops: {
        label: "Fresh price drops",
        description: "The sharpest newly verified fares sitting well below their recent baseline.",
      },
      good_options_next_30_days: {
        label: "Good options for next 30 days",
        description: "Trips leaving soon enough to book now without waiting for a future season.",
      },
      best_weekend_escapes: {
        label: "Best weekend escapes",
        description: "Shorter Luxembourg trips of 2 to 4 nights built around the weekend.",
      },
      best_long_stays: {
        label: "Best long stays",
        description: "Longer trips above 4 nights that stretch into a more substantial break.",
      },
    },
    welcome: {
      confirmedSubject: `Your ${BRAND_NAME} links are ready`,
      pendingSubject: `Confirm your ${BRAND_NAME} subscription`,
      confirmedPreview: "Your private preferences link is ready.",
      pendingPreview: "Confirm your email and choose the alerts you want.",
      confirmedHeadline: "Your flight alerts are already active.",
      pendingHeadline: "Confirm your email to start receiving Luxembourg fare drops.",
      confirmedIntro: "We are sending your private access link again so you can update your alerts.",
      pendingIntro: "One quick confirmation finishes the double opt-in. Then you can tailor the feed to the trips you actually want.",
      linkedTo: "Linked to:",
      alertSetupTitle: "Your alert setup",
      alertSetupBody: "Choose the kind of flight deals you want to see and how often you hear from us.",
      confirmBody: "After confirming, edit your preferences to control destinations, budget, routing, and email cadence.",
      primaryConfirmed: "Edit preferences",
      primaryPending: "Confirm subscription",
      preferencesLink: "Edit my preferences",
      notYouTitle: "Not you? Unsubscribe instantly.",
      notYouBody: "If this was not you, you can unsubscribe instantly now.",
      unsubscribeNow: "Unsubscribe instantly",
      alreadyConfirmed: "Already confirmed?",
      emailLabel: "Email",
    },
  },
  fr: {
    htmlLang: "fr",
    intlLocale: "fr-FR",
    tagline: "Vols pas chers depuis Luxembourg, adaptes a de vrais voyages.",
    flexibleDates: "Dates flexibles",
    notAvailable: "n/d",
    verifiedRecently: "Verifie recemment",
    verifiedJustNow: "Verifie a l'instant",
    verifiedMinutesAgo: (minutes) => `Verifie il y a ${minutes} min`,
    verifiedHoursAgo: (hours) => `Verifie il y a ${hours} h`,
    verifiedDaysAgo: (days) => `Verifie il y a ${days} j`,
    stayHours: (hours) => `${hours} h sur place`,
    stops: { NON_STOP: "Vol direct uniquement", ONE_STOP_OR_FEWER: "Jusqu'a 1 escale" },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null ? "sous la reference recente" : `${percent} % sous la reference recente`,
    baselineStillForming: "Reference encore en construction",
    multipleCarriers: "Plusieurs compagnies",
    headlineFlash: "Un tarif vient de passer nettement sous sa zone habituelle.",
    headlineSingle: "Une route de votre profil Luxembourg ressort aujourd'hui.",
    headlineDigest: "Voici les meilleurs tarifs depuis Luxembourg qui correspondent a vos filtres.",
    introFlash: "Ce tarif a franchi le seuil d'alerte fort, donc nous l'envoyons immediatement.",
    introDigest: "Voici les meilleurs tarifs actuellement dans votre profil de routes.",
    emptyFlashSubject: `Alerte urgente ${BRAND_NAME}`,
    emptyDigestSubject: `Resume quotidien ${BRAND_NAME}`,
    emptyFlashPreview: "Alerte urgente de vols depuis Luxembourg.",
    emptyDigestPreview: "Nouvelles baisses de prix depuis Luxembourg dans votre liste.",
    singleSubject: (city, price) => `${city} des ${price}`,
    multiSubject: (city, price, remaining) => `${city} des ${price} + ${remaining} autres tarifs`,
    singlePreview: (route, price) => `${route} a ${price}.`,
    multiPreview: (count, city, price) => `${count} tarifs compatibles, avec ${city} a ${price}.`,
    labels: {
      price: "Prix",
      travelDates: "Dates",
      tripShape: "Format",
      airline: "Compagnie",
      recentBaseline: "Reference recente",
      outbound: "Aller",
      return: "Retour",
      timeInDestination: "Temps sur place",
      baseline: "Reference",
      discount: "Baisse",
      homepage: "Accueil",
    },
    travelDateRange: (from, to) => `${from} au ${to}`,
    timing: (label, departure, arrival) => `${label} : ${departure} -> ${arrival}`,
    tripShape: (nights, stops) => `${nights} nuits · ${stops}`,
    nights: (nights) => `${nights} nuits`,
    skyscannerNote:
      "Ouvrez cette recherche dans Skyscanner ou dans votre parcours de reservation prefere tant que le tarif est visible.",
    openInSkyscanner: "Ouvrir dans Skyscanner",
    searchInSkyscanner: "Rechercher dans Skyscanner",
    editPreferences: "Modifier mes preferences",
    managePreferences: "Gerer mes preferences",
    unsubscribe: "Se desabonner",
    footerReason: "Vous recevez cet email parce que vous avez demande des offres de vols depuis Luxembourg selon votre profil.",
    editorial: {
      fresh_price_drops: {
        label: "Baisses de prix recentes",
        description: "Les tarifs verifies les plus nets sous leur reference recente.",
      },
      good_options_next_30_days: {
        label: "Bonnes options dans les 30 jours",
        description: "Des voyages assez proches pour reserver maintenant.",
      },
      best_weekend_escapes: {
        label: "Meilleures escapades week-end",
        description: "Voyages courts de 2 a 4 nuits autour du week-end.",
      },
      best_long_stays: {
        label: "Meilleurs longs sejours",
        description: "Voyages de plus de 4 nuits pour une vraie pause.",
      },
    },
    welcome: {
      confirmedSubject: `Vos liens ${BRAND_NAME} sont prets`,
      pendingSubject: `Confirmez votre inscription ${BRAND_NAME}`,
      confirmedPreview: "Votre lien prive de preferences est pret.",
      pendingPreview: "Confirmez votre email et choisissez les alertes souhaitees.",
      confirmedHeadline: "Vos alertes de vols sont deja actives.",
      pendingHeadline: "Confirmez votre email pour recevoir les baisses de prix depuis Luxembourg.",
      confirmedIntro: "Nous vous renvoyons votre lien prive pour modifier vos alertes.",
      pendingIntro: "Une confirmation rapide termine le double opt-in. Vous pourrez ensuite regler le flux selon vos voyages.",
      linkedTo: "Associe a :",
      alertSetupTitle: "Configuration de vos alertes",
      alertSetupBody: "Choisissez les offres que vous voulez voir et la frequence de nos emails.",
      confirmBody: "Apres confirmation, modifiez vos preferences de destination, budget, itineraire et frequence.",
      primaryConfirmed: "Modifier mes preferences",
      primaryPending: "Confirmer l'inscription",
      preferencesLink: "Modifier mes preferences",
      notYouTitle: "Ce n'etait pas vous ? Desabonnement instantane.",
      notYouBody: "Si ce n'etait pas vous, vous pouvez vous desabonner immediatement.",
      unsubscribeNow: "Me desabonner",
      alreadyConfirmed: "Deja confirme ?",
      emailLabel: "Email",
    },
  },
  de: {
    htmlLang: "de",
    intlLocale: "de-DE",
    tagline: "Guenstige Fluege ab Luxemburg, passend zu echten Reisen.",
    flexibleDates: "Flexible Daten",
    notAvailable: "k. A.",
    verifiedRecently: "Kuerzlich geprueft",
    verifiedJustNow: "Gerade geprueft",
    verifiedMinutesAgo: (minutes) => `Vor ${minutes} Min. geprueft`,
    verifiedHoursAgo: (hours) => `Vor ${hours} Std. geprueft`,
    verifiedDaysAgo: (days) => `Vor ${days} Tg. geprueft`,
    stayHours: (hours) => `${hours} Std. am Ziel`,
    stops: { NON_STOP: "Nur Direktfluege", ONE_STOP_OR_FEWER: "Bis zu 1 Stopp" },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null ? "unter dem aktuellen Vergleichswert" : `${percent} % unter dem aktuellen Vergleichswert`,
    baselineStillForming: "Vergleichswert wird noch gebildet",
    multipleCarriers: "Mehrere Airlines",
    headlineFlash: "Ein Tarif liegt deutlich unter dem normalen Bereich.",
    headlineSingle: "Eine Route in deinem Luxemburg-Profil faellt heute auf.",
    headlineDigest: "Das sind die besten Luxemburg-Tarife passend zu deinen Filtern.",
    introFlash: "Dieser Tarif hat die starke Alarmschwelle erreicht, deshalb senden wir ihn sofort.",
    introDigest: "Das sind die staerksten Tarife, die gerade zu deinem Routenprofil passen.",
    emptyFlashSubject: `${BRAND_NAME} Eilalarm`,
    emptyDigestSubject: `${BRAND_NAME} Tagesuebersicht`,
    emptyFlashPreview: "Dringender Flugdeal ab Luxemburg.",
    emptyDigestPreview: "Neue Preisrueckgaenge aus deiner Luxemburg-Watchlist.",
    singleSubject: (city, price) => `${city} ab ${price}`,
    multiSubject: (city, price, remaining) => `${city} ab ${price} + ${remaining} weitere Tarife`,
    singlePreview: (route, price) => `${route} fuer ${price}.`,
    multiPreview: (count, city, price) => `${count} passende Tarife, angefuehrt von ${city} fuer ${price}.`,
    labels: {
      price: "Preis",
      travelDates: "Reisedaten",
      tripShape: "Reiseform",
      airline: "Airline",
      recentBaseline: "Aktueller Vergleichswert",
      outbound: "Hinflug",
      return: "Rueckflug",
      timeInDestination: "Zeit am Ziel",
      baseline: "Vergleichswert",
      discount: "Rueckgang",
      homepage: "Startseite",
    },
    travelDateRange: (from, to) => `${from} bis ${to}`,
    timing: (label, departure, arrival) => `${label}: ${departure} -> ${arrival}`,
    tripShape: (nights, stops) => `${nights} Naechte · ${stops}`,
    nights: (nights) => `${nights} Naechte`,
    skyscannerNote:
      "Oeffne diese Suche in Skyscanner oder in deinem bevorzugten Buchungsablauf, solange der Tarif sichtbar ist.",
    openInSkyscanner: "In Skyscanner oeffnen",
    searchInSkyscanner: "In Skyscanner suchen",
    editPreferences: "Praeferenzen bearbeiten",
    managePreferences: "Praeferenzen verwalten",
    unsubscribe: "Abmelden",
    footerReason: "Du erhaeltst diese E-Mail, weil du Flugangebote ab Luxemburg passend zu deinem Profil angefordert hast.",
    editorial: {
      fresh_price_drops: {
        label: "Neue Preisrueckgaenge",
        description: "Die staerksten neu geprueften Tarife unter ihrem aktuellen Vergleichswert.",
      },
      good_options_next_30_days: {
        label: "Gute Optionen in den naechsten 30 Tagen",
        description: "Reisen, die bald genug starten, um jetzt zu buchen.",
      },
      best_weekend_escapes: {
        label: "Beste Wochenendtrips",
        description: "Kuerzere Reisen von 2 bis 4 Naechten rund ums Wochenende.",
      },
      best_long_stays: {
        label: "Beste laengere Aufenthalte",
        description: "Reisen ueber 4 Naechte fuer eine groessere Auszeit.",
      },
    },
    welcome: {
      confirmedSubject: `Deine ${BRAND_NAME}-Links sind bereit`,
      pendingSubject: `Bestaetige dein ${BRAND_NAME}-Abo`,
      confirmedPreview: "Dein privater Praeferenz-Link ist bereit.",
      pendingPreview: "Bestaetige deine E-Mail und waehle deine gewuenschten Alerts.",
      confirmedHeadline: "Deine Flugalerts sind bereits aktiv.",
      pendingHeadline: "Bestaetige deine E-Mail, um Preisrueckgaenge ab Luxemburg zu erhalten.",
      confirmedIntro: "Wir senden dir deinen privaten Link erneut, damit du deine Alerts anpassen kannst.",
      pendingIntro: "Eine kurze Bestaetigung schliesst den Double-Opt-in ab. Danach passt du den Feed an deine Reisen an.",
      linkedTo: "Verknuepft mit:",
      alertSetupTitle: "Deine Alert-Einstellungen",
      alertSetupBody: "Waehle, welche Flugangebote du sehen moechtest und wie oft wir dich kontaktieren.",
      confirmBody: "Nach der Bestaetigung kannst du Ziele, Budget, Route und E-Mail-Rhythmus bearbeiten.",
      primaryConfirmed: "Praeferenzen bearbeiten",
      primaryPending: "Abo bestaetigen",
      preferencesLink: "Meine Praeferenzen bearbeiten",
      notYouTitle: "Nicht du? Sofort abmelden.",
      notYouBody: "Wenn du das nicht warst, kannst du dich sofort abmelden.",
      unsubscribeNow: "Sofort abmelden",
      alreadyConfirmed: "Bereits bestaetigt?",
      emailLabel: "E-Mail",
    },
  },
  pt: {
    htmlLang: "pt",
    intlLocale: "pt-PT",
    tagline: "Voos baratos a partir do Luxemburgo, pensados para viagens reais.",
    flexibleDates: "Datas flexiveis",
    notAvailable: "n/d",
    verifiedRecently: "Verificado recentemente",
    verifiedJustNow: "Verificado agora",
    verifiedMinutesAgo: (minutes) => `Verificado ha ${minutes} min`,
    verifiedHoursAgo: (hours) => `Verificado ha ${hours} h`,
    verifiedDaysAgo: (days) => `Verificado ha ${days} d`,
    stayHours: (hours) => `${hours} h no destino`,
    stops: { NON_STOP: "Apenas direto", ONE_STOP_OR_FEWER: "Ate 1 escala" },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null ? "abaixo da referencia recente" : `${percent}% abaixo da referencia recente`,
    baselineStillForming: "Referencia ainda em formacao",
    multipleCarriers: "Varias companhias",
    headlineFlash: "Uma tarifa acabou de cair muito abaixo do normal.",
    headlineSingle: "Uma rota do seu perfil do Luxemburgo destaca-se hoje.",
    headlineDigest: "Estas sao as melhores tarifas do Luxemburgo que correspondem aos seus filtros.",
    introFlash: "Esta tarifa passou o limiar de alerta forte, por isso enviamo-la de imediato.",
    introDigest: "Estas sao as tarifas mais fortes atualmente dentro do seu perfil de rotas.",
    emptyFlashSubject: `Alerta imediato ${BRAND_NAME}`,
    emptyDigestSubject: `Resumo diario ${BRAND_NAME}`,
    emptyFlashPreview: "Alerta urgente de voos a partir do Luxemburgo.",
    emptyDigestPreview: "Novas quedas de preco da sua lista de voos do Luxemburgo.",
    singleSubject: (city, price) => `${city} desde ${price}`,
    multiSubject: (city, price, remaining) => `${city} desde ${price} + ${remaining} tarifas`,
    singlePreview: (route, price) => `${route} por ${price}.`,
    multiPreview: (count, city, price) => `${count} tarifas compativeis, com ${city} por ${price}.`,
    labels: {
      price: "Preco",
      travelDates: "Datas",
      tripShape: "Formato",
      airline: "Companhia",
      recentBaseline: "Referencia recente",
      outbound: "Ida",
      return: "Volta",
      timeInDestination: "Tempo no destino",
      baseline: "Referencia",
      discount: "Queda",
      homepage: "Inicio",
    },
    travelDateRange: (from, to) => `${from} a ${to}`,
    timing: (label, departure, arrival) => `${label}: ${departure} -> ${arrival}`,
    tripShape: (nights, stops) => `${nights} noites · ${stops}`,
    nights: (nights) => `${nights} noites`,
    skyscannerNote:
      "Abra esta pesquisa no Skyscanner ou no seu fluxo de reserva preferido enquanto a tarifa ainda estiver visivel.",
    openInSkyscanner: "Abrir no Skyscanner",
    searchInSkyscanner: "Pesquisar no Skyscanner",
    editPreferences: "Editar preferencias",
    managePreferences: "Gerir preferencias",
    unsubscribe: "Cancelar subscricao",
    footerReason: "Recebe este email porque pediu ofertas de voos do Luxemburgo de acordo com o seu perfil.",
    editorial: {
      fresh_price_drops: {
        label: "Quedas de preco recentes",
        description: "As tarifas verificadas mais fortes abaixo da sua referencia recente.",
      },
      good_options_next_30_days: {
        label: "Boas opcoes nos proximos 30 dias",
        description: "Viagens proximas o suficiente para reservar agora.",
      },
      best_weekend_escapes: {
        label: "Melhores escapadas de fim de semana",
        description: "Viagens curtas de 2 a 4 noites em torno do fim de semana.",
      },
      best_long_stays: {
        label: "Melhores estadias longas",
        description: "Viagens com mais de 4 noites para uma pausa maior.",
      },
    },
    welcome: {
      confirmedSubject: `Os seus links ${BRAND_NAME} estao prontos`,
      pendingSubject: `Confirme a sua subscricao ${BRAND_NAME}`,
      confirmedPreview: "O seu link privado de preferencias esta pronto.",
      pendingPreview: "Confirme o email e escolha os alertas que pretende.",
      confirmedHeadline: "Os seus alertas de voos ja estao ativos.",
      pendingHeadline: "Confirme o email para receber quedas de preco a partir do Luxemburgo.",
      confirmedIntro: "Enviamos novamente o seu link privado para poder atualizar os alertas.",
      pendingIntro: "Uma confirmacao rapida conclui o double opt-in. Depois podera ajustar o feed as suas viagens.",
      linkedTo: "Associado a:",
      alertSetupTitle: "Configuracao dos alertas",
      alertSetupBody: "Escolha que ofertas quer ver e com que frequencia quer receber emails.",
      confirmBody: "Depois de confirmar, edite destinos, orcamento, rotas e frequencia de email.",
      primaryConfirmed: "Editar preferencias",
      primaryPending: "Confirmar subscricao",
      preferencesLink: "Editar as minhas preferencias",
      notYouTitle: "Nao foi voce? Cancele de imediato.",
      notYouBody: "Se nao foi voce, pode cancelar a subscricao imediatamente.",
      unsubscribeNow: "Cancelar agora",
      alreadyConfirmed: "Ja confirmado?",
      emailLabel: "Email",
    },
  },
  it: {
    htmlLang: "it",
    intlLocale: "it-IT",
    tagline: "Voli economici dal Lussemburgo, pensati per viaggi reali.",
    flexibleDates: "Date flessibili",
    notAvailable: "n/d",
    verifiedRecently: "Verificato di recente",
    verifiedJustNow: "Verificato ora",
    verifiedMinutesAgo: (minutes) => `Verificato ${minutes} min fa`,
    verifiedHoursAgo: (hours) => `Verificato ${hours} h fa`,
    verifiedDaysAgo: (days) => `Verificato ${days} g fa`,
    stayHours: (hours) => `${hours} h a destinazione`,
    stops: { NON_STOP: "Solo diretto", ONE_STOP_OR_FEWER: "Fino a 1 scalo" },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null ? "sotto il riferimento recente" : `${percent}% sotto il riferimento recente`,
    baselineStillForming: "Riferimento ancora in formazione",
    multipleCarriers: "Piu compagnie",
    headlineFlash: "Una tariffa e appena scesa molto sotto il normale.",
    headlineSingle: "Una rotta del tuo profilo Lussemburgo spicca oggi.",
    headlineDigest: "Ecco le migliori tariffe dal Lussemburgo che corrispondono ai tuoi filtri.",
    introFlash: "Questa tariffa ha superato la soglia di allerta forte, quindi te la inviamo subito.",
    introDigest: "Queste sono le tariffe piu forti attualmente nel tuo profilo rotte.",
    emptyFlashSubject: `Allerta immediata ${BRAND_NAME}`,
    emptyDigestSubject: `Riepilogo giornaliero ${BRAND_NAME}`,
    emptyFlashPreview: "Allerta urgente voli dal Lussemburgo.",
    emptyDigestPreview: "Nuovi cali di prezzo dalla tua lista voli dal Lussemburgo.",
    singleSubject: (city, price) => `${city} da ${price}`,
    multiSubject: (city, price, remaining) => `${city} da ${price} + ${remaining} altre tariffe`,
    singlePreview: (route, price) => `${route} a ${price}.`,
    multiPreview: (count, city, price) => `${count} tariffe compatibili, con ${city} a ${price}.`,
    labels: {
      price: "Prezzo",
      travelDates: "Date",
      tripShape: "Tipo viaggio",
      airline: "Compagnia",
      recentBaseline: "Riferimento recente",
      outbound: "Andata",
      return: "Ritorno",
      timeInDestination: "Tempo a destinazione",
      baseline: "Riferimento",
      discount: "Calo",
      homepage: "Home",
    },
    travelDateRange: (from, to) => `${from} - ${to}`,
    timing: (label, departure, arrival) => `${label}: ${departure} -> ${arrival}`,
    tripShape: (nights, stops) => `${nights} notti · ${stops}`,
    nights: (nights) => `${nights} notti`,
    skyscannerNote:
      "Apri questa ricerca su Skyscanner o nel tuo percorso di prenotazione preferito finche la tariffa e visibile.",
    openInSkyscanner: "Apri su Skyscanner",
    searchInSkyscanner: "Cerca su Skyscanner",
    editPreferences: "Modifica preferenze",
    managePreferences: "Gestisci preferenze",
    unsubscribe: "Annulla iscrizione",
    footerReason: "Ricevi questa email perche hai richiesto offerte voli dal Lussemburgo in base al tuo profilo.",
    editorial: {
      fresh_price_drops: {
        label: "Cali di prezzo recenti",
        description: "Le tariffe appena verificate piu forti sotto il riferimento recente.",
      },
      good_options_next_30_days: {
        label: "Buone opzioni nei prossimi 30 giorni",
        description: "Viaggi abbastanza vicini da poter prenotare ora.",
      },
      best_weekend_escapes: {
        label: "Migliori weekend",
        description: "Viaggi brevi di 2-4 notti costruiti intorno al weekend.",
      },
      best_long_stays: {
        label: "Migliori soggiorni lunghi",
        description: "Viaggi sopra le 4 notti per una pausa piu completa.",
      },
    },
    welcome: {
      confirmedSubject: `I tuoi link ${BRAND_NAME} sono pronti`,
      pendingSubject: `Conferma la tua iscrizione a ${BRAND_NAME}`,
      confirmedPreview: "Il tuo link privato alle preferenze e pronto.",
      pendingPreview: "Conferma l'email e scegli gli alert che vuoi.",
      confirmedHeadline: "I tuoi alert voli sono gia attivi.",
      pendingHeadline: "Conferma l'email per ricevere cali di prezzo dal Lussemburgo.",
      confirmedIntro: "Ti inviamo di nuovo il link privato per aggiornare gli alert.",
      pendingIntro: "Una rapida conferma completa il double opt-in. Poi potrai adattare il feed ai tuoi viaggi.",
      linkedTo: "Collegato a:",
      alertSetupTitle: "Impostazioni alert",
      alertSetupBody: "Scegli che offerte vuoi vedere e con quale frequenza ricevere email.",
      confirmBody: "Dopo la conferma, modifica destinazioni, budget, itinerari e frequenza email.",
      primaryConfirmed: "Modifica preferenze",
      primaryPending: "Conferma iscrizione",
      preferencesLink: "Modifica le mie preferenze",
      notYouTitle: "Non eri tu? Annulla subito.",
      notYouBody: "Se non eri tu, puoi annullare subito l'iscrizione.",
      unsubscribeNow: "Annulla ora",
      alreadyConfirmed: "Gia confermato?",
      emailLabel: "Email",
    },
  },
  es: {
    htmlLang: "es",
    intlLocale: "es-ES",
    tagline: "Vuelos baratos desde Luxemburgo, pensados para viajes reales.",
    flexibleDates: "Fechas flexibles",
    notAvailable: "n/d",
    verifiedRecently: "Verificado recientemente",
    verifiedJustNow: "Verificado ahora",
    verifiedMinutesAgo: (minutes) => `Verificado hace ${minutes} min`,
    verifiedHoursAgo: (hours) => `Verificado hace ${hours} h`,
    verifiedDaysAgo: (days) => `Verificado hace ${days} d`,
    stayHours: (hours) => `${hours} h en destino`,
    stops: { NON_STOP: "Solo directos", ONE_STOP_OR_FEWER: "Hasta 1 escala" },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null ? "por debajo de la referencia reciente" : `${percent}% por debajo de la referencia reciente`,
    baselineStillForming: "Referencia todavia en formacion",
    multipleCarriers: "Varias aerolineas",
    headlineFlash: "Una tarifa acaba de caer muy por debajo de lo habitual.",
    headlineSingle: "Una ruta de tu perfil de Luxemburgo destaca hoy.",
    headlineDigest: "Estas son las mejores tarifas desde Luxemburgo que encajan con tus filtros.",
    introFlash: "Esta tarifa ha cruzado el umbral de alerta fuerte, por eso te la enviamos al momento.",
    introDigest: "Estas son las tarifas mas fuertes que ahora mismo encajan con tu perfil de rutas.",
    emptyFlashSubject: `Alerta inmediata ${BRAND_NAME}`,
    emptyDigestSubject: `Resumen diario ${BRAND_NAME}`,
    emptyFlashPreview: "Alerta urgente de vuelos desde Luxemburgo.",
    emptyDigestPreview: "Nuevas bajadas de precio desde Luxemburgo en tu lista.",
    singleSubject: (city, price) => `${city} desde ${price}`,
    multiSubject: (city, price, remaining) => `${city} desde ${price} + ${remaining} tarifas mas`,
    singlePreview: (route, price) => `${route} por ${price}.`,
    multiPreview: (count, city, price) => `${count} tarifas compatibles, empezando por ${city} a ${price}.`,
    labels: {
      price: "Precio",
      travelDates: "Fechas",
      tripShape: "Tipo de viaje",
      airline: "Aerolinea",
      recentBaseline: "Referencia reciente",
      outbound: "Ida",
      return: "Vuelta",
      timeInDestination: "Tiempo en destino",
      baseline: "Referencia",
      discount: "Bajada",
      homepage: "Inicio",
    },
    travelDateRange: (from, to) => `${from} a ${to}`,
    timing: (label, departure, arrival) => `${label}: ${departure} -> ${arrival}`,
    tripShape: (nights, stops) => `${nights} noches · ${stops}`,
    nights: (nights) => `${nights} noches`,
    skyscannerNote:
      "Abre esta busqueda en Skyscanner o en tu flujo de reserva preferido mientras la tarifa siga visible.",
    openInSkyscanner: "Abrir en Skyscanner",
    searchInSkyscanner: "Buscar en Skyscanner",
    editPreferences: "Editar preferencias",
    managePreferences: "Gestionar preferencias",
    unsubscribe: "Darse de baja",
    footerReason: "Recibes este email porque pediste ofertas de vuelos desde Luxemburgo adaptadas a tu perfil.",
    editorial: {
      fresh_price_drops: {
        label: "Bajadas recientes",
        description: "Las tarifas verificadas mas fuertes por debajo de su referencia reciente.",
      },
      good_options_next_30_days: {
        label: "Buenas opciones en los proximos 30 dias",
        description: "Viajes suficientemente cercanos como para reservar ahora.",
      },
      best_weekend_escapes: {
        label: "Mejores escapadas de fin de semana",
        description: "Viajes cortos de 2 a 4 noches alrededor del fin de semana.",
      },
      best_long_stays: {
        label: "Mejores estancias largas",
        description: "Viajes de mas de 4 noches para una escapada mas completa.",
      },
    },
    welcome: {
      confirmedSubject: `Tus enlaces de ${BRAND_NAME} estan listos`,
      pendingSubject: `Confirma tu suscripcion a ${BRAND_NAME}`,
      confirmedPreview: "Tu enlace privado para editar preferencias esta listo.",
      pendingPreview: "Confirma tu email y elige las alertas que quieres recibir.",
      confirmedHeadline: "Tus alertas de vuelos ya estan activas.",
      pendingHeadline: "Confirma tu email para recibir bajadas de precio desde Luxemburgo.",
      confirmedIntro: "Te enviamos otra vez tu enlace privado para que puedas actualizar tus alertas.",
      pendingIntro: "Una confirmacion rapida completa el double opt-in. Despues podras ajustar el feed a los viajes que realmente quieres.",
      linkedTo: "Vinculado a:",
      alertSetupTitle: "Configuracion de tus alertas",
      alertSetupBody: "Elige que ofertas quieres ver y con que frecuencia quieres que te escribamos.",
      confirmBody: "Despues de confirmar, edita destinos, presupuesto, rutas y frecuencia de emails.",
      primaryConfirmed: "Editar preferencias",
      primaryPending: "Confirmar suscripcion",
      preferencesLink: "Editar mis preferencias",
      notYouTitle: "No has sido tu? Baja inmediata.",
      notYouBody: "Si no has sido tu, puedes darte de baja inmediatamente.",
      unsubscribeNow: "Darme de baja",
      alreadyConfirmed: "Ya confirmado?",
      emailLabel: "Email",
    },
  },
};

export function normalizeEmailLocale(value: unknown): EmailLocale {
  if (typeof value !== "string") {
    return "en";
  }

  const normalized = value.toLowerCase().split("-")[0];
  return emailLocales.includes(normalized as EmailLocale) ? (normalized as EmailLocale) : "en";
}

function getCopy(locale?: EmailLocale | null) {
  return emailCopy[normalizeEmailLocale(locale)];
}

function formatCurrency(value: number, locale?: EmailLocale | null, currency: string = "EUR") {
  const copy = getCopy(locale);
  return new Intl.NumberFormat(copy.intlLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null, locale?: EmailLocale | null) {
  if (!value) {
    return getCopy(locale).flexibleDates;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateWithWeekday(value: string | null, locale?: EmailLocale | null) {
  if (!value) {
    return getCopy(locale).flexibleDates;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatFlightClock(value: string | null, locale?: EmailLocale | null) {
  if (!value) {
    return getCopy(locale).notAvailable;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFlightWeekdayClock(value: string | null, locale?: EmailLocale | null) {
  if (!value) {
    return getCopy(locale).notAvailable;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStayHours(value: number | null, locale?: EmailLocale | null) {
  if (value === null) {
    return null;
  }

  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return getCopy(locale).stayHours(rounded);
}

function formatVerifiedAge(value: string | null, locale?: EmailLocale | null, now: Date = new Date()) {
  const copy = getCopy(locale);
  if (!value) {
    return copy.verifiedRecently;
  }

  const diffMs = now.getTime() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 60_000) {
    return copy.verifiedJustNow;
  }

  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 60) {
    return copy.verifiedMinutesAgo(diffMinutes);
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return copy.verifiedHoursAgo(diffHours);
  }

  const diffDays = Math.round(diffHours / 24);
  return copy.verifiedDaysAgo(diffDays);
}

function formatStops(maxStops: string, locale?: EmailLocale | null) {
  const copy = getCopy(locale);
  if (maxStops === "NON_STOP" || maxStops === "ONE_STOP_OR_FEWER") {
    return copy.stops[maxStops];
  }

  return copy.unknownStops(maxStops);
}

function formatDrop(dropRatio: number | null, locale?: EmailLocale | null) {
  if (dropRatio === null) {
    return getCopy(locale).drop(null);
  }

  return getCopy(locale).drop(Math.round((1 - dropRatio) * 100));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildDealHeadline(sendType: CampaignSendType, deals: RenderableDeal[], locale?: EmailLocale | null) {
  const copy = getCopy(locale);
  if (sendType === "flash") {
    return copy.headlineFlash;
  }

  return deals.length === 1 ? copy.headlineSingle : copy.headlineDigest;
}

export function buildCampaignSubject(
  sendType: CampaignSendType,
  deals: RenderableDeal[],
  locale?: EmailLocale | null,
) {
  const copy = getCopy(locale);
  const [topDeal] = deals;

  if (!topDeal) {
    return sendType === "flash" ? copy.emptyFlashSubject : copy.emptyDigestSubject;
  }

  const price = formatCurrency(topDeal.dealPrice, locale);
  if (deals.length === 1) {
    return copy.singleSubject(topDeal.destinationCity, price);
  }

  return copy.multiSubject(topDeal.destinationCity, price, deals.length - 1);
}

export function buildCampaignPreviewText(
  sendType: CampaignSendType,
  deals: RenderableDeal[],
  locale?: EmailLocale | null,
) {
  const copy = getCopy(locale);
  const [topDeal] = deals;
  if (!topDeal) {
    return sendType === "flash" ? copy.emptyFlashPreview : copy.emptyDigestPreview;
  }

  const price = formatCurrency(topDeal.dealPrice, locale);
  return deals.length === 1
    ? copy.singlePreview(topDeal.routeLabel, price)
    : copy.multiPreview(deals.length, topDeal.destinationCity, price);
}

export function renderCampaignEmail(input: RenderCampaignEmailInput) {
  const locale = normalizeEmailLocale(input.locale);
  const copy = getCopy(locale);
  const siteUrl = getSiteUrl();
  const headline = buildDealHeadline(input.sendType, input.deals, locale);
  const intro = input.sendType === "flash" ? copy.introFlash : copy.introDigest;

  const renderDealCard = (deal: RenderableDeal) => {
    const baseline =
      deal.baselinePrice === null
        ? copy.baselineStillForming
        : formatCurrency(deal.baselinePrice, locale);
    const verifiedLabel = formatVerifiedAge(deal.verifiedAt, locale);
    const travelDates = copy.travelDateRange(
      formatDateWithWeekday(deal.departureDate, locale),
      formatDateWithWeekday(deal.returnDate, locale),
    );
    const outboundTiming =
      deal.outboundDepartureAt && deal.outboundArrivalAt
        ? copy.timing(
            copy.labels.outbound,
            formatFlightWeekdayClock(deal.outboundDepartureAt, locale),
            formatFlightClock(deal.outboundArrivalAt, locale),
          )
        : null;
    const returnTiming =
      deal.returnDepartureAt && deal.returnArrivalAt
        ? copy.timing(
            copy.labels.return,
            formatFlightWeekdayClock(deal.returnDepartureAt, locale),
            formatFlightClock(deal.returnArrivalAt, locale),
          )
        : null;
    const stayLabel = formatStayHours(deal.destinationStayHours, locale);

    return `
      <tr>
        <td style="padding: 0 0 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid ${EMAIL_BORDER}; border-radius: 18px; background: ${EMAIL_PANEL_ALT};">
            <tr>
              <td style="padding: 20px 22px;">
                <p style="margin: 0; color: ${EMAIL_ACCENT}; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">${escapeHtml(deal.routeLabel)}</p>
                <h2 style="margin: 12px 0 8px; color: ${EMAIL_TEXT}; font-size: 24px; line-height: 1.1;">${escapeHtml(deal.title)}</h2>
                <p style="margin: 0; color: ${EMAIL_MUTED}; font-size: 15px; line-height: 1.6;">${escapeHtml(deal.summary)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                  <tr>
                    <td style="padding: 0 12px 8px 0; color: ${EMAIL_MUTED}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">${escapeHtml(copy.labels.price)}</td>
                    <td style="padding: 0 12px 8px 0; color: ${EMAIL_MUTED}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">${escapeHtml(copy.labels.travelDates)}</td>
                    <td style="padding: 0 0 8px; color: ${EMAIL_MUTED}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">${escapeHtml(copy.labels.tripShape)}</td>
                    <td style="padding: 0 0 8px 12px; color: ${EMAIL_MUTED}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em;">${escapeHtml(copy.labels.airline)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 0 12px 0 0; color: ${EMAIL_TEXT}; font-size: 16px; font-weight: 700;">${escapeHtml(formatCurrency(deal.dealPrice, locale))}<br /><span style="color: ${EMAIL_MUTED}; font-size: 12px; font-weight: 500;">${escapeHtml(verifiedLabel)}</span></td>
                    <td style="padding: 0 12px 0 0; color: ${EMAIL_TEXT}; font-size: 15px;">${escapeHtml(travelDates)}${outboundTiming ? `<br /><span style="color: ${EMAIL_MUTED}; font-size: 13px;">${escapeHtml(outboundTiming)}</span>` : ""}${returnTiming ? `<br /><span style="color: ${EMAIL_MUTED}; font-size: 13px;">${escapeHtml(returnTiming)}</span>` : ""}${stayLabel ? `<br /><span style="color: ${EMAIL_MUTED}; font-size: 13px;">${escapeHtml(stayLabel)}</span>` : ""}</td>
                    <td style="padding: 0; color: ${EMAIL_TEXT}; font-size: 15px;">${escapeHtml(copy.tripShape(deal.tripNights, formatStops(deal.maxStops, locale)))}</td>
                    <td style="padding: 0 0 0 12px; color: ${EMAIL_TEXT}; font-size: 15px;">${escapeHtml(deal.airlineSummary ?? copy.multipleCarriers)}</td>
                  </tr>
                </table>
                <p style="margin: 14px 0 0; color: ${EMAIL_MUTED}; font-size: 14px; line-height: 1.6;">
                  ${escapeHtml(copy.labels.recentBaseline)}: ${escapeHtml(baseline)}. ${escapeHtml(formatDrop(deal.dropRatio, locale))}.
                </p>
                ${
                  deal.bookingUrl
                    ? `<p style="margin: 18px 0 0;"><a href="${escapeHtml(deal.bookingUrl)}" style="display: inline-block; padding: 12px 16px; border-radius: 999px; background: ${EMAIL_CTA}; color: ${EMAIL_CTA_TEXT}; font-size: 14px; font-weight: 650; text-decoration: none;">${escapeHtml(copy.openInSkyscanner)}</a></p>`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  };

  const sections = buildEditorialSections(input.deals, (deal) => ({
    routeBucket: deal.routeBucket,
    tripNights: deal.tripNights,
    dropRatio: deal.dropRatio,
    departureDate: deal.departureDate,
  }));

  const htmlDeals = sections
    .map((section) => {
      const sectionCopy = copy.editorial[section.key];
      return `
        <tr>
          <td style="padding: 0 0 12px;">
            <p style="margin: 0; color: ${EMAIL_ACCENT}; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;">${escapeHtml(sectionCopy.label)}</p>
            <p style="margin: 8px 0 0; color: ${EMAIL_MUTED}; font-size: 14px; line-height: 1.6;">${escapeHtml(sectionCopy.description)}</p>
          </td>
        </tr>
        ${section.items.map(renderDealCard).join("")}
      `;
    })
    .join("");

  const html = `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin: 0; padding: 32px 16px; background: ${EMAIL_BG}; color: ${EMAIL_TEXT}; font-family: Avenir Next, Segoe UI, Helvetica Neue, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(input.previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px;">
            <tr>
              <td style="padding: 0 0 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f7fbff 0%, #edf4ff 100%); border: 1px solid ${EMAIL_BORDER}; border-radius: 24px;">
                  <tr>
                    <td style="padding: 32px 30px 28px;">
                      <p style="margin: 0; color: ${EMAIL_ACCENT}; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;">${BRAND_NAME}</p>
                      <h1 style="margin: 14px 0 10px; color: ${EMAIL_TEXT}; font-size: 38px; line-height: 1.02; font-weight: 800; letter-spacing: -0.04em;">${escapeHtml(headline)}</h1>
                      <p style="margin: 0; color: ${EMAIL_MUTED}; font-size: 16px; line-height: 1.7;">${escapeHtml(intro)}</p>
                      <p style="margin: 18px 0 0;"><a href="${escapeHtml(input.managePreferencesUrl)}" style="display: inline-block; padding: 12px 16px; border-radius: 999px; background: ${EMAIL_ACCENT}; color: #ffffff; font-size: 14px; font-weight: 650; text-decoration: none;">${escapeHtml(copy.editPreferences)}</a></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${EMAIL_PANEL}; border: 1px solid ${EMAIL_BORDER}; border-radius: 22px;">
                  <tr>
                    <td style="padding: 28px 30px 10px;">
                      <p style="margin: 0 0 18px; color: ${EMAIL_MUTED}; font-size: 16px; line-height: 1.7;">${escapeHtml(input.previewText)}</p>
                      <p style="margin: 0 0 22px; color: ${EMAIL_MUTED}; font-size: 15px; line-height: 1.7;">${escapeHtml(copy.skyscannerNote)}</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${htmlDeals}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0 0; border-top: 1px solid rgba(44, 95, 214, 0.12);">
                <p style="margin: 20px 0 0; color: ${EMAIL_MUTED}; font-size: 13px; line-height: 1.7;">
                  ${escapeHtml(copy.footerReason)}
                  <a href="${escapeHtml(input.managePreferencesUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${escapeHtml(copy.managePreferences)}</a>
                  · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${escapeHtml(copy.unsubscribe)}</a>
                  · <a href="${escapeHtml(siteUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${BRAND_NAME}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    BRAND_NAME,
    "",
    headline,
    intro,
    "",
    input.previewText,
    `${copy.editPreferences}: ${input.managePreferencesUrl}`,
    "",
    ...input.deals.flatMap((deal) => [
      `${deal.routeLabel} · ${deal.title}`,
      deal.summary,
      `${copy.labels.price}: ${formatCurrency(deal.dealPrice, locale)} · ${formatVerifiedAge(deal.verifiedAt, locale)}`,
      `${copy.labels.travelDates}: ${copy.travelDateRange(formatDateWithWeekday(deal.departureDate, locale), formatDateWithWeekday(deal.returnDate, locale))}`,
      ...(deal.outboundDepartureAt && deal.outboundArrivalAt
        ? [
            copy.timing(
              copy.labels.outbound,
              formatFlightWeekdayClock(deal.outboundDepartureAt, locale),
              formatFlightClock(deal.outboundArrivalAt, locale),
            ),
          ]
        : []),
      ...(deal.returnDepartureAt && deal.returnArrivalAt
        ? [
            copy.timing(
              copy.labels.return,
              formatFlightWeekdayClock(deal.returnDepartureAt, locale),
              formatFlightClock(deal.returnArrivalAt, locale),
            ),
          ]
        : []),
      ...(deal.destinationStayHours !== null
        ? [`${copy.labels.timeInDestination}: ${formatStayHours(deal.destinationStayHours, locale)}`]
        : []),
      `${copy.labels.tripShape}: ${copy.tripShape(deal.tripNights, formatStops(deal.maxStops, locale))}`,
      `${copy.labels.airline}: ${deal.airlineSummary ?? copy.multipleCarriers}`,
      ...(deal.bookingUrl ? [`${copy.openInSkyscanner}: ${deal.bookingUrl}`] : []),
      `${copy.labels.baseline}: ${deal.baselinePrice === null ? copy.baselineStillForming : formatCurrency(deal.baselinePrice, locale)}`,
      `${copy.labels.discount}: ${formatDrop(deal.dropRatio, locale)}`,
      "",
    ]),
    `${copy.searchInSkyscanner}: https://www.skyscanner.net`,
    `${copy.managePreferences}: ${input.managePreferencesUrl}`,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
    `${copy.labels.homepage}: ${siteUrl}`,
  ];

  return { html, text: textLines.join("\n") };
}

export function renderWelcomeEmail(input: RenderWelcomeEmailInput) {
  const locale = normalizeEmailLocale(input.locale);
  const copy = getCopy(locale);
  const siteUrl = getSiteUrl();
  const welcome = copy.welcome;
  const subject = input.alreadyConfirmed ? welcome.confirmedSubject : welcome.pendingSubject;
  const previewText = input.alreadyConfirmed ? welcome.confirmedPreview : welcome.pendingPreview;
  const headline = input.alreadyConfirmed ? welcome.confirmedHeadline : welcome.pendingHeadline;
  const intro = input.alreadyConfirmed ? welcome.confirmedIntro : welcome.pendingIntro;
  const primaryLabel = input.alreadyConfirmed ? welcome.primaryConfirmed : welcome.primaryPending;
  const primaryUrl = input.alreadyConfirmed ? input.managePreferencesUrl : input.confirmUrl;

  const html = `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 32px 16px; background: ${EMAIL_BG}; color: ${EMAIL_TEXT}; font-family: Avenir Next, Segoe UI, Helvetica Neue, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(previewText)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px;">
            <tr>
              <td style="padding: 0 0 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f7fbff 0%, #edf4ff 100%); border: 1px solid ${EMAIL_BORDER}; border-radius: 24px;">
                  <tr>
                    <td style="padding: 32px 30px 28px;">
                      <p style="margin: 0; color: ${EMAIL_ACCENT}; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;">${BRAND_NAME}</p>
                      <h1 style="margin: 14px 0 10px; color: ${EMAIL_TEXT}; font-size: 38px; line-height: 1.02; font-weight: 800; letter-spacing: -0.04em;">${escapeHtml(headline)}</h1>
                      <p style="margin: 0; color: ${EMAIL_MUTED}; font-size: 16px; line-height: 1.7;">${escapeHtml(intro)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${EMAIL_PANEL}; border: 1px solid ${EMAIL_BORDER}; border-radius: 22px;">
                  <tr>
                    <td style="padding: 28px 30px 30px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td valign="top" width="44" style="padding-right: 16px;">
                            <div style="width: 44px; height: 44px; border-radius: 14px; border: 1px solid ${EMAIL_BORDER}; background: ${EMAIL_ACCENT_SOFT}; color: ${EMAIL_ACCENT}; font-size: 20px; line-height: 44px; text-align: center;">+</div>
                          </td>
                          <td valign="top">
                            <p style="margin: 0; color: ${EMAIL_MUTED}; font-size: 14px; line-height: 1.4;">${escapeHtml(welcome.linkedTo)}</p>
                            <p style="margin: 4px 0 0; color: ${EMAIL_TEXT}; font-size: 18px; line-height: 1.35; font-weight: 700;">${escapeHtml(input.email)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td valign="top" width="44" style="padding: 22px 16px 0 0;">
                            <div style="width: 44px; height: 44px; border-radius: 14px; border: 1px solid ${EMAIL_BORDER}; background: ${EMAIL_ACCENT_SOFT}; color: ${EMAIL_ACCENT}; font-size: 20px; line-height: 44px; text-align: center;">↗</div>
                          </td>
                          <td valign="top" style="padding-top: 22px;">
                            <p style="margin: 0; color: ${EMAIL_TEXT}; font-size: 18px; line-height: 1.35; font-weight: 700;">${escapeHtml(welcome.alertSetupTitle)}</p>
                            <p style="margin: 6px 0 0; color: ${EMAIL_MUTED}; font-size: 15px; line-height: 1.65;">${escapeHtml(input.alreadyConfirmed ? welcome.alertSetupBody : welcome.confirmBody)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2" style="padding-top: 24px;">
                            <a href="${escapeHtml(primaryUrl)}" style="display: inline-block; padding: 14px 22px; border-radius: 999px; background: ${EMAIL_CTA}; color: ${EMAIL_CTA_TEXT}; font-size: 15px; font-weight: 650; text-decoration: none;">${escapeHtml(primaryLabel)}</a>
                            <a href="${escapeHtml(input.managePreferencesUrl)}" style="display: inline-block; margin-left: 10px; padding: 13px 18px; border-radius: 999px; border: 1px solid ${EMAIL_BORDER}; color: ${EMAIL_ACCENT}; font-size: 14px; font-weight: 650; text-decoration: none;">${escapeHtml(welcome.preferencesLink)}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${EMAIL_PANEL_ALT}; border: 1px solid ${EMAIL_BORDER}; border-radius: 22px;">
                  <tr>
                    <td style="padding: 26px 30px;">
                      <p style="margin: 0; color: ${EMAIL_TEXT}; font-size: 27px; line-height: 1.15; font-family: Iowan Old Style, Palatino Linotype, Book Antiqua, serif;">${escapeHtml(welcome.notYouTitle)}</p>
                      <p style="margin: 10px 0 0; color: ${EMAIL_MUTED}; font-size: 14px; line-height: 1.7;">${escapeHtml(welcome.notYouBody)} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${escapeHtml(welcome.unsubscribeNow)}</a>.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0 0; border-top: 1px solid rgba(44, 95, 214, 0.12);">
                <p style="margin: 18px 0 0; color: ${EMAIL_TEXT}; font-size: 14px; letter-spacing: 0.16em; text-transform: uppercase;">${BRAND_NAME}</p>
                <p style="margin: 12px 0 0; color: ${EMAIL_MUTED}; font-size: 14px; line-height: 1.7;">${escapeHtml(copy.tagline)}</p>
                <p style="margin: 14px 0 0; color: ${EMAIL_MUTED}; font-size: 12px; line-height: 1.7;">
                  <a href="${escapeHtml(input.managePreferencesUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${escapeHtml(copy.managePreferences)}</a>
                  · <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${escapeHtml(copy.unsubscribe)}</a>
                  · <a href="${escapeHtml(siteUrl)}" style="color: ${EMAIL_ACCENT}; font-weight: 700; text-decoration: none;">${BRAND_NAME}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    BRAND_NAME,
    "",
    headline,
    intro,
    "",
    `${welcome.emailLabel}: ${input.email}`,
    `${primaryLabel}: ${primaryUrl}`,
    `${welcome.preferencesLink}: ${input.managePreferencesUrl}`,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
    `${copy.labels.homepage}: ${siteUrl}`,
  ].join("\n");

  return { subject, previewText, html, text };
}

export async function sendResendEmail(input: SendResendEmailInput) {
  const env = getResendEnv();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(env.RESEND_REPLY_TO_EMAIL ? { replyTo: env.RESEND_REPLY_TO_EMAIL } : {}),
      tags: [
        {
          name: "product",
          value: "352flights",
        },
        {
          name: "email_type",
          value: input.emailType,
        },
        ...(input.sendType
          ? [
              {
                name: "send_type",
                value: input.sendType,
              },
            ]
          : []),
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { id?: string; message?: string; error?: string }
    | null;

  if (!response.ok || !payload?.id) {
    throw new Error(payload?.message ?? payload?.error ?? "Resend rejected the email request.");
  }

  return payload.id;
}
