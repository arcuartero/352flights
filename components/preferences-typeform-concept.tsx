"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { LandmarkPhoto } from "@/components/landmark-photo";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  bucketOptionMap,
  bucketValues,
  clockHourOptions,
  defaultPreferenceValues,
  deliveryModeOptions,
  deriveSelectedRoutesFromBuckets,
  maxStopsPreferenceOptions,
  weekdayOptions,
  type BucketValue,
  type DeliveryModeValue,
  type MaxStopsPreferenceValue,
  type PreferencesBundle,
  type WeekdayValue,
} from "@/lib/preferences-shared";

type ScreenState =
  | {
      phase: "idle";
      message: string;
    }
  | {
      phase: "success";
      message: string;
    }
  | {
      phase: "error";
      message: string;
    };

type PreferenceFormState = PreferencesBundle["form"];
type StepId = "recap" | "styles" | "timing" | "routing" | "comfort" | "delivery" | "review";

type StepCopy = {
  id: StepId;
  shortLabel: string;
  title: string;
  description: string;
};

const conceptStepVisuals: Record<StepId, { city: string; landmarkTitle: string }> = {
  recap: { city: "Luxembourg", landmarkTitle: "Pont Adolphe" },
  styles: { city: "Paris", landmarkTitle: "Eiffel Tower" },
  timing: { city: "Barcelona", landmarkTitle: "Sagrada Familia" },
  routing: { city: "London", landmarkTitle: "Big Ben" },
  comfort: { city: "Rome", landmarkTitle: "Colosseum" },
  delivery: { city: "Lisbon", landmarkTitle: "Belem Tower" },
  review: { city: "Porto", landmarkTitle: "Ribeira" },
};

type ConceptCopy = {
  initialMessage: string;
  missingTokenMessage: string;
  loadErrorMessage: string;
  saveErrorMessage: string;
  loadingMessage: string;
  completeStepMessage: string;
  savingMessage: string;
  savedMessage: string;
  backToHome: string;
  originalPreferencesPage: string;
  stepPrefix: string;
  recapLabels: {
    email: string;
    tripStyles: string;
    departureDays: string;
    routing: string;
    comfort: string;
    budget: string;
    emailCadence: string;
  };
  anyDay: string;
  noLimit: string;
  noMinimum: string;
  anyPrice: string;
  upToPrice: string;
  includedInFeed: string;
  tapToInclude: string;
  currentlyAccepted: string;
  tapToAllow: string;
  included: string;
  microcopyTiming: string;
  budgetPlaceholder: string;
  fieldLabels: {
    earliestDeparture: string;
    latestArrival: string;
    minimumStay: string;
    maxFare: string;
  };
  buttonBack: string;
  buttonModify: string;
  buttonContinue: string;
  buttonSave: string;
  buttonSaving: string;
  visualEyebrow: string;
  visualCaption: string;
  visualAlt: string;
  bucketLabels: Record<BucketValue, { label: string; description: string }>;
  routingLabels: Record<MaxStopsPreferenceValue, { label: string; description: string }>;
  deliveryLabels: Record<DeliveryModeValue, { label: string; description: string }>;
  weekdayLabels: Record<WeekdayValue, { shortLabel: string; label: string }>;
  steps: StepCopy[];
};

