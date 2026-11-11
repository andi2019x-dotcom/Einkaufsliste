'use strict';
const VERSION='3.1.0',BUILD_DATE='2026-11-11',CHANGELOG=['3.1.0 (11.11.2026): Lebensmittel/Drogerie: ein fortlaufender Zettel ohne Datum, „Einkauf abschließen“ (offene Einträge wandern auf den neuen Zettel); alte Tageszettel unter „Früher“','3.0.0 (11.11.2026): Text einfügen und als Einkaufsliste analysieren (Vorschau), freie Einkaufszettel ohne Datum („Freie Listen“)','2.1.1 (10.11.2026): Fix Anzeige der Liste bei „Ohne Sortierung“','2.1.0 (10.11.2026): Sortierung nach Laden/Einkaufsweg, Kategorien-Blöcke, automatische Zuordnung, Läden-Verwaltung','2.0.3 (10.11.2026): Kategorien farbig, Anzeigename neuer Konten = Teil vor dem @','2.0.2 (10.11.2026): Einzelner Eintrag per 🗑 löschbar (mit Rückfrage, Papierkorb)','2.0.1 (10.11.2026): Eingabe – nach Enter sofort nächster Eintrag, Cursor/Tastatur bleiben','2.0.0 (10.11.2026): Firebase + Google-Anmeldung, Offline-Sync, Papierkorb'];
const CFG=window.APP_CONFIG,PURGE_MS=30*864e5;
const CATS=[{id:'food',name:'Lebensmittel',stores:'LIDL · Penny · Kaufland',color:'#1b7f4b'},{id:'drug',name:'Drogerie',stores:'DM · Rossmann',color:'#8e44ad'}];
const FREE={id:'free',name:'Freie Listen',stores:'',color:'#d35400'},ALL=[...CATS,FREE],CAT=id=>ALL.find(c=>c.id===id);
const berlin=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(d||new Date());
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const S={lid:null,gotL:false,gotI:false,fid:null,cat:'food',date:berlin(),view:'list',sel:new Set(),selMode:false,items:[],lists:[],users:[],user:null,ready:false,pending:false,denied:false,ens:{},pcats:[],stores:[],prod:new Map(),arr:false,editStore:null};
if(!window.firebase||!CFG.FIREBASE||CFG.FIREBASE.apiKey.includes('DEIN')){document.getElementById('app').textContent='Konfiguration fehlt: config.js ausfüllen (siehe README).';throw new Error('config')}
firebase.initializeApp(CFG.FIREBASE);
const auth=firebase.auth(),db=firebase.firestore(),FV=firebase.firestore.FieldValue;
db.enablePersistence({synchronizeTabs:true}).catch(e=>console.warn('Persistence:',e.code));
const items=db.collection('items'),lists=db.collection('lists'),users=db.collection('users'),pcats=db.collection('pcats'),stores=db.collection('stores'),products=db.collection('products');
const ms=x=>x&&x.toMillis?x.toMillis():(x||null),uid=()=>S.user.uid;
const pn=id=>{const u=S.users.find(u=>u.id===id);return u?u.name:'–'};
const h=(t,a={},...c)=>{const e=document.createElement(t);for(const k in a){const v=a[k];if(k==='class')e.className=v;else if(k in e)e[k]=v;else e.setAttribute(k,v)}c.flat().forEach(x=>x!=null&&e.append(x));return e};
document.head.append(h('style',{textContent:'.tabs button{font-size:.9rem;padding:0 6px}textarea{width:100%;min-height:220px;padding:10px 12px;border:2px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg);font:inherit;resize:vertical}.box.wide{max-width:620px;max-height:92vh;display:flex;flex-direction:column}.pvl{overflow:auto;flex:1;margin-bottom:10px}.pv{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}.pv.off .pvb{opacity:.55}.pv input[type=checkbox]{width:28px;height:28px;margin-top:12px;flex:none;accent-color:var(--pri)}.pvb{flex:1;min-width:0}.pvb select{margin:6px 0 2px}.pvb small{color:var(--mut);font-size:.75rem}'}));
// ---- Kategorien / Läden / Zuordnung (KAT-START)
const DEF_CATS=[['obst','Obst und Gemüse',120],['brot','Backwaren',30],['fleisch','Fleisch und Wurst',355],['milch','Käse und Milchprodukte',55],['kuehl','Kühlregal',185],['tk','Tiefkühlprodukte',215],['konserven','Konserven und Trockensortiment',75],['nudeln','Nudeln und Reis',40],['snacks','Süßigkeiten und Snacks',320],['getraenke','Getränke',240],['drogerie','Drogerie',280],['haushalt','Haushaltswaren',165],['aktion','Aktionsware',10]];
const DEF_ORDER=DEF_CATS.map(c=>c[0]);
// Regeln: ab 5 Zeichen "enthält", 3-4 Zeichen "gleich oder endet mit", 1-2 Zeichen / "=wort" nur gleich
const KW={drogerie:'waschmittel weichspüler shampoo duschgel zahnpasta zahnbürste seife =deo rasier tampon windel watte taschentuch klopapier toilettenpapier haarspray pflaster sonnencreme handcreme gesichtscreme lotion mundspül',
haushalt:'spülmittel müllbeutel müllsack alufolie backpapier frischhaltefolie küchenrolle serviette batterie glühbirne schwamm reiniger spülmaschine kerze gefrierbeutel',
getraenke:'wasser sprudel saft cola limo fanta sprite bier =wein rotwein weißwein weisswein =sekt schorle eistee energy getränk mineral',
konserven:'dose konserve =mais bohne linse kichererbse tomatenmark passierte suppe sauce soße ketchup senf mayo essig =öl mehl zucker =salz gewürz pfeffer backpulver hefe müsli haferflocken cornflakes marmelade honig nutella aufstrich =tee kaffee konfitüre brühe',
tk:'tiefkühl =tk pommes =eis eiscreme pizza',
kuehl:'tofu hummus antipasti fertiggericht pesto =dip',
fleisch:'fleisch hack hähnchen =huhn pute schnitzel wurst schinken salami speck steak lachs fisch leberkäs',
milch:'milch joghurt quark käse gouda mozzarella butter sahne schmand frischkäse parmesan margarine =ei eier skyr kefir',
brot:'brot brötchen toast semmel baguette croissant kuchen brezel laugen',
nudeln:'nudel spaghetti pasta penne fusilli =reis couscous bulgur spätzle lasagne',
snacks:'schokolade schoko chips kekse =keks gummibär süßigkeit bonbon riegel nüsse =nuss popcorn cracker salzstangen lakritz snack',
obst:'apfel äpfel birne banane orange zitrone mandarine traube erdbeer himbeer heidelbeer kiwi melone tomate gurke paprika zwiebel knoblauch kartoffel karotte möhre salat spinat brokkoli blumenkohl zucchini pilz champignon lauch radieschen kohl avocado ingwer obst gemüse petersilie basilikum kräuter'};
const norm=t=>t.toLowerCase().trim().replace(/\s+/g,' ');
const pkey=t=>norm(t).replace(/[\/.#?\[\]*~]/g,'_').slice(0,100)||'_';
const wm=(x,w)=>w[0]==='='?x===w.slice(1):w.length<=2?x===w:w.length<=4?(x===w||x.endsWith(w)):x.includes(w);
function guess(t){const k=pkey(t);if(S.prod.has(k))return S.prod.get(k);
 const toks=norm(t).split(/[^a-zäöüß]+/).filter(Boolean);
 for(const id in KW){if(!S.pcats.some(c=>c.id===id))continue;for(const w of KW[id].split(' '))if(toks.some(x=>wm(x,w)))return id}
 return 'none'}
const catOf=id=>S.pcats.find(c=>c.id===id);
const eff=s=>{const ids=S.pcats.map(c=>c.id);return[...s.order.filter(i=>ids.includes(i)),...ids.filter(i=>!s.order.includes(i))]};
const storesFor=l=>l==='free'?S.stores:S.stores.filter(s=>s.list===l);
function curStore(){const v=localStorage.getItem('store_'+S.cat);if(v==='-')return null;const ls=storesFor(S.cat);return ls.find(s=>s.id===v)||ls[0]||null}
function groups(its,store){const p=x=>x.pos||x.createdAt||0;its=its.slice().sort((a,b)=>p(a)-p(b));
 if(!store)return[{name:null,its}];
 const off=new Set(store.off||[]),e=eff(store),seq=[...e.filter(i=>!off.has(i)),...e.filter(i=>off.has(i)),'none'];
 return seq.map(id=>({name:id==='none'?'Nicht zugeordnet':catOf(id).name,hue:id==='none'?null:catOf(id).hue,its:its.filter(i=>(catOf(i.pcat)?i.pcat:'none')===id)})).filter(g=>g.its.length)}
async function seed(){if(S.seeding)return;S.seeding=true;
 try{const r=await db.collection('config').doc('seed').get({source:'server'});if(r.exists)return;
  const b=db.batch();DEF_CATS.forEach((c,i)=>b.set(pcats.doc(c[0]),{name:c[1],hue:c[2],sort:i}));
  [['lidl','Lidl','food'],['penny','Penny','food'],['kaufland','Kaufland','food'],['dm','DM','drug'],['rossmann','Rossmann','drug']].forEach((s,i)=>b.set(stores.doc(s[0]),{name:s[1],list:s[2],order:s[2]==='food'?[...DEF_ORDER]:['drogerie','haushalt',...DEF_ORDER],off:[],sort:i}));
  b.set(db.collection('config').doc('seed'),{done:true});await b.commit()}catch(e){S.seeding=false}}
function modal(title,fields,ok){const els=fields.map(f=>f.options?h('select',{},f.options.map(o=>h('option',{value:o[0],selected:o[0]===f.value},o[1]))):h('input',{type:'text',value:f.value||'',maxLength:f.max||200,onkeydown:e=>{if(e.key==='Enter'){e.preventDefault();go()}}}));
 const close=()=>ov.remove(),go=()=>{const v=els.map(e=>e.value);close();ok(v)};
 const ov=h('div',{class:'ov',onclick:e=>{if(e.target===ov)close()}},h('div',{class:'box'},h('h3',{},title),fields.map((f,i)=>h('label',{},f.label,els[i])),h('div',{class:'add'},h('button',{onclick:close},'Abbrechen'),h('button',{class:'p',onclick:go},'Speichern'))));
 document.body.append(ov);const f=els.find(e=>e.tagName==='INPUT');if(f){f.focus();f.select()}}
// (KAT-ENDE)
// ---- Textanalyse (ANA-START)
const ART=new Set('ein eine einen einem einer eines der die das den dem des nen ne nem n'.split(' '));
const FILL=new Set('ich wir ihr du er sie es man mir mich dir dich uns euch ihm ihn bitte noch nochmal einmal mal auch eigentlich vielleicht eventuell evtl doch halt einfach nur gerne gern etwas paar brauchen brauche brauchst braucht benötigen benötigt brauch kaufen kauf kaufe kaufst mitbringen mitbring mitbringst mitbringt bring bringe bringst bringt besorgen besorg besorge besorgst holen hol hole könntest könnte könnten könnt kannst kann würdest würde würden sollst sollte sollten soll muss musst müssen möchte möchtest möchten will willst wollen wollte wäre wären gibt dann also ja so überhaupt wirklich bräuchte bräuchten'.split(' '));
const SENT=new Set('hab habe habt hat haben ist sind war waren bin bist fällt fiel glaub glaube glaubt denke denk weiß weis ahnung gar nix nichts nicht kein keine keinen mehr fehlt mitgebracht gekauft besorgt geholt gemacht dass danke vergessen'.split(' '));
const MOD=/^(klein|größ|groß|gross|grün|rot|gelb|blau|rosa|weiß|weiss|schwarz|normal|frisch|bio|mild|scharf|süß|salzig|dunkel|hell|lang|kurz|dick|dünn|reif|neu|alt|ganz|halb|stark|leicht|kalt|warm|zart|fein|grob|mager|fettarm)(e|es|er|en|em|ere|eren|erer)?$/i;
// Wörterliste für Rechtschreibkorrektur (zusätzlich: Produktgedächtnis und Kategorie-Stichwörter)
const WL=('erdbeeren himbeeren heidelbeeren blaubeeren tomaten gurke gurken paprika zwiebeln knoblauch kartoffeln karotten möhren salat eisbergsalat kopfsalat feldsalat brokkoli blumenkohl zucchini champignons pilze lauch radieschen avocado ingwer bananen äpfel apfelmus orangen zitronen mandarinen trauben melone mango ananas kiwi birnen mozzarella parmesan joghurt frischkäse reibekäse schmand sahne butter margarine quark skyr milch eier gouda emmentaler camembert schinken salami leberwurst hackfleisch hähnchen hähnchenbrust schnitzel lachs thunfisch spaghetti makkaroni nudeln spätzle schupfnudeln reis couscous pizza pommes ketchup mayonnaise senf mehl zucker salz pfeffer gewürze backpulver haferflocken müsli cornflakes marmelade honig nutella schokolade gummibärchen chips kekse nüsse popcorn mineralwasser sprudel apfelsaft orangensaft multisaft apfelschorle eistee cola limonade bier rotwein weißwein toilettenpapier küchenrolle spülmittel waschmittel weichspüler zahnpasta zahnbürste shampoo duschgel handseife deo taschentücher müllbeutel alufolie backpapier frischhaltefolie batterien brötchen mischbrot vollkornbrot toastbrot baguette croissant tiefkühlpizza kichererbsen linsen bohnen tomatenmark brühe pesto hummus tofu vanille').split(' ');
const AKW={yofrutta:'milch',landliebe:'milch',bull:'getraenke'}; // Marken ohne Stichwort
const COND=/^(?:wenn|falls)\s+(?:es\s+)?(?:kein|keine|keinen)\s+(.+?)\s+(?:gibt|gäbe|hat|haben)\s*,?\s*(?:dann\s+)?(?:will|möchte|nimm|nimmt|nehm|nehmen|bring|brauch)\w*\s+(?:sie\s+|er\s+|man\s+|wir\s+)?(.+)$/i;
const UNITS='kg|g|gr|gramm|mg|l|ml|liter|litern|stück|stk|st|packungen|packung|pck|pkg|pack|dosen|dose|flaschen|flasche|kasten|kästen|bund|beutel|netz|becher|tüten|tüte|gläser|glas|rollen|rolle|scheiben|riegel|tafeln|tafel|kisten|kiste|schalen|schale';
const NW={ein:1,eine:1,einen:1,einem:1,einer:1,zwei:2,drei:3,vier:4,fünf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10,zwölf:12};
const RX_LX=/^(\d+(?:[.,]\d+)?)\s*(?:x|×|mal)\s+(.+)$/i,RX_LU=new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*('+UNITS+')\\.?\\s+(?:von\\s+)?(.+)$','i'),
 RX_NW=new RegExp('^('+Object.keys(NW).join('|')+')\\s+(?:('+UNITS+')\\s+(?:von\\s+)?)?(.+)$','i'),RX_BN=/^(\d+)\s+(?=\p{L})(.+)$/u,
 RX_TU=new RegExp('^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*('+UNITS+')\\.?$','i'),RX_TX=/^(.+?)\s+(?:x\s*(\d+)|(\d+)\s*x)$/i,RX_TN=/^(.+?)\s+(\d{1,2})$/;
const tk=w=>w.toLowerCase().replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu,'');
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const baseOf=t=>t.replace(/\s*\((?:\d[^)]*|sonst[^)]*)\)\s*$/i,'').trim();
const dkey=s=>norm(s).replace(/[^a-zäöüß0-9 ]/g,'').replace(/(en|n|e|s)$/,'');
const unit=u=>{u=u.toLowerCase();return/^(g|gr|gramm)$/.test(u)?'g':/^(l|liter|litern)$/.test(u)?'l':/^(st|stk|stück)$/.test(u)?'Stk.':u.length<=2?u:cap(u)};
function lev(a,b){const p=[];for(let j=0;j<=b.length;j++)p[j]=j;for(let i=1;i<=a.length;i++){let d=p[0];p[0]=i;for(let j=1;j<=b.length;j++){const t=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,d+(a[i-1]===b[j-1]?0:1));d=t}}return p[b.length]}
function anaVocab(){const V=new Map();WL.forEach(w=>V.set(w,'w'));
 S.prod.forEach((_,k)=>k.split(/[^a-zäöüß]+/).forEach(t=>{if(t.length>=4&&!V.has(t))V.set(t,'w')}));
 for(const id in KW)KW[id].split(' ').forEach(w=>{w=w.replace(/^=/,'');if(w.length>=6&&!V.has(w))V.set(w,'k')});return V}
