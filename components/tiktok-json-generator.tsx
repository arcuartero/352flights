"use client";

import { AlertTriangle, Check, Copy, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreatelloLanguage, CreatelloTemplate, TikTokGenerationResult } from "@/lib/tiktok-carousel";

type Payload = TikTokGenerationResult;
type Props = { initialData: Payload | null; initialError: string | null; initialMonth: string };
const TEMPLATES: Array<{value:CreatelloTemplate;label:string}> = [
  {value:"travel-offer",label:"Oferta de viaje"},
  {value:"travel-offer-glass",label:"Oferta de viaje Glass"},
  {value:"travel-offer-dark",label:"Oferta de viaje Dark"},
  {value:"cheap-flights-tiktok",label:"Cheap Flights / TikTok Organic"},
  {value:"flight-deals-352",label:"Ofertas de vuelo 352"},
];
const LANGUAGES: Array<{value:CreatelloLanguage;label:string}> = [
  {value:"en",label:"Inglés"},{value:"es",label:"Español"},{value:"fr",label:"Francés"},{value:"de",label:"Alemán"},{value:"pt",label:"Portugués"},
];

export function TikTokJsonGenerator({initialData,initialError,initialMonth}:Props){
  const [template,setTemplate]=useState<CreatelloTemplate>("travel-offer");
  const [language,setLanguage]=useState<CreatelloLanguage>("en");
  const [startMonth,setStartMonth]=useState(initialMonth);
  const [slideCount,setSlideCount]=useState(5);
  const [offersPerSlide,setOffersPerSlide]=useState(3);
  const [maxPrice,setMaxPrice]=useState(60);
  const [data,setData]=useState(initialData); const [error,setError]=useState(initialError); const [loading,setLoading]=useState(false); const [copied,setCopied]=useState(false);
  const json=useMemo(()=>data?.document?JSON.stringify(data.document,null,2):"",[data]);
  async function generate(){setLoading(true);setError(null);setCopied(false);try{const response=await fetch("/api/ops/tiktok-json",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({template,language,startMonth,slideCount,offersPerSlide,maxPrice:template==="flight-deals-352"?maxPrice:undefined})});const payload=await response.json();if(!response.ok||payload.ok!==true)throw new Error(payload.detail??"No se pudo generar el JSON.");JSON.parse(JSON.stringify(payload.document));setData(payload);}catch(e){setData(null);setError(e instanceof Error?e.message:"No se pudo generar el JSON.");}finally{setLoading(false)}}
  async function copy(){if(!json)return;try{await navigator.clipboard.writeText(json);setCopied(true);window.setTimeout(()=>setCopied(false),1800)}catch{setError("No se pudo copiar el JSON al portapapeles.")}}
  function download(){if(!json)return;const blob=new Blob([json+"\n"],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${template}-${language}-${startMonth}.json`;a.click();URL.revokeObjectURL(url)}
  return <div className="tiktok-json-generator">
    <section className="tiktok-json-generator__config" aria-labelledby="creatello-config-title">
      <div className="tiktok-json-generator__section-heading"><div><span className="ops-panel__eyebrow">Configuración</span><h2 id="creatello-config-title">Generador Creatello</h2></div></div>
      <label className="tiktok-json-field"><span>Plantilla</span><select value={template} onChange={e=>setTemplate(e.target.value as CreatelloTemplate)}>{TEMPLATES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
      <label className="tiktok-json-field"><span>Idioma</span><select value={language} onChange={e=>setLanguage(e.target.value as CreatelloLanguage)}>{LANGUAGES.map(x=><option key={x.value} value={x.value}>{x.label} — {x.value}</option>)}</select></label>
      <label className="tiktok-json-field"><span>Mes inicial</span><input min={initialMonth} type="month" value={startMonth} onChange={e=>setStartMonth(e.target.value)}/></label>
      <label className="tiktok-json-field"><span>{template==="cheap-flights-tiktok"?"Meses / slides":"Número de ofertas"}</span><div className="tiktok-json-field__number"><input min={1} max={20} type="number" value={slideCount} onChange={e=>setSlideCount(Number(e.target.value))}/><small>Máximo 20 slides por carrusel</small></div></label>
      {template==="cheap-flights-tiktok"?<label className="tiktok-json-field"><span>Ofertas por slide</span><div className="tiktok-json-field__number"><input min={3} max={10} type="number" value={offersPerSlide} onChange={e=>setOffersPerSlide(Number(e.target.value))}/><small>Recomendado: entre 3 y 6</small></div></label>:null}
      {template==="flight-deals-352"?<label className="tiktok-json-field"><span>Precio máximo</span><div className="tiktok-json-field__number"><input min={1} step="1" type="number" value={maxPrice} onChange={e=>setMaxPrice(Number(e.target.value))}/><small>Importe numérico, sin símbolo</small></div></label>:null}
      <button className="ops-button tiktok-json-generator__primary" disabled={loading||!startMonth} onClick={generate} type="button"><RefreshCw aria-hidden="true" className={loading?"is-spinning":""} size={17}/>{loading?"Generando…":"Generar JSON"}</button>
      <div className="tiktok-json-generator__rules"><strong>Validación automática</strong><p>Solo entrega ofertas reales, sin duplicados, con los campos obligatorios y sin imágenes ni configuración visual.</p></div>
    </section>
    <section className="tiktok-json-generator__output" aria-labelledby="creatello-output-title">
      <div className="tiktok-json-generator__output-head"><div><span className="ops-panel__eyebrow">Resultado</span><h2 id="creatello-output-title">JSON compatible</h2></div><div style={{display:"flex",gap:".5rem"}}><button className="ops-button ops-button--ghost ops-button--compact" disabled={!json||loading} onClick={copy} type="button">{copied?<Check size={16}/>:<Copy size={16}/>} {copied?"Copiado":"Copiar JSON"}</button><button className="ops-button ops-button--ghost ops-button--compact" disabled={!json||loading} onClick={download} type="button"><Download size={16}/> Descargar</button></div></div>
      {loading?<div aria-label="Generando JSON" className="tiktok-json-skeleton" role="status"><span/><span/><span/></div>:null}
      {!loading&&error?<div className="tiktok-json-message tiktok-json-message--error" role="alert"><AlertTriangle size={18}/><span>{error}</span></div>:null}
      {!loading&&data?<><div className="tiktok-json-preview tiktok-json-preview--travel-offers">{data.preview.map((item,i)=><article key={`${item.title}-${i}`}><div><strong>{item.title}</strong>{item.price!==undefined?<span>{item.price} {item.currency}</span>:null}</div><p>{item.detail}</p></article>)}</div><label className="tiktok-json-editor"><span className="sr-only">JSON generado, solo lectura</span><textarea readOnly spellCheck={false} value={json}/></label></>:null}
    </section>
  </div>;
}