const conceptCopyByLocale: Record<Locale, ConceptCopy> = {
  en: {
    initialMessage: "Answer a few focused questions and we will shape a much cleaner Luxembourg flight feed for you.",
    missingTokenMessage: "This page still needs a valid preference token from the signup flow.",
    loadErrorMessage: "We could not load your preferences.",
    saveErrorMessage: "We could not save your preferences.",
    loadingMessage: "Loading your preferences...",
    completeStepMessage: "Complete this step first so the next recommendations stay coherent.",
    savingMessage: "Saving your travel profile...",
    savedMessage: "Preferences saved. Your Luxembourg profile is ready.",
    backToHome: "Home",
    originalPreferencesPage: "Original preferences page",
    stepPrefix: "Step",
    recapLabels: {
      email: "Email",
      tripStyles: "Trip styles",
      departureDays: "Departure days",
      routing: "Routing",
      comfort: "Comfort",
      budget: "Budget",
      emailCadence: "Email cadence",
    },
    anyDay: "Any day",
    noLimit: "No limit",
    noMinimum: "No minimum",
    anyPrice: "Any price",
    upToPrice: "Up to €{price}",
    includedInFeed: "Included in your feed",
    tapToInclude: "Tap to include",
    currentlyAccepted: "Currently accepted",
    tapToAllow: "Tap to allow",
    included: "Included",
    microcopyTiming: "Keep several days if your schedule changes from week to week. The feed will stay broader and still relevant.",
    budgetPlaceholder: "Leave blank for any price",
    fieldLabels: {
      earliestDeparture: "Earliest departure you still consider acceptable",
      latestArrival: "Latest arrival you still want on either leg",
      minimumStay: "Minimum useful time you want in destination",
      maxFare: "Maximum fare you want us to bother you with",
    },
    buttonBack: "Back",
    buttonModify: "Modify my preferences",
    buttonContinue: "Continue",
    buttonSave: "Save my preferences",
    buttonSaving: "Saving...",
    visualEyebrow: "Luxembourg departures",
    visualCaption: "Personalized fare alerts, aligned with the new design.",
    visualAlt: "Traveler looking through an airplane window",
    bucketLabels: {
      weekend: { label: "Weekend", description: "Trips of 2 to 4 nights that sit around the weekend from Luxembourg." },
      long_stay: { label: "Long stay", description: "Trips above 4 nights, usually stretching from one weekend to the next." },
    },
    routingLabels: {
      NON_STOP: { label: "Non-stop only", description: "Only show the cleanest itineraries from Luxembourg." },
      ONE_STOP_OR_FEWER: { label: "Up to 1 stop", description: "Balance convenience and price on most routes." },
      ANY: { label: "Any routing", description: "Prioritize price even if the itinerary gets messier." },
    },
    deliveryLabels: {
      daily_digest: { label: "Daily digest", description: "A regular shortlist when relevant fares appear." },
      flash_only: { label: "Flash alerts only", description: "Only the strongest drops and most urgent fares." },
      weekly_best_of: { label: "Weekly best-of", description: "One calmer roundup with the top routes of the week." },
    },
    weekdayLabels: {
      MON: { shortLabel: "Mon", label: "Monday" },
      TUE: { shortLabel: "Tue", label: "Tuesday" },
      WED: { shortLabel: "Wed", label: "Wednesday" },
      THU: { shortLabel: "Thu", label: "Thursday" },
      FRI: { shortLabel: "Fri", label: "Friday" },
      SAT: { shortLabel: "Sat", label: "Saturday" },
      SUN: { shortLabel: "Sun", label: "Sunday" },
    },
    steps: [
      { id: "recap", shortLabel: "Current profile", title: "Your personalized flight alerts are ready.", description: "Review the preferences already saved on your account. If you want to change them, continue into the step-by-step flow." },
      { id: "styles", shortLabel: "Trip style", title: "Start with the kinds of trips you actually want to see.", description: "Choose the travel rhythm that matches your life first. Everything else will narrow from there." },
      { id: "timing", shortLabel: "Weekdays", title: "Tell us which departure days feel realistic for you.", description: "This keeps the feed close to your calendar instead of sending pretty fares you would never book." },
      { id: "routing", shortLabel: "Routing", title: "Choose how clean or flexible each trip should feel.", description: "Some travelers want only direct flights. Others are happy with one stop if the saving is worth it." },
      { id: "comfort", shortLabel: "Comfort", title: "Protect your sleep, your arrival times, and your useful time on the ground.", description: "These comfort rules quietly remove the awkward itineraries before they ever reach your inbox." },
      { id: "delivery", shortLabel: "Budget & emails", title: "Set your budget ceiling and how often you want us to write.", description: "This is where the feed starts to feel personal rather than generic." },
      { id: "review", shortLabel: "Review", title: "Review the profile you are about to save.", description: "You can still fine-tune the advanced custom watches later. This flow focuses on the essentials." },
    ],
  },
  fr: {
    initialMessage: "Répondez à quelques questions ciblées et nous construirons un flux de vols depuis le Luxembourg beaucoup plus propre pour vous.",
    missingTokenMessage: "Cette page a encore besoin d’un lien de préférences valide issu de l’inscription.",
    loadErrorMessage: "Nous n’avons pas pu charger vos préférences.",
    saveErrorMessage: "Nous n’avons pas pu enregistrer vos préférences.",
    loadingMessage: "Chargement de vos préférences...",
    completeStepMessage: "Complétez d’abord cette étape pour garder les recommandations cohérentes.",
    savingMessage: "Enregistrement de votre profil voyage...",
    savedMessage: "Préférences enregistrées. Votre profil Luxembourg est prêt.",
    backToHome: "Accueil",
    originalPreferencesPage: "Page d’origine",
    stepPrefix: "Étape",
    recapLabels: { email: "Email", tripStyles: "Styles de voyage", departureDays: "Jours de départ", routing: "Itinéraire", comfort: "Confort", budget: "Budget", emailCadence: "Fréquence email" },
    anyDay: "N'importe quel jour",
    noLimit: "Aucune limite",
    noMinimum: "Aucun minimum",
    anyPrice: "Tout prix",
    upToPrice: "Jusqu’à {price} €",
    includedInFeed: "Inclus dans votre flux",
    tapToInclude: "Touchez pour inclure",
    currentlyAccepted: "Actuellement accepté",
    tapToAllow: "Touchez pour autoriser",
    included: "Inclus",
    microcopyTiming: "Gardez plusieurs jours si votre agenda change selon les semaines. Le flux restera plus large mais toujours utile.",
    budgetPlaceholder: "Laissez vide pour tout prix",
    fieldLabels: {
      earliestDeparture: "Départ le plus tôt encore acceptable",
      latestArrival: "Arrivée la plus tardive acceptable sur l’un des trajets",
      minimumStay: "Temps minimum utile sur place",
      maxFare: "Tarif maximum au-delà duquel vous ne voulez pas être alerté",
    },
    buttonBack: "Retour",
    buttonModify: "Modifier mes préférences",
    buttonContinue: "Continuer",
    buttonSave: "Enregistrer mes préférences",
    buttonSaving: "Enregistrement...",
    visualEyebrow: "Départs du Luxembourg",
    visualCaption: "Des alertes personnalisées, alignées sur le nouveau design.",
    visualAlt: "Voyageur regardant par le hublot d’un avion",
    bucketLabels: {
      weekend: { label: "Week-end", description: "Voyages de 2 à 4 nuits autour du week-end au départ du Luxembourg." },
      long_stay: { label: "Long séjour", description: "Voyages de plus de 4 nuits, souvent d’un week-end à l’autre." },
    },
    routingLabels: {
      NON_STOP: { label: "Vol direct uniquement", description: "Afficher uniquement les itinéraires les plus simples au départ du Luxembourg." },
      ONE_STOP_OR_FEWER: { label: "Jusqu’à 1 escale", description: "Équilibrer confort et prix sur la plupart des routes." },
      ANY: { label: "Tout itinéraire", description: "Privilégier le prix même si l’itinéraire est moins propre." },
    },
    deliveryLabels: {
      daily_digest: { label: "Digest quotidien", description: "Une shortlist régulière quand des tarifs pertinents apparaissent." },
      flash_only: { label: "Alertes flash uniquement", description: "Seulement les plus fortes baisses et les tarifs les plus urgents." },
      weekly_best_of: { label: "Best-of hebdomadaire", description: "Un récapitulatif plus calme avec les meilleurs itinéraires de la semaine." },
    },
    weekdayLabels: {
      MON: { shortLabel: "Lun", label: "Lundi" },
      TUE: { shortLabel: "Mar", label: "Mardi" },
      WED: { shortLabel: "Mer", label: "Mercredi" },
      THU: { shortLabel: "Jeu", label: "Jeudi" },
      FRI: { shortLabel: "Ven", label: "Vendredi" },
      SAT: { shortLabel: "Sam", label: "Samedi" },
      SUN: { shortLabel: "Dim", label: "Dimanche" },
    },
    steps: [
      { id: "recap", shortLabel: "Profil actuel", title: "Vos alertes vol personnalisées sont prêtes.", description: "Vérifiez les préférences déjà enregistrées sur votre compte. Si vous voulez les modifier, continuez dans le parcours guidé." },
      { id: "styles", shortLabel: "Style de voyage", title: "Commencez par les types de voyages que vous voulez vraiment voir.", description: "Choisissez d’abord le rythme de voyage qui correspond à votre vie. Le reste s’ajustera ensuite." },
      { id: "timing", shortLabel: "Jours", title: "Dites-nous quels jours de départ sont réalistes pour vous.", description: "Ainsi, le flux colle à votre calendrier au lieu d’envoyer de jolies offres que vous ne réserveriez jamais." },
      { id: "routing", shortLabel: "Itinéraire", title: "Choisissez à quel point chaque trajet doit rester simple ou flexible.", description: "Certains voyageurs veulent uniquement des vols directs. D’autres acceptent une escale si l’économie vaut le coup." },
      { id: "comfort", shortLabel: "Confort", title: "Protégez votre sommeil, vos horaires d’arrivée et votre temps utile sur place.", description: "Ces règles de confort retirent discrètement les itinéraires pénibles avant même qu’ils n’arrivent dans votre inbox." },
      { id: "delivery", shortLabel: "Budget et emails", title: "Définissez votre plafond de prix et la fréquence d’envoi.", description: "C’est ici que le flux commence à devenir personnel plutôt que générique." },
      { id: "review", shortLabel: "Révision", title: "Vérifiez le profil que vous allez enregistrer.", description: "Vous pourrez toujours affiner plus tard les règles avancées. Ce parcours reste concentré sur l’essentiel." },
    ],
  },
  de: {
    initialMessage: "Beantworte ein paar gezielte Fragen und wir formen daraus einen deutlich saubereren Flug-Feed ab Luxemburg.",
    missingTokenMessage: "Diese Seite benötigt noch einen gültigen Präferenz-Link aus dem Anmeldefluss.",
    loadErrorMessage: "Deine Präferenzen konnten nicht geladen werden.",
    saveErrorMessage: "Deine Präferenzen konnten nicht gespeichert werden.",
    loadingMessage: "Deine Präferenzen werden geladen...",
    completeStepMessage: "Schließe diesen Schritt zuerst ab, damit die nächsten Empfehlungen stimmig bleiben.",
    savingMessage: "Dein Reiseprofil wird gespeichert...",
    savedMessage: "Präferenzen gespeichert. Dein Luxemburg-Profil ist bereit.",
    backToHome: "Start",
    originalPreferencesPage: "Ursprüngliche Präferenzseite",
    stepPrefix: "Schritt",
    recapLabels: { email: "E-Mail", tripStyles: "Reisestile", departureDays: "Abflugtage", routing: "Routing", comfort: "Komfort", budget: "Budget", emailCadence: "E-Mail-Rhythmus" },
    anyDay: "Jeder Tag",
    noLimit: "Keine Grenze",
    noMinimum: "Kein Minimum",
    anyPrice: "Jeder Preis",
    upToPrice: "Bis zu €{price}",
    includedInFeed: "Im Feed enthalten",
    tapToInclude: "Tippen zum Hinzufügen",
    currentlyAccepted: "Aktuell erlaubt",
    tapToAllow: "Tippen zum Erlauben",
    included: "Enthalten",
    microcopyTiming: "Lass mehrere Tage aktiv, wenn sich dein Wochenplan oft ändert. So bleibt der Feed breiter und trotzdem relevant.",
    budgetPlaceholder: "Leer lassen für jeden Preis",
    fieldLabels: {
      earliestDeparture: "Früheste Abflugzeit, die für dich noch okay ist",
      latestArrival: "Späteste Ankunft, die du auf einer Strecke noch akzeptierst",
      minimumStay: "Mindestzeit, die du sinnvoll am Ziel verbringen willst",
      maxFare: "Maximaler Preis, bei dem wir dich noch benachrichtigen sollen",
    },
    buttonBack: "Zurück",
    buttonModify: "Meine Präferenzen ändern",
    buttonContinue: "Weiter",
    buttonSave: "Meine Präferenzen speichern",
    buttonSaving: "Speichern...",
    visualEyebrow: "Abflüge ab Luxemburg",
    visualCaption: "Personalisierte Alerts im neuen visuellen Stil.",
    visualAlt: "Reisender blickt aus einem Flugzeugfenster",
    bucketLabels: {
      weekend: { label: "Wochenende", description: "Reisen von 2 bis 4 Nächten rund um das Wochenende ab Luxemburg." },
      long_stay: { label: "Längerer Aufenthalt", description: "Reisen über 4 Nächte, oft von einem Wochenende bis zum nächsten." },
    },
    routingLabels: {
      NON_STOP: { label: "Nur Nonstop", description: "Nur die saubersten Verbindungen ab Luxemburg anzeigen." },
      ONE_STOP_OR_FEWER: { label: "Bis zu 1 Stopp", description: "Bequemlichkeit und Preis auf den meisten Strecken ausbalancieren." },
      ANY: { label: "Jedes Routing", description: "Preis priorisieren, auch wenn der Reiseweg unordentlicher wird." },
    },
    deliveryLabels: {
      daily_digest: { label: "Täglicher Digest", description: "Eine regelmäßige Shortlist, wenn relevante Tarife auftauchen." },
      flash_only: { label: "Nur Flash-Alerts", description: "Nur die stärksten Preisstürze und dringendsten Tarife." },
      weekly_best_of: { label: "Wöchentliches Best-of", description: "Eine ruhigere Zusammenfassung mit den besten Strecken der Woche." },
    },
    weekdayLabels: {
      MON: { shortLabel: "Mo", label: "Montag" },
      TUE: { shortLabel: "Di", label: "Dienstag" },
      WED: { shortLabel: "Mi", label: "Mittwoch" },
      THU: { shortLabel: "Do", label: "Donnerstag" },
      FRI: { shortLabel: "Fr", label: "Freitag" },
      SAT: { shortLabel: "Sa", label: "Samstag" },
      SUN: { shortLabel: "So", label: "Sonntag" },
    },
    steps: [
      { id: "recap", shortLabel: "Aktuelles Profil", title: "Deine personalisierten Flug-Alerts sind bereit.", description: "Prüfe die bereits gespeicherten Präferenzen. Wenn du sie ändern möchtest, gehe in den Schritt-für-Schritt-Ablauf." },
      { id: "styles", shortLabel: "Reisestil", title: "Starte mit den Reisearten, die du wirklich sehen willst.", description: "Wähle zuerst den Reiserhythmus, der zu deinem Leben passt. Alles andere wird danach enger gefiltert." },
      { id: "timing", shortLabel: "Wochentage", title: "Sag uns, welche Abflugtage für dich realistisch sind.", description: "So bleibt der Feed nah an deinem Kalender statt dir schöne Tarife zu schicken, die du nie buchen würdest." },
      { id: "routing", shortLabel: "Routing", title: "Wähle, wie sauber oder flexibel sich jede Reise anfühlen soll.", description: "Manche wollen nur Direktflüge. Andere akzeptieren einen Stopp, wenn die Ersparnis groß genug ist." },
      { id: "comfort", shortLabel: "Komfort", title: "Schütze deinen Schlaf, deine Ankunftszeiten und deine nutzbare Zeit vor Ort.", description: "Diese Komfortregeln entfernen die mühsamen Verbindungen, bevor sie überhaupt in deinem Postfach landen." },
      { id: "delivery", shortLabel: "Budget & E-Mails", title: "Lege dein Preislimit und die Versandfrequenz fest.", description: "Hier fühlt sich der Feed wirklich persönlich statt generisch an." },
      { id: "review", shortLabel: "Prüfen", title: "Prüfe das Profil, das du gleich speicherst.", description: "Die erweiterten Regeln kannst du später noch feinjustieren. Dieser Ablauf konzentriert sich auf das Wesentliche." },
    ],
  },
  pt: {
    initialMessage: "Responda a algumas perguntas objetivas e criaremos um feed de voos do Luxemburgo muito mais limpo para si.",
    missingTokenMessage: "Esta página ainda precisa de um link de preferências válido vindo do fluxo de registo.",
    loadErrorMessage: "Não foi possível carregar as suas preferências.",
    saveErrorMessage: "Não foi possível guardar as suas preferências.",
    loadingMessage: "A carregar as suas preferências...",
    completeStepMessage: "Conclua primeiro este passo para manter as recomendações coerentes.",
    savingMessage: "A guardar o seu perfil de viagem...",
    savedMessage: "Preferências guardadas. O seu perfil do Luxemburgo está pronto.",
    backToHome: "Início",
    originalPreferencesPage: "Página original de preferências",
    stepPrefix: "Passo",
    recapLabels: { email: "Email", tripStyles: "Estilos de viagem", departureDays: "Dias de partida", routing: "Roteiro", comfort: "Conforto", budget: "Orçamento", emailCadence: "Frequência de email" },
    anyDay: "Qualquer dia",
    noLimit: "Sem limite",
    noMinimum: "Sem mínimo",
    anyPrice: "Qualquer preço",
    upToPrice: "Até €{price}",
    includedInFeed: "Incluído no seu feed",
    tapToInclude: "Toque para incluir",
    currentlyAccepted: "Atualmente aceite",
    tapToAllow: "Toque para permitir",
    included: "Incluído",
    microcopyTiming: "Mantenha vários dias se a sua agenda muda de semana para semana. O feed fica mais amplo e ainda relevante.",
    budgetPlaceholder: "Deixe em branco para qualquer preço",
    fieldLabels: {
      earliestDeparture: "Partida mais cedo que ainda considera aceitável",
      latestArrival: "Chegada mais tarde que ainda aceita em qualquer trecho",
      minimumStay: "Tempo mínimo útil que quer no destino",
      maxFare: "Tarifa máxima com a qual ainda quer ser incomodado",
    },
    buttonBack: "Voltar",
    buttonModify: "Modificar as minhas preferências",
    buttonContinue: "Continuar",
    buttonSave: "Guardar as minhas preferências",
    buttonSaving: "A guardar...",
    visualEyebrow: "Partidas do Luxemburgo",
    visualCaption: "Alertas personalizados, alinhados com o novo design.",
    visualAlt: "Viajante a olhar pela janela do avião",
    bucketLabels: {
      weekend: { label: "Fim de semana", description: "Viagens de 2 a 4 noites à volta do fim de semana a partir do Luxemburgo." },
      long_stay: { label: "Estadia longa", description: "Viagens acima de 4 noites, normalmente de um fim de semana ao outro." },
    },
    routingLabels: {
      NON_STOP: { label: "Só voos diretos", description: "Mostrar apenas os itinerários mais limpos a partir do Luxemburgo." },
      ONE_STOP_OR_FEWER: { label: "Até 1 escala", description: "Equilibrar conveniência e preço na maioria das rotas." },
      ANY: { label: "Qualquer roteiro", description: "Dar prioridade ao preço mesmo que o itinerário fique mais confuso." },
    },
    deliveryLabels: {
      daily_digest: { label: "Resumo diário", description: "Uma shortlist regular quando aparecem tarifas relevantes." },
      flash_only: { label: "Só alertas flash", description: "Apenas as quedas mais fortes e as tarifas mais urgentes." },
      weekly_best_of: { label: "Melhores da semana", description: "Um resumo mais calmo com as melhores rotas da semana." },
    },
    weekdayLabels: {
      MON: { shortLabel: "Seg", label: "Segunda-feira" },
      TUE: { shortLabel: "Ter", label: "Terça-feira" },
      WED: { shortLabel: "Qua", label: "Quarta-feira" },
      THU: { shortLabel: "Qui", label: "Quinta-feira" },
      FRI: { shortLabel: "Sex", label: "Sexta-feira" },
      SAT: { shortLabel: "Sáb", label: "Sábado" },
      SUN: { shortLabel: "Dom", label: "Domingo" },
    },
    steps: [
      { id: "recap", shortLabel: "Perfil atual", title: "Os seus alertas personalizados de voos estão prontos.", description: "Reveja as preferências já guardadas na sua conta. Se quiser alterá-las, continue no fluxo guiado." },
      { id: "styles", shortLabel: "Estilo de viagem", title: "Comece pelos tipos de viagens que realmente quer ver.", description: "Escolha primeiro o ritmo de viagem que combina com a sua vida. O resto afunila depois." },
      { id: "timing", shortLabel: "Dias", title: "Diga-nos quais os dias de partida realistas para si.", description: "Assim o feed fica próximo do seu calendário, em vez de enviar tarifas bonitas que nunca reservaria." },
      { id: "routing", shortLabel: "Roteiro", title: "Escolha quão limpo ou flexível cada trajeto deve ser.", description: "Alguns viajantes querem apenas voos diretos. Outros aceitam uma escala se a poupança compensar." },
      { id: "comfort", shortLabel: "Conforto", title: "Proteja o seu sono, as horas de chegada e o tempo útil no destino.", description: "Estas regras de conforto removem discretamente os itinerários incómodos antes mesmo de chegarem ao seu email." },
      { id: "delivery", shortLabel: "Orçamento e emails", title: "Defina o seu teto de preço e a frequência com que quer receber emails.", description: "É aqui que o feed começa a parecer pessoal em vez de genérico." },
      { id: "review", shortLabel: "Revisão", title: "Reveja o perfil que está prestes a guardar.", description: "Mais tarde poderá afinar regras avançadas. Este fluxo mantém-se focado no essencial." },
    ],
  },
  it: {
    initialMessage: "Rispondi a poche domande mirate e costruiremo un feed di voli dal Lussemburgo molto più pulito per te.",
    missingTokenMessage: "Questa pagina ha ancora bisogno di un link preferenze valido dal flusso di iscrizione.",
    loadErrorMessage: "Non siamo riusciti a caricare le tue preferenze.",
    saveErrorMessage: "Non siamo riusciti a salvare le tue preferenze.",
    loadingMessage: "Caricamento delle tue preferenze...",
    completeStepMessage: "Completa prima questo passaggio così le prossime raccomandazioni restano coerenti.",
    savingMessage: "Salvataggio del tuo profilo di viaggio...",
    savedMessage: "Preferenze salvate. Il tuo profilo Lussemburgo è pronto.",
    backToHome: "Home",
    originalPreferencesPage: "Pagina preferenze originale",
    stepPrefix: "Passo",
    recapLabels: { email: "Email", tripStyles: "Stili di viaggio", departureDays: "Giorni di partenza", routing: "Instradamento", comfort: "Comfort", budget: "Budget", emailCadence: "Frequenza email" },
    anyDay: "Qualsiasi giorno",
    noLimit: "Nessun limite",
    noMinimum: "Nessun minimo",
    anyPrice: "Qualsiasi prezzo",
    upToPrice: "Fino a €{price}",
    includedInFeed: "Incluso nel tuo feed",
    tapToInclude: "Tocca per includere",
    currentlyAccepted: "Attualmente accettato",
    tapToAllow: "Tocca per consentire",
    included: "Incluso",
    microcopyTiming: "Mantieni più giorni se il tuo calendario cambia di settimana in settimana. Il feed resterà più ampio ma ancora rilevante.",
    budgetPlaceholder: "Lascia vuoto per qualsiasi prezzo",
    fieldLabels: {
      earliestDeparture: "Partenza più presto che consideri ancora accettabile",
      latestArrival: "Arrivo più tardi che vuoi accettare su una tratta",
      minimumStay: "Tempo minimo utile che vuoi a destinazione",
      maxFare: "Tariffa massima per cui vuoi ancora essere avvisato",
    },
    buttonBack: "Indietro",
    buttonModify: "Modifica le mie preferenze",
    buttonContinue: "Continua",
    buttonSave: "Salva le mie preferenze",
    buttonSaving: "Salvataggio...",
    visualEyebrow: "Partenze dal Lussemburgo",
    visualCaption: "Avvisi personalizzati, allineati al nuovo design.",
    visualAlt: "Viaggiatore che guarda dal finestrino di un aereo",
    bucketLabels: {
      weekend: { label: "Weekend", description: "Viaggi da 2 a 4 notti intorno al weekend in partenza dal Lussemburgo." },
      long_stay: { label: "Soggiorno lungo", description: "Viaggi oltre 4 notti, spesso da un weekend all’altro." },
    },
    routingLabels: {
      NON_STOP: { label: "Solo diretti", description: "Mostra solo gli itinerari più puliti dal Lussemburgo." },
      ONE_STOP_OR_FEWER: { label: "Fino a 1 scalo", description: "Bilancia comodità e prezzo sulla maggior parte delle rotte." },
      ANY: { label: "Qualsiasi instradamento", description: "Dai priorità al prezzo anche se l’itinerario è meno lineare." },
    },
    deliveryLabels: {
      daily_digest: { label: "Digest giornaliero", description: "Una shortlist regolare quando compaiono tariffe rilevanti." },
      flash_only: { label: "Solo alert flash", description: "Solo i cali più forti e le tariffe più urgenti." },
      weekly_best_of: { label: "Best of settimanale", description: "Un riepilogo più calmo con le migliori rotte della settimana." },
    },
    weekdayLabels: {
      MON: { shortLabel: "Lun", label: "Lunedì" },
      TUE: { shortLabel: "Mar", label: "Martedì" },
      WED: { shortLabel: "Mer", label: "Mercoledì" },
      THU: { shortLabel: "Gio", label: "Giovedì" },
      FRI: { shortLabel: "Ven", label: "Venerdì" },
      SAT: { shortLabel: "Sab", label: "Sabato" },
      SUN: { shortLabel: "Dom", label: "Domenica" },
    },
    steps: [
      { id: "recap", shortLabel: "Profilo attuale", title: "I tuoi alert voli personalizzati sono pronti.", description: "Rivedi le preferenze già salvate nel tuo account. Se vuoi cambiarle, continua nel flusso guidato." },
      { id: "styles", shortLabel: "Stile di viaggio", title: "Parti dai tipi di viaggio che vuoi davvero vedere.", description: "Scegli prima il ritmo di viaggio che si adatta alla tua vita. Tutto il resto si restringerà da lì." },
      { id: "timing", shortLabel: "Giorni", title: "Dicci quali giorni di partenza sono realistici per te.", description: "Così il feed resta vicino al tuo calendario invece di mandarti tariffe belle che non prenoteresti mai." },
      { id: "routing", shortLabel: "Instradamento", title: "Scegli quanto pulito o flessibile deve essere ogni viaggio.", description: "Alcuni vogliono solo voli diretti. Altri accettano uno scalo se il risparmio vale la pena." },
      { id: "comfort", shortLabel: "Comfort", title: "Proteggi il sonno, gli orari di arrivo e il tempo utile sul posto.", description: "Queste regole di comfort eliminano in silenzio gli itinerari scomodi prima ancora che arrivino nella tua inbox." },
      { id: "delivery", shortLabel: "Budget ed email", title: "Imposta il tuo tetto di prezzo e la frequenza con cui vuoi riceverci.", description: "È qui che il feed comincia a sembrare personale invece che generico." },
      { id: "review", shortLabel: "Riepilogo", title: "Rivedi il profilo che stai per salvare.", description: "Potrai sempre rifinire più tardi le regole avanzate. Questo flusso resta focalizzato sull’essenziale." },
    ],
  },
  es: {
    initialMessage: "Responde unas pocas preguntas concretas y te dejaremos un feed de vuelos desde Luxemburgo mucho más limpio.",
    missingTokenMessage: "Esta página todavía necesita un enlace de preferencias válido del flujo de alta.",
    loadErrorMessage: "No hemos podido cargar tus preferencias.",
    saveErrorMessage: "No hemos podido guardar tus preferencias.",
    loadingMessage: "Cargando tus preferencias...",
    completeStepMessage: "Completa primero este paso para que las siguientes recomendaciones sigan siendo coherentes.",
    savingMessage: "Guardando tu perfil de viaje...",
    savedMessage: "Preferencias guardadas. Tu perfil de Luxemburgo está listo.",
    backToHome: "Inicio",
    originalPreferencesPage: "Página original de preferencias",
    stepPrefix: "Paso",
    recapLabels: { email: "Email", tripStyles: "Estilos de viaje", departureDays: "Días de salida", routing: "Escalas", comfort: "Comodidad", budget: "Presupuesto", emailCadence: "Frecuencia de email" },
    anyDay: "Cualquier día",
    noLimit: "Sin límite",
    noMinimum: "Sin mínimo",
    anyPrice: "Cualquier precio",
    upToPrice: "Hasta €{price}",
    includedInFeed: "Incluido en tu feed",
    tapToInclude: "Toca para incluir",
    currentlyAccepted: "Aceptado ahora",
    tapToAllow: "Toca para permitir",
    included: "Incluido",
    microcopyTiming: "Mantén varios días si tu agenda cambia de una semana a otra. El feed seguirá siendo más amplio y aun así relevante.",
    budgetPlaceholder: "Déjalo vacío para cualquier precio",
    fieldLabels: {
      earliestDeparture: "Salida más temprana que todavía te parece aceptable",
      latestArrival: "Llegada más tardía que aún aceptarías en cualquier tramo",
      minimumStay: "Tiempo mínimo útil que quieres en destino",
      maxFare: "Tarifa máxima por la que todavía quieres que te avisemos",
    },
    buttonBack: "Volver",
    buttonModify: "Modificar mis preferencias",
    buttonContinue: "Continuar",
    buttonSave: "Guardar mis preferencias",
    buttonSaving: "Guardando...",
    visualEyebrow: "Salidas desde Luxemburgo",
    visualCaption: "Alertas personalizadas, alineadas con el nuevo diseño.",
    visualAlt: "Viajero mirando por la ventana de un avión",
    bucketLabels: {
      weekend: { label: "Fin de semana", description: "Viajes de 2 a 4 noches alrededor del fin de semana desde Luxemburgo." },
      long_stay: { label: "Estancia larga", description: "Viajes de más de 4 noches, normalmente de un fin de semana al siguiente." },
    },
    routingLabels: {
      NON_STOP: { label: "Solo directos", description: "Mostrar solo los itinerarios más limpios desde Luxemburgo." },
      ONE_STOP_OR_FEWER: { label: "Hasta 1 escala", description: "Equilibrar comodidad y precio en la mayoría de rutas." },
      ANY: { label: "Cualquier itinerario", description: "Priorizar el precio aunque el itinerario sea más incómodo." },
    },
    deliveryLabels: {
      daily_digest: { label: "Resumen diario", description: "Una shortlist regular cuando aparecen tarifas relevantes." },
      flash_only: { label: "Solo alertas flash", description: "Solo las bajadas más fuertes y las tarifas más urgentes." },
      weekly_best_of: { label: "Lo mejor de la semana", description: "Un resumen más calmado con las mejores rutas de la semana." },
    },
    weekdayLabels: {
      MON: { shortLabel: "Lun", label: "Lunes" },
      TUE: { shortLabel: "Mar", label: "Martes" },
      WED: { shortLabel: "Mié", label: "Miércoles" },
      THU: { shortLabel: "Jue", label: "Jueves" },
      FRI: { shortLabel: "Vie", label: "Viernes" },
      SAT: { shortLabel: "Sáb", label: "Sábado" },
      SUN: { shortLabel: "Dom", label: "Domingo" },
    },
    steps: [
      { id: "recap", shortLabel: "Perfil actual", title: "Tus alertas de vuelos personalizadas están listas.", description: "Revisa las preferencias ya guardadas en tu cuenta. Si quieres cambiarlas, continúa en el flujo paso a paso." },
      { id: "styles", shortLabel: "Estilo de viaje", title: "Empieza por los tipos de viajes que de verdad quieres ver.", description: "Elige primero el ritmo de viaje que encaja con tu vida. Todo lo demás se ajustará a partir de ahí." },
      { id: "timing", shortLabel: "Días", title: "Cuéntanos qué días de salida son realistas para ti.", description: "Así el feed se acerca a tu calendario y no te manda tarifas bonitas que nunca reservarías." },
      { id: "routing", shortLabel: "Escalas", title: "Elige lo limpio o flexible que debe sentirse cada viaje.", description: "Hay viajeros que quieren solo vuelos directos. Otros aceptan una escala si el ahorro compensa." },
      { id: "comfort", shortLabel: "Comodidad", title: "Protege tu sueño, tus horarios de llegada y tu tiempo útil en destino.", description: "Estas reglas de comodidad eliminan en silencio los itinerarios incómodos antes de que lleguen a tu bandeja." },
      { id: "delivery", shortLabel: "Presupuesto y emails", title: "Define tu techo de precio y con qué frecuencia quieres recibirnos.", description: "Aquí es donde el feed empieza a sentirse personal en lugar de genérico." },
      { id: "review", shortLabel: "Revisión", title: "Revisa el perfil que estás a punto de guardar.", description: "Más adelante podrás afinar reglas avanzadas. Este flujo se centra en lo esencial." },
    ],
  },
};