// sicherer Treffer: gleicher Anfangsbuchstabe, höchstens 1 (ab 9 Zeichen 2) Abweichungen, eindeutig
function anaFix(w,V){const c=tk(w);if(c.length<5||V.has(c)||ART.has(c)||MOD.test(c)||/\d/.test(c)||guess(c)!=='none')return null;
 const lim=c.length>=9?2:1;let best=null,bs='',bd=9,tie=false;
 for(const[v,src]of V){if(v[0]!==c[0]||Math.abs(v.length-c.length)>lim||(src==='k'&&v.length<c.length))continue;const d=lev(c,v);
  if(d<bd||(d===bd&&src==='w'&&bs==='k')){bd=d;best=v;bs=src;tie=false}else if(d===bd&&!(src==='k'&&bs==='w'))tie=true}
 return best&&bd<=lim&&!tie?cap(best):null}
function catFor(b){const k=pkey(b);if(S.prod.has(k)&&catOf(S.prod.get(k)))return S.prod.get(k);
 for(const x of norm(b).split(/[^a-zäöüß]+/))if(AKW[x]&&catOf(AKW[x]))return AKW[x];return guess(b)}
function anaCore(s,V){let sent=false;const corr=[];
 if(/\b(?:bring|mitbring|kauf|besorg|brauch|hol|könnt|kannst|nimm)/i.test(s))s=s.replace(/\bfür\s+(?:mich|dich|uns|euch|ihn|sie|\p{Lu}\p{L}+)(?=\s|$)/gu,' ');
 let t=s.split(' ').filter(x=>{const k=tk(x);if(SENT.has(k)){sent=true;return false}return x&&!FILL.has(k)}).join(' ').trim(),q='',m;
 if(m=t.match(RX_LX)){q=m[1]+'x';t=m[2]}
 else if(m=t.match(RX_LU)){q=m[1]+' '+unit(m[2]);t=m[3]}
 else if((m=t.match(RX_NW))&&(m[2]||NW[m[1].toLowerCase()]>1)){const n=NW[m[1].toLowerCase()];q=m[2]?n+' '+unit(m[2]):n+'x';t=m[3]}
 else if(m=t.match(RX_BN)){q=m[1]+'x';t=m[2]}
 else if(m=t.match(RX_TU)){q=m[2]+' '+unit(m[3]);t=m[1]}
 else if(m=t.match(RX_TX)){q=(m[2]||m[3])+'x';t=m[1]}
 else if(m=t.match(RX_TN)){q=m[2]+'x';t=m[1]}
 let ws=t.split(' ').filter(Boolean);while(ws.length&&ART.has(tk(ws[0])))ws.shift();
 for(let i=0;i<ws.length-1;i++){const j=tk(ws[i])+tk(ws[i+1]);if(V.has(j)){corr.push(ws[i]+' '+ws[i+1]+' → '+cap(j));ws.splice(i,2,cap(j))}}
 ws=ws.map(x=>{const f=anaFix(x,V);if(f){corr.push(x+' → '+f);return f}return x});
 const base=ws.join(' '),cat=base?catFor(base):'none';
 return{base,q,cat,sent,corr,known:cat!=='none'||ws.some(x=>V.has(tk(x)))}}
