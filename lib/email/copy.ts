import "server-only";
import type { EditorialSectionKey } from "@/lib/editorial-sections";
import { BRAND_NAME } from "./format";

export const emailLocales = ["en", "fr", "de", "pt", "it", "es"] as const;

export type EmailLocale = (typeof emailLocales)[number];

type CampaignRouteCopy = {
  title: (destinationCity: string) => string;
  weekdays: Record<string, string>;
  nextPattern: (departure: string, arrival: string) => string;
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
  editorial: Record<
    EditorialSectionKey,
    { label: string; description: string }
  >;
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
      percent === null
        ? "below the recent baseline"
        : `${percent}% below the recent baseline`,
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
    multiSubject: (city, price, remaining) =>
      `${city} from ${price} + ${remaining} more fares`,
    singlePreview: (route, price) => `${route} at ${price}.`,
    multiPreview: (count, city, price) =>
      `${count} matching fares, led by ${city} at ${price}.`,
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
    timing: (label, departure, arrival) =>
      `${label}: ${departure} -> ${arrival}`,
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
    footerReason:
      "You are receiving this because you asked for Luxembourg flight deals matched to your route profile.",
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
        description:
          "The sharpest newly verified fares sitting well below their recent baseline.",
      },
      good_options_next_30_days: {
        label: "Good options for next 30 days",
        description:
          "Trips leaving soon enough to book now without waiting for a future season.",
      },
      best_weekend_escapes: {
        label: "Best weekend escapes",
        description:
          "Shorter Luxembourg trips of 2 to 4 nights built around the weekend.",
      },
      best_long_stays: {
        label: "Best long stays",
        description:
          "Longer trips above 4 nights that stretch into a more substantial break.",
      },
    },
    welcome: {
      confirmedSubject: `Your ${BRAND_NAME} links are ready`,
      pendingSubject: `Confirm your ${BRAND_NAME} subscription`,
      confirmedPreview: "Your private preferences link is ready.",
      pendingPreview: "Confirm your email and choose the alerts you want.",
      confirmedHeadline: "Tailor your travel alerts to your preferences.",
      pendingHeadline: "One more step before takeoff.",
      confirmedIntro:
        "We are sending your private access link again so you can update your alerts.",
      pendingIntro:
        "One quick confirmation finishes the double opt-in. Then you can tailor the feed to the trips you actually want.",
      linkedTo: "Linked to:",
      alertSetupTitle: "Your alert setup",
      alertSetupBody:
        "Choose the kind of flight deals you want to see and how often you hear from us.",
      confirmBody:
        "After confirming, edit your preferences to control destinations, budget, routing, and email cadence.",
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
    stops: {
      NON_STOP: "Vol direct uniquement",
      ONE_STOP_OR_FEWER: "Jusqu'a 1 escale",
    },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null
        ? "sous la reference recente"
        : `${percent} % sous la reference recente`,
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
    emptyDigestPreview:
      "Nouvelles baisses de prix depuis Luxembourg dans votre liste.",
    singleSubject: (city, price) => `${city} des ${price}`,
    multiSubject: (city, price, remaining) =>
      `${city} des ${price} + ${remaining} autres tarifs`,
    singlePreview: (route, price) => `${route} a ${price}.`,
    multiPreview: (count, city, price) =>
      `${count} tarifs compatibles, avec ${city} a ${price}.`,
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
    timing: (label, departure, arrival) =>
      `${label} : ${departure} -> ${arrival}`,
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
    footerReason:
      "Vous recevez cet email parce que vous avez demande des offres de vols depuis Luxembourg selon votre profil.",
    campaign: {
      belowReference: "sous votre référence",
      viewFlight: "Voir le vol",
      associatedWith: "Associé à",
      editTitle: "Modifier les préférences",
      editBody:
        "Ajustez les aéroports, les dates, les compagnies et les filtres de prix.",
      editAction: "Modifier mes préférences",
      unsubscribeTitle: "Vous ne souhaitez plus recevoir ces alertes ?",
      unsubscribeBody:
        "Vous pouvez désactiver ou supprimer cette alerte à tout moment.",
      unsubscribeAction: "Me désabonner",
    },
    editorial: {
      fresh_price_drops: {
        label: "Baisses de prix recentes",
        description:
          "Les tarifs verifies les plus nets sous leur reference recente.",
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
      pendingPreview:
        "Confirmez votre email et choisissez les alertes souhaitees.",
      confirmedHeadline: "Ajustez vos alertes de voyages à vos envies.",
      pendingHeadline: "Encore une étape avant le décollage.",
      confirmedIntro:
        "Nous vous renvoyons votre lien prive pour modifier vos alertes.",
      pendingIntro:
        "Une confirmation rapide termine le double opt-in. Vous pourrez ensuite regler le flux selon vos voyages.",
      linkedTo: "Associe a :",
      alertSetupTitle: "Configuration de vos alertes",
      alertSetupBody:
        "Choisissez les offres que vous voulez voir et la frequence de nos emails.",
      confirmBody:
        "Apres confirmation, modifiez vos preferences de destination, budget, itineraire et frequence.",
      primaryConfirmed: "Modifier mes preferences",
      primaryPending: "Confirmer l'inscription",
      preferencesLink: "Modifier mes preferences",
      notYouTitle: "Désabonnement instantané.",
      notYouBody:
        "Si ce n'etait pas vous, vous pouvez vous desabonner immediatement.",
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
    stops: {
      NON_STOP: "Nur Direktfluege",
      ONE_STOP_OR_FEWER: "Bis zu 1 Stopp",
    },
    unknownStops: (value) => value.replaceAll("_", " "),
    drop: (percent) =>
      percent === null
        ? "unter dem aktuellen Vergleichswert"
        : `${percent} % unter dem aktuellen Vergleichswert`,
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
    multiSubject: (city, price, remaining) =>
      `${city} ab ${price} + ${remaining} weitere Tarife`,
    singlePreview: (route, price) => `${route} fuer ${price}.`,
    multiPreview: (count, city, price) =>
      `${count} passende Tarife, angefuehrt von ${city} fuer ${price}.`,
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
    timing: (label, departure, arrival) =>
      `${label}: ${departure} -> ${arrival}`,
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
    footerReason:
      "Du erhaeltst diese E-Mail, weil du Flugangebote ab Luxemburg passend zu deinem Profil angefordert hast.",
    campaign: {
      belowReference: "unter deinem Vergleichswert",
      viewFlight: "Flug ansehen",
      associatedWith: "Verknüpft mit",
      editTitle: "Präferenzen ändern",
      editBody: "Passe Flughäfen, Daten, Airlines und Preisfilter an.",
      editAction: "Meine Präferenzen ändern",
      unsubscribeTitle: "Möchtest du diese Alerts nicht mehr erhalten?",
      unsubscribeBody:
        "Du kannst diesen Alert jederzeit deaktivieren oder löschen.",
      unsubscribeAction: "Abmelden",
    },
    editorial: {
      fresh_price_drops: {
        label: "Neue Preisrueckgaenge",
        description:
          "Die staerksten neu geprueften Tarife unter ihrem aktuellen Vergleichswert.",
      },
      good_options_next_30_days: {
        label: "Gute Optionen in den naechsten 30 Tagen",
        description: "Reisen, die bald genug starten, um jetzt zu buchen.",
      },
      best_weekend_escapes: {
        label: "Beste Wochenendtrips",
        description:
          "Kuerzere Reisen von 2 bis 4 Naechten rund ums Wochenende.",
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
      pendingPreview:
        "Bestaetige deine E-Mail und waehle deine gewuenschten Alerts.",
      confirmedHeadline: "Passe deine Reisealarme an deine Wünsche an.",
      pendingHeadline: "Noch ein Schritt bis zum Abflug.",
      confirmedIntro:
        "Wir senden dir deinen privaten Link erneut, damit du deine Alerts anpassen kannst.",
      pendingIntro:
        "Eine kurze Bestaetigung schliesst den Double-Opt-in ab. Danach passt du den Feed an deine Reisen an.",
      linkedTo: "Verknuepft mit:",
      alertSetupTitle: "Deine Alert-Einstellungen",
      alertSetupBody:
        "Waehle, welche Flugangebote du sehen moechtest und wie oft wir dich kontaktieren.",
      confirmBody:
        "Nach der Bestaetigung kannst du Ziele, Budget, Route und E-Mail-Rhythmus bearbeiten.",
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
    tagline:
      "Voos baratos a partir do Luxemburgo, pensados para viagens reais.",
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
      percent === null
        ? "abaixo da referencia recente"
        : `${percent}% abaixo da referencia recente`,
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
    emptyDigestPreview:
      "Novas quedas de preco da sua lista de voos do Luxemburgo.",
    singleSubject: (city, price) => `${city} desde ${price}`,
    multiSubject: (city, price, remaining) =>
      `${city} desde ${price} + ${remaining} tarifas`,
    singlePreview: (route, price) => `${route} por ${price}.`,
    multiPreview: (count, city, price) =>
      `${count} tarifas compativeis, com ${city} por ${price}.`,
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
    timing: (label, departure, arrival) =>
      `${label}: ${departure} -> ${arrival}`,
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
    footerReason:
      "Recebe este email porque pediu ofertas de voos do Luxemburgo de acordo com o seu perfil.",
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
        description:
          "As tarifas verificadas mais fortes abaixo da sua referencia recente.",
      },
      good_options_next_30_days: {
        label: "Boas opcoes nos proximos 30 dias",
        description: "Viagens proximas o suficiente para reservar agora.",
      },
      best_weekend_escapes: {
        label: "Melhores escapadas de fim de semana",
        description:
          "Viagens curtas de 2 a 4 noites em torno do fim de semana.",
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
      confirmedHeadline:
        "Ajuste os seus alertas de viagem às suas preferências.",
      pendingHeadline: "Só falta um passo para descolar.",
      confirmedIntro:
        "Enviamos novamente o seu link privado para poder atualizar os alertas.",
      pendingIntro:
        "Uma confirmacao rapida conclui o double opt-in. Depois podera ajustar o feed as suas viagens.",
      linkedTo: "Associado a:",
      alertSetupTitle: "Configuracao dos alertas",
      alertSetupBody:
        "Escolha que ofertas quer ver e com que frequencia quer receber emails.",
      confirmBody:
        "Depois de confirmar, edite destinos, orcamento, rotas e frequencia de email.",
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
      percent === null
        ? "sotto il riferimento recente"
        : `${percent}% sotto il riferimento recente`,
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
    emptyDigestPreview:
      "Nuovi cali di prezzo dalla tua lista voli dal Lussemburgo.",
    singleSubject: (city, price) => `${city} da ${price}`,
    multiSubject: (city, price, remaining) =>
      `${city} da ${price} + ${remaining} altre tariffe`,
    singlePreview: (route, price) => `${route} a ${price}.`,
    multiPreview: (count, city, price) =>
      `${count} tariffe compatibili, con ${city} a ${price}.`,
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
    timing: (label, departure, arrival) =>
      `${label}: ${departure} -> ${arrival}`,
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
    footerReason:
      "Ricevi questa email perche hai richiesto offerte voli dal Lussemburgo in base al tuo profilo.",
    campaign: {
      belowReference: "sotto il tuo riferimento",
      viewFlight: "Vedi volo",
      associatedWith: "Associato a",
      editTitle: "Modifica preferenze",
      editBody: "Modifica aeroporti, date, compagnie e filtri di prezzo.",
      editAction: "Modifica le mie preferenze",
      unsubscribeTitle: "Vuoi smettere di ricevere questi avvisi?",
      unsubscribeBody:
        "Puoi disattivare o eliminare questo avviso quando vuoi.",
      unsubscribeAction: "Annulla iscrizione",
    },
    editorial: {
      fresh_price_drops: {
        label: "Cali di prezzo recenti",
        description:
          "Le tariffe appena verificate piu forti sotto il riferimento recente.",
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
      confirmedIntro:
        "Ti inviamo di nuovo il link privato per aggiornare gli alert.",
      pendingIntro:
        "Una rapida conferma completa il double opt-in. Poi potrai adattare il feed ai tuoi viaggi.",
      linkedTo: "Collegato a:",
      alertSetupTitle: "Impostazioni alert",
      alertSetupBody:
        "Scegli che offerte vuoi vedere e con quale frequenza ricevere email.",
      confirmBody:
        "Dopo la conferma, modifica destinazioni, budget, itinerari e frequenza email.",
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
      percent === null
        ? "por debajo de la referencia reciente"
        : `${percent}% por debajo de la referencia reciente`,
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
    emptyDigestPreview:
      "Nuevas bajadas de precio desde Luxemburgo en tu lista.",
    singleSubject: (city, price) => `${city} desde ${price}`,
    multiSubject: (city, price, remaining) =>
      `${city} desde ${price} + ${remaining} tarifas mas`,
    singlePreview: (route, price) => `${route} por ${price}.`,
    multiPreview: (count, city, price) =>
      `${count} tarifas compatibles, empezando por ${city} a ${price}.`,
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
    timing: (label, departure, arrival) =>
      `${label}: ${departure} -> ${arrival}`,
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
    footerReason:
      "Recibes este email porque pediste ofertas de vuelos desde Luxemburgo adaptadas a tu perfil.",
    campaign: {
      belowReference: "por debajo de tu referencia",
      viewFlight: "Ver vuelo",
      associatedWith: "Asociado a",
      editTitle: "Modificar preferencias",
      editBody: "Ajusta aeropuertos, fechas, compañías y filtros de precio.",
      editAction: "Modificar mis preferencias",
      unsubscribeTitle: "¿Deseas dejar de recibir estas alertas?",
      unsubscribeBody:
        "Puedes desactivar o eliminar esta alerta cuando quieras.",
      unsubscribeAction: "Darme de baja",
    },
    editorial: {
      fresh_price_drops: {
        label: "Bajadas recientes",
        description:
          "Las tarifas verificadas mas fuertes por debajo de su referencia reciente.",
      },
      good_options_next_30_days: {
        label: "Buenas opciones en los proximos 30 dias",
        description:
          "Viajes suficientemente cercanos como para reservar ahora.",
      },
      best_weekend_escapes: {
        label: "Mejores escapadas de fin de semana",
        description:
          "Viajes cortos de 2 a 4 noches alrededor del fin de semana.",
      },
      best_long_stays: {
        label: "Mejores estancias largas",
        description:
          "Viajes de mas de 4 noches para una escapada mas completa.",
      },
    },
    welcome: {
      confirmedSubject: `Tus enlaces de ${BRAND_NAME} estan listos`,
      pendingSubject: `Confirma tu suscripcion a ${BRAND_NAME}`,
      confirmedPreview:
        "Tu enlace privado para editar preferencias esta listo.",
      pendingPreview:
        "Confirma tu email y elige las alertas que quieres recibir.",
      confirmedHeadline: "Ajusta tus alertas de viaje a tus preferencias.",
      pendingHeadline: "Solo falta un paso para despegar.",
      confirmedIntro:
        "Te enviamos otra vez tu enlace privado para que puedas actualizar tus alertas.",
      pendingIntro:
        "Una confirmacion rapida completa el double opt-in. Despues podras ajustar el feed a los viajes que realmente quieres.",
      linkedTo: "Vinculado a:",
      alertSetupTitle: "Configuracion de tus alertas",
      alertSetupBody:
        "Elige que ofertas quieres ver y con que frecuencia quieres que te escribamos.",
      confirmBody:
        "Despues de confirmar, edita destinos, presupuesto, rutas y frecuencia de emails.",
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

export const campaignRouteCopy: Record<EmailLocale, CampaignRouteCopy> = {
  en: {
    title: (destinationCity) => `Luxembourg to ${destinationCity}`,
    weekdays: {
      Mon: "Monday",
      Tue: "Tuesday",
      Wed: "Wednesday",
      Thu: "Thursday",
      Fri: "Friday",
      Sat: "Saturday",
      Sun: "Sunday",
    },
    nextPattern: (departure, arrival) => `${departure} -> ${arrival} next week`,
  },
  fr: {
    title: (destinationCity) => `Luxembourg vers ${destinationCity}`,
    weekdays: {
      Mon: "lundi",
      Tue: "mardi",
      Wed: "mercredi",
      Thu: "jeudi",
      Fri: "vendredi",
      Sat: "samedi",
      Sun: "dimanche",
    },
    nextPattern: (departure, arrival) =>
      `${departure} -> ${arrival} semaine prochaine`,
  },
  de: {
    title: (destinationCity) => `Luxemburg nach ${destinationCity}`,
    weekdays: {
      Mon: "Montag",
      Tue: "Dienstag",
      Wed: "Mittwoch",
      Thu: "Donnerstag",
      Fri: "Freitag",
      Sat: "Samstag",
      Sun: "Sonntag",
    },
    nextPattern: (departure, arrival) =>
      `${departure} -> ${arrival} nächste Woche`,
  },
  pt: {
    title: (destinationCity) => `Luxemburgo para ${destinationCity}`,
    weekdays: {
      Mon: "segunda-feira",
      Tue: "terça-feira",
      Wed: "quarta-feira",
      Thu: "quinta-feira",
      Fri: "sexta-feira",
      Sat: "sábado",
      Sun: "domingo",
    },
    nextPattern: (departure, arrival) =>
      `${departure} -> ${arrival} na próxima semana`,
  },
  it: {
    title: (destinationCity) => `Da Lussemburgo a ${destinationCity}`,
    weekdays: {
      Mon: "lunedì",
      Tue: "martedì",
      Wed: "mercoledì",
      Thu: "giovedì",
      Fri: "venerdì",
      Sat: "sabato",
      Sun: "domenica",
    },
    nextPattern: (departure, arrival) =>
      `${departure} -> ${arrival} della prossima settimana`,
  },
  es: {
    title: (destinationCity) => `Luxemburgo a ${destinationCity}`,
    weekdays: {
      Mon: "lunes",
      Tue: "martes",
      Wed: "miércoles",
      Thu: "jueves",
      Fri: "viernes",
      Sat: "sábado",
      Sun: "domingo",
    },
    nextPattern: (departure, arrival) =>
      `${departure} -> ${arrival} semana próxima`,
  },
};

export const multiCityAirportNames: Record<string, string> = {
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
  return emailLocales.includes(normalized as EmailLocale)
    ? (normalized as EmailLocale)
    : "en";
}

export function getCopy(locale?: EmailLocale | null) {
  return emailCopy[normalizeEmailLocale(locale)];
}
