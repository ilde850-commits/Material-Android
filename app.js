let SQL=null, db=null, dbBytes=null, dbFileName='', schema=[], sectionMap=[], currentSection=null;
let pdfIndex=new Map(), directoryHandle=null;

const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const qid=n=>'"'+String(n).replaceAll('"','""')+'"';
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const html=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)};

const SECTION_DEFS=[
  {key:'articulos',label:'Artículos',icon:'📦',aliases:['articulos','articulo','articles','items']},
  {key:'fichas',label:'Fichas técnicas',icon:'📄',aliases:['fichas_tecnicas','fichas','ficha_tecnica','technical_sheets']},
  {key:'kits',label:'Kits',icon:'🧰',aliases:['kits','kit']},
  {key:'clientes',label:'Clientes',icon:'👤',aliases:['clientes','cliente','clients']},
  {key:'gruas',label:'Grúas',icon:'🏗️',aliases:['gruas','grua','cranes']},
  {key:'catalogos',label:'Catálogos',icon:'📚',aliases:['catalogos','catalogo','catalogos_completos','catalogs']},
  {key:'publicitarias',label:'Fichas publicitarias',icon:'📰',aliases:['fichas_publicitarias','publicitarias','fichas_publicidad']}
];

async function init(){
  try{ SQL=await initSqlJs({locateFile:f=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/${f}`}); }
  catch(e){toast('No se pudo cargar SQLite. Comprueba Internet la primera vez.');console.error(e)}
  bind(); await restoreDb(); await restoreDirectoryHandle(); nav('home');
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
function bind(){
  $('#btnImportDb').onclick=()=>$('#dbFile').click();
  $('#dbFile').onchange=e=>{const f=e.target.files?.[0];if(f) importDb(f)};
  $('#btnGlobalSearch').onclick=()=>globalSearch(); $('#globalSearch').onkeydown=e=>{if(e.key==='Enter')globalSearch()};
  $('#btnSectionSearch').onclick=()=>sectionSearch(); $('#sectionSearch').onkeydown=e=>{if(e.key==='Enter')sectionSearch()};
  $('#btnPickFolder').onclick=pickPdfFolder; $('#folderFallback').onchange=e=>indexFallbackFiles(e.target.files);
  $('#closeDetail').onclick=()=>$('#detailDialog').close();
  document.addEventListener('click',e=>{const b=e.target.closest('[data-nav]');if(b)nav(b.dataset.nav)});
}
function nav(name){
  $$('.view').forEach(v=>v.classList.remove('active')); $$('.navItem').forEach(v=>v.classList.remove('active'));
  const map={home:'#viewHome',search:'#viewSearch',files:'#viewFiles',tables:'#viewTables',help:'#viewHelp',section:'#viewSection'};
  $(map[name]||map.home).classList.add('active'); const nb=$(`.navItem[data-nav="${name}"]`);if(nb)nb.classList.add('active');
  if(name==='tables')renderAllTables(); if(name==='home')renderHome(); window.scrollTo({top:0,behavior:'instant'});
}
async function importDb(file){
  if(!SQL){toast('SQLite todavía no está disponible.');return}
  try{const buf=await file.arrayBuffer(); loadDb(new Uint8Array(buf),file.name); await idbSet('dbBytes',buf);await idbSet('dbName',file.name);await idbSet('dbDate',new Date().toISOString());toast('Base de datos actualizada');}
  catch(e){console.error(e);toast('No se ha podido abrir la base de datos');}
}
function loadDb(bytes,name){dbBytes=bytes;dbFileName=name;db=new SQL.Database(bytes);inspectSchema();renderHome();}
async function restoreDb(){try{const buf=await idbGet('dbBytes');const name=await idbGet('dbName');if(buf&&SQL)loadDb(new Uint8Array(buf),name||'material.db')}catch(e){console.warn(e)}}
function inspectSchema(){
  const rs=db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  const tables=rs[0]?.values.flat()||[]; schema=tables.map(name=>{let cols=[];try{cols=db.exec(`PRAGMA table_info(${qid(name)})`)[0]?.values.map(v=>v[1])||[]}catch{} return {name,cols}});
  sectionMap=SECTION_DEFS.map(def=>{const t=findBestTable(def);return t?{...def,table:t}:null}).filter(Boolean);
}
function findBestTable(def){const scored=schema.map(t=>{const n=normalize(t.name);let score=0;for(const a of def.aliases){const aa=normalize(a);if(n===aa)score=Math.max(score,100);else if(n.includes(aa)||aa.includes(n))score=Math.max(score,60)}return {t,score}}).sort((a,b)=>b.score-a.score);return scored[0]?.score?scored[0].t:null}
function renderHome(){
  $('#dbName').textContent=dbFileName||'Ninguna'; $('#dbInfo').textContent=db?`${schema.length} tablas detectadas · datos guardados en este dispositivo`:'Importa material.db para comenzar.';
  $('#btnStatus').style.color=db?'#1f8b4c':'#b54b4b'; const g=$('#sectionGrid');g.innerHTML='';
  if(!db){g.innerHTML='<div class="card stack" style="grid-column:1/-1"><span class="muted">Las secciones aparecerán después de importar la base de datos.</span></div>';return}
  const items=sectionMap.length?sectionMap:schema.slice(0,8).map(t=>({label:t.name,icon:'🗂️',table:t}));
  items.forEach(s=>{const b=document.createElement('button');b.className='sectionCard';b.innerHTML=`<span class="emoji">${s.icon}</span><strong>${html(s.label)}</strong><small>${html(s.table.name)}</small>`;b.onclick=()=>openSection(s);g.appendChild(b)});
}
function openSection(s){currentSection=s;$('#sectionName').textContent=s.label;$('#sectionSearch').value='';nav('section');runSectionQuery('');}
function getTextColumns(table){return table.cols.filter(c=>!normalize(c).includes('blob'))}
function queryTable(table,term='',limit=150){
  const cols=getTextColumns(table);let sql=`SELECT * FROM ${qid(table.name)}`;const params=[];
  if(term&&cols.length){sql+=' WHERE '+cols.map(c=>`CAST(${qid(c)} AS TEXT) LIKE ?`).join(' OR ');for(let i=0;i<cols.length;i++)params.push('%'+term+'%')}
  sql+=` LIMIT ${Number(limit)||150}`;const stmt=db.prepare(sql);stmt.bind(params);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());stmt.free();return rows;
}
function sectionSearch(){if(!currentSection)return;runSectionQuery($('#sectionSearch').value.trim())}
function runSectionQuery(term){if(!db)return;try{const rows=queryTable(currentSection.table,term,200);$('#sectionMeta').textContent=`${rows.length}${rows.length===200?'+':''} resultados`;renderResults($('#sectionResults'),rows,currentSection)}catch(e){console.error(e);toast('No se pudo realizar la búsqueda')}}
function globalSearch(){
  if(!db){toast('Primero importa material.db');return} const term=$('#globalSearch').value.trim();if(!term){toast('Escribe algo para buscar');return}
  const source=sectionMap.length?sectionMap:schema.map(t=>({label:t.name,icon:'🗂️',table:t}));let all=[];
  for(const s of source){try{queryTable(s.table,term,60).forEach(r=>all.push({row:r,section:s}))}catch{}}
  $('#searchMeta').textContent=`${all.length} resultados en ${source.length} secciones`;const box=$('#searchResults');box.innerHTML='';all.slice(0,250).forEach(x=>box.appendChild(resultCard(x.row,x.section)));
}
function preferredTitle(row){const keys=Object.keys(row);const wanted=['descripcion','modelo','nombre','referencia','ref','codigo','cliente','razon_social'];for(const w of wanted){const k=keys.find(x=>normalize(x)===w||normalize(x).includes(w));if(k&&row[k]!==null&&String(row[k]).trim())return String(row[k])}const k=keys.find(x=>row[x]!=null&&String(row[x]).trim());return k?String(row[k]):'Registro'}
function visibleFields(row){const keys=Object.keys(row);const score=k=>{const n=normalize(k);if(/descripcion|modelo|nombre|referencia|proveedor|telefono|presion|caudal|familia|contacto/.test(n))return 10;if(/id$|pdf|ruta|path|archivo/.test(n))return 0;return 3};return keys.filter(k=>row[k]!=null&&String(row[k]).trim()).sort((a,b)=>score(b)-score(a)).slice(0,5)}
function resultCard(row,section){const d=document.createElement('div');d.className='resultCard';const fs=visibleFields(row);d.innerHTML=`<span class="pill">${html(section.label)}</span><h3>${html(preferredTitle(row))}</h3><div class="resultMeta">${fs.map(k=>`<div class="fieldLine"><b>${html(k)}:</b> ${html(row[k])}</div>`).join('')}</div>`;d.onclick=()=>showDetail(row,section);return d}
function renderResults(box,rows,section){box.innerHTML='';if(!rows.length){box.innerHTML='<div class="card stack"><span class="muted">No se han encontrado resultados.</span></div>';return}rows.forEach(r=>box.appendChild(resultCard(r,section)))}
function showDetail(row,section){
  $('#detailSection').textContent=section.label;$('#detailTitle').textContent=preferredTitle(row);const body=$('#detailBody');body.innerHTML='';
  for(const [k,v] of Object.entries(row)){if(v===null||String(v).trim()==='')continue;const r=document.createElement('div');r.className='detailRow';r.innerHTML=`<div class="label">${html(k)}</div><div class="value">${html(v)}</div>`;body.appendChild(r)}
  const acts=$('#detailActions');acts.innerHTML='';const pdf=findPdfCandidate(row);if(pdf){const b=document.createElement('button');b.className='primary';b.textContent='📄 Ver PDF';b.onclick=()=>openPdfForValue(pdf);acts.appendChild(b)}
  $('#detailDialog').showModal();
}
function findPdfCandidate(row){for(const [k,v] of Object.entries(row)){if(v==null)continue;const s=String(v).trim();const n=normalize(k);if(s.toLowerCase().includes('.pdf'))return s;if(/pdf|archivo|fichero|ruta|path|documento/.test(n)&&s)return s}return null}
function basename(p){return String(p).replaceAll('\\','/').split('/').pop().toLowerCase()}
async function openPdfForValue(v){
  let key=basename(v);let entry=pdfIndex.get(key);
  if(!entry&&!key.endsWith('.pdf'))entry=pdfIndex.get(key+'.pdf');
  if(!entry){const stem=key.replace(/\.pdf$/,'');entry=[...pdfIndex.entries()].find(([k])=>k.replace(/\.pdf$/,'')===stem)?.[1]}
  if(!entry){toast('No encuentro ese PDF en la carpeta seleccionada');return}
  try{const file=entry.getFile?await entry.getFile():entry;const url=URL.createObjectURL(file);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){console.error(e);toast('No se pudo abrir el PDF')}
}
async function pickPdfFolder(){
  if(window.showDirectoryPicker){try{directoryHandle=await window.showDirectoryPicker({mode:'read'});await idbSet('pdfDir',directoryHandle);await indexDirectory(directoryHandle);return}catch(e){if(e.name!=='AbortError')console.warn(e)}}
  $('#folderFallback').click();
}
async function indexDirectory(handle){pdfIndex.clear();let count=0;async function walk(h){for await(const [name,entry] of h.entries()){if(entry.kind==='directory')await walk(entry);else if(name.toLowerCase().endsWith('.pdf')){pdfIndex.set(name.toLowerCase(),entry);count++}}}await walk(handle);$('#folderStatus').textContent=`${handle.name} · ${count} PDF disponibles`;toast(`${count} PDF indexados`)}
function indexFallbackFiles(files){pdfIndex.clear();let count=0;for(const f of files){if(f.name.toLowerCase().endsWith('.pdf')){pdfIndex.set(f.name.toLowerCase(),f);count++}}$('#folderStatus').textContent=`Carpeta seleccionada · ${count} PDF disponibles (esta sesión)`;toast(`${count} PDF indexados`)}
async function restoreDirectoryHandle(){try{const h=await idbGet('pdfDir');if(h&&h.queryPermission){const p=await h.queryPermission({mode:'read'});if(p==='granted'){directoryHandle=h;await indexDirectory(h)}else $('#folderStatus').textContent='Carpeta recordada; toca “Seleccionar carpeta” para autorizarla.'}}catch{}}
function renderAllTables(){const b=$('#allTables');b.innerHTML='';if(!db){b.innerHTML='<div class="card stack muted">Importa primero la base de datos.</div>';return}schema.forEach(t=>{const d=document.createElement('button');d.className='resultCard tableItem';d.innerHTML=`<strong>${html(t.name)}</strong><span class="small muted">${t.cols.length} columnas</span>`;d.onclick=()=>openSection({label:t.name,icon:'🗂️',table:t});b.appendChild(d)})}
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('material-movil',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbSet(k,v){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbGet(k){const d=await idb();return new Promise((res,rej)=>{const r=d.transaction('kv').objectStore('kv').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
init();
