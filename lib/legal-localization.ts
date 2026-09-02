import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";
import { getLocalizedHomePath, htmlLangTags, locales, type Locale } from "@/lib/locales";

export type LegalPageKey = "privacy" | "cookies" | "terms";

type LegalPageCopy = {
  title: string;
  description: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
};

type LegalLocaleCopy = {
  eyebrow: string;
  backHome: string;
  pages: Record<LegalPageKey, LegalPageCopy>;
};

export const legalPathSegments: Record<Locale, Record<LegalPageKey, string>> = {
  en: { privacy: "privacy", cookies: "cookies", terms: "terms" },
  fr: { privacy: "confidentialite", cookies: "cookies", terms: "conditions" },
  de: { privacy: "datenschutz", cookies: "cookies", terms: "nutzungsbedingungen" },
  pt: { privacy: "privacidade", cookies: "cookies", terms: "termos" },
  it: { privacy: "privacy", cookies: "cookie", terms: "termini" },
  es: { privacy: "privacidad", cookies: "cookies", terms: "terminos" },
};

export const legalCopy: Record<Locale, LegalLocaleCopy> = {
  en: {
    eyebrow: "Legal",
    backHome: "Back to home",
    pages: {
      privacy: {
        title: "Privacy policy",
        description: "How +352 Flights uses subscriber preferences and technical data.",
        intro: "+352 Flights uses subscriber preferences, fare data, and essential technical logs to run the service, personalize alerts, and keep the product reliable.",
        sections: [
          { title: "What we store", body: "We store the preferences you choose, the routes and fare combinations surfaced by the scanner, and minimal technical information needed to operate the product." },
          { title: "Why we store it", body: "This information is used to send relevant fare emails, improve matching, and monitor the health of the service." },
          { title: "Your control", body: "You can update your email preferences at any time from your subscriber link, or stop all emails using the unsubscribe link included in every message." },
        ],
      },
      cookies: {
        title: "Cookies",
        description: "How +352 Flights uses essential cookies and local browser storage.",
        intro: "+352 Flights uses a small number of essential browser cookies and local storage keys to keep the interface working, remember settings, and preserve session-level product behavior.",
        sections: [
          { title: "Essential only", body: "These cookies support core features such as subscriber sessions, interface preferences, and product reliability. They are not used to build unrelated advertising profiles." },
          { title: "Preference storage", body: "Some settings may also be saved locally in your browser, such as theme mode or recent interface state, to keep the experience consistent between visits." },
          { title: "How to manage them", body: "You can clear browser storage or block cookies in your browser settings, although some parts of the experience may stop working correctly." },
        ],
      },
      terms: {
        title: "Terms",
        description: "Terms for using +352 Flights fare information and alerts.",
        intro: "+352 Flights surfaces fare opportunities from Luxembourg and groups them into useful travel patterns, but prices can change quickly and airline availability is never guaranteed.",
        sections: [
          { title: "Fare information", body: "Deals are based on the best combinations the system can verify at the time of scanning. Final price and availability always depend on the booking page." },
          { title: "No travel guarantee", body: "Routes, schedules, and prices may change without notice. Always double-check the final booking details before purchasing." },
          { title: "Use of the service", body: "The product helps you discover potentially strong fares faster; it does not replace the final booking confirmation from airlines or travel platforms." },
        ],
      },
    },
  },
  fr: {
    eyebrow: "Informations légales",
    backHome: "Retour à l’accueil",
    pages: {
      privacy: {
        title: "Politique de confidentialité",
        description: "Comment +352 Flights utilise vos préférences et données techniques.",
        intro: "+352 Flights utilise les préférences des abonnés, les données tarifaires et les journaux techniques essentiels pour faire fonctionner le service, personnaliser les alertes et maintenir sa fiabilité.",
        sections: [
          { title: "Données enregistrées", body: "Nous enregistrons les préférences que vous choisissez, les itinéraires et combinaisons tarifaires détectés par le scanner, ainsi que les informations techniques minimales nécessaires au fonctionnement du produit." },
          { title: "Pourquoi nous les utilisons", body: "Ces informations servent à envoyer des emails tarifaires pertinents, améliorer la correspondance et surveiller la fiabilité du service." },
          { title: "Vous gardez le contrôle", body: "Vous pouvez modifier vos préférences à tout moment depuis votre lien privé ou arrêter tous les emails avec le lien de désinscription présent dans chaque message." },
        ],
      },
      cookies: {
        title: "Cookies",
        description: "Comment +352 Flights utilise les cookies essentiels et le stockage local.",
        intro: "+352 Flights utilise quelques cookies essentiels et clés de stockage local pour faire fonctionner l’interface, mémoriser vos réglages et conserver le comportement de la session.",
        sections: [
          { title: "Uniquement l’essentiel", body: "Ces cookies prennent en charge les sessions abonnés, les préférences d’interface et la fiabilité du produit. Ils ne servent pas à créer des profils publicitaires sans rapport avec le service." },
          { title: "Préférences enregistrées", body: "Certains réglages, comme le thème ou l’état récent de l’interface, peuvent être enregistrés localement pour rendre l’expérience cohérente entre les visites." },
          { title: "Comment les gérer", body: "Vous pouvez effacer le stockage du navigateur ou bloquer les cookies dans ses réglages, mais certaines fonctions risquent alors de ne plus fonctionner correctement." },
        ],
      },
      terms: {
        title: "Conditions d’utilisation",
        description: "Conditions d’utilisation des tarifs et alertes de +352 Flights.",
        intro: "+352 Flights présente des opportunités tarifaires depuis le Luxembourg et les organise en formats de voyage utiles, mais les prix peuvent évoluer rapidement et la disponibilité n’est jamais garantie.",
        sections: [
          { title: "Informations tarifaires", body: "Les offres reposent sur les meilleures combinaisons que le système peut vérifier au moment de l’analyse. Le prix final et la disponibilité dépendent toujours de la page de réservation." },
          { title: "Aucune garantie de voyage", body: "Les itinéraires, horaires et prix peuvent changer sans préavis. Vérifiez toujours les informations finales avant tout achat." },
          { title: "Utilisation du service", body: "Le produit vous aide à repérer plus vite des tarifs intéressants ; il ne remplace pas la confirmation finale d’une compagnie ou plateforme de voyage." },
        ],
      },
    },
  },
  de: {
    eyebrow: "Rechtliches",
    backHome: "Zur Startseite",
    pages: {
      privacy: {
        title: "Datenschutzerklärung",
        description: "Wie +352 Flights Präferenzen und technische Daten verwendet.",
        intro: "+352 Flights verwendet Abonnentenpräferenzen, Tarifdaten und notwendige technische Protokolle, um den Dienst zu betreiben, Alerts zu personalisieren und das Produkt zuverlässig zu halten.",
        sections: [
          { title: "Was wir speichern", body: "Wir speichern Ihre gewählten Präferenzen, die vom Scanner gefundenen Routen und Tarifkombinationen sowie die minimal erforderlichen technischen Informationen für den Betrieb." },
          { title: "Warum wir es speichern", body: "Diese Informationen werden verwendet, um passende Tarif-E-Mails zu senden, die Zuordnung zu verbessern und die Zuverlässigkeit des Dienstes zu überwachen." },
          { title: "Ihre Kontrolle", body: "Sie können Ihre E-Mail-Präferenzen jederzeit über Ihren privaten Link ändern oder alle E-Mails über den Abmeldelink in jeder Nachricht stoppen." },
        ],
      },
      cookies: {
        title: "Cookies",
        description: "Wie +352 Flights notwendige Cookies und lokalen Speicher verwendet.",
        intro: "+352 Flights verwendet wenige notwendige Browser-Cookies und lokale Speicherwerte, damit die Oberfläche funktioniert, Einstellungen erhalten bleiben und Sitzungsfunktionen verfügbar sind.",
        sections: [
          { title: "Nur das Notwendige", body: "Diese Cookies unterstützen Abonnentensitzungen, Oberflächeneinstellungen und die Zuverlässigkeit des Produkts. Sie werden nicht für unabhängige Werbeprofile verwendet." },
          { title: "Gespeicherte Präferenzen", body: "Einstellungen wie Designmodus oder der letzte Oberflächenzustand können lokal gespeichert werden, damit die Nutzung zwischen Besuchen konsistent bleibt." },
          { title: "Verwaltung", body: "Sie können den Browserspeicher löschen oder Cookies in den Browsereinstellungen blockieren. Einige Funktionen könnten dann nicht mehr korrekt arbeiten." },
        ],
      },
      terms: {
        title: "Nutzungsbedingungen",
        description: "Bedingungen für Tarifinformationen und Alerts von +352 Flights.",
        intro: "+352 Flights zeigt Tarifmöglichkeiten ab Luxemburg und ordnet sie in nützliche Reisemuster ein. Preise können sich schnell ändern und die Verfügbarkeit ist nie garantiert.",
        sections: [
          { title: "Tarifinformationen", body: "Angebote basieren auf den besten Kombinationen, die das System zum Prüfzeitpunkt verifizieren kann. Endpreis und Verfügbarkeit hängen immer von der Buchungsseite ab." },
          { title: "Keine Reisegarantie", body: "Routen, Flugpläne und Preise können sich ohne Vorankündigung ändern. Prüfen Sie vor dem Kauf immer die endgültigen Buchungsdetails." },
          { title: "Nutzung des Dienstes", body: "Das Produkt hilft, potenziell gute Tarife schneller zu entdecken; es ersetzt nicht die endgültige Bestätigung durch Airlines oder Reiseplattformen." },
        ],
      },
    },
  },
  pt: {
    eyebrow: "Informação legal",
    backHome: "Voltar ao início",
    pages: {
      privacy: {
        title: "Política de privacidade",
        description: "Como a +352 Flights utiliza preferências e dados técnicos.",
        intro: "A +352 Flights utiliza preferências dos subscritores, dados de tarifas e registos técnicos essenciais para operar o serviço, personalizar alertas e manter o produto fiável.",
        sections: [
          { title: "O que guardamos", body: "Guardamos as preferências escolhidas, as rotas e combinações de tarifas apresentadas pelo scanner e a informação técnica mínima necessária para operar o produto." },
          { title: "Por que a guardamos", body: "Esta informação é utilizada para enviar emails relevantes, melhorar a correspondência e acompanhar a fiabilidade do serviço." },
          { title: "O seu controlo", body: "Pode atualizar as preferências a qualquer momento através do seu link privado ou parar todos os emails usando o link de cancelamento incluído em cada mensagem." },
        ],
      },
      cookies: {
        title: "Cookies",
        description: "Como a +352 Flights utiliza cookies essenciais e armazenamento local.",
        intro: "A +352 Flights utiliza alguns cookies essenciais e chaves de armazenamento local para manter a interface a funcionar, recordar definições e preservar o comportamento da sessão.",
        sections: [
          { title: "Apenas o essencial", body: "Estes cookies suportam sessões, preferências da interface e fiabilidade do produto. Não são utilizados para criar perfis publicitários sem relação com o serviço." },
          { title: "Preferências guardadas", body: "Algumas definições, como o tema ou o estado recente da interface, podem ser guardadas localmente para manter uma experiência consistente entre visitas." },
          { title: "Como geri-los", body: "Pode limpar o armazenamento ou bloquear cookies nas definições do navegador, embora algumas funcionalidades possam deixar de funcionar corretamente." },
        ],
      },
      terms: {
        title: "Termos de utilização",
        description: "Termos das informações de tarifas e alertas da +352 Flights.",
        intro: "A +352 Flights apresenta oportunidades de tarifas a partir do Luxemburgo e organiza-as em padrões de viagem úteis, mas os preços podem mudar rapidamente e a disponibilidade nunca é garantida.",
        sections: [
          { title: "Informação de tarifas", body: "As ofertas baseiam-se nas melhores combinações que o sistema consegue verificar no momento da análise. O preço final e a disponibilidade dependem sempre da página de reserva." },
          { title: "Sem garantia de viagem", body: "Rotas, horários e preços podem mudar sem aviso. Confirme sempre os detalhes finais antes de comprar." },
          { title: "Utilização do serviço", body: "O produto ajuda a descobrir tarifas potencialmente interessantes mais depressa; não substitui a confirmação final de companhias aéreas ou plataformas de viagem." },
        ],
      },
    },
  },
  it: {
    eyebrow: "Informazioni legali",
    backHome: "Torna alla home",
    pages: {
      privacy: {
        title: "Informativa sulla privacy",
        description: "Come +352 Flights utilizza preferenze e dati tecnici.",
        intro: "+352 Flights utilizza le preferenze degli iscritti, i dati tariffari e i registri tecnici essenziali per gestire il servizio, personalizzare gli avvisi e mantenere affidabile il prodotto.",
        sections: [
          { title: "Cosa conserviamo", body: "Conserviamo le preferenze scelte, le rotte e le combinazioni tariffarie rilevate dallo scanner e le informazioni tecniche minime necessarie al funzionamento." },
          { title: "Perché le conserviamo", body: "Queste informazioni servono a inviare email pertinenti, migliorare gli abbinamenti e monitorare l’affidabilità del servizio." },
          { title: "Il tuo controllo", body: "Puoi aggiornare le preferenze in qualsiasi momento dal tuo link privato o interrompere tutte le email usando il link di disiscrizione incluso in ogni messaggio." },
        ],
      },
      cookies: {
        title: "Cookie",
        description: "Come +352 Flights utilizza cookie essenziali e memoria locale.",
        intro: "+352 Flights utilizza pochi cookie essenziali e dati di memoria locale per far funzionare l’interfaccia, ricordare le impostazioni e conservare le funzioni della sessione.",
        sections: [
          { title: "Solo l’essenziale", body: "Questi cookie supportano sessioni, preferenze dell’interfaccia e affidabilità del prodotto. Non vengono usati per creare profili pubblicitari non collegati al servizio." },
          { title: "Preferenze memorizzate", body: "Alcune impostazioni, come il tema o lo stato recente dell’interfaccia, possono essere salvate localmente per rendere coerente l’esperienza tra le visite." },
          { title: "Come gestirli", body: "Puoi cancellare la memoria del browser o bloccare i cookie nelle impostazioni, anche se alcune funzioni potrebbero non funzionare correttamente." },
        ],
      },
      terms: {
        title: "Termini di utilizzo",
        description: "Termini per le informazioni tariffarie e gli avvisi di +352 Flights.",
        intro: "+352 Flights presenta opportunità tariffarie dal Lussemburgo e le organizza in schemi di viaggio utili, ma i prezzi possono cambiare rapidamente e la disponibilità non è mai garantita.",
        sections: [
          { title: "Informazioni sulle tariffe", body: "Le offerte si basano sulle migliori combinazioni che il sistema riesce a verificare al momento della scansione. Prezzo finale e disponibilità dipendono sempre dalla pagina di prenotazione." },
          { title: "Nessuna garanzia di viaggio", body: "Rotte, orari e prezzi possono cambiare senza preavviso. Verifica sempre i dettagli finali prima dell’acquisto." },
          { title: "Uso del servizio", body: "Il prodotto aiuta a scoprire più rapidamente tariffe potenzialmente convenienti; non sostituisce la conferma finale di compagnie aeree o piattaforme di viaggio." },
        ],
      },
    },
  },
  es: {
    eyebrow: "Información legal",
    backHome: "Volver al inicio",
    pages: {
      privacy: {
        title: "Política de privacidad",
        description: "Cómo utiliza +352 Flights tus preferencias y datos técnicos.",
        intro: "+352 Flights utiliza las preferencias de suscriptores, los datos de tarifas y los registros técnicos esenciales para prestar el servicio, personalizar alertas y mantener el producto fiable.",
        sections: [
          { title: "Qué guardamos", body: "Guardamos las preferencias que eliges, las rutas y combinaciones de tarifas detectadas por el escáner y la información técnica mínima necesaria para operar el producto." },
          { title: "Por qué lo guardamos", body: "Esta información se utiliza para enviar emails relevantes, mejorar las coincidencias y supervisar la fiabilidad del servicio." },
          { title: "Tú tienes el control", body: "Puedes actualizar tus preferencias en cualquier momento desde tu enlace privado o detener todos los emails mediante el enlace de baja incluido en cada mensaje." },
        ],
      },
      cookies: {
        title: "Cookies",
        description: "Cómo utiliza +352 Flights las cookies esenciales y el almacenamiento local.",
        intro: "+352 Flights utiliza unas pocas cookies esenciales y claves de almacenamiento local para que la interfaz funcione, recordar ajustes y conservar el comportamiento de la sesión.",
        sections: [
          { title: "Solo lo esencial", body: "Estas cookies permiten gestionar sesiones, preferencias de interfaz y fiabilidad del producto. No se utilizan para crear perfiles publicitarios ajenos al servicio." },
          { title: "Preferencias guardadas", body: "Algunos ajustes, como el tema o el estado reciente de la interfaz, pueden guardarse localmente para mantener una experiencia coherente entre visitas." },
          { title: "Cómo gestionarlas", body: "Puedes borrar el almacenamiento o bloquear las cookies en los ajustes del navegador, aunque algunas funciones podrían dejar de funcionar correctamente." },
        ],
      },
      terms: {
        title: "Términos de uso",
        description: "Condiciones de uso de la información de tarifas y alertas de +352 Flights.",
        intro: "+352 Flights muestra oportunidades de tarifas desde Luxemburgo y las agrupa en formatos de viaje útiles, pero los precios pueden cambiar rápidamente y la disponibilidad nunca está garantizada.",
        sections: [
          { title: "Información de tarifas", body: "Las ofertas se basan en las mejores combinaciones que el sistema puede verificar en el momento del escaneo. El precio final y la disponibilidad dependen siempre de la página de reserva." },
          { title: "Sin garantía de viaje", body: "Las rutas, los horarios y los precios pueden cambiar sin aviso. Comprueba siempre los detalles finales antes de comprar." },
          { title: "Uso del servicio", body: "El producto ayuda a descubrir más rápido tarifas potencialmente interesantes; no sustituye la confirmación final de aerolíneas o plataformas de viaje." },
        ],
      },
    },
  },
};

