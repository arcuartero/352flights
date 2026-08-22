import "server-only";

import { buildEditorialSections, type EditorialSectionKey } from "@/lib/editorial-sections";
import { getResendEnv, getSiteUrl } from "@/lib/env";
import { type CampaignSendType } from "@/lib/ops-shared";

const BRAND_NAME = "+352 Flights";
const EMAIL_ASSET_REVISION = "20260822-1";

function versionEmailAsset(url: string) {
  return `${url}?v=${EMAIL_ASSET_REVISION}`;
}

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

type CampaignRouteCopy = {
  title: (destinationCity: string) => string;
  weekdays: Record<string, string>;
  nextPattern: (departure: string, arrival: string) => string;
};

type RenderCampaignEmailInput = {
  sendType: CampaignSendType;
  subject: string;
  previewText: string;
  subscriberEmail?: string | null;
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
  introFlash: (dealCount: number) => string;
  introDigest: (dealCount: number) => string;
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
  skyscannerNote: (dealCount: number) => string;
  openInSkyscanner: string;
  searchInSkyscanner: string;
  editPreferences: string;
  managePreferences: string;
  unsubscribe: string;
  footerReason: string;
  campaign: {
    belowReference: string;
    viewFlight: string;
    associatedWith: string;
    editTitle: string;
    editBody: string;
    editAction: string;
    unsubscribeTitle: string;
    unsubscribeBody: string;
    unsubscribeAction: string;
  };
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
    headlineFlash: "New reasons to pack your bags !",
    headlineSingle: "New reasons to pack your bags !",
    headlineDigest: "New reasons to pack your bags !",
    introFlash: (dealCount) =>
      dealCount === 1
        ? "The price has dropped enough to be worth letting you know now."
        : "The prices have dropped enough to be worth letting you know now.",
    introDigest: (dealCount) =>
      dealCount === 1
        ? "The price has dropped enough to be worth letting you know now."
        : "The prices have dropped enough to be worth letting you know now.",
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
    skyscannerNote: (dealCount) =>
      dealCount === 1
        ? "Take a look now, because this price can change at any time."
        : "Take a look now, because these prices can change at any time.",
    openInSkyscanner: "Open in Skyscanner",
    searchInSkyscanner: "Search in Skyscanner",
    editPreferences: "Edit preferences",
    managePreferences: "Manage preferences",
    unsubscribe: "Unsubscribe",
    footerReason: "You are receiving this because you asked for Luxembourg flight deals matched to your route profile.",
    campaign: {
      belowReference: "below your reference",
      viewFlight: "View flight",
      associatedWith: "Associated with",
      editTitle: "Change preferences",
      editBody: "Adjust airports, dates, airlines, and price filters.",
      editAction: "Change my preferences",
      unsubscribeTitle: "Want to stop receiving these alerts?",
      unsubscribeBody: "You can pause or delete this alert whenever you like.",
      unsubscribeAction: "Unsubscribe me",
    },
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
      confirmedHeadline: "Tailor your travel alerts to your preferences.",
      pendingHeadline: "One more step before takeoff.",
      confirmedIntro: "We are sending your private access link again so you can update your alerts.",
      pendingIntro: "One quick confirmation finishes the double opt-in. Then you can tailor the feed to the trips you actually want.",
      linkedTo: "Linked to:",
      alertSetupTitle: "Your alert setup",
      alertSetupBody: "Choose the kind of flight deals you want to see and how often you hear from us.",
      confirmBody: "After confirming, edit your preferences to control destinations, budget, routing, and email cadence.",
      primaryConfirmed: "Edit preferences",
      primaryPending: "Confirm subscription",
      preferencesLink: "Edit my preferences",
      notYouTitle: "Unsubscribe instantly.",
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
    headlineFlash: "Des nouvelles raisons de faire vos valises !",
    headlineSingle: "Des nouvelles raisons de faire vos valises !",
    headlineDigest: "Des nouvelles raisons de faire vos valises !",
    introFlash: (dealCount) =>
      dealCount === 1
        ? "Le prix a suffisamment baissé pour que cela vaille la peine de vous prévenir maintenant."
        : "Les prix ont suffisamment baissé pour que cela vaille la peine de vous prévenir maintenant.",
    introDigest: (dealCount) =>
      dealCount === 1
        ? "Le prix a suffisamment baissé pour que cela vaille la peine de vous prévenir maintenant."
        : "Les prix ont suffisamment baissé pour que cela vaille la peine de vous prévenir maintenant.",
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
    skyscannerNote: (dealCount) =>
      dealCount === 1
        ? "Jetez-y un œil maintenant, car ce prix peut changer à tout moment."
        : "Jetez-y un œil maintenant, car ces prix peuvent changer à tout moment.",
    openInSkyscanner: "Ouvrir dans Skyscanner",
    searchInSkyscanner: "Rechercher dans Skyscanner",
    editPreferences: "Modifier mes preferences",
    managePreferences: "Gerer mes preferences",
    unsubscribe: "Se desabonner",
    footerReason: "Vous recevez cet email parce que vous avez demande des offres de vols depuis Luxembourg selon votre profil.",
    campaign: {
      belowReference: "sous votre référence",
      viewFlight: "Voir le vol",
      associatedWith: "Associé à",
      editTitle: "Modifier les préférences",
      editBody: "Ajustez les aéroports, les dates, les compagnies et les filtres de prix.",
      editAction: "Modifier mes préférences",
      unsubscribeTitle: "Vous ne souhaitez plus recevoir ces alertes ?",
      unsubscribeBody: "Vous pouvez désactiver ou supprimer cette alerte à tout moment.",
      unsubscribeAction: "Me désabonner",
    },
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
      confirmedHeadline: "Ajustez vos alertes de voyages à vos envies.",
      pendingHeadline: "Encore une étape avant le décollage.",
      confirmedIntro: "Nous vous renvoyons votre lien prive pour modifier vos alertes.",
      pendingIntro: "Une confirmation rapide termine le double opt-in. Vous pourrez ensuite regler le flux selon vos voyages.",
      linkedTo: "Associe a :",
      alertSetupTitle: "Configuration de vos alertes",
      alertSetupBody: "Choisissez les offres que vous voulez voir et la frequence de nos emails.",
      confirmBody: "Apres confirmation, modifiez vos preferences de destination, budget, itineraire et frequence.",
      primaryConfirmed: "Modifier mes preferences",
      primaryPending: "Confirmer l'inscription",
      preferencesLink: "Modifier mes preferences",
      notYouTitle: "Désabonnement instantané.",
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
    headlineFlash: "Neue Gründe gefunden, die Koffer zu packen.",
    headlineSingle: "Neue Gründe gefunden, die Koffer zu packen.",
    headlineDigest: "Neue Gründe gefunden, die Koffer zu packen.",
    introFlash: (dealCount) =>
      dealCount === 1
        ? "Der Preis ist weit genug gesunken, dass es sich lohnt, dich jetzt zu informieren."
        : "Die Preise sind weit genug gesunken, dass es sich lohnt, dich jetzt zu informieren.",
    introDigest: (dealCount) =>
      dealCount === 1
        ? "Der Preis ist weit genug gesunken, dass es sich lohnt, dich jetzt zu informieren."
        : "Die Preise sind weit genug gesunken, dass es sich lohnt, dich jetzt zu informieren.",
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
    skyscannerNote: (dealCount) =>
      dealCount === 1
        ? "Schau jetzt nach, denn dieser Preis kann sich jederzeit ändern."
        : "Schau jetzt nach, denn diese Preise können sich jederzeit ändern.",
    openInSkyscanner: "In Skyscanner oeffnen",
    searchInSkyscanner: "In Skyscanner suchen",
    editPreferences: "Praeferenzen bearbeiten",
    managePreferences: "Praeferenzen verwalten",
    unsubscribe: "Abmelden",
    footerReason: "Du erhaeltst diese E-Mail, weil du Flugangebote ab Luxemburg passend zu deinem Profil angefordert hast.",
    campaign: {
      belowReference: "unter deinem Vergleichswert",
      viewFlight: "Flug ansehen",
      associatedWith: "Verknüpft mit",
      editTitle: "Präferenzen ändern",
      editBody: "Passe Flughäfen, Daten, Airlines und Preisfilter an.",
      editAction: "Meine Präferenzen ändern",
      unsubscribeTitle: "Möchtest du diese Alerts nicht mehr erhalten?",
      unsubscribeBody: "Du kannst diesen Alert jederzeit deaktivieren oder löschen.",
      unsubscribeAction: "Abmelden",
    },
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
      confirmedHeadline: "Passe deine Reisealarme an deine Wünsche an.",
      pendingHeadline: "Noch ein Schritt bis zum Abflug.",
      confirmedIntro: "Wir senden dir deinen privaten Link erneut, damit du deine Alerts anpassen kannst.",
      pendingIntro: "Eine kurze Bestaetigung schliesst den Double-Opt-in ab. Danach passt du den Feed an deine Reisen an.",
      linkedTo: "Verknuepft mit:",
      alertSetupTitle: "Deine Alert-Einstellungen",
      alertSetupBody: "Waehle, welche Flugangebote du sehen moechtest und wie oft wir dich kontaktieren.",
      confirmBody: "Nach der Bestaetigung kannst du Ziele, Budget, Route und E-Mail-Rhythmus bearbeiten.",
      primaryConfirmed: "Praeferenzen bearbeiten",
      primaryPending: "Abo bestaetigen",
      preferencesLink: "Meine Praeferenzen bearbeiten",
      notYouTitle: "Sofort abbestellen.",
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
    headlineFlash: "Novos motivos para fazer as malas !",
    headlineSingle: "Novos motivos para fazer as malas !",
    headlineDigest: "Novos motivos para fazer as malas !",
    introFlash: (dealCount) =>
      dealCount === 1
        ? "O preço baixou o suficiente para valer a pena avisar agora."
        : "Os preços baixaram o suficiente para valer a pena avisar agora.",
    introDigest: (dealCount) =>
      dealCount === 1
        ? "O preço baixou o suficiente para valer a pena avisar agora."
        : "Os preços baixaram o suficiente para valer a pena avisar agora.",
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
    skyscannerNote: (dealCount) =>
      dealCount === 1
        ? "Veja agora, porque este preço pode mudar a qualquer momento."
        : "Veja agora, porque estes preços podem mudar a qualquer momento.",
    openInSkyscanner: "Abrir no Skyscanner",
    searchInSkyscanner: "Pesquisar no Skyscanner",
    editPreferences: "Editar preferencias",
    managePreferences: "Gerir preferencias",
    unsubscribe: "Cancelar subscricao",
    footerReason: "Recebe este email porque pediu ofertas de voos do Luxemburgo de acordo com o seu perfil.",
    campaign: {
      belowReference: "abaixo da sua referência",
      viewFlight: "Ver voo",
      associatedWith: "Associado a",
      editTitle: "Alterar preferências",
      editBody: "Ajuste aeroportos, datas, companhias e filtros de preço.",
      editAction: "Alterar as minhas preferências",
      unsubscribeTitle: "Pretende deixar de receber estes alertas?",
      unsubscribeBody: "Pode desativar ou eliminar este alerta quando quiser.",
      unsubscribeAction: "Cancelar subscrição",
    },
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
      confirmedHeadline: "Ajuste os seus alertas de viagem às suas preferências.",
      pendingHeadline: "Só falta um passo para descolar.",
      confirmedIntro: "Enviamos novamente o seu link privado para poder atualizar os alertas.",
      pendingIntro: "Uma confirmacao rapida conclui o double opt-in. Depois podera ajustar o feed as suas viagens.",
      linkedTo: "Associado a:",
      alertSetupTitle: "Configuracao dos alertas",
      alertSetupBody: "Escolha que ofertas quer ver e com que frequencia quer receber emails.",
      confirmBody: "Depois de confirmar, edite destinos, orcamento, rotas e frequencia de email.",
      primaryConfirmed: "Editar preferencias",
      primaryPending: "Confirmar subscricao",
      preferencesLink: "Editar as minhas preferencias",
      notYouTitle: "Cancelamento imediato.",
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
    headlineFlash: "Nuovi motivi per fare le valigie !",
    headlineSingle: "Nuovi motivi per fare le valigie !",
    headlineDigest: "Nuovi motivi per fare le valigie !",
    introFlash: (dealCount) =>
      dealCount === 1
        ? "Il prezzo è sceso abbastanza da valere la pena avvisarti ora."
        : "I prezzi sono scesi abbastanza da valere la pena avvisarti ora.",
    introDigest: (dealCount) =>
      dealCount === 1
        ? "Il prezzo è sceso abbastanza da valere la pena avvisarti ora."
        : "I prezzi sono scesi abbastanza da valere la pena avvisarti ora.",
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
    skyscannerNote: (dealCount) =>
      dealCount === 1
        ? "Dai un'occhiata ora, perché questo prezzo può cambiare in qualsiasi momento."
        : "Dai un'occhiata ora, perché questi prezzi possono cambiare in qualsiasi momento.",
    openInSkyscanner: "Apri su Skyscanner",
    searchInSkyscanner: "Cerca su Skyscanner",
    editPreferences: "Modifica preferenze",
    managePreferences: "Gestisci preferenze",
    unsubscribe: "Annulla iscrizione",
    footerReason: "Ricevi questa email perche hai richiesto offerte voli dal Lussemburgo in base al tuo profilo.",
    campaign: {
      belowReference: "sotto il tuo riferimento",
      viewFlight: "Vedi volo",
      associatedWith: "Associato a",
      editTitle: "Modifica preferenze",
      editBody: "Modifica aeroporti, date, compagnie e filtri di prezzo.",
      editAction: "Modifica le mie preferenze",
      unsubscribeTitle: "Vuoi smettere di ricevere questi avvisi?",
      unsubscribeBody: "Puoi disattivare o eliminare questo avviso quando vuoi.",
      unsubscribeAction: "Annulla iscrizione",
    },
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
      confirmedHeadline: "Adatta i tuoi avvisi di viaggio alle tue preferenze.",
      pendingHeadline: "Ancora un passo prima del decollo.",
      confirmedIntro: "Ti inviamo di nuovo il link privato per aggiornare gli alert.",
      pendingIntro: "Una rapida conferma completa il double opt-in. Poi potrai adattare il feed ai tuoi viaggi.",
      linkedTo: "Collegato a:",
      alertSetupTitle: "Impostazioni alert",
      alertSetupBody: "Scegli che offerte vuoi vedere e con quale frequenza ricevere email.",
      confirmBody: "Dopo la conferma, modifica destinazioni, budget, itinerari e frequenza email.",
      primaryConfirmed: "Modifica preferenze",
      primaryPending: "Conferma iscrizione",
      preferencesLink: "Modifica le mie preferenze",
      notYouTitle: "Disiscrizione immediata.",
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
    headlineFlash: "Nuevas razones para hacer tus maletas !",
    headlineSingle: "Nuevas razones para hacer tus maletas !",
    headlineDigest: "Nuevas razones para hacer tus maletas !",
    introFlash: (dealCount) =>
      dealCount === 1
        ? "El precio ha bajado lo suficiente como para que merezca la pena avisarte ahora."
        : "Los precios han bajado lo suficiente como para que merezca la pena avisarte ahora.",
    introDigest: (dealCount) =>
      dealCount === 1
        ? "El precio ha bajado lo suficiente como para que merezca la pena avisarte ahora."
        : "Los precios han bajado lo suficiente como para que merezca la pena avisarte ahora.",
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
    skyscannerNote: (dealCount) =>
      dealCount === 1
        ? "Échale un vistazo ahora, porque este precio puede cambiar en cualquier momento."
        : "Échales un vistazo ahora, porque estos precios pueden cambiar en cualquier momento.",
    openInSkyscanner: "Abrir en Skyscanner",
    searchInSkyscanner: "Buscar en Skyscanner",
    editPreferences: "Editar preferencias",
    managePreferences: "Gestionar preferencias",
    unsubscribe: "Darse de baja",
    footerReason: "Recibes este email porque pediste ofertas de vuelos desde Luxemburgo adaptadas a tu perfil.",
    campaign: {
      belowReference: "por debajo de tu referencia",
      viewFlight: "Ver vuelo",
      associatedWith: "Asociado a",
      editTitle: "Modificar preferencias",
      editBody: "Ajusta aeropuertos, fechas, compañías y filtros de precio.",
      editAction: "Modificar mis preferencias",
      unsubscribeTitle: "¿Deseas dejar de recibir estas alertas?",
      unsubscribeBody: "Puedes desactivar o eliminar esta alerta cuando quieras.",
      unsubscribeAction: "Darme de baja",
    },
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
      confirmedHeadline: "Ajusta tus alertas de viaje a tus preferencias.",
      pendingHeadline: "Solo falta un paso para despegar.",
      confirmedIntro: "Te enviamos otra vez tu enlace privado para que puedas actualizar tus alertas.",
      pendingIntro: "Una confirmacion rapida completa el double opt-in. Despues podras ajustar el feed a los viajes que realmente quieres.",
      linkedTo: "Vinculado a:",
      alertSetupTitle: "Configuracion de tus alertas",
      alertSetupBody: "Elige que ofertas quieres ver y con que frecuencia quieres que te escribamos.",
      confirmBody: "Despues de confirmar, edita destinos, presupuesto, rutas y frecuencia de emails.",
      primaryConfirmed: "Editar preferencias",
      primaryPending: "Confirmar suscripcion",
      preferencesLink: "Editar mis preferencias",
      notYouTitle: "Baja inmediata.",
      notYouBody: "Si no has sido tu, puedes darte de baja inmediatamente.",
      unsubscribeNow: "Darme de baja",
      alreadyConfirmed: "Ya confirmado?",
      emailLabel: "Email",
    },
  },
};