const titleOf=c=>cap(c.base.replace(/\bvon (\p{L})/gu,(x,a)=>'von '+a.toUpperCase()))+(c.q?' ('+c.q+')':'');
function anaMulti(s){const w=s.split(' ');
 if(w.length>=2&&w.length<=4&&w.every(x=>{const t=tk(x);return t.length>=4&&/(en|n|e|er|s|a)$/.test(t)&&!MOD.test(t)&&!/\d/.test(t)&&catFor(t)!=='none'})&&new Set(w.map(x=>catFor(tk(x)))).size===1)return w;return[s]}
function anaSplit(text){const out=[];
 const und=p=>{const a=p.split(/\s+(?:und|&|sowie)\s+/i),o=[a[0]];for(let i=1;i<a.length;i++){const pv=o[o.length-1].trim().split(/\s+/);if(pv.length===1&&MOD.test(pv[0]))o[o.length-1]+=' und '+a[i];else o.push(a[i])}return o};
 for(let line of text.replace(/\r/g,'').replace(/(\d),(\d)/g,'$1\u0001$2').split('\n')){
  line=line.replace(/^\s*(?:[-–—•·*▪►✓✔☐☑□■●○]+|\d{1,2}[.)]|\(\d{1,2}\))\s+/,'');
  for(const p of line.split(/[;,!?…]+|\.+(?=\s|$|,)/))for(const q of p.split(/\s+(?:aber|denn|weil|sondern|damit)\s+/i))out.push(...und(q))}
 return out}
