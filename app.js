'use strict';
const VERSION='2.0.3',BUILD_DATE='2026-11-10',CHANGELOG=['2.0.3 (10.11.2026): Kategorien farbig, Anzeigename neuer Konten = Teil vor dem @','2.0.2 (10.11.2026): Einzelner Eintrag per 🗑 löschbar (mit Rückfrage, Papierkorb)','2.0.1 (10.11.2026): Eingabe – nach Enter sofort nächster Eintrag, Cursor/Tastatur bleiben','2.0.0 (10.11.2026): Firebase + Google-Anmeldung, Offline-Sync, Papierkorb'];
const CFG=window.APP_CONFIG,PURGE_MS=30*864e5;
const CATS=[{id:'food',name:'Lebensmittel',stores:'LIDL · Penny · Kaufland',color:'#1b7f4b'},{id:'drug',name:'Drogerie',stores:'DM · Rossmann',color:'#8e44ad'}];
const berlin=d=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(d||new Date());
const fmt=d=>new Date(d+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const S={cat:'food',date:berlin(),view:'list',sel:new Set(),selMode:false,items:[],lists:[],users:[],user:null,ready:false,pending:false,denied:false,ens:{}};
if(!window.firebase||!CFG.FIREBASE||CFG.FIREBASE.apiKey.includes('DEIN')){document.getElementById('app').textContent='Konfiguration fehlt: config.js ausfüllen (siehe README).';throw new Error('config')}
firebase.initializeApp(CFG.FIREBASE);
const auth=firebase.auth(),db=firebase.firestore(),FV=firebase.firestore.FieldValue;
db.enablePersistence({synchronizeTabs:true}).catch(e=>console.warn('Persistence:',e.code));
const items=db.collection('items'),lists=db.collection('lists'),users=db.collection('users');
const ms=x=>x&&x.toMillis?x.toMillis():(x||null),uid=()=>S.user.uid;
const pn=id=>{const u=S.users.find(u=>u.id===id);return u?u.name:'–'};
const h=(t,a={},...c)=>{const e=document.createElement(t);for(const k in a){const v=a[k];if(k==='class')e.className=v;else if(k in e)e[k]=v;else e.setAttribute(k,v)}c.flat().forEach(x=>x!=null&&e.append(x));return e};
// ---- Aktionen (Firestore speichert offline dauerhaft vor und überträgt später; Änderungen je Dokument/Feld)
function addItem(title){title=title.trim();if(!title)return;const lid=S.cat+'_'+S.date;
 if(!S.lists.some(l=>l.id===lid))lists.doc(lid).set({cat:S.cat,date:S.date,createdBy:uid(),createdAt:FV.serverTimestamp()}).catch(()=>{});
 items.doc().set({title,listId:lid,cat:S.cat,date:S.date,createdBy:uid(),createdAt:FV.serverTimestamp(),updatedAt:FV.serverTimestamp(),done:false,doneBy:null,doneAt:null,deletedAt:null,deletedBy:null}).catch(e=>alert('Speichern fehlgeschlagen: '+e.message))}
const toggle=i=>items.doc(i.id).update({done:!i.done,doneBy:i.done?null:uid(),doneAt:i.done?null:FV.serverTimestamp(),updatedAt:FV.serverTimestamp()}).catch(e=>alert(e.message));
function editItem(i){const t=prompt('Eintrag bearbeiten',i.title);if(t&&t.trim()&&t.trim()!==i.title)items.doc(i.id).update({title:t.trim(),updatedAt:FV.serverTimestamp()}).catch(e=>alert(e.message))}
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
 unsubs.push(items.onSnapshot({includeMetadataChanges:true},s=>{S.items=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{id:d.id,title:x.title,listId:x.listId,createdBy:x.createdBy,createdAt:ms(x.createdAt),done:!!x.done,doneBy:x.doneBy,doneAt:ms(x.doneAt),deletedAt:ms(x.deletedAt)}});S.pending=s.metadata.hasPendingWrites;S.denied=false;if(!s.metadata.fromCache)purge();render()},denied));
 unsubs.push(lists.onSnapshot(s=>{S.lists=s.docs.map(d=>{const x=d.data({serverTimestamps:'estimate'});return{id:d.id,cat:x.cat,date:x.date,createdBy:x.createdBy}});if(!s.metadata.fromCache||!navigator.onLine)ensureToday();render()},denied));
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
 const nv=(v,l)=>h('button',{class:S.view===v?'on':'',onclick:()=>{S.view=v;if(v==='list')S.date=berlin();S.selMode=false;S.sel.clear();render()}},l);
 const nav=h('nav',{},h('div',{},nv('list','Heute'),nv('hist','Früher'),nv('trash','Papierkorb'),nv('set','Einstellungen')),
  h('div',{class:'foot'},h('span',{},h('i',{class:'dot',style:'background:'+(!on?'#c0392b':S.pending?'#e0a100':'#1b7f4b')}),txt),h('span',{},'v'+VERSION+' · '+BUILD_DATE)));
 if(S.view==='list'){const p=listParts();
  // Eingabefeld bleibt bestehen (wird nicht neu aufgebaut) -> Fokus/Tastatur bleiben nach Enter erhalten
  if(ADDEL.isConnected){TOP.replaceWith(p.top);REST.replaceWith(p.rest);NAVEL.replaceWith(nav)}
  else{W.replaceChildren(p.top,ADDEL,p.rest);app.replaceChildren(W,nav)}
  TOP=p.top;REST=p.rest;NAVEL=nav}
 else app.replaceChildren(S.view==='hist'?histView():S.view==='trash'?trashView():setView(),nav)}