const campaignRouteCopy: Record<EmailLocale, CampaignRouteCopy> = {
  en: {
    title: (destinationCity) => `Luxembourg to ${destinationCity}`,
    weekdays: { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} next week`,
  },
  fr: {
    title: (destinationCity) => `Luxembourg vers ${destinationCity}`,
    weekdays: { Mon: "lundi", Tue: "mardi", Wed: "mercredi", Thu: "jeudi", Fri: "vendredi", Sat: "samedi", Sun: "dimanche" },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} semaine prochaine`,
  },
  de: {
    title: (destinationCity) => `Luxemburg nach ${destinationCity}`,
    weekdays: { Mon: "Montag", Tue: "Dienstag", Wed: "Mittwoch", Thu: "Donnerstag", Fri: "Freitag", Sat: "Samstag", Sun: "Sonntag" },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} nächste Woche`,
  },
  pt: {
    title: (destinationCity) => `Luxemburgo para ${destinationCity}`,
    weekdays: { Mon: "segunda-feira", Tue: "terça-feira", Wed: "quarta-feira", Thu: "quinta-feira", Fri: "sexta-feira", Sat: "sábado", Sun: "domingo" },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} na próxima semana`,
  },
  it: {
    title: (destinationCity) => `Da Lussemburgo a ${destinationCity}`,
    weekdays: { Mon: "lunedì", Tue: "martedì", Wed: "mercoledì", Thu: "giovedì", Fri: "venerdì", Sat: "sabato", Sun: "domenica" },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} della prossima settimana`,
  },
  es: {
    title: (destinationCity) => `Luxemburgo a ${destinationCity}`,
    weekdays: { Mon: "lunes", Tue: "martes", Wed: "miércoles", Thu: "jueves", Fri: "viernes", Sat: "sábado", Sun: "domingo" },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} semana próxima`,
  },
};

