'use strict';
const VERSION='2.1.1',BUILD_DATE='2026-11-10',CHANGELOG=['2.1.1 (10.11.2026): Fix Anzeige der Liste bei „Ohne Sortierung“','2.1.0 (10.11.2026): Sortierung nach Laden/Einkaufsweg, Kategorien-Blöcke, automatische Zuordnung, Läden-Verwaltung','2.0.3 (10.11.2026): Kategorien farbig, Anzeigename neuer Konten = Teil vor dem @','2.0.2 (10.11.2026): Einzelner Eintrag per 🗑 löschbar (mit Rückfrage, Papierkorb)','2.0.1 (10.11.2026): Eingabe – nach Enter sofort nächster Eintrag, Cursor/Tastatur bleiben','2.0.0 (10.11.2026): Firebase + Google-Anmeldung, Offline-Sync, Papierkorb'];
const CFG=window.APP_CONFIG,PURGE_MS=30*864e5;
const CATS=[{id:'food',name:'Lebensmittel',stores:'LIDL · Penny · Kaufland',color:'#1b7f4b'},{id:'drug',name:'Drogerie',stores:'DM · Rossmann',color:'#8e44ad'}];
const berlin=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(d||new Date());
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const S={cat:'food',date:berlin(),view:'list',sel:new Set(),selMode:false,items:[],lists:[],users:[],user:null,ready:false,pending:false,denied:false,ens:{},pcats:[],stores:[],prod:new Map(),arr:false,editStore:null};
if(!window.firebase||!CFG.FIREBASE||CFG.FIREBASE.apiKey.includes('DEIN')){document.getElementById('app').textContent='Konfiguration fehlt: config.js ausfüllen (siehe README).';throw new Error('config')}
firebase.initializeApp(CFG.FIREBASE);
const auth=firebase.auth(),db=firebase.firestore(),FV=firebase.firestore.FieldValue;
db.enablePersistence({synchronizeTabs:true}).catch(e=>console.warn('Persistence:',e.code));
const items=db.collection('items'),lists=db.collection('lists'),users=db.collection('users'),pcats=db.collection('pcats'),stores=db.collection('stores'),products=db.collection('products');
const ms=x=>x&&x.toMillis?x.toMillis():(x||null),uid=()=>S.user.uid;
const pn=id=>{const u=S.users.find(u=>u.id===id);return u?u.name:'–'};
const h=(t,a={},...c)=>{const e=document.createElement(t);for(const k in a){const v=a[k];if(k==='class')e.className=v;else if(k in e)e[k]=v;else e.setAttribute(k,v)}c.flat().forEach(x=>x!=null&&e.append(x));return e};
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
const storesFor=l=>S.stores.filter(s=>s.list===l);
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
// ---- Aktionen (Firestore speichert offline dauerhaft vor und überträgt später; Änderungen je Dokument/Feld)
function addItem(title){title=title.trim();if(!title)return;const lid=S.cat+'_'+S.date;
 if(!S.lists.some(l=>l.id===lid))lists.doc(lid).set({cat:S.cat,date:S.date,createdBy:uid(),createdAt:FV.serverTimestamp()}).catch(()=>{});
 items.doc().set({title,pcat:guess(title),pos:Date.now(),listId:lid,cat:S.cat,date:S.date,createdBy:uid(),createdAt:FV.serverTimestamp(),updatedAt:FV.serverTimestamp(),done:false,doneBy:null,doneAt:null,deletedAt:null,deletedBy:null}).catch(e=>alert('Speichern fehlgeschlagen: '+e.message))}
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
const restore=i=>items.doc(i.id).update({deletedAt:null,deletedBy:null,updatedAt:FV.serverTimestamp()}).catch(e=>alert(e.message));
// ---- Live-Daten
let unsubs=[];
const denied=e=>{if(e.code==='permission-denied'){S.denied=true;render()}};
function ensureToday(){const d=berlin();for(const c of CATS){const id=c.id+'_'+d;if(!S.lists.some(l=>l.id===id)&&!S.ens[id]){S.ens[id]=1;lists.doc(id).set({cat:c.id,date:d,createdBy:uid(),createdAt:FV.serverTimestamp()}).catch(()=>{})}}}
function purge(){if(S.purged)return;S.purged=true;const old=S.items.filter(i=>i.deletedAt&&Date.now()-i.deletedAt>PURGE_MS).slice(0,400);if(!old.length)return;const b=db.batch();old.forEach(i=>b.delete(items.doc(i.id)));b.commit().catch(()=>{})}
function listen(){if(unsubs.length)return;
 unsubs.push(items.onSnapshot({includeMetadataChanges:true},s=>{S.items=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{id:d.id,title:x.title,listId:x.listId,createdBy:x.createdBy,createdAt:ms(x.createdAt),done:!!x.done,doneBy:x.doneBy,doneAt:ms(x.doneAt),deletedAt:ms(x.deletedAt),pcat:x.pcat||'none',pos:x.pos||null}});S.pending=s.metadata.hasPendingWrites;S.denied=false;if(!s.metadata.fromCache)purge();render()},denied));
 unsubs.push(lists.onSnapshot(s=>{S.lists=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{id:d.id,cat:x.cat,date:x.date,createdBy:x.createdBy}});if(!s.metadata.fromCache||!navigator.onLine)ensureToday();render()},denied));
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
W.ontouchend=e=>{const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;if(Math.abs(dx)>70&&Math.abs(dy)<60){const k=CATS.findIndex(c=>c.id===S.cat);S.cat=CATS[(k+(dx<0?1:CATS.length-1))%CATS.length].id;S.sel.clear();render()}};
function render(){const app=document.getElementById('app');if(!S.ready)return;
 if(!S.user)return showLogin();
 if(S.denied){app.replaceChildren(h('div',{class:'center'},h('h2',{},'Kein Zugriff'),h('div',{class:'sub'},S.user.email+' ist nicht freigegeben.'),h('button',{onclick:()=>auth.signOut()},'Abmelden')));return}
 const cc=(S.view==='list'||S.view==='hist')?CATS.find(c=>c.id===S.cat).color:'#1b7f4b';document.documentElement.style.setProperty('--pri',cc);const tm=document.querySelector('meta[name=theme-color]');if(tm)tm.content=cc;
 const on=navigator.onLine,txt=!on?'Offline'+(S.pending?' – Änderungen vorgemerkt':''):S.pending?'Wird synchronisiert …':'Synchronisiert';
 const nv=(v,l)=>h('button',{class:(S.view===v||(v==='set'&&S.view==='store'))?'on':'',onclick:()=>{S.view=v;if(v==='list')S.date=berlin();S.selMode=false;S.sel.clear();render()}},l);
 const nav=h('nav',{},h('div',{},nv('list','Heute'),nv('hist','Früher'),nv('trash','Papierkorb'),nv('set','Einstellungen')),
  h('div',{class:'foot'},h('span',{},h('i',{class:'dot',style:'background:'+(!on?'#c0392b':S.pending?'#e0a100':'#1b7f4b')}),txt),h('span',{},'v'+VERSION+' · '+BUILD_DATE)));
 if(S.view==='list'){const p=listParts();
  // Eingabefeld bleibt bestehen (wird nicht neu aufgebaut) -> Fokus/Tastatur bleiben nach Enter erhalten
  if(ADDEL.isConnected){TOP.replaceWith(p.top);REST.replaceWith(p.rest);NAVEL.replaceWith(nav)}
  else{W.replaceChildren(p.top,ADDEL,p.rest);app.replaceChildren(W,nav)}
  TOP=p.top;REST=p.rest;NAVEL=nav}
 else app.replaceChildren(S.view==='hist'?histView():S.view==='trash'?trashView():S.view==='store'?storeView():setView(),nav)}
