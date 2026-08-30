export const CREATELLO_TEMPLATES = [
  "travel-offer", "travel-offer-glass", "travel-offer-dark",
  "cheap-flights-tiktok", "flight-deals-352",
] as const;
export const CREATELLO_LANGUAGES = ["es", "en", "fr", "de", "pt"] as const;

export type CreatelloTemplate = typeof CREATELLO_TEMPLATES[number];
export type CreatelloLanguage = typeof CREATELLO_LANGUAGES[number];

export type TikTokOrigin = { airport: string; city: string; flag: string };
export type TikTokSourceOffer = {
  id: number; originAirport: string; originCity?: string; destinationAirport: string;
  destinationCity: string; departureDate: string; returnDate: string; price: number;
  currency: string; maxStops: string; scannedAt: string; metadata?: Record<string, unknown>;
};
export type TikTokGenerationOptions = {
  template: CreatelloTemplate; language: CreatelloLanguage; originAirport: string;
  startMonth: string; slideCount: number; offersPerSlide: number; maxPrice?: number; now?: Date;
};
export type TikTokGenerationResult = {
  document: Record<string, unknown>; warnings: string[];
  preview: Array<{ title: string; detail: string; price?: number; currency?: string }>;
};

const LOCALES: Record<CreatelloLanguage, string> = {
  es: "es-ES", en: "en-GB", fr: "fr-FR", de: "de-DE", pt: "pt-PT",
};
const CTA: Record<CreatelloLanguage, string> = {
  es: "Ver oferta", en: "View deal", fr: "Voir l’offre", de: "Angebot ansehen", pt: "Ver oferta",
};
const COVER = {
  es: ["VUELOS BARATOS", "Desde"], en: ["CHEAP FLIGHTS", "From"],
  fr: ["VOLS PAS CHERS", "Depuis"], de: ["GÜNSTIGE FLÜGE", "Ab"], pt: ["VOOS BARATOS", "Desde"],
} as const;
const CLOSING = {
  es: ["Tú sabes cuándo volar. Nosotros encontramos dónde.", "Elige tus días de viaje preferidos y encontraremos vuelos desde Luxemburgo que encajen contigo y cuesten menos de lo habitual.", "Descubre tu próximo viaje"],
  en: ["You know when to fly. We’ll find where.", "Choose your preferred travel days, and we’ll find flights from Luxembourg that fit your rhythm and cost less than usual.", "Discover your next trip"],
  fr: ["Vous savez quand partir. Nous trouvons où.", "Choisissez vos jours de voyage préférés et nous trouverons des vols depuis Luxembourg adaptés à votre rythme et moins chers que d’habitude.", "Découvrez votre prochain voyage"],
  de: ["Du weißt, wann du fliegen willst. Wir finden das Ziel.", "Wähle deine bevorzugten Reisetage und wir finden Flüge ab Luxemburg, die zu deinem Rhythmus passen und günstiger als üblich sind.", "Entdecke deine nächste Reise"],
  pt: ["Sabes quando voar. Nós encontramos o destino.", "Escolhe os teus dias de viagem preferidos e encontraremos voos desde o Luxemburgo que se ajustem ao teu ritmo e custem menos do que o habitual.", "Descobre a tua próxima viagem"],
} as const;
const ORIGINS: Record<string, Record<CreatelloLanguage, string>> = {
  LUX: { es: "Luxemburgo", en: "Luxembourg", fr: "Luxembourg", de: "Luxemburg", pt: "Luxemburgo" },
};
const COUNTRY_DATA: Record<string, { code: string; flag: string; names: Record<CreatelloLanguage, string> }> = {
  GB:{code:"GB",flag:"🇬🇧",names:{es:"Reino Unido",en:"United Kingdom",fr:"Royaume-Uni",de:"Vereinigtes Königreich",pt:"Reino Unido"}},
  FR:{code:"FR",flag:"🇫🇷",names:{es:"Francia",en:"France",fr:"France",de:"Frankreich",pt:"França"}},
  ES:{code:"ES",flag:"🇪🇸",names:{es:"España",en:"Spain",fr:"Espagne",de:"Spanien",pt:"Espanha"}},
  IT:{code:"IT",flag:"🇮🇹",names:{es:"Italia",en:"Italy",fr:"Italie",de:"Italien",pt:"Itália"}},
  PT:{code:"PT",flag:"🇵🇹",names:{es:"Portugal",en:"Portugal",fr:"Portugal",de:"Portugal",pt:"Portugal"}},
  DE:{code:"DE",flag:"🇩🇪",names:{es:"Alemania",en:"Germany",fr:"Allemagne",de:"Deutschland",pt:"Alemanha"}},
  AT:{code:"AT",flag:"🇦🇹",names:{es:"Austria",en:"Austria",fr:"Autriche",de:"Österreich",pt:"Áustria"}},
  BE:{code:"BE",flag:"🇧🇪",names:{es:"Bélgica",en:"Belgium",fr:"Belgique",de:"Belgien",pt:"Bélgica"}},
  NL:{code:"NL",flag:"🇳🇱",names:{es:"Países Bajos",en:"Netherlands",fr:"Pays-Bas",de:"Niederlande",pt:"Países Baixos"}},
  IE:{code:"IE",flag:"🇮🇪",names:{es:"Irlanda",en:"Ireland",fr:"Irlande",de:"Irland",pt:"Irlanda"}},
  CH:{code:"CH",flag:"🇨🇭",names:{es:"Suiza",en:"Switzerland",fr:"Suisse",de:"Schweiz",pt:"Suíça"}},
};
const AIRPORT_COUNTRY: Record<string,string> = {
  LHR:"GB",LGW:"GB",STN:"GB",LCY:"GB",EDI:"GB",MAN:"GB",CDG:"FR",ORY:"FR",NCE:"FR",MRS:"FR",TLS:"FR",BOD:"FR",BCN:"ES",MAD:"ES",PMI:"ES",AGP:"ES",ALC:"ES",SVQ:"ES",VLC:"ES",IBZ:"ES",FCO:"IT",CIA:"IT",MXP:"IT",LIN:"IT",BGY:"IT",NAP:"IT",VCE:"IT",LIS:"PT",OPO:"PT",FAO:"PT",BER:"DE",MUC:"DE",FRA:"DE",HAM:"DE",VIE:"AT",BRU:"BE",AMS:"NL",DUB:"IE",ZRH:"CH",GVA:"CH",
  HDF:"DE",GWT:"DE",BOJ:"BG",VAR:"BG",BVC:"CV",RAI:"CV",SID:"CV",VXE:"CV",PRG:"CZ",CGO:"CN",ZAD:"HR",BWK:"HR",DBV:"HR",CPH:"DK",HRG:"EG",RMF:"EG",LJU:"SI",TFS:"ES",LPA:"ES",XRY:"ES",LEI:"ES",BIO:"ES",FUE:"ES",GRO:"ES",ACE:"ES",MAH:"ES",SPC:"ES",JFK:"US",EWR:"US",HEL:"FI",RVN:"FI",FSC:"FR",CLY:"FR",AJA:"FR",BIA:"FR",BIQ:"FR",MPL:"FR",TLN:"FR",ATH:"GR",KGS:"GR",CFU:"GR",CHQ:"GR",HER:"GR",RHO:"GR",GPA:"GR",SKG:"GR",ZTH:"GR",BUD:"HU",RMI:"IT",PSR:"IT",BRI:"IT",BLQ:"IT",BZO:"IT",BDS:"IT",CAG:"IT",CTA:"IT",FLR:"IT",SUF:"IT",OLB:"IT",PMO:"IT",QSR:"IT",NRT:"JP",MLA:"MT",RAK:"MA",AGA:"MA",TIV:"ME",OSL:"NO",KRK:"PL",WAW:"PL",FNC:"PT",PXO:"PT",OTP:"RO",DSS:"SN",ARN:"SE",TUN:"TN",DJE:"TN",NBE:"TN",MIR:"TN",IST:"TR",AYT:"TR",ADB:"TR",DXB:"AE",DWC:"AE",AUH:"AE",
};
const CITY_NAMES: Record<string, Partial<Record<CreatelloLanguage,string>>> = {
  london:{es:"Londres",fr:"Londres",de:"London",pt:"Londres"}, paris:{es:"París",de:"Paris",pt:"Paris"},
  lisbon:{es:"Lisboa",fr:"Lisbonne",de:"Lissabon",pt:"Lisboa"}, rome:{es:"Roma",fr:"Rome",de:"Rom",pt:"Roma"},
  milan:{es:"Milán",fr:"Milan",de:"Mailand",pt:"Milão"}, munich:{es:"Múnich",fr:"Munich",de:"München",pt:"Munique"},
  vienna:{es:"Viena",fr:"Vienne",de:"Wien",pt:"Viena"}, brussels:{es:"Bruselas",fr:"Bruxelles",de:"Brüssel",pt:"Bruxelas"},
};