const multiCityAirportNames: Record<string, string> = {
  BGY: "Bergamo",
  DWC: "Al Maktoum International",
  DXB: "Dubai International",
  EWR: "Newark Liberty",
  JFK: "John F. Kennedy",
  LCY: "London City",
  LGW: "Gatwick",
  LHR: "Heathrow",
  LIN: "Linate",
  MXP: "Malpensa",
  STN: "Stansted",
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

function splitCampaignRouteLabel(routeLabel: string) {
  const divider = " · ";
  const dividerIndex = routeLabel.indexOf(divider);

  if (dividerIndex === -1) {
    return { routeLabel: routeLabel.trim(), patternLabel: null };
  }

  return {
    routeLabel: routeLabel.slice(0, dividerIndex).trim(),
    patternLabel: routeLabel.slice(dividerIndex + divider.length).trim() || null,
  };
}

function formatCampaignRouteLabel(deal: RenderableDeal) {
  const { routeLabel } = splitCampaignRouteLabel(deal.routeLabel);
  const airportName = multiCityAirportNames[deal.destinationAirport.toUpperCase()];

  if (!airportName) {
    return routeLabel;
  }

  const cityAndAirport = `${deal.destinationCity} · ${airportName}`;
  return /\([^)]*\)\s*$/.test(routeLabel)
    ? routeLabel.replace(/\([^)]*\)\s*$/, `(${cityAndAirport})`)
    : `${routeLabel} (${cityAndAirport})`;
}