function toggleSelection<T extends string>(values: T[], value: T, checked: boolean) {
  if (checked) {
    return [...values, value].filter((entry, index, items) => items.indexOf(entry) === index);
  }

  return values.filter((entry) => entry !== value);
}

function toNumberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function buildConceptFormState(bundle: PreferencesBundle): PreferenceFormState {
  const preferredBuckets =
    bundle.form.preferredBuckets.length > 0
      ? bundle.form.preferredBuckets
      : defaultPreferenceValues.preferredBuckets;

  return {
    ...bundle.form,
    preferredBuckets,
    selectedRoutes: deriveSelectedRoutesFromBuckets(preferredBuckets),
    maxStopsPreferences:
      bundle.form.maxStopsPreferences.length > 0
        ? bundle.form.maxStopsPreferences
        : defaultPreferenceValues.maxStopsPreferences,
    departureWeekdays:
      bundle.form.departureWeekdays.length > 0
        ? bundle.form.departureWeekdays
        : defaultPreferenceValues.departureWeekdays,
    deliveryModes:
      bundle.form.deliveryModes.length > 0
        ? bundle.form.deliveryModes
        : defaultPreferenceValues.deliveryModes,
    minTripNights: null,
    maxTripNights: null,
  };
}

function formatHour(hour: number | null, copy: ConceptCopy) {
  if (hour === null) {
    return copy.noLimit;
  }

  return `${String(hour).padStart(2, "0")}:00`;
}