function anaFrag(raw,V){const s=raw.replace(/\u0001/g,',').replace(/\s+/g,' ').trim();if(!s||!/[\p{L}\d]/u.test(s))return[];
 const unk=t=>({title:cap(t),cat:'none',on:false,note:'nicht erkannt – bitte prüfen',ucat:false});
 const cm=s.match(COND);if(cm){const a=anaCore(cm[1],V);if(a.base)return[{title:titleOf(a)+' (sonst '+cap(cm[2].trim())+')',cat:a.cat,on:true,note:'Alternative erkannt',ucat:false,base:a.base}]}
 return anaMulti(s).map(p=>{const c=anaCore(p,V);
  if(!c.base)return c.sent?unk(p):null;
  if(c.sent&&!c.known)return unk(p);
  const r={title:titleOf(c),cat:c.cat,on:true,note:c.corr.length?'korrigiert: '+c.corr.join(', '):'',ucat:false,base:c.base};
  if(c.sent){r.note=(r.note?r.note+' · ':'')+'aus Satz abgeleitet – prüfen'}
  if(!c.known&&c.base.split(' ').length>=6){r.on=false;r.note='nicht erkannt – bitte prüfen'}
  return r}).filter(Boolean)}
function anaRun(text,lid){const V=anaVocab(),open=new Set(S.items.filter(i=>i.listId===lid&&!i.done&&!i.deletedAt).map(i=>dkey(baseOf(i.title)))),seen=new Set(),rows=[];
 for(const f of anaSplit(text))for(const r of anaFrag(f,V)){
  if(r.base){const k=dkey(r.base);if(open.has(k)){r.on=false;r.note=(r.note?r.note+' · ':'')+'schon offen in der Liste'}else if(seen.has(k)){r.on=false;r.note=(r.note?r.note+' · ':'')+'doppelt im Text'}else seen.add(k)}
  rows.push(r)}
 return rows}
// (ANA-ENDE)
// ---- Text einfügen: Dialog, Vorschau, Übernehmen
function anaOpen(pre){const lid=curLid();if(!lid)return;
 const ta=h('textarea',{placeholder:'Text hier einfügen (Chat, Notiz, Diktat …)',value:pre||''}),ov=h('div',{class:'ov'},h('div',{class:'box wide'},h('h3',{},'Text einfügen'),h('div',{class:'sub'},'Der Text wird in Einträge zerlegt. Vor dem Anlegen siehst du eine Vorschau.'),ta,
  h('div',{class:'add'},h('button',{onclick:()=>ov.remove()},'Abbrechen'),h('button',{class:'p',onclick:()=>{const t=ta.value;if(!t.trim())return;ov.remove();anaPreview(t,lid)}},'Analysieren'))));
 document.body.append(ov);ta.focus()}
function anaPreview(text,lid){const rows=anaRun(text,lid),list=h('div',{class:'pvl'}),ok=h('button',{class:'p'}),
  upd=()=>{const n=rows.filter(r=>r.on&&r.title.trim()).length;ok.textContent='Übernehmen ('+n+')';ok.disabled=!n},
  el=r=>{const cb=h('input',{type:'checkbox',checked:r.on,onclick:()=>{r.on=cb.checked;box.className='pv'+(r.on?'':' off');upd()}}),
   ti=h('input',{type:'text',value:r.title,maxLength:200,oninput:()=>{r.title=ti.value;upd()}}),
   sl=h('select',{onchange:()=>{r.cat=sl.value;r.ucat=true}},[...S.pcats.map(c=>h('option',{value:c.id,selected:c.id===r.cat},c.name)),h('option',{value:'none',selected:r.cat==='none'},'Nicht zugeordnet')]),
   box=h('div',{class:'pv'+(r.on?'':' off')},cb,h('div',{class:'pvb'},ti,sl,r.note?h('small',{},r.note):null));r.ti=ti;return box},
  fill=()=>{list.replaceChildren(...rows.map(el));if(!rows.length)list.append(h('div',{class:'sub'},'Nichts erkannt – mit „＋ Eintrag“ ergänzen.'));upd()},
  ov=h('div',{class:'ov'},h('div',{class:'box wide'},h('h3',{},'Vorschau'),h('div',{class:'sub'},'Einträge ändern, abwählen oder ergänzen. Erst „Übernehmen“ legt sie an.'),list,
   h('div',{class:'add',style:'margin-bottom:0'},h('button',{onclick:()=>{rows.push({title:'',cat:'none',on:true,note:'',ucat:false});fill();rows[rows.length-1].ti.focus()}},'＋ Eintrag'),h('button',{onclick:()=>{ov.remove();anaOpen(text)}},'Zurück'),h('button',{onclick:()=>ov.remove()},'Abbrechen'),ok)));
 ok.onclick=()=>{ov.remove();anaCommit(rows,lid)};fill();document.body.append(ov)}
function anaCommit(rows,lid){const sel=rows.filter(r=>r.on&&r.title.trim());if(!sel.length)return;const t0=Date.now();
 for(let k=0;k<sel.length;k+=200){const b=db.batch();
  sel.slice(k,k+200).forEach((r,j)=>{const t=r.title.trim().slice(0,200);b.set(items.doc(),itemDoc(t,lid,r.cat,t0+k+j));
   const bs=baseOf(t);if(r.ucat&&r.cat!==guess(bs)){S.prod.set(pkey(bs),r.cat);b.set(products.doc(pkey(bs)),{cat:r.cat})}}); // manuelle Korrektur wird gemerkt
  b.commit().catch(e=>alert('Speichern fehlgeschlagen: '+e.message))}}