function localizeCampaignPattern(patternLabel: string | null, locale?: EmailLocale | null) {
  if (!patternLabel) {
    return null;
  }

  const normalizedLocale = normalizeEmailLocale(locale);
  const routeCopy = campaignRouteCopy[normalizedLocale];
  const match = patternLabel.match(/^([A-Za-z]{3})\s*->\s*(next\s+)?([A-Za-z]{3})$/i);

  if (!match) {
    return null;
  }

  const departureKey = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
  const arrivalKey = `${match[3][0].toUpperCase()}${match[3].slice(1).toLowerCase()}`;
  const departure = routeCopy.weekdays[departureKey];
  const arrival = routeCopy.weekdays[arrivalKey];

  if (!departure || !arrival) {
    return null;
  }

  return match[2]
    ? routeCopy.nextPattern(departure, arrival)
    : `${departure} -> ${arrival}`;
}

function formatCampaignDealTitle(deal: RenderableDeal, locale?: EmailLocale | null) {
  const normalizedLocale = normalizeEmailLocale(locale);
  return campaignRouteCopy[normalizedLocale].title(deal.destinationCity);
}

function formatCampaignDealPattern(deal: RenderableDeal, locale?: EmailLocale | null) {
  const normalizedLocale = normalizeEmailLocale(locale);
  const { patternLabel } = splitCampaignRouteLabel(deal.routeLabel);
  return localizeCampaignPattern(patternLabel, normalizedLocale);
}

function formatCurrency(value: number, locale?: EmailLocale | null, currency: string = "EUR") {
  const copy = getCopy(locale);
  return new Intl.NumberFormat(copy.intlLocale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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

function formatCampaignDateRange(
  from: string | null,
  to: string | null,
  locale?: EmailLocale | null,
) {
  if (!from || !to) {
    return getCopy(locale).flexibleDates;
  }

  const intlLocale = getCopy(locale).intlLocale;
  const departure = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
  }).format(new Date(from));
  const arrival = new Intl.DateTimeFormat(intlLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(to));

  return `${departure} — ${arrival}`;
}

function formatCampaignTiming(label: string, departure: string, arrival: string) {
  return `${label} ${departure} — ${arrival}`;
}

