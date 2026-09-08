let SQL=null, db=null, dbBytes=null, dbFileName='', schema=[], sectionMap=[], currentSection=null;
let pdfFallbackIndex=new Map(), directoryHandle=null;

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
  {key:'publicitarias',label:'Fichas publicitarias',icon:'📰',aliases:['advertising_sheets','fichas_publicitarias','publicitarias','fichas_publicidad']}
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
  const cols=getTextColumns(table); const hasSupplier=cols.includes('proveedor_id') && schema.some(t=>t.name==='suppliers');
  let sql=hasSupplier
    ? `SELECT t.*, s.nombre AS proveedor FROM ${qid(table.name)} t LEFT JOIN suppliers s ON s.id=t.proveedor_id`
    : `SELECT * FROM ${qid(table.name)}`;
  const params=[];
  if(term){
    const searchCols=hasSupplier?[...cols,'proveedor']:cols;
    sql+=' WHERE '+searchCols.map(c=>c==='proveedor'?`CAST(s.nombre AS TEXT) LIKE ?`:`CAST(t.${qid(c)} AS TEXT) LIKE ?`).join(' OR ');
    for(let i=0;i<searchCols.length;i++)params.push('%'+term+'%');
  }
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
function visibleFields(row){
  const keys=Object.keys(row);const score=k=>{const n=normalize(k);if(['id','proveedor_id'].includes(n))return -10;if(/descripcion|modelo|nombre|referencia|proveedor|telefono|presion|caudal|familia|contacto|codigo_barras/.test(n))return 10;return 3};
  return keys.filter(k=>row[k]!=null&&String(row[k]).trim()&&score(k)>=0).sort((a,b)=>score(b)-score(a)).slice(0,6)
}
function findField(row,names){const keys=Object.keys(row);for(const wanted of names){const w=normalize(wanted);let k=keys.find(x=>normalize(x)===w);if(k)return k;k=keys.find(x=>normalize(x).includes(w));if(k)return k}return null}
function supportsPdf(section){return ['articulos','fichas','gruas','catalogos','publicitarias'].includes(section?.key)}
function pdfLinkField(row,section){
  const bySection={articulos:['descripcion'],fichas:['descripcion'],gruas:['modelo'],catalogos:['nombre'],publicitarias:['nombre']};
  return findField(row,bySection[section?.key]||[]);
}
function normalizeStem(v){return normalize(String(v??'').replace(/\.pdf$/i,'')).replace(/[^a-z0-9]+/g,'')}
function pdfCandidates(row,section){
  const vals=[];const add=v=>{if(v!==null&&v!==undefined&&String(v).trim())vals.push(String(v).trim())};
  // Artículos: regla confirmada del programa de PC: el PDF se llama como CODIGO_BARRAS.
  if(section?.key==='articulos'){add(row.codigo_barras);return vals}
  // Para el resto, la BD no contiene ruta ni nombre de PDF. Probamos las convenciones
  // habituales usadas por la aplicación de escritorio: id, referencia y campo visible.
  if(section?.key==='fichas'){add(row.codigo_barras);add(row.id);add(row.referencia);add(row.ref_proveedor);add(row.descripcion)}
  if(section?.key==='gruas'){add(row.id);add(row.modelo);add(row.referencia)}
  if(section?.key==='catalogos'){add(row.id);add(row.nombre);add(row.referencia)}
  if(section?.key==='publicitarias'){add(row.id);add(row.nombre);add(row.referencia)}
  const id=row.id!=null?String(row.id):'';
  if(id){
    const prefixes={fichas:['ficha','technical_sheet','technical'],gruas:['grua','crane'],catalogos:['catalogo','catalog'],publicitarias:['ficha_publicitaria','publicitaria','advertising_sheet','advertising']};
    for(const p of prefixes[section?.key]||[])vals.push(`${p}_${id}`,`${p}-${id}`,`${p}${id}`)
  }
  return [...new Set(vals)]
}
async function findPdfEntry(row,section){
  if(!supportsPdf(section))return null;
  const cands=pdfCandidates(row,section);

  // Selector moderno: NO indexamos toda la carpeta. Buscamos únicamente el
  // documento solicitado. Esto evita que Android tenga que mantener miles de
  // manejadores de archivos en memoria al elegir la carpeta.
  if(directoryHandle){
    for(const c of cands){
      const base=basename(c);
      const names=[base,base.toLowerCase().endsWith('.pdf')?base:base+'.pdf'];
      for(const name of names){
        try{return await directoryHandle.getFileHandle(name,{create:false})}catch(e){}
      }
    }
    // Segunda pasada, sólo si hace falta, para diferencias de mayúsculas o
    // nombres con una convención ligeramente distinta.
    try{
      const wanted=cands.map(c=>normalizeStem(c)).filter(Boolean);
      for await(const [name,entry] of directoryHandle.entries()){
        if(entry.kind!=='file'||!name.toLowerCase().endsWith('.pdf'))continue;
        const stem=normalizeStem(name);
        if(wanted.some(w=>stem===w||(w.length>=4&&(stem.startsWith(w)||stem.endsWith(w)))))return entry;
      }
    }catch(e){console.warn(e)}
  }

  // Compatibilidad con navegadores que sólo permiten seleccionar la carpeta
  // mediante <input webkitdirectory>. En ese caso sí recibimos la lista de
  // ficheros, pero sólo se conserva durante esta sesión.
  if(pdfFallbackIndex.size){
    for(const c of cands){
      const base=basename(c);
      for(const k of [base,base.endsWith('.pdf')?base:base+'.pdf']){
        const hit=pdfFallbackIndex.get(k.toLowerCase());if(hit)return hit;
      }
    }
    const entries=[...pdfFallbackIndex.entries()];
    for(const c of cands){const cs=normalizeStem(c);if(!cs)continue;const hit=entries.find(([k])=>{const ks=normalizeStem(k);return ks===cs||(cs.length>=4&&(ks.startsWith(cs)||ks.endsWith(cs)))});if(hit)return hit[1]}
  }
  return null;
}
function pdfFolderReady(){return !!directoryHandle || pdfFallbackIndex.size>0}
function resultCard(row,section){
  const d=document.createElement('div');d.className='resultCard';const fs=visibleFields(row);const title=preferredTitle(row);
  d.innerHTML=`<span class="pill">${html(section.label)}</span><h3 class="resultTitle">${html(title)}</h3><div class="resultMeta">${fs.map(k=>`<div class="fieldLine"><b>${html(prettyLabel(k))}:</b> ${html(row[k])}</div>`).join('')}</div>`;
  d.onclick=()=>showDetail(row,section);return d
}
function prettyLabel(k){const m={familia:'Familia',ref_proveedor:'Ref. proveedor',codigo_barras:'Código de barras',referencia:'Referencia',descripcion:'Descripción',descripcion2:'Descripción 2',estado:'Estado',proveedor:'Proveedor',anotaciones:'Anotaciones',modelo:'Modelo',presion:'Presión',caudal:'Caudal',nombre:'Nombre',contacto:'Contacto',telefono:'Teléfono',direccion:'Dirección',poblacion:'Población',codigo_postal:'Código postal',provincia:'Provincia',comunidad_autonoma:'Comunidad autónoma',observaciones:'Observaciones',referencia_tip:'Referencia TIP'};return m[normalize(k)]||String(k).replaceAll('_',' ')}
function renderResults(box,rows,section){box.innerHTML='';if(!rows.length){box.innerHTML='<div class="card stack"><span class="muted">No se han encontrado resultados.</span></div>';return}rows.forEach(r=>box.appendChild(resultCard(r,section)))}
function addDetailRow(body,k,v,linkFn=null){const r=document.createElement('div');r.className='detailRow';r.innerHTML=`<div class="label">${html(prettyLabel(k))}</div><div class="value"></div>`;const val=r.querySelector('.value');if(linkFn){const b=document.createElement('button');b.className='pdfTextLink detailPdfLink';b.type='button';b.innerHTML=`${html(v)} <span aria-hidden="true">📄</span>`;b.onclick=linkFn;val.appendChild(b)}else val.textContent=v;body.appendChild(r)}
function kitComponents(kitId){
  if(!schema.some(t=>t.name==='components')||!schema.some(t=>t.name==='articles'))return [];
  try{const st=db.prepare(`SELECT c.cantidad,c.posicion,a.codigo_barras,a.referencia,a.descripcion FROM components c JOIN articles a ON a.id=c.article_id WHERE c.kit_id=? ORDER BY c.posicion,c.id`);st.bind([kitId]);const out=[];while(st.step())out.push(st.getAsObject());st.free();return out}catch(e){return []}
}
async function showDetail(row,section){
  $('#detailSection').textContent=section.label;$('#detailTitle').textContent=preferredTitle(row);const body=$('#detailBody');body.innerHTML='';
  for(const [k,v] of Object.entries(row)){
    if(['id','proveedor_id'].includes(normalize(k))||v===null||String(v).trim()==='')continue;
    addDetailRow(body,k,String(v),null)
  }
  if(section?.key==='kits'&&row.id!=null){const comps=kitComponents(row.id);if(comps.length){const box=document.createElement('div');box.className='kitComponents';box.innerHTML='<h3>Componentes del kit</h3>'+comps.map(c=>`<div class="kitComp"><b>${html(c.cantidad)} × ${html(c.descripcion||c.referencia||c.codigo_barras)}</b><small>${html(c.referencia||'')} · ${html(c.codigo_barras||'')}</small></div>`).join('');body.appendChild(box)}}
  const acts=$('#detailActions');acts.innerHTML='';acts.style.display='none';$('#detailDialog').showModal();

  if(!supportsPdf(section))return;
  if(!pdfFolderReady()){
    const info=document.createElement('div');info.className='pdfMissing';info.textContent='Selecciona primero la carpeta pdf';acts.appendChild(info);acts.style.display='grid';return;
  }

  const loading=document.createElement('div');loading.className='pdfMissing';loading.textContent='Buscando PDF…';acts.appendChild(loading);acts.style.display='grid';
  const pdf=await findPdfEntry(row,section);
  // La ficha puede haberse cerrado mientras buscábamos.
  if(!$('#detailDialog').open)return;
  acts.innerHTML='';
  if(pdf){
    const linkKey=pdfLinkField(row,section);
    if(linkKey){
      const rows=[...body.querySelectorAll('.detailRow')];
      const target=rows.find(r=>normalize(r.querySelector('.label')?.textContent)===normalize(prettyLabel(linkKey)));
      if(target){const val=target.querySelector('.value');const text=val.textContent;val.innerHTML='';const b=document.createElement('button');b.className='pdfTextLink detailPdfLink';b.type='button';b.innerHTML=`${html(text)} <span aria-hidden="true">📄</span>`;b.onclick=()=>openPdfEntry(pdf);val.appendChild(b)}
    }
    const b=document.createElement('button');b.className='primary';b.textContent='📄 Abrir PDF';b.onclick=()=>openPdfEntry(pdf);acts.appendChild(b);
  }else{
    const info=document.createElement('div');info.className='pdfMissing';info.textContent='Este registro no tiene PDF localizado';acts.appendChild(info)
  }
  acts.style.display='grid';
}
async function openPdfEntry(entry){
  if(!entry){toast('No encuentro ese PDF en la carpeta seleccionada');return}
  try{const file=entry.getFile?await entry.getFile():entry;const url=URL.createObjectURL(file);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){console.error(e);toast('No se pudo abrir el PDF')}
}
async function pickPdfFolder(){
  // v1.4: seleccionar la carpeta NO la recorre ni indexa. Sólo guardamos el
  // permiso. Así la base SQLite queda totalmente al margen del selector PDF.
  if(window.showDirectoryPicker){
    try{
      const h=await window.showDirectoryPicker({mode:'read'});
      directoryHandle=h;
      try{await pdfIdbSet('pdfDir',h)}catch(e){console.warn('No se pudo recordar la carpeta PDF',e)}
      $('#folderStatus').textContent=`${h.name} · carpeta autorizada`;
      toast('Carpeta PDF seleccionada');
      await ensureDbReady();
      renderHome();
      return;
    }catch(e){if(e.name==='AbortError')return;console.warn(e)}
  }
  $('#folderFallback').click();
}
async function ensureDbReady(){
  if(db)return true;
  try{const buf=await idbGet('dbBytes');const name=await idbGet('dbName');if(buf&&SQL){loadDb(new Uint8Array(buf),name||'material.db');return true}}catch(e){console.warn(e)}
  return false;
}
function indexFallbackFiles(files){
  pdfFallbackIndex.clear();let count=0;
  for(const f of files){if(f.name.toLowerCase().endsWith('.pdf')){pdfFallbackIndex.set(f.name.toLowerCase(),f);count++}}
  $('#folderStatus').textContent=`Carpeta seleccionada · ${count} PDF disponibles (esta sesión)`;toast('Carpeta PDF seleccionada');
  ensureDbReady().then(()=>renderHome());
}
async function restoreDirectoryHandle(){
  try{
    const h=await pdfIdbGet('pdfDir');
    if(h&&h.queryPermission){
      const p=await h.queryPermission({mode:'read'});
      if(p==='granted'){directoryHandle=h;$('#folderStatus').textContent=`${h.name} · carpeta autorizada`}
      else $('#folderStatus').textContent='Carpeta recordada; toca “Seleccionar carpeta” para autorizarla.'
    }
  }catch(e){console.warn(e)}
}
function renderAllTables(){const b=$('#allTables');b.innerHTML='';if(!db){b.innerHTML='<div class="card stack muted">Importa primero la base de datos.</div>';return}schema.forEach(t=>{const d=document.createElement('button');d.className='resultCard tableItem';d.innerHTML=`<strong>${html(t.name)}</strong><span class="small muted">${t.cols.length} columnas</span>`;d.onclick=()=>openSection({label:t.name,icon:'🗂️',table:t});b.appendChild(d)})}

function pdfIdb(){return new Promise((res,rej)=>{const r=indexedDB.open('material-movil-pdf',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function pdfIdbSet(k,v){const d=await pdfIdb();return new Promise((res,rej)=>{const tx=d.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function pdfIdbGet(k){const d=await pdfIdb();return new Promise((res,rej)=>{const r=d.transaction('kv').objectStore('kv').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('material-movil',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbSet(k,v){const d=await idb();return new Promise((res,rej)=>{const tx=d.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbGet(k){const d=await idb();return new Promise((res,rej)=>{const r=d.transaction('kv').objectStore('kv').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
init();
