/* Create the printable application locally; no document data leaves the browser. */
function localDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('수업 날짜를 입력하세요.');
 const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);
 if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)throw Error('날짜를 확인하세요.');
 return date;
}
function dateLabel(value,full=false){const d=localDate(value);return `${full?d.getFullYear()+'년 ':''}${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]}${full?'요일':''})`;}
function applicationChoices(){
 const teacher=$('applicationTeacher').value;
 return savedSwaps.filter(p=>p.lessons.some(l=>l.teacher===teacher)).map(pair=>({pair,own:pair.lessons.find(l=>l.teacher===teacher),other:pair.lessons.find(l=>l.teacher!==teacher)})).sort((a,b)=>a.own.period-b.own.period||a.own.day-b.own.day||a.pair.number-b.pair.number);
}
function renderApplicationRows(){
 const teacher=$('applicationTeacher').value;
 $('applicationRows').innerHTML=applicationChoices().map(({pair,own,other})=>{
  const previous=pair.applications?.[teacher];
  return `<div class="application-row"><div class="application-row-title">교체 ${pair.number} · ${esc(own.group)} · ${time(own)} ${esc(own.subject)}</div><p>${esc(name(other.teacher))} · ${esc(other.subject)} · ${time(other)}</p><label>맞바꿀 수업의 실제 날짜<input type="date" data-request-date="${esc(pair.id)}" value="${esc(previous?.makeupDate||'')}" required></label></div>`;
 }).join('');
 const initial=applicationChoices()[0]?.pair.applications?.[teacher];
 $('absenceDate').value=initial?.absenceDate||'';$('applicationNote').value=initial?.note||'';
}
function openApplication(){
 if(!savedSwaps.length)return;
 const ids=[...new Set(savedSwaps.flatMap(p=>p.lessons.map(l=>l.teacher)))];
 $('applicationTeacher').innerHTML=ids.map(id=>`<option value="${esc(id)}">${esc(name(id))}</option>`).join('');
 renderApplicationRows();$('applicationError').textContent='';$('applicationDialog').showModal();
}
function collectApplication(){
 const teacher=$('applicationTeacher').value,absenceDate=$('absenceDate').value;
 const absent=localDate(absenceDate),usedPeriods=new Set(),rows=[];
 for(const {pair,own,other} of applicationChoices()){
  const dateInput=[...$('applicationRows').querySelectorAll('[data-request-date]')].find(x=>x.dataset.requestDate===pair.id);
  const makeupDate=dateInput.value,makeup=localDate(makeupDate);
  if(absent.getDay()!==own.day+1)throw Error(`${name(teacher)} 선생님의 ${time(own)} 수업에 맞는 결보강일자를 선택하세요.`);
  if(makeup.getDay()!==other.day+1)throw Error(`교체 ${pair.number}: ${time(other)}에 맞는 날짜를 선택하세요.`);
  if(own.period>7||usedPeriods.has(own.period))throw Error('한 신청서에는 1~7교시를 중복 없이 입력할 수 있습니다. 날짜별로 나누어 작성하세요.');
  // Confirm actual dated lessons do not overlap across multiple saved pairs.
  if(rows.some(r=>r.makeupDate===makeupDate&&r.other.period===other.period))throw Error('신청 교사의 보강 날짜·교시가 중복됩니다.');
  usedPeriods.add(own.period);rows.push({pairId:pair.id,own,other,makeupDate,otherName:name(other.teacher)});
 }
 if(!rows.length)throw Error('작성할 교체가 없습니다.');
 rows.sort((a,b)=>a.own.period-b.own.period);
 return {teacher,teacherName:name(teacher),absenceDate,reason:'',note:$('applicationNote').value.trim(),rows};
}
function applicationPreview(data){
 // Use the actual preview embedded in the 2026 HWPX, rather than redraw its
 // table in HTML. Coordinates are in the original 724 × 1024 preview pixels;
 // percentage positioning keeps the original page and overlays aligned.
 const box=(x,y,w,h,text,cls='')=>`<div class="field ${cls}" style="left:${x/724*100}%;top:${y/1024*100}%;width:${w/724*100}%;height:${h/1024*100}%">${esc(text)}</div>`;
 const applicant=`( ${[...new Set(data.rows.map(r=>r.own.subject))].join('·')} )과     교 사 : ( ${data.teacherName} ) 인`;
 const filled=new Map(data.rows.map(r=>[r.own.period,r]));
 const starts=[371,417,460,503,546,589,632],heights=[46,43,43,43,43,43,38];
 const rows=starts.map((y,i)=>{
  const r=filled.get(i+1);
  const cells=r?[r.own.group,r.own.subject,r.other.subject,r.otherName,dateLabel(r.makeupDate),r.other.period]:[];
  return `<div class="period-row">${cells.map((v,j)=>box([135,177,237,297,433,520][j],y+1,[39,57,57,133,84,36][j],heights[i]-3,v)).join('')}</div>`;
 }).join('');
 const image=new URL('./templates/application-2026-preview.png',location.href).href;
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>결보강신청서 · ${esc(data.teacherName)}</title><style>
 *{box-sizing:border-box}body{margin:0;background:#e8ebee;color:#000;font-family:'바탕',Batang,'Noto Serif CJK KR',serif}.actions{position:sticky;top:0;z-index:2;padding:12px;background:white;border-bottom:1px solid #ccc}.actions button{font:13px system-ui;padding:8px 14px;background:white;border:1px solid #bbb;border-radius:5px;cursor:pointer}.paper{position:relative;width:210mm;height:297mm;margin:18px auto;background:white}.form-original{display:block;width:100%;height:100%}.field{position:absolute;display:flex;align-items:center;justify-content:center;padding:0 1px;font-size:10pt;line-height:1.25;overflow-wrap:anywhere;white-space:pre-wrap;background:white}.applicant{font-size:12pt}.date{justify-content:flex-start;padding-left:3mm;font-size:12pt}.notes{align-items:flex-start;justify-content:flex-start;padding:3mm;font-size:11pt}@page{size:A4;margin:0}@media print{body{background:white}.actions{display:none}.paper{margin:0;break-inside:avoid}}@media screen and (max-width:800px){.paper{margin:8px 0}}
 </style></head><body><div class="actions"><button onclick="window.print()">인쇄 / PDF 저장</button></div><main class="paper"><img class="form-original" src="${esc(image)}" alt="2026년 결보강신청서 원본 양식">${box(170,204,327,19,applicant,'applicant')}${box(170,230,460,33,dateLabel(data.absenceDate,true),'date')}${data.reason?box(170,269,460,34,data.reason):''}${rows}${box(89,713,541,143,data.note,'notes')}</main></body></html>`;
}
// Keep every original archive entry; change only text in the original section.
let applicationTemplatePromise;
async function applicationTemplate(){
 if(!applicationTemplatePromise)applicationTemplatePromise=fetch('./templates/application-2026.hwpx').then(r=>{
  if(!r.ok)throw Error('신청서 원본을 불러오지 못했습니다. 잠시 후 다시 시도하세요.');
  return r.arrayBuffer();
 }).catch(e=>{applicationTemplatePromise=null;throw e;});
 return new Uint8Array(await applicationTemplatePromise);
}
function applicationHwpx(template,data){
 const files=fflate.unzipSync(template),path='Contents/section0.xml';
 let xml=fflate.strFromU8(files[path]);
 const encode=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const values=new Map();
 values.set('1/2',dateLabel(data.absenceDate,true));
 values.set('2/2',data.reason);
 values.set('13/0',data.note);
 for(const row of data.rows){
  const r=row.own.period+4;
  [row.own.group,row.own.subject,row.other.subject,row.otherName,dateLabel(row.makeupDate),row.other.period].forEach((v,i)=>values.set(`${r}/${[1,3,4,5,6,7][i]}`,v));
 }
 // These cells contain no nested table. Match the address after their paragraph,
 // preserving all cell, paragraph, run, border, sizing and merge attributes.
 for(const [address,value] of values){
  if(value==='')continue;
  const [row,col]=address.split('/');let found=false;
  xml=xml.replace(/<hp:tc\b[^>]*>(?:(?!<hp:tc\b)[\s\S])*?<\/hp:tc>/g,cell=>{
   if(!cell.includes(`<hp:cellAddr colAddr="${col}" rowAddr="${row}"/>`))return cell;
   found=true;
   if(address==='1/2'){
    // The 2026 form uses separate runs for the year and the rest of the
    // date. Fill both in place, retaining their individual character styles.
    const date=localDate(data.absenceDate);
    return cell.replace('<hp:t>2026</hp:t>',`<hp:t>${date.getFullYear()}</hp:t>`)
     .replace('<hp:t>년 월 일  ( 요일 )</hp:t>',`<hp:t>년 ${date.getMonth()+1}월 ${date.getDate()}일 (${['일','월','화','수','목','금','토'][date.getDay()]}요일)</hp:t>`);
   }
   return cell.replace(/<hp:run\b([^>]*?)(?:\/>|>[\s\S]*?<\/hp:run>)/,(_,attrs)=>`<hp:run${attrs}><hp:t>${encode(value)}</hp:t></hp:run>`);
  });
  if(!found)throw Error('신청서 원본의 입력 칸을 찾지 못했습니다.');
 }
 const applicant=`( ${[...new Set(data.rows.map(r=>r.own.subject))].join('·')} )과     교 사 : ( ${data.teacherName} ) 인`;
 const applicantPlaceholder=/\( +\)과 +교 사 : \( +\) 인/;
 if(!applicantPlaceholder.test(xml))throw Error('신청서 원본의 신청 교사 칸을 찾지 못했습니다.');
 xml=xml.replace(applicantPlaceholder,()=>encode(applicant));
 files[path]=fflate.strToU8(xml);
 // Refresh the text preview while preserving all document/layout resources.
 files['Preview/PrvText.txt']=fflate.strToU8([applicant,dateLabel(data.absenceDate,true),...data.rows.map(r=>`${r.own.period}교시 ${r.own.group} ${r.own.subject} → ${r.other.subject} ${r.otherName} ${dateLabel(r.makeupDate)} ${r.other.period}교시`),data.note].join('\r\n'));
 // Preserve the original thumbnail and package membership for compatibility.
 const entries={mimetype:[files.mimetype,{level:0}]};
 for(const [name,bytes] of Object.entries(files))if(name!=='mimetype')entries[name]=bytes;
 return fflate.zipSync(entries,{level:6});
}
function rememberApplication(data){
 const next=savedSwaps.map(pair=>{const row=data.rows.find(r=>r.pairId===pair.id);return row?{...pair,applications:{...pair.applications,[data.teacher]:{absenceDate:data.absenceDate,makeupDate:row.makeupDate,reason:data.reason,note:data.note}}}:pair;});
 if(!persistSwaps(next))$('applicationError').textContent='신청서는 작성했지만 입력 날짜를 브라우저에 저장하지 못했습니다.';
}
$('applicationTeacher').onchange=renderApplicationRows;
$('applicationOpen').onclick=()=>openApplication();$('applicationClose').onclick=()=>$('applicationDialog').close();
$('applicationForm').onsubmit=async e=>{
 e.preventDefault();$('applicationError').textContent='';let data;
 try{data=collectApplication();}catch(err){$('applicationError').textContent=err.message;return;}
 const download=e.submitter?.id==='applicationDownload';
 const preview=download?null:window.open('about:blank','_blank');
 if(!download&&!preview){$('applicationError').textContent='신청서를 볼 수 있도록 브라우저의 팝업 차단을 해제하세요.';return;}
 const buttons=[$('applicationGenerate'),$('applicationDownload')];buttons.forEach(b=>b.disabled=true);
 try{
  if(download){
   const bytes=applicationHwpx(await applicationTemplate(),data);
   const url=URL.createObjectURL(new Blob([bytes],{type:'application/hwp+zip'}));
   const link=document.createElement('a');link.href=url;link.download=`결보강신청서_${data.teacherName.replace(/[\\/:*?"<>|]/g,'_')}_${data.absenceDate}.hwpx`;
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }else{
   preview.document.open();preview.document.write(applicationPreview(data));preview.document.close();
  }
  rememberApplication(data);
 }catch(err){preview?.close();$('applicationError').textContent=err.message||'신청서를 만들지 못했습니다.';}
 finally{buttons.forEach(b=>b.disabled=false);}
};