function formatFlightClock(value: string | null, locale?: EmailLocale | null) {
  if (!value) {
    return getCopy(locale).notAvailable;
  }

  return new Intl.DateTimeFormat(getCopy(locale).intlLocale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Luxembourg",
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
    timeZone: "Europe/Luxembourg",
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

function renderPlainEmailAddress(value: string) {
  const separatorIndex = value.lastIndexOf("@");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return escapeHtml(value);
  }

  return [
    `<span>${escapeHtml(value.slice(0, separatorIndex))}</span>`,
    `<span>&#64;</span>`,
    `<span>${escapeHtml(value.slice(separatorIndex + 1))}</span>`,
  ].join("");
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
  const routeLabel = formatCampaignRouteLabel(topDeal);
  return deals.length === 1
    ? copy.singlePreview(routeLabel, price)
    : copy.multiPreview(deals.length, topDeal.destinationCity, price);
}

export function renderCampaignEmail(input: RenderCampaignEmailInput) {
  const locale = normalizeEmailLocale(input.locale);
  const copy = getCopy(locale);
  const siteUrl = getSiteUrl();
  const headline = buildDealHeadline(input.sendType, input.deals, locale);
  const dealCount = input.deals.length;
  const intro =
    input.sendType === "flash" ? copy.introFlash(dealCount) : copy.introDigest(dealCount);
  const skyscannerNote = copy.skyscannerNote(dealCount);
  const logoUrl = `${siteUrl}/v2-logo.png`;
  const heroImageUrl = versionEmailAsset(`${siteUrl}/email-airplane-window.jpg`);
  const iconUrl = (name: string) =>
    versionEmailAsset(`${siteUrl}/email-icons/${name}.png`);

  const renderDealCard = (deal: RenderableDeal) => {
    const routeLabel = formatCampaignRouteLabel(deal);
    const localizedTitle = formatCampaignDealTitle(deal, locale);
    const localizedPattern = formatCampaignDealPattern(deal, locale);
    const travelDates = formatCampaignDateRange(deal.departureDate, deal.returnDate, locale);
    const outboundTiming =
      deal.outboundDepartureAt && deal.outboundArrivalAt
        ? formatCampaignTiming(
            copy.labels.outbound,
            formatFlightClock(deal.outboundDepartureAt, locale),
            formatFlightClock(deal.outboundArrivalAt, locale),
          )
        : null;
    const returnTiming =
      deal.returnDepartureAt && deal.returnArrivalAt
        ? formatCampaignTiming(
            copy.labels.return,
            formatFlightClock(deal.returnDepartureAt, locale),
            formatFlightClock(deal.returnArrivalAt, locale),
          )
        : null;
    const dropPercent =
      deal.dropRatio === null ? null : Math.max(0, Math.round((1 - deal.dropRatio) * 100));
    const discountPill =
      dropPercent && dropPercent > 0
        ? `<span style="display: inline-block; margin-left: 8px; padding: 5px 9px; border-radius: 7px; background-color: #d8f5df; color: #15853d; font-size: 13px; line-height: 16px; font-weight: 800; vertical-align: middle;">&#9660;&nbsp;${dropPercent}%</span>`
        : "";

    return `
      <tr>
        <td style="padding: 0 0 16px;">
          <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 20px; border-collapse: separate; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.08);">
            <tr>
              <td class="deal-card-pad" style="padding: 27px 30px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="deal-head-left" valign="top" style="padding: 0 18px 17px 0;">
                      <p style="margin: 0 0 10px; color: #1263e9; font-size: 12px; line-height: 16px; font-weight: 800; letter-spacing: 0.03em; text-transform: uppercase;">${escapeHtml(routeLabel)}</p>
                      <h2 class="email-text" style="margin: 0; color: #091a3a; font-size: 25px; line-height: 1.18; font-weight: 400; letter-spacing: -0.025em;">${escapeHtml(localizedTitle)}</h2>
                      ${localizedPattern ? `<p class="email-muted" style="margin: 7px 0 0; color: #52627b; font-size: 16px; line-height: 1.4; font-weight: 400;">${escapeHtml(localizedPattern)}</p>` : ""}
                    </td>
                    <td class="deal-head-right" valign="top" align="right" width="230" style="width: 230px; padding: 0 0 17px;">
                      <p class="email-text" style="margin: 0; color: #091a3a; font-size: 33px; line-height: 1; font-weight: 850; white-space: nowrap;">${escapeHtml(formatCurrency(deal.dealPrice, locale))}${discountPill}</p>
                      <p class="email-muted" style="margin: 8px 0 0; color: #52627b; font-size: 13px; line-height: 1.4;">${escapeHtml(copy.campaign.belowReference)}</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #dce7f6;">
                  <tr>
                    <td class="meta-cell" valign="top" width="34%" style="width: 34%; padding: 17px 14px 17px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding-right: 10px;"><img src="${escapeHtml(iconUrl("calendar"))}" width="27" height="27" alt="" style="display: block; width: 27px; height: 27px; border: 0;" /></td><td class="email-text" style="color: #091a3a; font-size: 13px; line-height: 1.55;">${escapeHtml(travelDates)}</td></tr></table>
                    </td>
                    <td class="meta-cell" valign="top" width="35%" style="width: 35%; padding: 17px 14px; border-left: 1px solid #dce7f6;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding-right: 10px;"><img src="${escapeHtml(iconUrl("clock"))}" width="27" height="27" alt="" style="display: block; width: 27px; height: 27px; border: 0;" /></td><td class="email-text" style="color: #091a3a; font-size: 13px; line-height: 1.55;">${outboundTiming ? escapeHtml(outboundTiming) : escapeHtml(copy.notAvailable)}${returnTiming ? `<br />${escapeHtml(returnTiming)}` : ""}</td></tr></table>
                    </td>
                    <td class="meta-cell" valign="top" width="31%" style="width: 31%; padding: 17px 0 17px 14px; border-left: 1px solid #dce7f6;">
                      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top" style="padding-right: 10px;"><img src="${escapeHtml(iconUrl("plane"))}" width="27" height="27" alt="" style="display: block; width: 27px; height: 27px; border: 0;" /></td><td class="trip-meta email-text" style="color: #091a3a; font-size: 13px; line-height: 1.55; white-space: nowrap;">${escapeHtml(copy.nights(deal.tripNights))} &nbsp;·&nbsp; ${escapeHtml(deal.airlineSummary ?? copy.multipleCarriers)}</td></tr></table>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="action-cell" valign="middle" align="right" style="padding-top: 3px; text-align: right;">
                      ${deal.bookingUrl ? `<a href="${escapeHtml(deal.bookingUrl)}" style="display: inline-block; padding: 13px 22px; border-radius: 8px; background-color: #ed241f; color: #ffffff; font-size: 14px; line-height: 18px; font-weight: 800; text-decoration: none; box-shadow: 0 7px 18px rgba(237, 36, 31, 0.2);">${escapeHtml(copy.campaign.viewFlight)}</a>` : ""}
                    </td>
                  </tr>
                </table>
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
          <td style="padding: 16px 0 13px;">
            <p style="margin: 0; color: #1263e9; font-size: 14px; line-height: 18px; font-weight: 850; letter-spacing: 0.03em; text-transform: uppercase;">${escapeHtml(sectionCopy.label)}</p>
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
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>${escapeHtml(input.subject)}</title>
    <style>
      .email-body, .email-canvas { background-color: #eef5ff !important; }
      .email-card { background-color: #ffffff !important; }
      .email-text { color: #091a3a !important; }
      .email-muted { color: #52627b !important; }
      .account-email a, .account-email [x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      @media only screen and (max-width: 620px) {
        html, body { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
        .email-body { width: 100% !important; max-width: 100% !important; padding: 18px 10px !important; box-sizing: border-box !important; overflow-x: hidden !important; }
        .email-canvas { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }
        .email-shell { width: 100% !important; max-width: 100% !important; min-width: 0 !important; table-layout: fixed !important; }
        .email-card { table-layout: fixed !important; }
        .email-logo { width: 142px !important; max-width: 142px !important; }
        .email-shell, .email-card, .hero-copy-cell, .hero-image-cell, .summary-pad, .manage-pad, .deal-card-pad, .deal-head-left, .deal-head-right { min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; }
        .hero-copy-cell, .hero-image-cell { display: block !important; width: 100% !important; max-width: 100% !important; }
        .hero-copy-cell { padding: 34px 25px 32px !important; }
        .hero-image { width: 100% !important; max-width: none !important; height: 230px !important; border-radius: 0 0 19px 19px !important; object-fit: cover !important; }
        .hero-title { font-size: 30px !important; line-height: 1.12 !important; }
        .summary-pad, .manage-pad { padding: 22px 21px !important; }
        .deal-card-pad { padding: 23px 21px 21px !important; }
        .deal-head-left, .deal-head-right, .action-cell { display: block !important; width: 100% !important; max-width: 100% !important; }
        .deal-head-left { padding-right: 0 !important; }
        .deal-head-right { padding: 0 0 18px !important; }
        .meta-cell { display: block !important; width: 100% !important; padding: 14px 0 !important; border-left: 0 !important; border-bottom: 1px solid #dce7f6 !important; }
        .trip-meta { white-space: normal !important; }
        .action-cell { padding-top: 17px !important; text-align: right !important; }
        .manage-icon, .manage-copy, .manage-action { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; text-align: left !important; }
        .manage-icon { padding: 16px 0 10px !important; }
        .manage-copy { padding: 0 !important; }
        .manage-action { padding: 14px 0 0 !important; }
        .manage-action a { display: block !important; width: auto !important; min-width: 0 !important; text-align: center !important; white-space: normal !important; }
        .account-email { word-break: break-word !important; }
        .footer-links a { display: inline-block !important; margin: 4px 5px !important; }
      }
    </style>
  </head>
  <body class="email-body" style="margin: 0; padding: 32px 16px; background-color: #eef5ff; background-image: radial-gradient(circle at 50% 8%, #ffffff 0%, #f6f9ff 42%, #eaf3ff 100%); color: #091a3a; font-family: Avenir Next, Segoe UI, Helvetica Neue, Arial, sans-serif; -webkit-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(input.previewText)}</div>
    <table class="email-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef5ff" style="background-color: #eef5ff; background-image: radial-gradient(circle at 50% 8%, #ffffff 0%, #f6f9ff 42%, #eaf3ff 100%);">
      <tr>
        <td align="center">
          <table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 810px;">
            <tr>
              <td align="center" style="padding: 0 0 24px;">
                <a href="${escapeHtml(siteUrl)}" style="text-decoration: none;">
                  <img class="email-logo" src="${escapeHtml(logoUrl)}" width="190" alt="${BRAND_NAME}" style="display: block; width: 190px; max-width: 100%; height: auto; border: 0;" />
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 22px; border-collapse: separate; overflow: hidden; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.09);">
                  <tr>
                    <td class="hero-copy-cell" valign="middle" width="60%" style="width: 60%; padding: 58px 38px;">
                      <h1 class="hero-title email-text" style="margin: 0 0 16px; color: #091a3a; font-size: 40px; line-height: 1.12; font-weight: 500; letter-spacing: -0.035em;">${escapeHtml(headline)}</h1>
                      <p class="email-muted" style="margin: 0; color: #52627b; font-size: 16px; line-height: 1.65;">${escapeHtml(intro)}</p>
                    </td>
                    <td class="hero-image-cell" valign="middle" width="40%" style="width: 40%; padding: 0; background-color: #e5e8ee;">
                      <img class="hero-image" src="${escapeHtml(heroImageUrl)}" width="324" height="390" alt="" style="display: block; width: 100%; max-width: 324px; height: 390px; border: 0; border-radius: 0 21px 21px 0; object-fit: cover;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 20px; border-collapse: separate; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.08);">
                  <tr>
                    <td class="summary-pad" style="padding: 28px 32px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; table-layout: fixed;">
                        <tr>
                          <td class="summary-icon-cell" valign="middle" width="82" style="width: 82px; padding-right: 18px;">
                            <table role="presentation" width="72" height="72" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 72px; height: 72px; background-color: #edf4ff; border-radius: 16px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("bell"))}" width="38" height="38" alt="" style="display: block; width: 38px; height: 38px; border: 0;" /></td></tr></table>
                          </td>
                          <td class="summary-copy-cell" valign="middle" style="word-break: break-word;">
                            <p class="email-text" style="margin: 0; color: #091a3a; font-size: 15px; line-height: 1.5; font-weight: 800;">${escapeHtml(input.previewText)}</p>
                            <p class="email-muted" style="margin: 5px 0 0; color: #52627b; font-size: 14px; line-height: 1.55;">${escapeHtml(skyscannerNote)}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlDeals}</table></td></tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width: 100%; background-color: #ffffff; border: 1px solid #e4ecf8; border-radius: 20px; border-collapse: separate; box-shadow: 0 12px 34px rgba(38, 83, 155, 0.08);">
                  <tr>
                    <td class="manage-pad" style="padding: 25px 30px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${input.subscriberEmail ? `<tr><td class="manage-icon" valign="middle" width="62" style="width: 62px; padding-right: 17px;"><table role="presentation" width="54" height="54" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 54px; height: 54px; background-color: #edf4ff; border-radius: 14px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("at"))}" width="31" height="31" alt="" style="display: block; width: 31px; height: 31px; border: 0;" /></td></tr></table></td><td class="manage-copy" colspan="2" valign="middle"><p class="email-muted" style="margin: 0; color: #52627b; font-size: 13px; line-height: 1.4;">${escapeHtml(copy.campaign.associatedWith)}</p><p class="account-email email-text" style="margin: 4px 0 0; color: #091a3a; font-size: 17px; line-height: 1.4; font-weight: 400;">${renderPlainEmailAddress(input.subscriberEmail)}</p></td></tr><tr><td colspan="3" style="height: 18px; border-bottom: 1px solid #dce7f6; font-size: 0; line-height: 0;">&nbsp;</td></tr>` : ""}
                        <tr>
                          <td class="manage-icon" valign="middle" width="62" style="width: 62px; padding: 18px 17px 0 0;"><table role="presentation" width="54" height="54" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 54px; height: 54px; background-color: #edf4ff; border-radius: 14px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("sliders"))}" width="31" height="31" alt="" style="display: block; width: 31px; height: 31px; border: 0;" /></td></tr></table></td>
                          <td class="manage-copy" valign="middle" style="padding-top: 18px;"><p class="email-text" style="margin: 0; color: #091a3a; font-size: 16px; line-height: 1.35; font-weight: 400;">${escapeHtml(copy.campaign.editTitle)}</p><p class="email-muted" style="margin: 4px 0 0; color: #52627b; font-size: 13px; line-height: 1.5;">${escapeHtml(copy.campaign.editBody)}</p></td>
                          <td class="manage-action" valign="middle" align="right" width="230" style="width: 230px; padding: 18px 0 0 16px;"><a href="${escapeHtml(input.managePreferencesUrl)}" style="display: inline-block; min-width: 190px; padding: 11px 16px; border-radius: 8px; background-color: #edf4ff; color: #1263e9; font-size: 13px; line-height: 17px; font-weight: 400; text-align: center; text-decoration: none; white-space: nowrap;">${escapeHtml(copy.campaign.editAction)}</a></td>
                        </tr>
                        <tr><td colspan="3" style="height: 18px; border-bottom: 1px solid #dce7f6; font-size: 0; line-height: 0;">&nbsp;</td></tr>
                        <tr>
                          <td class="manage-icon" valign="middle" width="62" style="width: 62px; padding: 18px 17px 0 0;"><table role="presentation" width="54" height="54" cellpadding="0" cellspacing="0" bgcolor="#edf4ff" style="width: 54px; height: 54px; background-color: #edf4ff; border-radius: 14px;"><tr><td align="center" valign="middle"><img src="${escapeHtml(iconUrl("close"))}" width="31" height="31" alt="" style="display: block; width: 31px; height: 31px; border: 0;" /></td></tr></table></td>
                          <td class="manage-copy" valign="middle" style="padding-top: 18px;"><p class="email-text" style="margin: 0; color: #091a3a; font-size: 16px; line-height: 1.35; font-weight: 400;">${escapeHtml(copy.campaign.unsubscribeTitle)}</p><p class="email-muted" style="margin: 4px 0 0; color: #52627b; font-size: 13px; line-height: 1.5;">${escapeHtml(copy.campaign.unsubscribeBody)}</p></td>
                          <td class="manage-action" valign="middle" align="right" width="230" style="width: 230px; padding: 18px 0 0 16px;"><a href="${escapeHtml(input.unsubscribeUrl)}" style="display: inline-block; min-width: 190px; padding: 11px 16px; border-radius: 8px; background-color: #edf4ff; color: #1263e9; font-size: 13px; line-height: 17px; font-weight: 400; text-align: center; text-decoration: none; white-space: nowrap;">${escapeHtml(copy.campaign.unsubscribeAction)}</a></td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 2px 12px 0;">
                <p class="footer-links email-muted" style="margin: 0; color: #52627b; font-size: 12px; line-height: 1.8;">
                  <a href="${escapeHtml(input.managePreferencesUrl)}" style="color: #1263e9; font-weight: 700; text-decoration: none;">${escapeHtml(copy.managePreferences)}</a>
                  &nbsp;·&nbsp; <a href="${escapeHtml(input.unsubscribeUrl)}" style="color: #1263e9; font-weight: 700; text-decoration: none;">${escapeHtml(copy.unsubscribe)}</a>
                  &nbsp;·&nbsp; <a href="${escapeHtml(siteUrl)}" style="color: #1263e9; font-weight: 700; text-decoration: none;">${BRAND_NAME}</a>
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
    skyscannerNote,
    `${copy.campaign.editAction}: ${input.managePreferencesUrl}`,
    "",
    ...input.deals.flatMap((deal) => [
      formatCampaignRouteLabel(deal),
      formatCampaignDealTitle(deal, locale),
      ...(formatCampaignDealPattern(deal, locale)
        ? [formatCampaignDealPattern(deal, locale) as string]
        : []),
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
      ...(deal.bookingUrl ? [`${copy.campaign.viewFlight}: ${deal.bookingUrl}`] : []),
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
  const heroImageUrl = versionEmailAsset(
    `${siteUrl}/${input.alreadyConfirmed ? "email-alerts-airport.jpg" : "email-airplane-window.jpg"}`,
  );
  const logoUrl = `${siteUrl}/v2-logo.png`;

  const html = `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(subject)}</title>
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      .email-body, .email-canvas { background-color: #eef4ff !important; }
      .email-card { background-color: #ffffff !important; }
      .email-card-soft, .email-icon { background-color: #f3f6fc !important; }
      .email-text { color: #091a3a !important; }
      .email-muted { color: #52627b !important; }
      .email-link { color: #174ed6 !important; }
      .email-divider { border-color: #dce4f1 !important; }
      .email-logo-plate { background-color: #ffffff !important; }
      .account-email a, .account-email [x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        pointer-events: none !important;
        cursor: text !important;
      }

      @media only screen and (max-width: 620px) {
        .email-body { padding: 16px 10px !important; }
        .email-shell { width: 100% !important; max-width: 100% !important; }
        .hero-copy-cell { width: 100% !important; padding: 38px 26px 40px !important; }
        .hero-image-cell, .hero-image {
          display: none !important;
          width: 0 !important;
          max-width: 0 !important;
          height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
          mso-hide: all !important;
        }
        .hero-title { font-size: 38px !important; line-height: 1.08 !important; }
        .card-pad { padding: 25px 22px !important; }
        .feature-icon-cell { width: 52px !important; padding-right: 14px !important; }
        .feature-icon { width: 46px !important; height: 46px !important; line-height: 46px !important; }
        .account-email { font-size: 17px !important; word-break: break-word !important; }
        .email-logo { width: 122px !important; max-width: 122px !important; }
        .footer-links a { display: inline-block !important; margin: 4px 5px !important; }
      }

      @media (prefers-color-scheme: dark) {
        .email-body, .email-canvas { background-color: #081321 !important; }
        .email-card { background-color: #111e31 !important; }
        .email-card-soft, .email-icon { background-color: #17263d !important; }
        .email-text { color: #f5f8ff !important; }
        .email-muted { color: #bac6d8 !important; }
        .email-link { color: #8eafff !important; }
        .email-divider { border-color: #2c3c55 !important; }
        .email-logo-plate { background-color: #ffffff !important; }
      }

      [data-ogsc] .email-body, [data-ogsc] .email-canvas { background-color: #081321 !important; }
      [data-ogsc] .email-card { background-color: #111e31 !important; }
      [data-ogsc] .email-card-soft, [data-ogsc] .email-icon { background-color: #17263d !important; }
      [data-ogsc] .email-text { color: #f5f8ff !important; }
      [data-ogsc] .email-muted { color: #bac6d8 !important; }
      [data-ogsc] .email-link { color: #8eafff !important; }
      [data-ogsc] .email-divider { border-color: #2c3c55 !important; }
      [data-ogsc] .email-logo-plate { background-color: #ffffff !important; }
    </style>
  </head>
  <body class="email-body" style="margin: 0; padding: 34px 16px; background-color: #eef4ff; color: #091a3a; font-family: Avenir Next, Segoe UI, Helvetica Neue, Arial, sans-serif; -webkit-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${escapeHtml(previewText)}</div>
    <table class="email-canvas" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef4ff" style="background-color: #eef4ff;">
      <tr>
        <td align="center">
          <table class="email-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 700px;">
            <tr>
              <td align="center" style="padding: 0 0 18px;">
                <table class="email-logo-plate" role="presentation" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border-radius: 12px;">
                  <tr>
                    <td style="padding: 8px 12px;">
                      <a href="${escapeHtml(siteUrl)}" style="text-decoration: none;">
                        <img class="email-logo" src="${escapeHtml(logoUrl)}" width="174" alt="${BRAND_NAME}" style="display: block; width: 174px; max-width: 100%; height: auto; border: 0;" />
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #dce4f1; border-radius: 22px; border-collapse: separate; overflow: hidden;">
                  <tr>
                    <td class="hero-copy-cell" valign="middle" width="62%" style="width: 62%; padding: 54px 38px 52px;">
                      <h1 class="hero-title email-text" style="margin: 0 0 34px; color: #091a3a; font-size: 46px; line-height: 1.08; font-weight: 500; letter-spacing: -0.035em; mso-line-height-rule: exactly;">${escapeHtml(headline)}</h1>
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" bgcolor="#ee312c" style="background-color: #ee312c; border-radius: 9px;">
                            <a href="${escapeHtml(primaryUrl)}" style="display: inline-block; padding: 16px 25px; color: #ffffff; font-size: 16px; line-height: 20px; font-weight: 700; text-decoration: none;">${escapeHtml(primaryLabel)}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td class="hero-image-cell" valign="middle" width="38%" style="width: 38%; padding: 0; background-color: #dce8f8;">
                      <img class="hero-image" src="${escapeHtml(heroImageUrl)}" width="266" height="356" alt="" style="display: block; width: 100%; max-width: 266px; height: 356px; border: 0; border-radius: 0 21px 21px 0; object-fit: cover;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 0 18px;">
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #dce4f1; border-radius: 22px; border-collapse: separate;">
                  <tr>
                    <td class="card-pad" style="padding: 30px 38px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="feature-icon-cell" valign="middle" width="64" style="width: 64px; padding-right: 18px;">
                            <div class="feature-icon email-icon email-link" style="width: 52px; height: 52px; border-radius: 16px; background-color: #f3f6fc; color: #174ed6; font-size: 21px; line-height: 52px; font-weight: 700; text-align: center;">@</div>
                          </td>
                          <td valign="middle">
                            <p class="email-muted" style="margin: 0; color: #52627b; font-size: 14px; line-height: 1.4;">${escapeHtml(welcome.linkedTo)}</p>
                            <p class="account-email email-text" style="margin: 5px 0 0; color: #091a3a; font-size: 19px; line-height: 1.35; font-weight: 800;">${renderPlainEmailAddress(input.email)}</p>
                          </td>
                        </tr>
                        <tr>
                          <td colspan="2" class="email-divider" style="height: 25px; border-bottom: 1px solid #dce4f1; font-size: 0; line-height: 0;">&nbsp;</td>
                        </tr>
                        <tr>
                          <td class="feature-icon-cell" valign="middle" width="64" style="width: 64px; padding: 25px 18px 0 0;">
                            <div class="feature-icon email-icon" style="width: 52px; height: 52px; border-radius: 16px; background-color: #f3f6fc; color: #174ed6; font-family: Apple Color Emoji, Segoe UI Emoji, sans-serif; font-size: 22px; line-height: 52px; font-weight: 700; text-align: center;">&#128276;</div>
                          </td>
                          <td valign="middle" style="padding-top: 25px;">
                            <p class="email-text" style="margin: 0; color: #091a3a; font-size: 18px; line-height: 1.35; font-weight: 800;">${escapeHtml(welcome.alertSetupTitle)}</p>
                            <p class="email-muted" style="margin: 6px 0 0; color: #52627b; font-size: 15px; line-height: 1.55;">${escapeHtml(input.alreadyConfirmed ? welcome.alertSetupBody : welcome.confirmBody)}</p>
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
                <table class="email-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color: #ffffff; border: 1px solid #dce4f1; border-radius: 22px; border-collapse: separate;">
                  <tr>
                    <td class="card-pad" style="padding: 27px 38px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="feature-icon-cell" valign="middle" width="64" style="width: 64px; padding-right: 18px;">
                            <div class="feature-icon email-icon email-link" style="width: 52px; height: 52px; border-radius: 16px; background-color: #f3f6fc; color: #174ed6; font-size: 20px; line-height: 52px; font-weight: 700; text-align: center;">×</div>
                          </td>
                          <td valign="middle">
                            <p class="email-text" style="margin: 0; color: #091a3a; font-size: 19px; line-height: 1.35; font-weight: 800;">${escapeHtml(welcome.notYouTitle)}</p>
                            <p class="email-muted" style="margin: 7px 0 0; color: #52627b; font-size: 14px; line-height: 1.55;">${escapeHtml(welcome.notYouBody)} <a class="email-link" href="${escapeHtml(input.unsubscribeUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${escapeHtml(welcome.unsubscribeNow)}</a></p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" class="email-divider" style="padding: 24px 16px 4px; border-top: 1px solid #dce4f1;">
                <p class="footer-links email-muted" style="margin: 0; color: #52627b; font-size: 12px; line-height: 1.8;">
                  <a class="email-link" href="${escapeHtml(input.managePreferencesUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${escapeHtml(copy.managePreferences)}</a>
                  &nbsp;·&nbsp; <a class="email-link" href="${escapeHtml(input.unsubscribeUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${escapeHtml(copy.unsubscribe)}</a>
                  &nbsp;·&nbsp; <a class="email-link" href="${escapeHtml(siteUrl)}" style="color: #174ed6; font-weight: 700; text-decoration: none;">${BRAND_NAME}</a>
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