function formatWeekdays(values: WeekdayValue[], copy: ConceptCopy) {
  if (values.length === weekdayOptions.length) {
    return copy.anyDay;
  }

  return values
    .map((value) => copy.weekdayLabels[value].shortLabel)
    .join(", ");
}

function formatDeliveryModes(values: DeliveryModeValue[], copy: ConceptCopy) {
  return values
    .map((value) => copy.deliveryLabels[value].label)
    .join(", ");
}

function formatMinimumStayOption(hours: number, locale: Locale) {
  switch (locale) {
    case "fr":
      return `Au moins ${hours}h`;
    case "de":
      return `Mindestens ${hours}h`;
    case "pt":
      return `Pelo menos ${hours}h`;
    case "it":
      return `Almeno ${hours}h`;
    case "es":
      return `Al menos ${hours}h`;
    default:
      return `At least ${hours}h`;
  }
}

function formatMinimumStaySummary(hours: number | null, locale: Locale, copy: ConceptCopy) {
  if (hours === null) {
    return copy.noMinimum;
  }

  switch (locale) {
    case "fr":
      return `${hours}h sur place`;
    case "de":
      return `${hours}h am Ziel`;
    case "pt":
      return `${hours}h no destino`;
    case "it":
      return `${hours}h a destinazione`;
    case "es":
      return `${hours}h en destino`;
    default:
      return `${hours}h in destination`;
  }
}

