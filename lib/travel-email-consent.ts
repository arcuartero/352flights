import type { Locale } from "@/lib/locales";

// Keep each published version immutable so the stored version identifies the wording shown.
export const TRAVEL_EMAIL_CONSENT_VERSION = "travel-content-v1-2026-09-21";

export const travelEmailConsentCopy: Record<Locale, string> = {
  en: "I also want emails from +352 Flights with travel inspiration and accommodation offers. These are separate from my flight alerts. I can opt out at any time.",
  fr: "Je souhaite aussi recevoir des emails de +352 Flights avec des idées de voyage et des offres d’hébergement. Ils sont distincts de mes alertes de vols. Je peux me désinscrire à tout moment.",
  de: "Ich möchte auch E-Mails von +352 Flights mit Reiseideen und Unterkunftsangeboten erhalten. Diese sind unabhängig von meinen Flugbenachrichtigungen. Ich kann sie jederzeit abbestellen.",
  es: "También quiero recibir emails de +352 Flights con ideas de viaje y ofertas de alojamiento. Son independientes de mis alertas de vuelos. Puedo darme de baja cuando quiera.",
  pt: "Também quero receber emails da +352 Flights com ideias de viagem e ofertas de alojamento. São separados dos meus alertas de voos. Posso cancelar a qualquer momento.",
  it: "Voglio ricevere anche email da +352 Flights con idee di viaggio e offerte di alloggio. Sono separate dai miei avvisi sui voli. Posso annullare l’iscrizione in qualsiasi momento.",
};

export const travelEmailExistingSubscriberCopy: Record<Locale, string> = {
  en: "Already subscribed? Change this choice from your private preferences link.",
  fr: "Déjà abonné ? Modifiez ce choix depuis votre lien privé de préférences.",
  de: "Schon abonniert? Ändern Sie diese Auswahl über Ihren privaten Präferenzlink.",
  es: "¿Ya estás suscrito? Cambia esta elección desde tu enlace privado de preferencias.",
  pt: "Já subscreveu? Altere esta escolha através do seu link privado de preferências.",
  it: "Sei già iscritto? Modifica questa scelta dal tuo link privato delle preferenze.",
};