// ---- Aktionen (Firestore speichert offline dauerhaft vor und überträgt später; Änderungen je Dokument/Feld)
const openRun=c=>S.lists.filter(l=>l.cat===c&&l.run&&!l.closedAt).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
const viewLid=()=>S.cat==='free'?S.fid:S.lid||(openRun(S.cat)||{}).id||null;
// fortlaufender Zettel je Bereich: legt ihn an, falls keiner offen ist; beim allerersten Mal wandern die offenen Einträge des neuesten alten Tageszettels hinein
function ensureRun(c){const r=openRun(c);if(r)return r.id;if(S.ens['run_'+c])return S.ens['run_'+c];if(!S.gotL||!S.gotI)return null;
 const any=S.lists.some(l=>l.cat===c&&l.run),id=c+(any?'_r'+Date.now():'_run_start'),b=db.batch();S.ens['run_'+c]=id;
 b.set(lists.doc(id),{cat:c,run:true,createdBy:uid(),createdAt:FV.serverTimestamp()},{merge:true});
 if(!any){const old=S.lists.filter(l=>l.cat===c&&!l.run&&l.date).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(old)S.items.filter(i=>i.listId===old.id&&!i.done&&!i.deletedAt).forEach(i=>b.update(items.doc(i.id),{listId:id,updatedAt:FV.serverTimestamp()}))}
 b.commit().catch(()=>{delete S.ens['run_'+c]});return id}
const curLid=()=>S.cat==='free'?S.fid:S.lid||ensureRun(S.cat);
function closeRun(){const r=openRun(S.cat);if(!r)return;const op=S.items.filter(i=>i.listId===r.id&&!i.done&&!i.deletedAt);
 if(!confirm('Einkauf abschließen?\n\n'+(op.length?op.length+' offene(r) Eintrag/Einträge wandern auf den neuen Zettel.':'Der Zettel wandert unter „Früher“.')))return;
 const id=S.cat+'_r'+Date.now();S.ens['run_'+S.cat]=id;
 const all=[['u',lists.doc(r.id),{closedAt:FV.serverTimestamp()}],['s',lists.doc(id),{cat:S.cat,run:true,createdBy:uid(),createdAt:FV.serverTimestamp()}],...op.map(i=>['u',items.doc(i.id),{listId:id,updatedAt:FV.serverTimestamp()}])];
 for(let k=0;k<all.length;k+=400){const b=db.batch();all.slice(k,k+400).forEach(o=>o[0]==='s'?b.set(o[1],o[2]):b.update(o[1],o[2]));b.commit().catch(e=>alert(e.message))}
 S.lid=null;render()}
const itemDoc=(title,lid,pcat,pos)=>({title,pcat,pos,listId:lid,cat:S.cat,date:null,createdBy:uid(),createdAt:FV.serverTimestamp(),updatedAt:FV.serverTimestamp(),done:false,doneBy:null,doneAt:null,deletedAt:null,deletedBy:null});
function addItem(title){title=title.trim();if(!title)return;const lid=curLid();if(!lid)return;
 items.doc().set(itemDoc(title,lid,guess(title),Date.now())).catch(e=>alert('Speichern fehlgeschlagen: '+e.message))}
const toggle=i=>items.doc(i.id).update({done:!i.done,doneBy:i.done?null:uid(),doneAt:i.done?null:FV.serverTimestamp(),updatedAt:FV.serverTimestamp()}).catch(e=>alert(e.message));
function editItem(i){const cur=catOf(i.pcat)?i.pcat:'none';
 modal('Eintrag bearbeiten',[{label:'Bezeichnung',value:i.title},{label:'Kategorie',value:cur,options:[...S.pcats.map(c=>[c.id,c.name]),['none','Nicht zugeordnet']]}],([t,c])=>{t=t.trim();if(!t)return;const u={};
  if(t!==i.title)u.title=t;
  if(c!==cur){u.pcat=c;S.prod.set(pkey(t),c);products.doc(pkey(t)).set({cat:c}).catch(()=>{})} // manuelle Korrektur wird dauerhaft gemerkt
  if(!Object.keys(u).length)return;u.updatedAt=FV.serverTimestamp();items.doc(i.id).update(u).catch(e=>alert(e.message))})}
function moveItem(i,grp,d){const k=grp.findIndex(x=>x.id===i.id),o=grp[k+d];if(!o)return;const p=x=>x.pos||x.createdAt||0;let a=p(o),b=p(i);if(a===b)a+=d;
 const bt=db.batch();bt.update(items.doc(i.id),{pos:a,updatedAt:FV.serverTimestamp()});bt.update(items.doc(o.id),{pos:b,updatedAt:FV.serverTimestamp()});bt.commit().catch(e=>alert(e.message))}
function delSel(){const its=S.items.filter(i=>S.sel.has(i.id));if(!its.length)return;
 if(!confirm(its.length+' Eintrag/Einträge löschen?\n\n• '+its.map(i=>i.title).join('\n• ')+'\n\nSie bleiben 30 Tage im Papierkorb.'))return;
 const b=db.batch();its.forEach(i=>b.update(items.doc(i.id),{deletedAt:FV.serverTimestamp(),deletedBy:uid(),updatedAt:FV.serverTimestamp()}));b.commit().catch(e=>alert(e.message));S.sel.clear();S.selMode=false;render()}
function delOne(i){if(!confirm('„'+i.title+'“ löschen?\n\nDer Eintrag bleibt 30 Tage im Papierkorb.'))return;items.doc(i.id).update({deletedAt:FV.serverTimestamp(),deletedBy:uid(),updatedAt:FV.serverTimestamp()}).catch(e=>alert(e.message))}
const restore=i=>{const l=S.lists.find(x=>x.id===i.listId),b=db.batch();b.update(items.doc(i.id),{deletedAt:null,deletedBy:null,updatedAt:FV.serverTimestamp()});if(l&&l.deleted)b.update(lists.doc(l.id),{deleted:false});b.commit().catch(e=>alert(e.message))};
// ---- Live-Daten
let unsubs=[];
const denied=e=>{if(e.code==='permission-denied'){S.denied=true;render()}};
function ensureToday(){for(const c of CATS)ensureRun(c.id)}
function purge(){if(S.purged)return;S.purged=true;const old=S.items.filter(i=>i.deletedAt&&Date.now()-i.deletedAt>PURGE_MS).slice(0,400);if(!old.length)return;const b=db.batch();old.forEach(i=>b.delete(items.doc(i.id)));b.commit().catch(()=>{})}
function listen(){if(unsubs.length)return;
 unsubs.push(items.onSnapshot({includeMetadataChanges:true},s=>{S.items=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{id:d.id,title:x.title,listId:x.listId,createdBy:x.createdBy,createdAt:ms(x.createdAt),done:!!x.done,doneBy:x.doneBy,doneAt:ms(x.doneAt),deletedAt:ms(x.deletedAt),pcat:x.pcat||'none',pos:x.pos||null}});S.pending=s.metadata.hasPendingWrites;S.denied=false;S.gotI=true;if(!s.metadata.fromCache)purge();if(!s.metadata.fromCache||!navigator.onLine)ensureToday();render()},denied));
 unsubs.push(lists.onSnapshot(s=>{S.lists=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{id:d.id,cat:x.cat,date:x.date,createdBy:x.createdBy,name:x.name||'',archived:!!x.archived,deleted:!!x.deleted,createdAt:ms(x.createdAt),run:!!x.run,closedAt:ms(x.closedAt)}});S.gotL=true;if(!s.metadata.fromCache||!navigator.onLine)ensureToday();render()},denied));
 unsubs.push(pcats.onSnapshot(s=>{S.pcats=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.sort||0)-(b.sort||0));if(!s.metadata.fromCache&&!s.size)seed();render()},denied));
 unsubs.push(stores.onSnapshot(s=>{S.stores=s.docs.map(d=>({order:[],off:[],...d.data(),id:d.id})).sort((a,b)=>(a.sort||0)-(b.sort||0));render()},denied));
 unsubs.push(products.onSnapshot(s=>{S.prod=new Map(s.docs.map(d=>[d.id,d.data().cat]))},denied));
 unsubs.push(users.onSnapshot(s=>{S.users=s.docs.map(d=>({id:d.id,name:d.data().name||d.data().email||'?'}));
  if(!s.metadata.fromCache&&!s.docs.some(d=>d.id===uid()))users.doc(uid()).set({name:S.user.email.split('@')[0],email:S.user.email}).catch(()=>{});render()},denied))}