export function getLocalizedLegalPath(locale: Locale, page: LegalPageKey) {
  const segment = legalPathSegments[locale][page];
  return locale === "en" ? `/${segment}` : `/${locale}/${segment}`;
}

export function getLegalPageFromSegment(locale: Locale, segment: string): LegalPageKey | null {
  const entry = Object.entries(legalPathSegments[locale]).find(([, value]) => value === segment);
  return (entry?.[0] as LegalPageKey | undefined) ?? null;
}

export function getLegalLanguageAlternates(page: LegalPageKey): Record<string, string> {
  return Object.fromEntries([
    ...locales.map((locale) => [htmlLangTags[locale], getLocalizedLegalPath(locale, page)]),
    ["x-default", getLocalizedLegalPath("en", page)],
  ]);
}

export function getLegalMetadata(locale: Locale, page: LegalPageKey): Metadata {
  const copy = legalCopy[locale].pages[page];
  const pathname = getLocalizedLegalPath(locale, page);
  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: pathname,
      languages: getLegalLanguageAlternates(page),
    },
    openGraph: {
      type: "website",
      siteName: "+352 Flights",
      title: copy.title,
      description: copy.description,
      url: new URL(pathname, getSiteUrl()),
      locale: htmlLangTags[locale].replace("-", "_"),
    },
    robots: { index: true, follow: true },
  };
}