function formatComfortSummary(
  earliestDepartureHour: number | null,
  latestArrivalHour: number | null,
  locale: Locale,
  copy: ConceptCopy,
) {
  const earliest = formatHour(earliestDepartureHour, copy);
  const latest = formatHour(latestArrivalHour, copy);

  switch (locale) {
    case "fr":
      return `Départ après ${earliest} · arrivée avant ${latest}`;
    case "de":
      return `Abflug nach ${earliest} · Ankunft bis ${latest}`;
    case "pt":
      return `Partida depois de ${earliest} · chegada até ${latest}`;
    case "it":
      return `Partenza dopo le ${earliest} · arrivo entro le ${latest}`;
    case "es":
      return `Salida después de las ${earliest} · llegada antes de las ${latest}`;
    default:
      return `Depart after ${earliest} · arrive by ${latest}`;
  }
}

export function PreferencesTypeformConcept() {
  const { locale } = useI18n();
  const copy = conceptCopyByLocale[locale];
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [bundle, setBundle] = useState<PreferencesBundle | null>(null);
  const [form, setForm] = useState<PreferenceFormState>(defaultPreferenceValues);
  const [screen, setScreen] = useState<ScreenState>({
    phase: "idle",
    message: copy.initialMessage,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  const conceptSteps = copy.steps;

  useEffect(() => {
    let isActive = true;

    async function loadPreferences() {
      if (!token) {
        setIsLoading(false);
        setScreen({
          phase: "error",
          message: copy.missingTokenMessage,
        });
        return;
      }

      setIsLoading(true);
      setScreen({ phase: "idle", message: copy.initialMessage });

      try {
        const response = await fetch(`/api/preferences?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as PreferencesBundle & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? copy.loadErrorMessage);
        }

        if (!isActive) {
          return;
        }

        setBundle(payload);
        setForm(buildConceptFormState(payload));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setScreen({
          phase: "error",
          message:
            error instanceof Error
              ? error.message
              : copy.loadErrorMessage,
        });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadPreferences();

    return () => {
      isActive = false;
    };
  }, [copy.initialMessage, copy.loadErrorMessage, copy.missingTokenMessage, token]);

  const currentStep = conceptSteps[currentStepIndex];
  const currentStepVisual = conceptStepVisuals[currentStep.id];

  const canContinue = useMemo(() => {
    switch (currentStep.id) {
      case "styles":
        return form.preferredBuckets.length > 0;
      case "timing":
        return form.departureWeekdays.length > 0;
      case "routing":
        return form.maxStopsPreferences.length > 0;
      case "delivery":
        return form.deliveryModes.length > 0;
      default:
        return true;
    }
  }, [currentStep.id, form.departureWeekdays.length, form.deliveryModes.length, form.maxStopsPreferences.length, form.preferredBuckets.length]);

  function moveToStep(index: number) {
    setCurrentStepIndex(Math.min(Math.max(index, 0), conceptSteps.length - 1));
  }

  function goNext() {
    if (!canContinue) {
      setScreen({
        phase: "error",
        message: copy.completeStepMessage,
      });
      return;
    }

    setScreen({ phase: "idle", message: copy.initialMessage });
    setIsEditing(true);
    moveToStep(currentStepIndex + 1);
  }

  function savePreferences() {
    if (!bundle) {
      return;
    }

    startTransition(async () => {
      setScreen({
        phase: "idle",
        message: copy.savingMessage,
      });

      try {
        const response = await fetch("/api/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: bundle.token,
            preferredBuckets: form.preferredBuckets,
            selectedRoutes: deriveSelectedRoutesFromBuckets(form.preferredBuckets),
            maxStopsPreferences: form.maxStopsPreferences,
            departureWeekdays: form.departureWeekdays,
            minTripNights: null,
            maxTripNights: null,
            budgetCeilingEur: form.budgetCeilingEur,
            earliestDepartureHour: form.earliestDepartureHour,
            latestArrivalHour: form.latestArrivalHour,
            minDestinationStayHours: form.minDestinationStayHours,
            deliveryModes: form.deliveryModes,
            customAlertRules: form.customAlertRules,
          }),
        });

        const payload = (await response.json()) as { message?: string; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? copy.saveErrorMessage);
        }

        setScreen({
          phase: "success",
          message:
                  payload.message ?? copy.savedMessage,
        });
      } catch (error) {
        setScreen({
          phase: "error",
          message:
            error instanceof Error ? error.message : copy.loadErrorMessage,
        });
      }
    });
  }

  if (isLoading) {
    return (
      <section className="preferences-concept">
        <div className="preferences-concept__empty">
          <p>{copy.loadingMessage}</p>
        </div>
      </section>
    );
  }

  if (!token || !bundle) {
    return (
      <section className="preferences-concept">
        <div className="preferences-concept__empty preferences-concept__empty--stacked">
          <p className="preferences-status preferences-status--error">{screen.message}</p>
          <div className="preferences-link-row">
            <Link className="preferences-link" href="/">
              {copy.backToHome}
            </Link>
            <Link className="preferences-link preferences-link--ghost" href="/preferences">
              {copy.originalPreferencesPage}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const preferencesBundle = bundle;

  function renderStepBody() {
    switch (currentStep.id) {
      case "recap":
        return (
          <div className="preferences-concept__answers preferences-concept__answers--summary">
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.email}</span>
              <strong>{preferencesBundle.email}</strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.tripStyles}</span>
              <strong>
                {form.preferredBuckets.map((bucket) => copy.bucketLabels[bucket].label).join(" + ")}
              </strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.departureDays}</span>
              <strong>{formatWeekdays(form.departureWeekdays, copy)}</strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.routing}</span>
              <strong>
                {form.maxStopsPreferences.map((value) => copy.routingLabels[value].label).join(", ")}
              </strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.comfort}</span>
              <strong>
                {`${formatHour(form.earliestDepartureHour, copy)} · ${formatHour(form.latestArrivalHour, copy)}`}
              </strong>
              <p>
                {copy.fieldLabels.minimumStay}:{" "}
                {formatMinimumStaySummary(form.minDestinationStayHours, locale, copy)}
              </p>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.budget}</span>
              <strong>
                {form.budgetCeilingEur === null
                  ? copy.anyPrice
                  : copy.upToPrice.replace("{price}", String(form.budgetCeilingEur))}
              </strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.emailCadence}</span>
              <strong>{formatDeliveryModes(form.deliveryModes, copy)}</strong>
            </article>
          </div>
        );
      case "styles":
        return (
          <div className="preferences-concept__answers preferences-concept__answers--cards">
            {bucketValues.map((bucket) => {
              const checked = form.preferredBuckets.includes(bucket);
              const option = copy.bucketLabels[bucket];

              return (
                <button
                  aria-pressed={checked}
                  className={`preferences-concept__option-card ${checked ? "is-selected" : ""}`}
                  key={bucket}
                  onClick={() => {
                    setForm((current) => {
                      const preferredBuckets = toggleSelection(
                        current.preferredBuckets,
                        bucket,
                        !checked,
                      );

                      return {
                        ...current,
                        preferredBuckets,
                        selectedRoutes: deriveSelectedRoutesFromBuckets(preferredBuckets),
                      };
                    });
                  }}
                  type="button"
                >
                  <span className={`preferences-concept__check ${checked ? "is-selected" : ""}`} aria-hidden="true">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <span>{option.label}</span>
                  <strong>{checked ? copy.includedInFeed : copy.tapToInclude}</strong>
                  <p>{option.description}</p>
                </button>
              );
            })}
          </div>
        );
      case "timing":
        return (
          <div className="preferences-concept__answers">
            <div className="preferences-concept__weekday-grid">
              {weekdayOptions.map((option) => {
                const checked = form.departureWeekdays.includes(option.value);

                return (
                  <button
                    aria-pressed={checked}
                    className={`preferences-concept__weekday ${checked ? "is-selected" : ""}`}
                    key={option.value}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        departureWeekdays: toggleSelection(
                          current.departureWeekdays,
                          option.value,
                          !checked,
                        ),
                      }));
                    }}
                    type="button"
                  >
                    <span className={`preferences-concept__check ${checked ? "is-selected" : ""}`} aria-hidden="true">
                      <Check size={15} strokeWidth={3} />
                    </span>
                    <span>{copy.weekdayLabels[option.value].shortLabel}</span>
                    <strong>{copy.weekdayLabels[option.value].label}</strong>
                  </button>
                );
              })}
            </div>
            <p className="preferences-concept__microcopy">{copy.microcopyTiming}</p>
          </div>
        );
      case "routing":
        return (
          <div className="preferences-concept__answers preferences-concept__answers--cards">
            {maxStopsPreferenceOptions.map((option) => {
              const checked = form.maxStopsPreferences.includes(option.value);
              const localizedOption = copy.routingLabels[option.value];

              return (
                <button
                  aria-pressed={checked}
                  className={`preferences-concept__option-card ${checked ? "is-selected" : ""}`}
                  key={option.value}
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      maxStopsPreferences: toggleSelection(
                        current.maxStopsPreferences,
                        option.value,
                        !checked,
                      ),
                    }));
                  }}
                  type="button"
                >
                  <span className={`preferences-concept__check ${checked ? "is-selected" : ""}`} aria-hidden="true">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <span>{localizedOption.label}</span>
                  <strong>{checked ? copy.currentlyAccepted : copy.tapToAllow}</strong>
                  <p>{localizedOption.description}</p>
                </button>
              );
            })}
          </div>
        );
      case "comfort":
        return (
          <div className="preferences-concept__answers preferences-concept__answers--form">
            <label className="preferences-concept__field">
              <span>{copy.fieldLabels.earliestDeparture}</span>
              <select
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    earliestDepartureHour: toNumberOrNull(event.target.value),
                  }));
                }}
                value={form.earliestDepartureHour ?? ""}
              >
                <option value="">{copy.noLimit}</option>
                {clockHourOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="preferences-concept__field">
              <span>{copy.fieldLabels.latestArrival}</span>
              <select
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    latestArrivalHour: toNumberOrNull(event.target.value),
                  }));
                }}
                value={form.latestArrivalHour ?? ""}
              >
                <option value="">{copy.noLimit}</option>
                {clockHourOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="preferences-concept__field">
              <span>{copy.fieldLabels.minimumStay}</span>
              <select
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    minDestinationStayHours: toNumberOrNull(event.target.value),
                  }));
                }}
                value={form.minDestinationStayHours ?? ""}
              >
                <option value="">{copy.noMinimum}</option>
                <option value="24">{formatMinimumStayOption(24, locale)}</option>
                <option value="36">{formatMinimumStayOption(36, locale)}</option>
                <option value="48">{formatMinimumStayOption(48, locale)}</option>
                <option value="72">{formatMinimumStayOption(72, locale)}</option>
                <option value="120">{formatMinimumStayOption(120, locale)}</option>
              </select>
            </label>
          </div>
        );
      case "delivery":
        return (
          <div className="preferences-concept__answers preferences-concept__answers--stacked">
            <label className="preferences-concept__field">
              <span>{copy.fieldLabels.maxFare}</span>
              <input
                inputMode="numeric"
                onChange={(event) => {
                  setForm((current) => ({
                    ...current,
                    budgetCeilingEur: toNumberOrNull(event.target.value),
                  }));
                }}
                placeholder={copy.budgetPlaceholder}
                type="text"
                value={form.budgetCeilingEur ?? ""}
              />
            </label>

            <div className="preferences-concept__answers preferences-concept__answers--cards">
              {deliveryModeOptions.map((option) => {
                const checked = form.deliveryModes.includes(option.value);
                const localizedOption = copy.deliveryLabels[option.value];

                return (
                  <button
                    aria-pressed={checked}
                    className={`preferences-concept__option-card ${checked ? "is-selected" : ""}`}
                    key={option.value}
                    onClick={() => {
                      setForm((current) => ({
                        ...current,
                        deliveryModes: toggleSelection(current.deliveryModes, option.value, !checked),
                      }));
                    }}
                    type="button"
                  >
                    <span className={`preferences-concept__check ${checked ? "is-selected" : ""}`} aria-hidden="true">
                      <Check size={16} strokeWidth={3} />
                    </span>
                    <span>{localizedOption.label}</span>
                    <strong>{checked ? copy.included : copy.tapToInclude}</strong>
                    <p>{localizedOption.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      case "review":
        return (
          <div className="preferences-concept__answers preferences-concept__answers--summary">
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.tripStyles}</span>
              <strong>
                {form.preferredBuckets.map((bucket) => copy.bucketLabels[bucket].label).join(" + ")}
              </strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.departureDays}</span>
              <strong>{formatWeekdays(form.departureWeekdays, copy)}</strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.routing}</span>
              <strong>
                {form.maxStopsPreferences
                  .map((value) => copy.routingLabels[value].label)
                  .join(", ")}
              </strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.comfort}</span>
              <strong>
                {formatComfortSummary(form.earliestDepartureHour, form.latestArrivalHour, locale, copy)}
              </strong>
              <p>
                {copy.fieldLabels.minimumStay}: {formatMinimumStaySummary(form.minDestinationStayHours, locale, copy)}
              </p>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.budget}</span>
              <strong>
                {form.budgetCeilingEur === null
                  ? copy.anyPrice
                  : copy.upToPrice.replace("{price}", String(form.budgetCeilingEur))}
              </strong>
            </article>
            <article className="preferences-concept__summary-card">
              <span>{copy.recapLabels.emailCadence}</span>
              <strong>{formatDeliveryModes(form.deliveryModes, copy)}</strong>
            </article>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <section className="preferences-concept">
      <div className="preferences-concept__stage">
        <section className="preferences-concept__panel">
          {isEditing ? (
            <ol className="preferences-concept__step-rail">
              {conceptSteps.slice(1).map((step, index) => {
                const stepIndex = index + 1;

                return (
                  <li
                    className={`preferences-concept__step-rail-item ${
                      stepIndex === currentStepIndex
                        ? "is-current"
                        : stepIndex < currentStepIndex
                          ? "is-complete"
                          : ""
                    }`}
                    key={step.id}
                  >
                    <button
                      className="preferences-concept__step-rail-button"
                      onClick={() => moveToStep(stepIndex)}
                      type="button"
                    >
                      <span>{String(stepIndex).padStart(2, "0")}</span>
                      <strong>{step.shortLabel}</strong>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}

          <div className="preferences-concept__question">
            <h3>{currentStep.title}</h3>
            <p>{currentStep.description}</p>
          </div>

          <div className={`preferences-status preferences-status--${screen.phase}`}>
            {screen.message}
          </div>

          {renderStepBody()}

          <footer className="preferences-concept__actions">
            <button
              className="preferences-link preferences-link--ghost"
              disabled={!isEditing || currentStepIndex <= 1 || isPending}
              onClick={() => moveToStep(currentStepIndex - 1)}
              type="button"
            >
              {copy.buttonBack}
            </button>

            <div className="preferences-concept__action-group">
              {currentStep.id === "recap" ? (
                <button
                  className="preferences-submit"
                  disabled={isPending}
                  onClick={() => {
                    setScreen({ phase: "idle", message: copy.initialMessage });
                    setIsEditing(true);
                    moveToStep(1);
                  }}
                  type="button"
                >
                  {copy.buttonModify}
                </button>
              ) : currentStep.id === "review" ? (
                <button
                  className="preferences-submit"
                  disabled={isPending}
                  onClick={savePreferences}
                  type="button"
                >
                  {isPending ? copy.buttonSaving : copy.buttonSave}
                </button>
              ) : (
                <button
                  className="preferences-submit"
                  disabled={!canContinue || isPending}
                  onClick={goNext}
                  type="button"
                >
                  {copy.buttonContinue}
                </button>
              )}
            </div>
          </footer>
        </section>

        <aside className="preferences-concept__visual">
          <div className="preferences-concept__image-frame">
            <LandmarkPhoto
              alt={copy.visualAlt}
              destinationCity={currentStepVisual.city}
              landmarkTitle={currentStepVisual.landmarkTitle}
            />
            <div className="preferences-concept__image-overlay" />
          </div>
        </aside>
      </div>
    </section>
  );
}