// ---- Ansicht
let TOP,REST,NAVEL;const W=h('div',{});
const addGo=()=>{addItem(ADDINP.value);ADDINP.value='';ADDINP.focus()};
const ADDINP=h('input',{id:'add',type:'text',placeholder:'Neuer Eintrag …',autocomplete:'off',enterkeyhint:'enter',onkeydown:e=>{if(e.key==='Enter'){e.preventDefault();addGo()}}});
const ADDEL=h('div',{class:'add'},ADDINP,h('button',{class:'p',onpointerdown:e=>e.preventDefault(),onclick:addGo},'＋'));
let x0,y0;W.ontouchstart=e=>{x0=e.touches[0].clientX;y0=e.touches[0].clientY};
W.ontouchend=e=>{const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;if(Math.abs(dx)>70&&Math.abs(dy)<60){const k=ALL.findIndex(c=>c.id===S.cat);S.cat=ALL[(k+(dx<0?1:ALL.length-1))%ALL.length].id;S.fid=null;S.lid=null;S.sel.clear();render()}};
function render(){const app=document.getElementById('app');if(!S.ready)return;
 if(!S.user)return showLogin();
 if(S.denied){app.replaceChildren(h('div',{class:'center'},h('h2',{},'Kein Zugriff'),h('div',{class:'sub'},S.user.email+' ist nicht freigegeben.'),h('button',{onclick:()=>auth.signOut()},'Abmelden')));return}
 if(S.cat==='free'&&S.fid){const fl=S.lists.find(x=>x.id===S.fid);if(fl&&fl.deleted)S.fid=null}
 const cc=(S.view==='list'||S.view==='hist')?CAT(S.cat).color:'#1b7f4b';document.documentElement.style.setProperty('--pri',cc);const tm=document.querySelector('meta[name=theme-color]');if(tm)tm.content=cc;
 const on=navigator.onLine,txt=!on?'Offline'+(S.pending?' – Änderungen vorgemerkt':''):S.pending?'Wird synchronisiert …':'Synchronisiert';
 const nv=(v,l)=>h('button',{class:(S.view===v||(v==='set'&&S.view==='store'))?'on':'',onclick:()=>{S.view=v;if(v==='list')S.lid=null;S.selMode=false;S.sel.clear();render()}},l);
 const nav=h('nav',{},h('div',{},nv('list','Zettel'),nv('hist','Früher'),nv('trash','Papierkorb'),nv('set','Einstellungen')),
  h('div',{class:'foot'},h('span',{},h('i',{class:'dot',style:'background:'+(!on?'#c0392b':S.pending?'#e0a100':'#1b7f4b')}),txt),h('span',{},'v'+VERSION+' · '+BUILD_DATE)));
 if(S.view==='list'&&!(S.cat==='free'&&!S.fid)){const p=listParts();
  // Eingabefeld bleibt bestehen (wird nicht neu aufgebaut) -> Fokus/Tastatur bleiben nach Enter erhalten
  if(ADDEL.isConnected){TOP.replaceWith(p.top);REST.replaceWith(p.rest);NAVEL.replaceWith(nav)}
  else{W.replaceChildren(p.top,ADDEL,p.rest);app.replaceChildren(W,nav)}
  TOP=p.top;REST=p.rest;NAVEL=nav}
 else app.replaceChildren(S.view==='list'?freeView():S.view==='hist'?histView():S.view==='trash'?trashView():S.view==='store'?storeView():setView(),nav)}
function row(i,done,grp){const sel=S.selMode,tg=()=>{S.sel.has(i.id)?S.sel.delete(i.id):S.sel.add(i.id);render()};
 return h('div',{class:'row'+(done?' done':'')+(S.sel.has(i.id)?' sel':''),onclick:sel?tg:null},
 h('input',{type:'checkbox',checked:sel?S.sel.has(i.id):i.done,onclick:ev=>{ev.stopPropagation();if(sel)tg();else toggle(i)}}),
 h('div',{class:'t'},i.title,h('small',{},pn(i.createdBy)+(done&&i.doneBy?' · erledigt von '+pn(i.doneBy):''))),
 sel?null:(S.arr&&!done&&grp)?[h('button',{onclick:()=>moveItem(i,grp,-1),title:'nach oben'},'▲'),h('button',{onclick:()=>moveItem(i,grp,1),title:'nach unten'},'▼')]
 :[h('button',{onclick:()=>editItem(i),title:'Bearbeiten'},'✎'),h('button',{class:'d',onclick:()=>delOne(i),title:'Löschen'},'🗑')])}
const catTabs=()=>h('div',{class:'tabs'},ALL.map(c=>h('button',{class:c.id===S.cat?'on':'',style:'border-color:'+c.color+(c.id===S.cat?';background:'+c.color+';color:#fff':''),onclick:()=>{S.cat=c.id;S.fid=null;S.lid=null;S.sel.clear();render()}},c.name)));
// ---- Freie Einkaufszettel (ohne Datum): Sammlung "lists" mit cat:'free', name, archived, deleted
const freeLists=arch=>S.lists.filter(l=>l.cat==='free'&&!l.deleted&&!!l.archived===arch).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
const openFree=id=>{S.cat='free';S.fid=id;S.view='list';S.selMode=false;S.sel.clear();render()};
function newFree(){modal('Neuer Zettel',[{label:'Name (z. B. Grillfest)',max:60}],([n])=>{n=n.trim();if(!n)return;const d=lists.doc();
 d.set({cat:'free',name:n,date:null,archived:false,deleted:false,createdBy:uid(),createdAt:FV.serverTimestamp()}).catch(e=>alert('Speichern fehlgeschlagen: '+e.message));openFree(d.id)})}