function row(i,done,grp){const sel=S.selMode,tg=()=>{S.sel.has(i.id)?S.sel.delete(i.id):S.sel.add(i.id);render()};
 return h('div',{class:'row'+(done?' done':'')+(S.sel.has(i.id)?' sel':''),onclick:sel?tg:null},
 h('input',{type:'checkbox',checked:sel?S.sel.has(i.id):i.done,onclick:ev=>{ev.stopPropagation();if(sel)tg();else toggle(i)}}),
 h('div',{class:'t'},i.title,h('small',{},pn(i.createdBy)+(done&&i.doneBy?' · erledigt von '+pn(i.doneBy):''))),
 sel?null:(S.arr&&!done&&grp)?[h('button',{onclick:()=>moveItem(i,grp,-1),title:'nach oben'},'▲'),h('button',{onclick:()=>moveItem(i,grp,1),title:'nach unten'},'▼')]
 :[h('button',{onclick:()=>editItem(i),title:'Bearbeiten'},'✎'),h('button',{class:'d',onclick:()=>delOne(i),title:'Löschen'},'🗑')])}
const catTabs=()=>h('div',{class:'tabs'},CATS.map(c=>h('button',{class:c.id===S.cat?'on':'',style:'border-color:'+c.color+(c.id===S.cat?';background:'+c.color+';color:#fff':''),onclick:()=>{S.cat=c.id;S.sel.clear();render()}},c.name)));
function listParts(){const lid=S.cat+'_'+S.date,cat=CATS.find(c=>c.id===S.cat),ls=S.lists.find(l=>l.id===lid),store=curStore();
 const its=S.items.filter(i=>i.listId===lid&&!i.deletedAt);
 const op=its.filter(i=>!i.done),dn=its.filter(i=>i.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
 const gs=groups(op,store);
 const opEls=gs.flatMap(g=>g.name==null?g.its.map(i=>row(i,0,g.its)):h('div',{class:'blk'+(g.hue==null?' none':''),style:g.hue==null?'':'--h:'+g.hue},h('div',{class:'bh'},g.name),g.its.map(i=>row(i,0,g.its))));
 const sel=h('select',{onchange:e=>{localStorage.setItem('store_'+S.cat,e.target.value);render()}},[...storesFor(S.cat).map(s=>h('option',{value:s.id,selected:!!store&&s.id===store.id},'Laden: '+s.name)),h('option',{value:'-',selected:!store},'Ohne Sortierung')]);
 return{top:h('div',{},catTabs(),h('h2',{},fmt(S.date)),h('div',{class:'sub'},cat.name+' ('+cat.stores+') · Erstellt von '+pn(ls?ls.createdBy:uid())),sel),
  rest:h('div',{},h('div',{class:'add'},h('button',{onclick:()=>{S.selMode=!S.selMode;S.arr=false;S.sel.clear();render()}},S.selMode?'Abbrechen':'Auswählen'),
   S.selMode?h('button',{class:'d',onclick:delSel},'Löschen ('+S.sel.size+')'):h('button',{class:S.arr?'p':'',onclick:()=>{S.arr=!S.arr;render()}},S.arr?'Fertig':'Anordnen')),
  h('div',{class:'cols'},h('div',{class:'col'},h('h3',{},'Offen ('+op.length+')'),opEls),h('div',{class:'col'},h('h3',{},'Erledigt ('+dn.length+')'),dn.map(i=>row(i,1)))))}}
function histView(){const ls=S.lists.filter(l=>l.cat===S.cat).sort((a,b)=>b.date.localeCompare(a.date));
 return h('div',{},catTabs(),h('h2',{},'Frühere Einkaufszettel'),ls.map(l=>{const it=S.items.filter(i=>i.listId===l.id&&!i.deletedAt);
  return h('div',{class:'row',onclick:()=>{S.date=l.date;S.view='list';render()}},h('div',{class:'t'},fmt(l.date),h('small',{},it.filter(i=>i.done).length+' von '+it.length+' erledigt')))}))}
function trashView(){const it=S.items.filter(i=>i.deletedAt&&Date.now()-i.deletedAt<PURGE_MS).sort((a,b)=>b.deletedAt-a.deletedAt);
 return h('div',{},h('h2',{},'Papierkorb'),h('div',{class:'sub'},'30 Tage Aufbewahrung, endgültiges Löschen erst danach (vom Server erzwungen)'),
  it.map(i=>{const l=S.lists.find(x=>x.id===i.listId),c=l&&CATS.find(c=>c.id===l.cat);return h('div',{class:'row'},h('div',{class:'t'},i.title,h('small',{},(l?fmt(l.date)+' · '+(c?c.name:''):'')+' · gelöscht '+new Date(i.deletedAt).toLocaleDateString('de-DE'))),h('button',{onclick:()=>restore(i)},'Wiederherstellen'))}),it.length?null:h('div',{class:'sub'},'Leer'))}
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
auth.onAuthStateChanged(u=>{S.user=u;S.ready=true;if(u)listen();else{unsubs.forEach(f=>f());unsubs=[];S.items=[];S.lists=[];S.users=[];S.pcats=[];S.stores=[];S.prod=new Map();S.purged=false;S.ens={}}render()});
addEventListener('online',render);addEventListener('offline',render);
addEventListener('visibilitychange',()=>{if(!document.hidden){if(S.view==='list'&&berlin()!==S.date)S.date=berlin();if(S.user)ensureToday();render()}});
