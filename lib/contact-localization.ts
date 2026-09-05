import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/env";
import type { Locale } from "@/lib/locales";

type ContactCopy = {
  navLabel: string;
  eyebrow: string;
  title: string;
  intro: string;
  emailPrompt: string;
  responseTime: string;
  formTitle: string;
  name: string;
  namePlaceholder: string;
  email: string;
  emailPlaceholder: string;
  reason: string;
  reasons: {
    general: string;
    deals: string;
    partnership: string;
    privacy: string;
    technical: string;
  };
  subject: string;
  subjectPlaceholder: string;
  message: string;
  messagePlaceholder: string;
  privacyPrefix: string;
  privacyLink: string;
  submit: string;
  submitting: string;
  success: string;
  error: string;
  backHome: string;
};

export const contactPathSegments: Record<Locale, string> = {
  en: "contact",
  fr: "contact",
  de: "kontakt",
  pt: "contacto",
  it: "contatti",
  es: "contacto",
};

export const contactCopy: Record<Locale, ContactCopy> = {
  en: {
    navLabel: "Contact",
    eyebrow: "Contact",
    title: "How can we help?",
    intro: "Questions about a fare, your alerts, a partnership, or anything else? Send us a message and we’ll get back to you as soon as we can.",
    emailPrompt: "Prefer email?",
    responseTime: "We usually reply within two working days.",
    formTitle: "Send us a message",
    name: "Name",
    namePlaceholder: "Your name",
    email: "Email address",
    emailPlaceholder: "you@email.com",
    reason: "What can we help with?",
    reasons: { general: "General question", deals: "Flight deals or alerts", partnership: "Partnership", privacy: "Privacy or data", technical: "Technical issue" },
    subject: "Subject",
    subjectPlaceholder: "A short summary",
    message: "Message",
    messagePlaceholder: "Tell us how we can help…",
    privacyPrefix: "By sending this form, you agree that we may use these details to answer your request. See our",
    privacyLink: "privacy policy",
    submit: "Send message",
    submitting: "Sending…",
    success: "Thank you — your message has been sent. We’ll be in touch soon.",
    error: "We couldn’t send your message right now. Please try again or email us directly.",
    backHome: "Back to home",
  },
  fr: {
    navLabel: "Contact",
    eyebrow: "Contact",
    title: "Comment pouvons-nous vous aider ?",
    intro: "Une question sur un tarif, vos alertes, un partenariat ou autre chose ? Envoyez-nous un message et nous vous répondrons dès que possible.",
    emailPrompt: "Vous préférez l’email ?",
    responseTime: "Nous répondons généralement sous deux jours ouvrés.",
    formTitle: "Envoyez-nous un message",
    name: "Nom",
    namePlaceholder: "Votre nom",
    email: "Adresse email",
    emailPlaceholder: "vous@email.com",
    reason: "Comment pouvons-nous vous aider ?",
    reasons: { general: "Question générale", deals: "Offres de vols ou alertes", partnership: "Partenariat", privacy: "Confidentialité ou données", technical: "Problème technique" },
    subject: "Objet",
    subjectPlaceholder: "Un bref résumé",
    message: "Message",
    messagePlaceholder: "Expliquez-nous comment nous pouvons vous aider…",
    privacyPrefix: "En envoyant ce formulaire, vous acceptez que nous utilisions ces informations pour répondre à votre demande. Consultez notre",
    privacyLink: "politique de confidentialité",
    submit: "Envoyer le message",
    submitting: "Envoi…",
    success: "Merci — votre message a bien été envoyé. Nous vous répondrons bientôt.",
    error: "Votre message n’a pas pu être envoyé. Réessayez ou écrivez-nous directement.",
    backHome: "Retour à l’accueil",
  },
  de: {
    navLabel: "Kontakt",
    eyebrow: "Kontakt",
    title: "Wie können wir helfen?",
    intro: "Fragen zu einem Tarif, Ihren Alerts, einer Partnerschaft oder zu etwas anderem? Schreiben Sie uns – wir melden uns so bald wie möglich.",
    emailPrompt: "Lieber per E-Mail?",
    responseTime: "Wir antworten normalerweise innerhalb von zwei Werktagen.",
    formTitle: "Nachricht senden",
    name: "Name",
    namePlaceholder: "Ihr Name",
    email: "E-Mail-Adresse",
    emailPlaceholder: "sie@email.com",
    reason: "Wobei können wir helfen?",
    reasons: { general: "Allgemeine Frage", deals: "Flugangebote oder Alerts", partnership: "Partnerschaft", privacy: "Datenschutz oder Daten", technical: "Technisches Problem" },
    subject: "Betreff",
    subjectPlaceholder: "Kurze Zusammenfassung",
    message: "Nachricht",
    messagePlaceholder: "Beschreiben Sie, wie wir helfen können…",
    privacyPrefix: "Mit dem Absenden stimmen Sie zu, dass wir diese Angaben zur Beantwortung Ihrer Anfrage verwenden. Mehr in unserer",
    privacyLink: "Datenschutzerklärung",
    submit: "Nachricht senden",
    submitting: "Wird gesendet…",
    success: "Vielen Dank — Ihre Nachricht wurde gesendet. Wir melden uns bald.",
    error: "Ihre Nachricht konnte nicht gesendet werden. Versuchen Sie es erneut oder schreiben Sie uns direkt.",
    backHome: "Zur Startseite",
  },
  pt: {
    navLabel: "Contacto",
    eyebrow: "Contacto",
    title: "Como podemos ajudar?",
    intro: "Tem uma questão sobre uma tarifa, os seus alertas, uma parceria ou outro assunto? Envie-nos uma mensagem e responderemos assim que possível.",
    emailPrompt: "Prefere email?",
    responseTime: "Normalmente respondemos em dois dias úteis.",
    formTitle: "Envie-nos uma mensagem",
    name: "Nome",
    namePlaceholder: "O seu nome",
    email: "Endereço de email",
    emailPlaceholder: "voce@email.com",
    reason: "Como podemos ajudar?",
    reasons: { general: "Questão geral", deals: "Ofertas de voos ou alertas", partnership: "Parceria", privacy: "Privacidade ou dados", technical: "Problema técnico" },
    subject: "Assunto",
    subjectPlaceholder: "Um breve resumo",
    message: "Mensagem",
    messagePlaceholder: "Diga-nos como podemos ajudar…",
    privacyPrefix: "Ao enviar este formulário, aceita que utilizemos estes dados para responder ao seu pedido. Consulte a nossa",
    privacyLink: "política de privacidade",
    submit: "Enviar mensagem",
    submitting: "A enviar…",
    success: "Obrigado — a sua mensagem foi enviada. Entraremos em contacto em breve.",
    error: "Não foi possível enviar a sua mensagem. Tente novamente ou envie-nos um email.",
    backHome: "Voltar ao início",
  },
  it: {
    navLabel: "Contatti",
    eyebrow: "Contatti",
    title: "Come possiamo aiutarti?",
    intro: "Hai una domanda su una tariffa, i tuoi avvisi, una collaborazione o altro? Inviaci un messaggio e ti risponderemo al più presto.",
    emailPrompt: "Preferisci l’email?",
    responseTime: "Di solito rispondiamo entro due giorni lavorativi.",
    formTitle: "Inviaci un messaggio",
    name: "Nome",
    namePlaceholder: "Il tuo nome",
    email: "Indirizzo email",
    emailPlaceholder: "tu@email.com",
    reason: "Come possiamo aiutarti?",
    reasons: { general: "Domanda generale", deals: "Offerte voli o avvisi", partnership: "Collaborazione", privacy: "Privacy o dati", technical: "Problema tecnico" },
    subject: "Oggetto",
    subjectPlaceholder: "Un breve riepilogo",
    message: "Messaggio",
    messagePlaceholder: "Raccontaci come possiamo aiutarti…",
    privacyPrefix: "Inviando il modulo, accetti che utilizziamo questi dati per rispondere alla tua richiesta. Consulta la nostra",
    privacyLink: "informativa sulla privacy",
    submit: "Invia messaggio",
    submitting: "Invio…",
    success: "Grazie — il messaggio è stato inviato. Ti risponderemo presto.",
    error: "Non è stato possibile inviare il messaggio. Riprova o scrivici direttamente.",
    backHome: "Torna alla home",
  },
  es: {
    navLabel: "Contacto",
    eyebrow: "Contacto",
    title: "¿Cómo podemos ayudarte?",
    intro: "¿Tienes alguna pregunta sobre una tarifa, tus alertas, una colaboración o cualquier otro tema? Envíanos un mensaje y te responderemos lo antes posible.",
    emailPrompt: "¿Prefieres escribirnos por email?",
    responseTime: "Normalmente respondemos en un plazo de dos días laborables.",
    formTitle: "Envíanos un mensaje",
    name: "Nombre",
    namePlaceholder: "Tu nombre",
    email: "Correo electrónico",
    emailPlaceholder: "tu@email.com",
    reason: "¿En qué podemos ayudarte?",
    reasons: { general: "Consulta general", deals: "Ofertas de vuelos o alertas", partnership: "Colaboración", privacy: "Privacidad o datos", technical: "Problema técnico" },
    subject: "Asunto",
    subjectPlaceholder: "Un breve resumen",
    message: "Mensaje",
    messagePlaceholder: "Cuéntanos cómo podemos ayudarte…",
    privacyPrefix: "Al enviar este formulario, aceptas que utilicemos estos datos para responder a tu solicitud. Consulta nuestra",
    privacyLink: "política de privacidad",
    submit: "Enviar mensaje",
    submitting: "Enviando…",
    success: "Gracias — tu mensaje se ha enviado correctamente. Te responderemos pronto.",
    error: "No hemos podido enviar tu mensaje. Inténtalo de nuevo o escríbenos directamente.",
    backHome: "Volver al inicio",
  },
};

export function getLocalizedContactPath(locale: Locale) {
  const segment = contactPathSegments[locale];
  return locale === "en" ? `/${segment}` : `/${locale}/${segment}`;
}

export function isContactSegment(locale: Locale, segment: string) {
  return contactPathSegments[locale] === segment;
}

export function getContactMetadata(locale: Locale): Metadata {
  const copy = contactCopy[locale];
  const canonical = getLocalizedContactPath(locale);

  return {
    title: `${copy.navLabel} | +352 Flights`,
    description: copy.intro,
    alternates: {
      canonical,
      languages: Object.fromEntries(
        (Object.keys(contactPathSegments) as Locale[]).map((language) => [
          language,
          `${getSiteUrl()}${getLocalizedContactPath(language)}`,
        ]),
      ),
    },
  };
}