const renFree=l=>modal('Zettel umbenennen',[{label:'Name',value:l.name||'',max:60}],([n])=>{n=n.trim();if(n)lists.doc(l.id).update({name:n}).catch(e=>alert(e.message))});
const arcFree=l=>{lists.doc(l.id).update({archived:!l.archived}).catch(e=>alert(e.message));if(!l.archived){S.fid=null;render()}};
function delFree(l){const its=S.items.filter(i=>i.listId===l.id&&!i.deletedAt);
 if(!confirm('Zettel „'+l.name+'“ löschen?\n\n'+its.length+' Eintrag/Einträge bleiben 30 Tage im Papierkorb.'))return;
 const all=[[lists.doc(l.id),{deleted:true}],...its.map(i=>[items.doc(i.id),{deletedAt:FV.serverTimestamp(),deletedBy:uid(),updatedAt:FV.serverTimestamp()}])];
 for(let k=0;k<all.length;k+=400){const b=db.batch();all.slice(k,k+400).forEach(a=>b.update(a[0],a[1]));b.commit().catch(e=>alert(e.message))}
 S.fid=null;render()}
function freeView(){const ls=freeLists(false);
 return h('div',{},catTabs(),h('h2',{},'Freie Listen'),h('div',{class:'sub'},'Einkaufszettel ohne Datum – bleiben bestehen, bis du sie archivierst oder löschst.'),
  h('div',{class:'add'},h('button',{class:'p',style:'flex:1',onclick:newFree},'＋ Neuer Zettel')),
  ls.map(l=>{const it=S.items.filter(i=>i.listId===l.id&&!i.deletedAt);return h('div',{class:'row',onclick:()=>openFree(l.id)},h('div',{class:'t'},l.name||'Zettel',h('small',{},it.filter(i=>!i.done).length+' offen · '+it.filter(i=>i.done).length+' erledigt · von '+pn(l.createdBy))))}),
  ls.length?null:h('div',{class:'sub'},'Noch keine freien Zettel.'))}
