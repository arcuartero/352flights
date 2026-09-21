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
        description: "How +352 Flights uses cookies and local browser storage.",
        intro: "+352 Flights uses necessary browser storage to run the site and save your choice. Functional, analytics and marketing categories are optional and start disabled.",
        sections: [
          { title: "Necessary", body: "Language, theme, security and your consent choice use necessary storage. These settings keep the site working." },
          { title: "Optional categories", body: "Functional storage can remember recent destinations. Google Analytics measures users, sessions and pages only after you accept analytics. Marketing remains inactive unless relevant services are added and you consent." },
          { title: "Anonymous counts", body: "We count banner decisions and broad page groups after a rejection or closure in daily totals. These totals contain no visitor ID, IP address, session ID, user agent or full URL. They cannot identify unique visitors. Rejected visits are not sent to Google Analytics." },
          { title: "How to manage them", body: "Use the Cookie settings button on any page to accept, reject or change optional categories. Rejecting them removes the saved recent-destinations list and Google Analytics cookies." },
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
        description: "Comment +352 Flights utilise les cookies et le stockage local.",
        intro: "+352 Flights utilise un stockage nécessaire au fonctionnement du site et à la sauvegarde de votre choix. Les catégories fonctionnelles, statistiques et marketing sont facultatives et désactivées par défaut.",
        sections: [
          { title: "Nécessaires", body: "La langue, le thème, la sécurité et votre choix de cookies utilisent un stockage nécessaire au fonctionnement du site." },
          { title: "Catégories facultatives", body: "Le stockage fonctionnel peut mémoriser les destinations récentes. Google Analytics mesure les visites uniquement avec votre accord. Le marketing reste inactif sans service ajouté et accepté." },
          { title: "Comptages anonymes", body: "Nous comptons chaque jour les choix du bandeau et les grandes catégories de pages vues après un refus ou une fermeture, sans identifiant, adresse IP, session, agent utilisateur ni URL complète. Ces totaux ne comptent pas les visiteurs uniques et ne sont pas transmis à Google." },
          { title: "Comment les gérer", body: "Utilisez le bouton Paramètres des cookies sur chaque page pour modifier votre choix. Un refus efface les destinations récentes enregistrées." },
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
        description: "Wie +352 Flights Cookies und lokalen Speicher verwendet.",
        intro: "+352 Flights nutzt notwendigen Speicher für den Betrieb der Website und Ihre Auswahl. Funktionale, Analyse- und Marketing-Kategorien sind optional und zunächst deaktiviert.",
        sections: [
          { title: "Notwendig", body: "Sprache, Design, Sicherheit und Ihre Cookie-Auswahl benötigen Speicher für den Betrieb der Website." },
          { title: "Optionale Kategorien", body: "Funktionaler Speicher kann letzte Ziele merken. Google Analytics misst Besuche nur mit Ihrer Zustimmung. Marketing bleibt ohne zusätzliche Dienste und Zustimmung inaktiv." },
          { title: "Anonyme Zählwerte", body: "Wir zählen Banner-Entscheidungen und grobe Seitengruppen nach Ablehnung oder Schließen als Tageswerte, ohne Besucherkennung, IP-Adresse, Sitzung, User-Agent oder vollständige URL. Daraus ergeben sich keine eindeutigen Besucher; an Google wird nichts gesendet." },
          { title: "Verwaltung", body: "Über Cookie-Einstellungen auf jeder Seite können Sie Ihre Auswahl ändern. Eine Ablehnung löscht gespeicherte letzte Ziele." },
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
        description: "Como a +352 Flights utiliza cookies e armazenamento local.",
        intro: "A +352 Flights utiliza armazenamento necessário para o site funcionar e guardar a sua escolha. As categorias funcionais, analíticas e de marketing são opcionais e começam desligadas.",
        sections: [
          { title: "Necessários", body: "Idioma, tema, segurança e a sua escolha de cookies usam armazenamento necessário para o funcionamento do site." },
          { title: "Categorias opcionais", body: "O armazenamento funcional pode recordar destinos recentes. O Google Analytics mede visitas apenas com o seu consentimento. O marketing permanece inativo sem serviços adicionais aceites." },
          { title: "Contagens anónimas", body: "Contamos escolhas do banner e grupos gerais de páginas após rejeição ou fecho em totais diários, sem identificador, IP, sessão, agente do navegador ou URL completa. Não representam visitantes únicos nem são enviados à Google." },
          { title: "Como geri-los", body: "Use Definições de cookies em qualquer página para alterar a escolha. Rejeitar apaga os destinos recentes guardados." },
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
        description: "Come +352 Flights utilizza cookie e memoria locale.",
        intro: "+352 Flights usa memoria necessaria per il sito e per salvare la tua scelta. Le categorie funzionali, analitiche e marketing sono facoltative e inizialmente disattivate.",
        sections: [
          { title: "Necessari", body: "Lingua, tema, sicurezza e scelta dei cookie usano memoria necessaria al funzionamento del sito." },
          { title: "Categorie facoltative", body: "La memoria funzionale può ricordare le destinazioni recenti. Google Analytics misura le visite solo con il tuo consenso. Il marketing resta inattivo senza altri servizi accettati." },
          { title: "Conteggi anonimi", body: "Contiamo le scelte del banner e i gruppi generali di pagine dopo un rifiuto o una chiusura in totali giornalieri, senza identificativi, IP, sessioni, user agent o URL completo. Non sono visitatori unici e non inviamo questi dati a Google." },
          { title: "Come gestirli", body: "Usa Impostazioni cookie in ogni pagina per modificare la scelta. Il rifiuto cancella le destinazioni recenti salvate." },
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
        description: "Cómo utiliza +352 Flights las cookies y el almacenamiento local.",
        intro: "+352 Flights usa almacenamiento necesario para que funcione la web y guardar tu elección. Las categorías funcionales, analíticas y de marketing son opcionales y empiezan desactivadas.",
        sections: [
          { title: "Necesarias", body: "El idioma, el tema, la seguridad y tu elección de cookies usan almacenamiento necesario para la web." },
          { title: "Categorías opcionales", body: "El almacenamiento funcional puede recordar destinos recientes. Google Analytics mide visitas y sesiones solo si aceptas la categoría Analíticas. Marketing sigue inactivo mientras no se incorporen otros servicios y los aceptes." },
          { title: "Recuentos anónimos", body: "Contamos cada día las decisiones del banner y grupos generales de páginas vistas después de rechazar o cerrar. No guardamos identificadores, dirección IP, sesión, agente del navegador ni URL completa. No son usuarios únicos ni se envían a Google." },
          { title: "Cómo gestionarlas", body: "Usa Configuración de cookies en cualquier página para cambiar tu elección. Rechazarlas borra los destinos recientes guardados." },
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