function parseDate(value:string) { const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if(!m)return null; return new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); }
function todayKey(now:Date) { return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Luxembourg",year:"numeric",month:"2-digit",day:"2-digit"}).format(now); }
function monthDate(start:string, offset:number) { const [y,m]=start.split("-").map(Number); if(!y||m<1||m>12)throw new Error("El mes inicial no es válido."); return new Date(Date.UTC(y,m-1+offset,1)); }
export function getTikTokCarouselDateRange(startMonth:string, count:number, now=new Date()) { const start=monthDate(startMonth,0); const end=monthDate(startMonth,Math.min(20,Math.max(1,Math.trunc(count)))); const first=start.toISOString().slice(0,10); return {fromDate:first>todayKey(now)?first:todayKey(now),toDateExclusive:end.toISOString().slice(0,10)}; }
export function resolveTikTokOrigin(airport:string):TikTokOrigin { const code=airport.trim().toUpperCase(); return {airport:code,city:ORIGINS[code]?.es??code,flag:code==="LUX"?"🇱🇺":""}; }
function keyText(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();}
function cityName(city:string,lang:CreatelloLanguage){return CITY_NAMES[keyText(city)]?.[lang]??city.trim();}
function countryFor(airport:string,lang:CreatelloLanguage){const code=AIRPORT_COUNTRY[airport.toUpperCase()]; if(!code)throw new Error(`Falta el país y código ISO para ${airport.toUpperCase()}.`); const name=new Intl.DisplayNames([LOCALES[lang]],{type:"region"}).of(code); if(!name)throw new Error(`No se pudo traducir el país ${code}.`); const flag=String.fromCodePoint(...[...code].map(letter=>127397+letter.charCodeAt(0))); return {code,name,flag};}
function shortDate(value:string,lang:CreatelloLanguage){const date=parseDate(value); if(!date)throw new Error(`Fecha no válida: ${value}.`); const month=new Intl.DateTimeFormat(LOCALES[lang],{month:"short",timeZone:"UTC"}).format(date).replace(/\.$/,lang==="fr"?".":"").toLowerCase(); return `${date.getUTCDate()} ${month}`;}
function monthName(value:string,lang:CreatelloLanguage){const date=parseDate(value); if(!date)throw new Error(`Fecha no válida: ${value}.`); const name=new Intl.DateTimeFormat(LOCALES[lang],{month:"long",timeZone:"UTC"}).format(date); return name.charAt(0).toUpperCase()+name.slice(1);}
function currency(v:string){const n=v.trim().toUpperCase(); return n==="EUR"||n==="€"?"€":n==="USD"||n==="$"?"$":n==="GBP"||n==="£"?"£":v.trim();}
function metaString(o:TikTokSourceOffer,key:string){const v=o.metadata?.[key]; return typeof v==="string"&&v.trim()?v.trim():undefined;}
function time(v:string|undefined,label:string){if(!v)throw new Error(`Falta ${label}.`); const m=/T(\d{2}:\d{2})/.exec(v); if(!m)throw new Error(`${label} no tiene un horario válido.`); return m[1];}
function duration(a:string|undefined,b:string|undefined,label:string){if(!a||!b)throw new Error(`Falta ${label}.`); const ms=new Date(b).getTime()-new Date(a).getTime(); if(!Number.isFinite(ms)||ms<=0)throw new Error(`${label} no es válida.`); const mins=Math.round(ms/60000); return `${Math.floor(mins/60)}h ${mins%60}m`;}
function tripDuration(o:TikTokSourceOffer,lang:CreatelloLanguage){const a=parseDate(o.departureDate),b=parseDate(o.returnDate); if(!a||!b)throw new Error("Las fechas del viaje no son válidas."); const days=Math.round((b.getTime()-a.getTime())/86400000)+1; const words={es:days===1?"día":"días",en:days===1?"day":"days",fr:days===1?"jour":"jours",de:days===1?"Tag":"Tage",pt:days===1?"dia":"dias"}; return `${days} ${words[lang]}`;}
function normalized(offers:TikTokSourceOffer[],options:TikTokGenerationOptions){const origin=options.originAirport.toUpperCase(); const range=getTikTokCarouselDateRange(options.startMonth,options.slideCount,options.now); const best=new Map<string,TikTokSourceOffer>(); for(const o of offers){if(o.originAirport.toUpperCase()!==origin||o.departureDate<range.fromDate||o.departureDate>=range.toDateExclusive||!parseDate(o.departureDate)||!parseDate(o.returnDate)||o.returnDate<o.departureDate||!Number.isFinite(o.price)||o.price<=0)continue; const k=`${origin}:${o.destinationAirport.toUpperCase()}:${o.departureDate}:${o.returnDate}`; if(!best.has(k)||o.price<best.get(k)!.price)best.set(k,o);} return [...best.values()].sort((a,b)=>a.price-b.price||a.departureDate.localeCompare(b.departureDate)).slice(0,200);}
function uniqueDestinationOffers(offers:TikTokSourceOffer[]){const seen=new Set<string>(); return offers.filter(offer=>{const key=keyText(offer.destinationCity); if(seen.has(key))return false; seen.add(key); return true;});}

export function generateCreatelloDocument(source:TikTokSourceOffer[],options:TikTokGenerationOptions):TikTokGenerationResult {
  const offers=uniqueDestinationOffers(normalized(source,options)); if(!offers.length)throw new Error("No hay ofertas reales válidas para la selección.");
  const lang=options.language, originCode=options.originAirport.toUpperCase(), originCity=ORIGINS[originCode]?.[lang]??resolveTikTokOrigin(originCode).city;
  let document:Record<string,unknown>; const preview:TikTokGenerationResult["preview"]=[];
  if(options.template==="cheap-flights-tiktok"){
    const groups=new Map<string,TikTokSourceOffer[]>(); for(const o of offers){const k=o.departureDate.slice(0,7); const list=groups.get(k)??[]; if(list.length<Math.min(10,Math.max(3,options.offersPerSlide)))list.push(o); groups.set(k,list);}
    const slides=[...groups.values()].slice(0,20).filter(v=>v.length>0).map(group=>({origin:{city:originCity,airport:originCode},offers:group.map(o=>({destination:cityName(o.destinationCity,lang),airport:o.destinationAirport.toUpperCase(),departure:shortDate(o.departureDate,lang),returnDate:shortDate(o.returnDate,lang),price:Number(o.price.toFixed(2)),currency:currency(o.currency)}))}));
    const c=CLOSING[lang]; document={template:"cheap-flights-tiktok",language:lang,cover:{title:COVER[lang][0],subtitle:`${COVER[lang][1]} ${originCity}`},slides,closing:{headline:c[0],body:c[1],cta:c[2]}};
    slides.forEach(s=>preview.push({title:s.offers.map(o=>o.destination).join(" · "),detail:`${s.offers.length} ofertas`}));
  } else if(options.template==="flight-deals-352"){
    const monthOffers=offers.filter(o=>o.departureDate.slice(0,7)===options.startMonth).filter(o=>o.price<=(options.maxPrice??Infinity)).slice(0,20); if(!monthOffers.length)throw new Error("No hay ofertas válidas del mes y precio seleccionados.");
    const slides=monthOffers.map(o=>{const country=countryFor(o.destinationAirport,lang), od=metaString(o,"outbound_departure_at"),oa=metaString(o,"outbound_arrival_at"),rd=metaString(o,"return_departure_at"),ra=metaString(o,"return_arrival_at"),airline=metaString(o,"airline_summary")??metaString(o,"primary_airline"),code=metaString(o,"primary_airline_code")?.toUpperCase(); if(!airline)throw new Error(`Falta la aerolínea para ${o.destinationAirport}.`); if(!code||!/^[A-Z0-9]{2}$/.test(code))throw new Error(`Falta el código IATA de aerolínea para ${o.destinationAirport}.`); return {destination:cityName(o.destinationCity,lang),flag:country.flag,outboundDate:shortDate(o.departureDate,lang),returnDate:shortDate(o.returnDate,lang),originAirport:originCode,destinationAirport:o.destinationAirport.toUpperCase(),outboundDepartureTime:time(od,"la salida de ida"),outboundArrivalTime:time(oa,"la llegada de ida"),returnDepartureTime:time(rd,"la salida de vuelta"),returnArrivalTime:time(ra,"la llegada de vuelta"),outboundDuration:duration(od,oa,"la duración de ida"),returnDuration:duration(rd,ra,"la duración de vuelta"),airline,airlineCode:code,price:Number(o.price.toFixed(2)),currency:currency(o.currency),cta:CTA[lang]};});
    document={template:"flight-deals-352",language:lang,cover:{month:monthName(monthOffers[0].departureDate,lang),maxPrice:options.maxPrice??Math.ceil(Math.max(...monthOffers.map(o=>o.price))),currency:currency(monthOffers[0].currency)},slides}; slides.forEach(s=>preview.push({title:s.destination,detail:`${s.outboundDate} → ${s.returnDate}`,price:s.price,currency:s.currency}));
  } else {
    const slides=offers.slice(0,Math.min(20,Math.max(1,options.slideCount))).map(o=>{const country=countryFor(o.destinationAirport,lang); return {title:cityName(o.destinationCity,lang),country:country.name,countryCode:country.code,origin:originCode,destination:o.destinationAirport.toUpperCase(),outboundDate:shortDate(o.departureDate,lang),returnDate:shortDate(o.returnDate,lang),duration:tripDuration(o,lang),direct:o.maxStops.toUpperCase()==="NON_STOP",price:Number(o.price.toFixed(2)),currency:currency(o.currency),currencyPosition:currency(o.currency)==="€"?"after":"before",cta:CTA[lang]};});
    document={template:"travel-offer",language:lang,slides}; slides.forEach(s=>preview.push({title:s.title,detail:`${s.country} · ${s.outboundDate} → ${s.returnDate}`,price:s.price,currency:s.currency}));
  }
  validateCreatelloDocument(document); return {document,warnings:[],preview};
}

export function validateCreatelloDocument(document:Record<string,unknown>){
  const json=JSON.stringify(document); JSON.parse(json);
  if(/"(?:image\w*|\w*style|color|position\w*|zoom)"\s*:/i.test(json))throw new Error("El JSON contiene imágenes o configuración visual.");
  if(!["travel-offer","cheap-flights-tiktok","flight-deals-352"].includes(String(document.template)))throw new Error("Identificador de plantilla no admitido.");
  if(!CREATELLO_LANGUAGES.includes(document.language as CreatelloLanguage))throw new Error("Idioma no admitido.");
  const slides=document.slides; if(!Array.isArray(slides)||slides.length<1||slides.length>20)throw new Error("El JSON debe contener entre 1 y 20 slides.");
  if(json.includes(":null")||json.includes("undefined"))throw new Error("El JSON contiene valores vacíos no admitidos.");
  const seen=new Set<string>(); const seenDestinations=new Set<string>();
  const offers=slides.flatMap(slide=>{if(!slide||typeof slide!=="object")throw new Error("Hay una slide no válida."); const value=slide as Record<string,unknown>; return Array.isArray(value.offers)?value.offers:[value];});
  for(const item of offers){if(!item||typeof item!=="object")throw new Error("Hay una oferta no válida."); const offer=item as Record<string,unknown>; const price=offer.price; if(typeof price!=="number"||!Number.isFinite(price)||price<=0)throw new Error("Todos los precios deben ser números válidos."); const iataFields=document.template==="flight-deals-352"?["originAirport","destinationAirport"]:document.template==="cheap-flights-tiktok"?["airport"]:["origin","destination"]; for(const field of iataFields){const value=offer[field]; if(typeof value==="string"&&(value!==value.toUpperCase()||!/^[A-Z]{3}$/.test(value)))throw new Error(`${field} debe ser un código IATA en mayúsculas.`);} const key=[offer.origin??offer.originAirport,offer.destinationAirport??offer.destination??offer.airport,offer.outboundDate??offer.departure,offer.returnDate].join(":"); if(seen.has(key))throw new Error("El JSON contiene ofertas duplicadas."); seen.add(key); const destinationKey=keyText(String(offer.title??offer.destination??offer.airport??offer.destinationAirport)); if(seenDestinations.has(destinationKey))throw new Error("El JSON contiene destinos repetidos."); seenDestinations.add(destinationKey);}
}