function row(i,done){const sel=S.selMode,tg=()=>{S.sel.has(i.id)?S.sel.delete(i.id):S.sel.add(i.id);render()};
 return h('div',{class:'row'+(done?' done':'')+(S.sel.has(i.id)?' sel':''),onclick:sel?tg:null},
 h('input',{type:'checkbox',checked:sel?S.sel.has(i.id):i.done,onclick:ev=>{ev.stopPropagation();if(sel)tg();else toggle(i)}}),
 h('div',{class:'t'},i.title,h('small',{},pn(i.createdBy)+(done&&i.doneBy?' · erledigt von '+pn(i.doneBy):''))),
 sel?null:h('button',{onclick:()=>editItem(i),title:'Bearbeiten'},'✎'),
 sel?null:h('button',{class:'d',onclick:()=>delOne(i),title:'Löschen'},'🗑'))}
const catTabs=()=>h('div',{class:'tabs'},CATS.map(c=>h('button',{class:c.id===S.cat?'on':'',style:'border-color:'+c.color+(c.id===S.cat?';background:'+c.color+';color:#fff':''),onclick:()=>{S.cat=c.id;S.sel.clear();render()}},c.name)));
function listParts(){const lid=S.cat+'_'+S.date,cat=CATS.find(c=>c.id===S.cat),ls=S.lists.find(l=>l.id===lid);
 const its=S.items.filter(i=>i.listId===lid&&!i.deletedAt),by=(k,d)=>(a,b)=>d*((a[k]||0)-(b[k]||0));
 const op=its.filter(i=>!i.done).sort(by('createdAt',1)),dn=its.filter(i=>i.done).sort(by('doneAt',-1));
 return{top:h('div',{},catTabs(),h('h2',{},fmt(S.date)),h('div',{class:'sub'},cat.name+' ('+cat.stores+') · Erstellt von '+pn(ls?ls.createdBy:uid()))),
  rest:h('div',{},h('div',{class:'add'},h('button',{onclick:()=>{S.selMode=!S.selMode;S.sel.clear();render()}},S.selMode?'Abbrechen':'Auswählen'),S.selMode?h('button',{class:'d',onclick:delSel},'Löschen ('+S.sel.size+')'):null),
  h('div',{class:'cols'},h('div',{class:'col'},h('h3',{},'Offen ('+op.length+')'),op.map(i=>row(i,0))),h('div',{class:'col'},h('h3',{},'Erledigt ('+dn.length+')'),dn.map(i=>row(i,1)))))}}