function listParts(){const free=S.cat==='free',lid=viewLid(),cat=CAT(S.cat),ls=S.lists.find(l=>l.id===lid),store=curStore();
 const its=S.items.filter(i=>i.listId===lid&&!i.deletedAt);
 const op=its.filter(i=>!i.done),dn=its.filter(i=>i.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
 const gs=groups(op,store);
 const opEls=gs.flatMap(g=>g.name==null?g.its.map(i=>row(i,0,g.its)):h('div',{class:'blk'+(g.hue==null?' none':''),style:g.hue==null?'':'--h:'+g.hue},h('div',{class:'bh'},g.name),g.its.map(i=>row(i,0,g.its))));
 const sel=h('select',{onchange:e=>{localStorage.setItem('store_'+S.cat,e.target.value);render()}},[...storesFor(S.cat).map(s=>h('option',{value:s.id,selected:!!store&&s.id===store.id},'Laden: '+s.name)),h('option',{value:'-',selected:!store},'Ohne Sortierung')]);
 const head=free?h('div',{},catTabs(),h('button',{onclick:()=>{S.fid=null;render()}},'← Alle Zettel'),h('h2',{},ls?ls.name:'…'),
   h('div',{class:'sub'},'Freier Zettel · Erstellt von '+pn(ls?ls.createdBy:uid())+(ls&&ls.archived?' · archiviert':'')),
   h('div',{class:'add'},h('button',{onclick:()=>ls&&renFree(ls)},'✎ Name'),h('button',{onclick:()=>ls&&arcFree(ls)},ls&&ls.archived?'↩ Aktivieren':'📦 Archiv'),h('button',{class:'d',onclick:()=>ls&&delFree(ls)},'🗑 Löschen')),sel)
  :h('div',{},catTabs(),S.lid?h('button',{onclick:()=>{S.lid=null;render()}},'← Aktueller Zettel'):null,h('h2',{},S.lid?(ls&&ls.date?fmt(ls.date):'Einkauf vom '+(ls&&ls.closedAt?new Date(ls.closedAt).toLocaleDateString('de-DE'):'?')):'Einkaufszettel'),h('div',{class:'sub'},cat.name+' ('+cat.stores+')'+(S.lid?'':' · fortlaufend, ohne Datum')),S.lid?null:h('div',{class:'add'},h('button',{class:'p',style:'flex:1',onclick:closeRun},'✔ Einkauf abschließen')),sel);
 return{top:head,
  rest:h('div',{},h('div',{class:'add'},h('button',{onclick:()=>{S.selMode=!S.selMode;S.arr=false;S.sel.clear();render()}},S.selMode?'Abbrechen':'Auswählen'),
   S.selMode?h('button',{class:'d',onclick:delSel},'Löschen ('+S.sel.size+')'):h('button',{class:S.arr?'p':'',onclick:()=>{S.arr=!S.arr;render()}},S.arr?'Fertig':'Anordnen'),
   h('button',{style:'flex:1',onclick:()=>anaOpen()},'📋 Text einfügen')),
  h('div',{class:'cols'},h('div',{class:'col'},h('h3',{},'Offen ('+op.length+')'),opEls),h('div',{class:'col'},h('h3',{},'Erledigt ('+dn.length+')'),dn.map(i=>row(i,1)))))}}
function histView(){const free=S.cat==='free',hk=l=>l.date?new Date(l.date+'T12:00:00').getTime():l.closedAt||0,ls=free?[]:S.lists.filter(l=>l.cat===S.cat&&(l.date||(l.run&&l.closedAt))).sort((a,b)=>hk(b)-hk(a)),ar=freeLists(true);
 return h('div',{},catTabs(),free?null:h('h2',{},'Frühere Einkaufszettel'),
  ls.map(l=>{const it=S.items.filter(i=>i.listId===l.id&&!i.deletedAt);
   return h('div',{class:'row',onclick:()=>{S.lid=l.id;S.view='list';render()}},h('div',{class:'t'},l.date?fmt(l.date):'Einkauf vom '+new Date(l.closedAt).toLocaleDateString('de-DE'),h('small',{},it.filter(i=>i.done).length+' von '+it.length+' erledigt')))}),
  h('h2',{},'Archivierte freie Zettel'),
  ar.map(l=>{const it=S.items.filter(i=>i.listId===l.id&&!i.deletedAt);
   return h('div',{class:'row',onclick:()=>openFree(l.id)},h('div',{class:'t'},l.name||'Zettel',h('small',{},it.filter(i=>i.done).length+' von '+it.length+' erledigt')),h('button',{onclick:ev=>{ev.stopPropagation();arcFree(l)}},'Aktivieren'))}),
  ar.length?null:h('div',{class:'sub'},'Keine archivierten Zettel.'))}
function trashView(){const it=S.items.filter(i=>i.deletedAt&&Date.now()-i.deletedAt<PURGE_MS).sort((a,b)=>b.deletedAt-a.deletedAt);
 return h('div',{},h('h2',{},'Papierkorb'),h('div',{class:'sub'},'30 Tage Aufbewahrung, endgültiges Löschen erst danach (vom Server erzwungen)'),
  it.map(i=>{const l=S.lists.find(x=>x.id===i.listId),c=l&&CATS.find(c=>c.id===l.cat);return h('div',{class:'row'},h('div',{class:'t'},i.title,h('small',{},(l?(l.cat==='free'?'Freie Liste „'+(l.name||'?')+'“':(l.date?fmt(l.date):'Einkaufszettel')+' · '+(c?c.name:'')):'')+' · gelöscht '+new Date(i.deletedAt).toLocaleDateString('de-DE'))),h('button',{onclick:()=>restore(i)},'Wiederherstellen'))}),it.length?null:h('div',{class:'sub'},'Leer'))}
const LN={food:'Lebensmittel',drug:'Drogerie'};
function storeDlg(s){modal(s?'Laden bearbeiten':'Laden hinzufügen',[{label:'Name',value:s?s.name:'',max:40},{label:'Einkaufsliste',value:s?s.list:S.cat,options:[['food','Lebensmittel'],['drug','Drogerie']]}],([n,l])=>{n=n.trim();if(!n)return;
 (s?stores.doc(s.id).update({name:n,list:l}):stores.add({name:n,list:l,order:[...DEF_ORDER],off:[],sort:Date.now()})).catch(e=>alert(e.message))})}
function setView(){const nm=h('input',{type:'text',value:pn(uid()),maxLength:30});
 return h('div',{},h('h2',{},'Einstellungen'),h('div',{class:'sub'},'Angemeldet als '+S.user.email),h('h3',{},'Mein Anzeigename'),
  h('div',{class:'add'},nm,h('button',{onclick:()=>{const v=nm.value.trim();if(v)users.doc(uid()).set({name:v,email:S.user.email}).catch(e=>alert(e.message))}},'OK')),
  h('h3',{},'Läden und Einkaufsreihenfolge'),
  S.stores.map(s=>h('div',{class:'row'},h('div',{class:'t'},s.name,h('small',{},LN[s.list]||'')),h('button',{onclick:()=>{S.editStore=s.id;S.view='store';render()}},'Reihenfolge'),h('button',{onclick:()=>storeDlg(s),title:'Umbenennen'},'✎'),h('button',{class:'d',onclick:()=>{if(confirm('Laden „'+s.name+'“ löschen?'))stores.doc(s.id).delete().catch(e=>alert(e.message))},title:'Löschen'},'🗑'))),
  h('button',{onclick:()=>storeDlg(null)},'＋ Laden hinzufügen'),
  h('h3',{},'Mitglieder'),S.users.map(u=>h('div',{class:'sub'},u.name)),
  h('button',{class:'d',onclick:()=>{if(S.pending&&!confirm('Es gibt noch nicht übertragene Änderungen. Sie bleiben auf diesem Gerät gespeichert und werden nach erneuter Anmeldung übertragen. Abmelden?'))return;auth.signOut()}},'Abmelden'),
  h('h3',{},'Änderungen'),CHANGELOG.map(c=>h('div',{class:'sub'},c)))}
function storeView(){const s=S.stores.find(x=>x.id===S.editStore);if(!s){S.view='set';return setView()}
 const e=eff(s),off=new Set(s.off||[]),save=o=>stores.doc(s.id).update(o).catch(er=>alert(er.message));
 const mv=(k,d)=>{const n=e.slice(),t=n[k+d];if(t==null)return;n[k+d]=n[k];n[k]=t;save({order:n})};
 return h('div',{},h('button',{onclick:()=>{S.view='set';render()}},'← Zurück'),h('h2',{},s.name+' – Reihenfolge'),
  h('div',{class:'sub'},'So sind die Kategorien im Laden angeordnet. Häkchen entfernt = Kategorie steht am Ende.'),
  h('div',{class:'add'},h('button',{onclick:()=>{if(confirm('Standardreihenfolge übernehmen? Die aktuelle Reihenfolge dieses Ladens wird ersetzt.'))save({order:[...DEF_ORDER],off:[]})}},'Standardreihenfolge'),
   h('button',{onclick:()=>modal('Neue Kategorie',[{label:'Name',max:40}],([n])=>{n=n.trim();if(n)pcats.add({name:n,hue:(S.pcats.length*47)%360,sort:Date.now()}).catch(er=>alert(er.message))})},'＋ Kategorie')),
  e.map((id,k)=>{const c=catOf(id);return h('div',{class:'row'},h('input',{type:'checkbox',checked:!off.has(id),title:'aktiv',onclick:()=>save({off:off.has(id)?[...off].filter(x=>x!==id):[...off,id]})}),
   h('div',{class:'t',style:'border-left:6px solid hsl('+c.hue+' 55% 45%);padding-left:8px'},c.name),
   h('button',{onclick:()=>mv(k,-1)},'▲'),h('button',{onclick:()=>mv(k,1)},'▼'),
   h('button',{onclick:()=>modal('Kategorie umbenennen',[{label:'Name',value:c.name,max:40}],([n])=>{n=n.trim();if(n)pcats.doc(id).update({name:n}).catch(er=>alert(er.message))})},'✎'),
   h('button',{class:'d',onclick:()=>{if(confirm('Kategorie „'+c.name+'“ endgültig löschen?\n\nZugeordnete Artikel erscheinen unter „Nicht zugeordnet“.'))pcats.doc(id).delete().catch(er=>alert(er.message))}},'🗑'))}))}
function showLogin(){const msg=h('div',{class:'sub'}),p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
 const go=()=>auth.signInWithPopup(p).catch(e=>{if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment')auth.signInWithRedirect(p);else msg.textContent='Anmeldung fehlgeschlagen: '+e.message});
 document.getElementById('app').replaceChildren(h('div',{class:'center'},h('h2',{},'🛒 Einkaufsliste'),h('button',{class:'p',onclick:go},'Mit Google anmelden'),msg))}
// ---- Start
if('serviceWorker'in navigator){const had=!!navigator.serviceWorker.controller;navigator.serviceWorker.register('sw.js').then(r=>setInterval(()=>r.update(),36e5));navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had)location.reload()})}
auth.onAuthStateChanged(u=>{S.user=u;S.ready=true;if(u)listen();else{unsubs.forEach(f=>f());unsubs=[];S.items=[];S.lists=[];S.users=[];S.pcats=[];S.stores=[];S.prod=new Map();S.purged=false;S.ens={};S.gotL=false;S.gotI=false;S.lid=null}render()});
addEventListener('online',render);addEventListener('offline',render);
addEventListener('visibilitychange',()=>{if(!document.hidden){if(S.view==='list'&&berlin()!==S.date)S.date=berlin();if(S.user)ensureToday();render()}});
