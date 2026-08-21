"use client";

import {
  CalendarDays,
  Check,
  Clock3,
  Mail,
  Plane,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import { LandmarkPhoto } from "@/components/landmark-photo";
import { useI18n, type Locale } from "@/lib/i18n";
import {
  bucketValues,
  clockHourOptions,
  defaultPreferenceValues,
  deriveSelectedRoutesFromBuckets,
  maxStopsPreferenceOptions,
  weekdayOptions,
  type BucketValue,
  type DeliveryModeValue,
  type MaxStopsPreferenceValue,
  type PreferencesBundle,
  type WeekdayValue,
} from "@/lib/preferences-shared";

type ScreenState = {
  phase: "idle" | "success" | "error";
  message: string;
};

type PreferenceFormState = PreferencesBundle["form"];
type PhaseId = "travel" | "preferences" | "alerts";

type WizardCopy = {
  setupTitle: string;
  phases: Record<PhaseId, { label: string; title: string; description: string }>;
  weekdayQuestion: string;
  stops: string;
  comfort: string;
  leaveAfter: string;
  arriveBefore: string;
  minimumStay: string;
  twoFullDays: string;
  budget: string;
  delivery: string;
  controlNote: string;
  emailNote: string;
  anyTime: string;
  anyPrice: string;
  upTo: string;
  back: string;
  continue: string;
  activate: string;
  activating: string;
  loading: string;
  missingToken: string;
  loadError: string;
  saveError: string;
  saved: string;
  completeStep: string;
  home: string;
  bucketLabels: Record<BucketValue, { label: string; description: string }>;
  routingLabels: Record<MaxStopsPreferenceValue, string>;
  deliveryLabels: Record<DeliveryModeValue, { label: string; description: string }>;
  weekdays: Record<WeekdayValue, string>;
  visualAlt: string;
};

const copyByLocale: Record<Locale, WizardCopy> = {
  en: {
    setupTitle: "Set up your flight alerts",
    phases: {
      travel: { label: "Your travel", title: "What kind of trip are you looking for?", description: "Choose one or both. You can change this at any time." },
      preferences: { label: "Flight preferences", title: "Which flights are worth alerting you about?", description: "Set your limits once. We’ll filter out the rest." },
      alerts: { label: "Alerts", title: "How often should we send your best deals?", description: "Choose one or more. You can change this at any time." },
    },
    weekdayQuestion: "When can you usually leave?",
    stops: "Stops",
    comfort: "Comfort",
    leaveAfter: "Leave after",
    arriveBefore: "Arrive before",
    minimumStay: "Useful time at destination",
    twoFullDays: "At least 2 full days",
    budget: "Budget",
    delivery: "Delivery",
    controlNote: "You’re always in control of your notifications.",
    emailNote: "Alerts will be sent to {email}.",
    anyTime: "Any time",
    anyPrice: "Any price",
    upTo: "Up to €{price}",
    back: "Back",
    continue: "Continue",
    activate: "Activate my alerts",
    activating: "Activating…",
    loading: "Loading your preferences…",
    missingToken: "Open the private preference link from your alert email to continue.",
    loadError: "We could not load your preferences.",
    saveError: "We could not save your preferences. Please try again.",
    saved: "Your alerts are active and your preferences have been saved.",
    completeStep: "Choose at least one option before continuing.",
    home: "Back to home",
    bucketLabels: {
      weekend: { label: "Weekend escape", description: "2–4 nights" },
      long_stay: { label: "Longer trip", description: "5+ nights" },
    },
    routingLabels: { NON_STOP: "Direct only", ONE_STOP_OR_FEWER: "Up to 1 stop", ANY: "Any route" },
    deliveryLabels: {
      flash_only: { label: "Alert me immediately about exceptional deals", description: "Only when a price is unusually good." },
      daily_digest: { label: "Send me the best deals every day", description: "One useful daily shortlist." },
      weekly_best_of: { label: "Send me the week’s best deals", description: "A calmer weekly roundup." },
    },
    weekdays: { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" },
    visualAlt: "European destination seen from above",
  },
  fr: {
    setupTitle: "Configurez vos alertes de vols",
    phases: {
      travel: { label: "Votre voyage", title: "Quel type de voyage recherchez-vous ?", description: "Choisissez une ou deux options. Vous pourrez les modifier à tout moment." },
      preferences: { label: "Préférences de vol", title: "Quels vols méritent une alerte ?", description: "Définissez vos limites une fois. Nous filtrons le reste." },
      alerts: { label: "Alertes", title: "À quelle fréquence envoyer nos meilleures offres ?", description: "Choisissez une ou plusieurs options. Vous pourrez les modifier à tout moment." },
    },
    weekdayQuestion: "Quels jours pouvez-vous généralement partir ?",
    stops: "Escales",
    comfort: "Confort",
    leaveAfter: "Partir après",
    arriveBefore: "Arriver avant",
    minimumStay: "Temps utile à destination",
    twoFullDays: "Au moins 2 jours complets",
    budget: "Budget",
    delivery: "Envoi",
    controlNote: "Vous gardez toujours le contrôle de vos notifications.",
    emailNote: "Les alertes seront envoyées à {email}.",
    anyTime: "Toute heure",
    anyPrice: "Tous les prix",
    upTo: "Jusqu’à {price} €",
    back: "Retour",
    continue: "Continuer",
    activate: "Activer mes alertes",
    activating: "Activation…",
    loading: "Chargement de vos préférences…",
    missingToken: "Ouvrez le lien privé reçu dans l’e-mail d’alerte pour continuer.",
    loadError: "Nous n’avons pas pu charger vos préférences.",
    saveError: "Nous n’avons pas pu enregistrer vos préférences. Réessayez.",
    saved: "Vos alertes sont actives et vos préférences ont été enregistrées.",
    completeStep: "Choisissez au moins une option avant de continuer.",
    home: "Retour à l’accueil",
    bucketLabels: {
      weekend: { label: "Escapade week-end", description: "2 à 4 nuits" },
      long_stay: { label: "Voyage plus long", description: "5 nuits ou plus" },
    },
    routingLabels: { NON_STOP: "Direct uniquement", ONE_STOP_OR_FEWER: "1 escale maximum", ANY: "Tous les trajets" },
    deliveryLabels: {
      flash_only: { label: "M’alerter immédiatement des offres exceptionnelles", description: "Uniquement lorsqu’un prix est vraiment remarquable." },
      daily_digest: { label: "M’envoyer les meilleures offres chaque jour", description: "Une sélection quotidienne vraiment utile." },
      weekly_best_of: { label: "M’envoyer les meilleures offres de la semaine", description: "Un récapitulatif hebdomadaire plus calme." },
    },
    weekdays: { MON: "Lun", TUE: "Mar", WED: "Mer", THU: "Jeu", FRI: "Ven", SAT: "Sam", SUN: "Dim" },
    visualAlt: "Destination européenne vue du ciel",
  },
  de: {
    setupTitle: "Flugbenachrichtigungen einrichten",
    phases: {
      travel: { label: "Ihre Reise", title: "Welche Art von Reise suchen Sie?", description: "Wählen Sie eine oder beide Optionen. Änderungen sind jederzeit möglich." },
      preferences: { label: "Flugpräferenzen", title: "Für welche Flüge lohnt sich eine Benachrichtigung?", description: "Legen Sie Ihre Grenzen einmal fest. Wir filtern den Rest." },
      alerts: { label: "Benachrichtigungen", title: "Wie oft sollen wir die besten Angebote senden?", description: "Wählen Sie eine oder mehrere Optionen. Änderungen sind jederzeit möglich." },
    },
    weekdayQuestion: "An welchen Tagen können Sie normalerweise abreisen?",
    stops: "Stopps",
    comfort: "Komfort",
    leaveAfter: "Abflug nach",
    arriveBefore: "Ankunft vor",
    minimumStay: "Nutzbare Zeit am Ziel",
    twoFullDays: "Mindestens 2 volle Tage",
    budget: "Budget",
    delivery: "Versand",
    controlNote: "Sie behalten jederzeit die Kontrolle über Ihre Benachrichtigungen.",
    emailNote: "Benachrichtigungen werden an {email} gesendet.",
    anyTime: "Jederzeit",
    anyPrice: "Jeder Preis",
    upTo: "Bis €{price}",
    back: "Zurück",
    continue: "Weiter",
    activate: "Benachrichtigungen aktivieren",
    activating: "Wird aktiviert…",
    loading: "Präferenzen werden geladen…",
    missingToken: "Öffnen Sie zum Fortfahren den privaten Link aus Ihrer Benachrichtigungs-E-Mail.",
    loadError: "Ihre Präferenzen konnten nicht geladen werden.",
    saveError: "Ihre Präferenzen konnten nicht gespeichert werden. Bitte erneut versuchen.",
    saved: "Ihre Benachrichtigungen sind aktiv und die Präferenzen wurden gespeichert.",
    completeStep: "Wählen Sie mindestens eine Option, bevor Sie fortfahren.",
    home: "Zur Startseite",
    bucketLabels: {
      weekend: { label: "Wochenendtrip", description: "2–4 Nächte" },
      long_stay: { label: "Längere Reise", description: "5+ Nächte" },
    },
    routingLabels: { NON_STOP: "Nur Direktflüge", ONE_STOP_OR_FEWER: "Bis zu 1 Stopp", ANY: "Jede Route" },
    deliveryLabels: {
      flash_only: { label: "Außergewöhnliche Angebote sofort melden", description: "Nur wenn ein Preis ungewöhnlich gut ist." },
      daily_digest: { label: "Die besten Angebote täglich senden", description: "Eine nützliche tägliche Auswahl." },
      weekly_best_of: { label: "Die besten Angebote der Woche senden", description: "Eine ruhigere wöchentliche Übersicht." },
    },
    weekdays: { MON: "Mo", TUE: "Di", WED: "Mi", THU: "Do", FRI: "Fr", SAT: "Sa", SUN: "So" },
    visualAlt: "Europäisches Reiseziel von oben",
  },
  pt: {
    setupTitle: "Configure os seus alertas de voos",
    phases: {
      travel: { label: "A sua viagem", title: "Que tipo de viagem procura?", description: "Escolha uma ou ambas. Pode alterar tudo a qualquer momento." },
      preferences: { label: "Preferências de voo", title: "Que voos merecem um alerta?", description: "Defina os seus limites uma vez. Nós filtramos o resto." },
      alerts: { label: "Alertas", title: "Com que frequência enviamos as melhores ofertas?", description: "Escolha uma ou mais opções. Pode alterar tudo a qualquer momento." },
    },
    weekdayQuestion: "Em que dias pode normalmente partir?",
    stops: "Escalas",
    comfort: "Conforto",
    leaveAfter: "Partir depois das",
    arriveBefore: "Chegar antes das",
    minimumStay: "Tempo útil no destino",
    twoFullDays: "Pelo menos 2 dias completos",
    budget: "Orçamento",
    delivery: "Envio",
    controlNote: "Mantém sempre o controlo das suas notificações.",
    emailNote: "Os alertas serão enviados para {email}.",
    anyTime: "Qualquer hora",
    anyPrice: "Qualquer preço",
    upTo: "Até €{price}",
    back: "Voltar",
    continue: "Continuar",
    activate: "Ativar os meus alertas",
    activating: "A ativar…",
    loading: "A carregar as suas preferências…",
    missingToken: "Abra a ligação privada do seu email de alertas para continuar.",
    loadError: "Não foi possível carregar as suas preferências.",
    saveError: "Não foi possível guardar as suas preferências. Tente novamente.",
    saved: "Os seus alertas estão ativos e as preferências foram guardadas.",
    completeStep: "Escolha pelo menos uma opção antes de continuar.",
    home: "Voltar ao início",
    bucketLabels: {
      weekend: { label: "Escapadinha de fim de semana", description: "2–4 noites" },
      long_stay: { label: "Viagem mais longa", description: "5+ noites" },
    },
    routingLabels: { NON_STOP: "Apenas direto", ONE_STOP_OR_FEWER: "Até 1 escala", ANY: "Qualquer rota" },
    deliveryLabels: {
      flash_only: { label: "Alertar-me imediatamente sobre ofertas excecionais", description: "Apenas quando o preço é mesmo fora do comum." },
      daily_digest: { label: "Enviar-me as melhores ofertas todos os dias", description: "Uma seleção diária realmente útil." },
      weekly_best_of: { label: "Enviar-me as melhores ofertas da semana", description: "Um resumo semanal mais tranquilo." },
    },
    weekdays: { MON: "Seg", TUE: "Ter", WED: "Qua", THU: "Qui", FRI: "Sex", SAT: "Sáb", SUN: "Dom" },
    visualAlt: "Destino europeu visto do alto",
  },
  it: {
    setupTitle: "Configura i tuoi avvisi di volo",
    phases: {
      travel: { label: "Il tuo viaggio", title: "Che tipo di viaggio stai cercando?", description: "Scegli una o entrambe le opzioni. Potrai modificarle in qualsiasi momento." },
      preferences: { label: "Preferenze di volo", title: "Per quali voli vale la pena avvisarti?", description: "Imposta i limiti una volta. Al resto pensiamo noi." },
      alerts: { label: "Avvisi", title: "Con quale frequenza dobbiamo inviare le offerte migliori?", description: "Scegli una o più opzioni. Potrai modificarle in qualsiasi momento." },
    },
    weekdayQuestion: "In quali giorni puoi partire di solito?",
    stops: "Scali",
    comfort: "Comfort",
    leaveAfter: "Partenza dopo le",
    arriveBefore: "Arrivo prima delle",
    minimumStay: "Tempo utile a destinazione",
    twoFullDays: "Almeno 2 giorni interi",
    budget: "Budget",
    delivery: "Invio",
    controlNote: "Hai sempre il controllo delle tue notifiche.",
    emailNote: "Gli avvisi saranno inviati a {email}.",
    anyTime: "Qualsiasi ora",
    anyPrice: "Qualsiasi prezzo",
    upTo: "Fino a €{price}",
    back: "Indietro",
    continue: "Continua",
    activate: "Attiva i miei avvisi",
    activating: "Attivazione…",
    loading: "Caricamento delle preferenze…",
    missingToken: "Apri il link privato ricevuto nell’email degli avvisi per continuare.",
    loadError: "Non è stato possibile caricare le preferenze.",
    saveError: "Non è stato possibile salvare le preferenze. Riprova.",
    saved: "Gli avvisi sono attivi e le preferenze sono state salvate.",
    completeStep: "Scegli almeno un’opzione prima di continuare.",
    home: "Torna alla home",
    bucketLabels: {
      weekend: { label: "Fuga nel weekend", description: "2–4 notti" },
      long_stay: { label: "Viaggio più lungo", description: "5+ notti" },
    },
    routingLabels: { NON_STOP: "Solo voli diretti", ONE_STOP_OR_FEWER: "Fino a 1 scalo", ANY: "Qualsiasi rotta" },
    deliveryLabels: {
      flash_only: { label: "Avvisami subito delle offerte eccezionali", description: "Solo quando un prezzo è insolitamente conveniente." },
      daily_digest: { label: "Inviami ogni giorno le offerte migliori", description: "Una selezione quotidiana davvero utile." },
      weekly_best_of: { label: "Inviami le offerte migliori della settimana", description: "Un riepilogo settimanale più tranquillo." },
    },
    weekdays: { MON: "Lun", TUE: "Mar", WED: "Mer", THU: "Gio", FRI: "Ven", SAT: "Sab", SUN: "Dom" },
    visualAlt: "Destinazione europea vista dall’alto",
  },
  es: {
    setupTitle: "Configura tus alertas de vuelos",
    phases: {
      travel: { label: "Tu viaje", title: "¿Qué tipo de viaje estás buscando?", description: "Elige una opción o ambas. Podrás cambiarlo cuando quieras." },
      preferences: { label: "Preferencias de vuelo", title: "¿Sobre qué vuelos merece la pena avisarte?", description: "Define tus límites una vez. Nosotros filtraremos el resto." },
      alerts: { label: "Alertas", title: "¿Con qué frecuencia quieres recibir las mejores ofertas?", description: "Elige una o varias opciones. Podrás cambiarlo cuando quieras." },
    },
    weekdayQuestion: "¿Qué días puedes salir normalmente?",
    stops: "Escalas",
    comfort: "Comodidad",
    leaveAfter: "Salir después de las",
    arriveBefore: "Llegar antes de las",
    minimumStay: "Tiempo útil en destino",
    twoFullDays: "Al menos 2 días completos",
    budget: "Presupuesto",
    delivery: "Envío",
    controlNote: "Tú mantienes siempre el control de tus notificaciones.",
    emailNote: "Las alertas se enviarán a {email}.",
    anyTime: "Cualquier hora",
    anyPrice: "Cualquier precio",
    upTo: "Hasta €{price}",
    back: "Atrás",
    continue: "Continuar",
    activate: "Activar mis alertas",
    activating: "Activando…",
    loading: "Cargando tus preferencias…",
    missingToken: "Abre el enlace privado de tu email de alertas para continuar.",
    loadError: "No hemos podido cargar tus preferencias.",
    saveError: "No hemos podido guardar tus preferencias. Inténtalo de nuevo.",
    saved: "Tus alertas están activas y tus preferencias se han guardado.",
    completeStep: "Elige al menos una opción antes de continuar.",
    home: "Volver a la home",
    bucketLabels: {
      weekend: { label: "Escapada de fin de semana", description: "2–4 noches" },
      long_stay: { label: "Viaje más largo", description: "5 noches o más" },
    },
    routingLabels: { NON_STOP: "Solo directos", ONE_STOP_OR_FEWER: "Hasta 1 escala", ANY: "Cualquier ruta" },
    deliveryLabels: {
      flash_only: { label: "Avísame al instante de ofertas excepcionales", description: "Solo cuando el precio sea realmente fuera de lo normal." },
      daily_digest: { label: "Envíame las mejores ofertas cada día", description: "Una selección diaria realmente útil." },
      weekly_best_of: { label: "Envíame las mejores ofertas de la semana", description: "Un resumen semanal más tranquilo." },
    },
    weekdays: { MON: "Lun", TUE: "Mar", WED: "Mié", THU: "Jue", FRI: "Vie", SAT: "Sáb", SUN: "Dom" },
    visualAlt: "Destino europeo visto desde el aire",
  },
};

const phaseOrder: PhaseId[] = ["travel", "preferences", "alerts"];
const deliveryModeOrder: DeliveryModeValue[] = ["flash_only", "daily_digest", "weekly_best_of"];
const phaseVisuals: Record<PhaseId, { city: string; landmarkTitle: string }> = {
  travel: { city: "Paris", landmarkTitle: "Eiffel Tower" },
  preferences: { city: "Barcelona", landmarkTitle: "Sagrada Familia" },
  alerts: { city: "Lisbon", landmarkTitle: "Alfama" },
};

function toggleSelection<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

function buildFormState(bundle: PreferencesBundle): PreferenceFormState {
  const preferredBuckets = bundle.form.preferredBuckets.length
    ? bundle.form.preferredBuckets
    : defaultPreferenceValues.preferredBuckets;

  return {
    ...bundle.form,
    preferredBuckets,
    selectedRoutes: deriveSelectedRoutesFromBuckets(preferredBuckets),
    maxStopsPreferences: bundle.form.maxStopsPreferences.length
      ? bundle.form.maxStopsPreferences
      : defaultPreferenceValues.maxStopsPreferences,
    departureWeekdays: bundle.form.departureWeekdays.length
      ? bundle.form.departureWeekdays
      : defaultPreferenceValues.departureWeekdays,
    deliveryModes: bundle.form.deliveryModes.length
      ? bundle.form.deliveryModes
      : defaultPreferenceValues.deliveryModes,
    minTripNights: null,
    maxTripNights: null,
  };
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span className={`preferences-wizard__selection-mark ${selected ? "is-selected" : ""}`} aria-hidden="true">
      {selected ? <Check size={15} strokeWidth={3} /> : null}
    </span>
  );
}

function TransitioningPhoto({ phase, alt }: { phase: PhaseId; alt: string }) {
  const visual = phaseVisuals[phase];
  const [current, setCurrent] = useState(visual);
  const [incoming, setIncoming] = useState<typeof visual | null>(null);
  const [visible, setVisible] = useState(false);
  const targetKey = `${visual.city}:${visual.landmarkTitle}`;
  const currentKey = `${current.city}:${current.landmarkTitle}`;

  useEffect(() => {
    if (targetKey !== currentKey) {
      setVisible(false);
      setIncoming(visual);
    }
  }, [currentKey, targetKey, visual]);

  useEffect(() => {
    if (!incoming || !visible) return;
    const timer = window.setTimeout(() => {
      setCurrent(incoming);
      setIncoming(null);
      setVisible(false);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [incoming, visible]);

  return (
    <>
      <div className={`preferences-wizard__photo-layer ${visible ? "is-leaving" : "is-active"}`}>
        <LandmarkPhoto alt={alt} destinationCity={current.city} landmarkTitle={current.landmarkTitle} loading="eager" />
      </div>
      {incoming ? (
        <div className={`preferences-wizard__photo-layer ${visible ? "is-active" : ""}`}>
          <LandmarkPhoto alt="" destinationCity={incoming.city} landmarkTitle={incoming.landmarkTitle} loading="eager" onLoad={() => setVisible(true)} />
        </div>
      ) : null}
    </>
  );
}

function ChoiceButton({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`preferences-wizard__choice-card ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="preferences-wizard__choice-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <small>{description}</small>
      <SelectionMark selected={selected} />
    </button>
  );
}

export function PreferencesTypeformConcept() {
  const { locale } = useI18n();
  const copy = copyByLocale[locale];
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [bundle, setBundle] = useState<PreferencesBundle | null>(null);
  const [form, setForm] = useState<PreferenceFormState>(defaultPreferenceValues);
  const [screen, setScreen] = useState<ScreenState>({ phase: "idle", message: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [furthestPhase, setFurthestPhase] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadPreferences() {
      if (!token) {
        setIsLoading(false);
        setScreen({ phase: "error", message: copy.missingToken });
        return;
      }

      try {
        const response = await fetch(`/api/preferences?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const payload = (await response.json()) as PreferencesBundle;
        if (!response.ok) throw new Error();
        if (!active) return;
        setBundle(payload);
        setForm(buildFormState(payload));
      } catch {
        if (active) setScreen({ phase: "error", message: copy.loadError });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPreferences();
    return () => { active = false; };
  }, [copy.loadError, copy.missingToken, token]);

  const phase = phaseOrder[phaseIndex];
  const phaseCopy = copy.phases[phase];
  const canContinue = useMemo(() => {
    if (phase === "travel") {
      return form.preferredBuckets.length > 0 && form.departureWeekdays.length > 0;
    }
    if (phase === "preferences") return form.maxStopsPreferences.length > 0;
    return form.deliveryModes.length > 0;
  }, [form.departureWeekdays.length, form.deliveryModes.length, form.maxStopsPreferences.length, form.preferredBuckets.length, phase]);

  function moveTo(index: number) {
    setScreen({ phase: "idle", message: "" });
    setPhaseIndex(Math.min(Math.max(index, 0), phaseOrder.length - 1));
  }

  function continueFlow() {
    if (!canContinue) {
      setScreen({ phase: "error", message: copy.completeStep });
      return;
    }
    const nextIndex = Math.min(phaseIndex + 1, phaseOrder.length - 1);
    setFurthestPhase((current) => Math.max(current, nextIndex));
    moveTo(nextIndex);
  }

  function savePreferences() {
    if (!bundle || !canContinue) {
      setScreen({ phase: "error", message: copy.completeStep });
      return;
    }

    startTransition(async () => {
      setScreen({ phase: "idle", message: "" });
      try {
        const response = await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        if (!response.ok) throw new Error();
        setScreen({ phase: "success", message: copy.saved });
      } catch {
        setScreen({ phase: "error", message: copy.saveError });
      }
    });
  }

  if (isLoading) {
    return <section className="preferences-wizard preferences-wizard--state"><p>{copy.loading}</p></section>;
  }

  if (!token || !bundle) {
    return (
      <section className="preferences-wizard preferences-wizard--state">
        <p className="preferences-status preferences-status--error">{screen.message}</p>
        <Link className="preferences-submit" href="/">{copy.home}</Link>
      </section>
    );
  }

  const preferencesBundle = bundle;

  function renderPhase() {
    if (phase === "travel") {
      return (
        <div className="preferences-wizard__phase-body">
          <div className="preferences-wizard__trip-grid">
            {bucketValues.map((bucket) => {
              const selected = form.preferredBuckets.includes(bucket);
              const localized = copy.bucketLabels[bucket];
              return (
                <ChoiceButton
                  description={localized.description}
                  icon={bucket === "weekend" ? <CalendarDays /> : <Plane />}
                  key={bucket}
                  onClick={() => {
                    setForm((current) => {
                      const preferredBuckets = toggleSelection(current.preferredBuckets, bucket);
                      return { ...current, preferredBuckets, selectedRoutes: deriveSelectedRoutesFromBuckets(preferredBuckets) };
                    });
                  }}
                  selected={selected}
                  title={localized.label}
                />
              );
            })}
          </div>
          <div className="preferences-wizard__section-heading preferences-wizard__section-heading--compact">
            <h3>{copy.weekdayQuestion}</h3>
          </div>
          <div className="preferences-wizard__weekday-grid">
            {weekdayOptions.map((day) => {
              const selected = form.departureWeekdays.includes(day.value);
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? "is-selected" : ""}
                  key={day.value}
                  onClick={() => setForm((current) => ({ ...current, departureWeekdays: toggleSelection(current.departureWeekdays, day.value) }))}
                  type="button"
                >
                  {copy.weekdays[day.value]}
                  {selected ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (phase === "preferences") {
      const staySelected = form.minDestinationStayHours !== null;
      const budgetOptions: Array<number | null> = [null, 100, 150, 200, 250];
      return (
        <div className="preferences-wizard__phase-body preferences-wizard__phase-body--preferences">
          <fieldset className="preferences-wizard__group">
            <legend>{copy.stops}</legend>
            <div className="preferences-wizard__segmented">
              {maxStopsPreferenceOptions.map((option) => {
                const selected = form.maxStopsPreferences.includes(option.value);
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "is-selected" : ""}
                    key={option.value}
                    onClick={() => setForm((current) => ({ ...current, maxStopsPreferences: [option.value] }))}
                    type="button"
                  >
                    {copy.routingLabels[option.value]}
                    {selected ? <SelectionMark selected /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="preferences-wizard__group">
            <legend>{copy.comfort}</legend>
            <div className="preferences-wizard__time-grid">
              <label>
                <span>{copy.leaveAfter}</span>
                <div className="preferences-wizard__select-wrap">
                  <Clock3 size={18} aria-hidden="true" />
                  <select value={form.earliestDepartureHour ?? ""} onChange={(event) => setForm((current) => ({ ...current, earliestDepartureHour: event.target.value === "" ? null : Number(event.target.value) }))}>
                    <option value="">{copy.anyTime}</option>
                    {clockHourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </label>
              <label>
                <span>{copy.arriveBefore}</span>
                <div className="preferences-wizard__select-wrap">
                  <Clock3 size={18} aria-hidden="true" />
                  <select value={form.latestArrivalHour ?? ""} onChange={(event) => setForm((current) => ({ ...current, latestArrivalHour: event.target.value === "" ? null : Number(event.target.value) }))}>
                    <option value="">{copy.anyTime}</option>
                    {clockHourOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </label>
            </div>
            <button
              aria-pressed={staySelected}
              className={`preferences-wizard__toggle-row ${staySelected ? "is-selected" : ""}`}
              onClick={() => setForm((current) => ({ ...current, minDestinationStayHours: staySelected ? null : 48 }))}
              type="button"
            >
              <span className="preferences-wizard__switch" aria-hidden="true"><span /></span>
              <span><small>{copy.minimumStay}</small><strong>{copy.twoFullDays}</strong></span>
            </button>
          </fieldset>

          <fieldset className="preferences-wizard__group">
            <legend>{copy.budget}</legend>
            <div className="preferences-wizard__budget-grid">
              {budgetOptions.map((amount) => {
                const selected = form.budgetCeilingEur === amount;
                const label = amount === null ? copy.anyPrice : copy.upTo.replace("{price}", String(amount));
                return (
                  <button aria-pressed={selected} className={selected ? "is-selected" : ""} key={amount ?? "any"} onClick={() => setForm((current) => ({ ...current, budgetCeilingEur: amount }))} type="button">
                    {label}
                    {selected ? <SelectionMark selected /> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      );
    }

    const deliveryIcons: Record<DeliveryModeValue, ReactNode> = {
      flash_only: <Zap />,
      daily_digest: <Mail />,
      weekly_best_of: <CalendarDays />,
    };

    return (
      <div className="preferences-wizard__phase-body">
        <fieldset className="preferences-wizard__group">
          <legend>{copy.delivery}</legend>
          <div className="preferences-wizard__delivery-list">
            {deliveryModeOrder.map((mode) => {
              const selected = form.deliveryModes.includes(mode);
              const localized = copy.deliveryLabels[mode];
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? "is-selected" : ""}
                  key={mode}
                  onClick={() => setForm((current) => ({ ...current, deliveryModes: toggleSelection(current.deliveryModes, mode) }))}
                  type="button"
                >
                  <span className="preferences-wizard__delivery-icon" aria-hidden="true">{deliveryIcons[mode]}</span>
                  <span><strong>{localized.label}</strong><small>{localized.description}</small></span>
                  <SelectionMark selected={selected} />
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="preferences-wizard__trust-note">
          <ShieldCheck size={21} aria-hidden="true" />
          <span>{copy.controlNote}<small>{copy.emailNote.replace("{email}", preferencesBundle.email)}</small></span>
        </div>
      </div>
    );
  }

  return (
    <section className="preferences-wizard">
      <div className="preferences-wizard__stage">
        <section className="preferences-wizard__panel">
          <h1>{copy.setupTitle}</h1>
          <ol className="preferences-wizard__steps" aria-label={copy.setupTitle}>
            {phaseOrder.map((item, index) => {
              const complete = index < phaseIndex;
              const current = index === phaseIndex;
              return (
                <Fragment key={item}>
                  <li className={`${current ? "is-current" : ""} ${complete ? "is-complete" : ""}`}>
                    <button aria-current={current ? "step" : undefined} disabled={index > furthestPhase} onClick={() => moveTo(index)} type="button">
                      <span>{complete ? <Check size={17} strokeWidth={3} /> : index + 1}</span>
                      <strong>{copy.phases[item].label}</strong>
                    </button>
                  </li>
                  {index < phaseOrder.length - 1 ? (
                    <li aria-hidden="true" className="preferences-wizard__step-connector" />
                  ) : null}
                </Fragment>
              );
            })}
          </ol>

          <header className="preferences-wizard__intro">
            <h2>{phaseCopy.title}</h2>
            <p>{phaseCopy.description}</p>
          </header>

          {renderPhase()}

          {screen.message ? (
            <p aria-live="polite" className={`preferences-wizard__status preferences-wizard__status--${screen.phase}`}>{screen.message}</p>
          ) : null}

          <footer className="preferences-wizard__actions">
            <button className="preferences-wizard__back" disabled={phaseIndex === 0 || isPending} onClick={() => moveTo(phaseIndex - 1)} type="button">{copy.back}</button>
            {phase === "alerts" ? (
              <button className="preferences-wizard__primary" disabled={!canContinue || isPending} onClick={savePreferences} type="button">{isPending ? copy.activating : copy.activate}</button>
            ) : (
              <button className="preferences-wizard__primary" disabled={!canContinue || isPending} onClick={continueFlow} type="button">{copy.continue}</button>
            )}
          </footer>
        </section>

        <aside className="preferences-wizard__visual">
          <TransitioningPhoto alt={copy.visualAlt} phase={phase} />
          <div className="preferences-wizard__photo-wash" />
        </aside>
      </div>
    </section>
  );
}