function histView(){const ls=S.lists.filter(l=>l.cat===S.cat).sort((a,b)=>b.date.localeCompare(a.date));
 return h('div',{},catTabs(),h('h2',{},'Frühere Einkaufszettel'),ls.map(l=>{const it=S.items.filter(i=>i.listId===l.id&&!i.deletedAt);
  return h('div',{class:'row',onclick:()=>{S.date=l.date;S.view='list';render()}},h('div',{class:'t'},fmt(l.date),h('small',{},it.filter(i=>i.done).length+' von '+it.length+' erledigt')))}))}
function trashView(){const it=S.items.filter(i=>i.deletedAt&&Date.now()-i.deletedAt<PURGE_MS).sort((a,b)=>b.deletedAt-a.deletedAt);
 return h('div',{},h('h2',{},'Papierkorb'),h('div',{class:'sub'},'30 Tage Aufbewahrung, endgültiges Löschen erst danach (vom Server erzwungen)'),
  it.map(i=>{const l=S.lists.find(x=>x.id===i.listId),c=l&&CATS.find(c=>c.id===l.cat);return h('div',{class:'row'},h('div',{class:'t'},i.title,h('small',{},(l?fmt(l.date)+' · '+(c?c.name:''):'')+' · gelöscht '+new Date(i.deletedAt).toLocaleDateString('de-DE'))),h('button',{onclick:()=>restore(i)},'Wiederherstellen'))}),it.length?null:h('div',{class:'sub'},'Leer'))}
function setView(){const nm=h('input',{type:'text',value:pn(uid()),maxLength:30});
 return h('div',{},h('h2',{},'Einstellungen'),h('div',{class:'sub'},'Angemeldet als '+S.user.email),h('h3',{},'Mein Anzeigename'),
  h('div',{class:'add'},nm,h('button',{onclick:()=>{const v=nm.value.trim();if(v)users.doc(uid()).set({name:v,email:S.user.email}).catch(e=>alert(e.message))}},'OK')),
  h('h3',{},'Mitglieder'),S.users.map(u=>h('div',{class:'sub'},u.name)),
  h('button',{class:'d',onclick:()=>{if(S.pending&&!confirm('Es gibt noch nicht übertragene Änderungen. Sie bleiben auf diesem Gerät gespeichert und werden nach erneuter Anmeldung übertragen. Abmelden?'))return;auth.signOut()}},'Abmelden'),
  h('h3',{},'Änderungen'),CHANGELOG.map(c=>h('div',{class:'sub'},c)))}
function showLogin(){const msg=h('div',{class:'sub'}),p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
 const go=()=>auth.signInWithPopup(p).catch(e=>{if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment')auth.signInWithRedirect(p);else msg.textContent='Anmeldung fehlgeschlagen: '+e.message});
 document.getElementById('app').replaceChildren(h('div',{class:'center'},h('h2',{},'🛒 Einkaufsliste'),h('button',{class:'p',onclick:go},'Mit Google anmelden'),msg))}
// ---- Start
if('serviceWorker'in navigator){const had=!!navigator.serviceWorker.controller;navigator.serviceWorker.register('sw.js').then(r=>setInterval(()=>r.update(),36e5));navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had)location.reload()})}
auth.onAuthStateChanged(u=>{S.user=u;S.ready=true;if(u)listen();else{unsubs.forEach(f=>f());unsubs=[];S.items=[];S.lists=[];S.users=[];S.purged=false;S.ens={}}render()});
addEventListener('online',render);addEventListener('offline',render);
addEventListener('visibilitychange',()=>{if(!document.hidden){if(S.view==='list'&&berlin()!==S.date)S.date=berlin();if(S.user)ensureToday();render()}});
