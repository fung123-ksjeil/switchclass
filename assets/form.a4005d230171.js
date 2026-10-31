/* Fill the supplied HWP template locally; no document data leaves the browser. */
let applicationStartPair=null;
const HWP_ROW_HEADERS=[
 [146,150,154,158,162,166,170],[179,183,187,191,195,199,203],
 [212,216,220,224,228,232,236],[245,249,253,257,261,265,269],
 [278,282,286,290,294,298,302],[311,315,319,323,327,331,335],
 [344,349,354,359,364,369,374]
];
function localDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('수업 날짜를 입력하세요.');
 const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);
 if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)throw Error('날짜를 확인하세요.');
 return date;
}
function dateLabel(value,full=false){const d=localDate(value);return `${full?d.getFullYear()+'년 ':''}${d.getMonth()+1}월 ${d.getDate()}일 (${['일','월','화','수','목','금','토'][d.getDay()]}${full?'요일':''})`;}
function applicationChoices(){
 const teacher=$('applicationTeacher').value;
 return savedSwaps.filter(p=>p.lessons.some(l=>l.teacher===teacher)).map(pair=>({pair,own:pair.lessons.find(l=>l.teacher===teacher),other:pair.lessons.find(l=>l.teacher!==teacher)}));
}
function renderApplicationRows(){
 const teacher=$('applicationTeacher').value;
 $('applicationRows').innerHTML=applicationChoices().map(({pair,own,other},i)=>{
  const previous=pair.applications?.[teacher];
  const checked=applicationStartPair?pair.id===applicationStartPair:i===0;
  return `<div class="application-row"><label><input type="checkbox" data-request-pair="${esc(pair.id)}" ${checked?'checked':''}> 교체 ${pair.number} · ${esc(own.group)} · ${time(own)} ${esc(own.subject)}</label><p>${esc(name(other.teacher))} · ${esc(other.subject)} · ${time(other)}</p><label>맞바꿀 수업의 실제 날짜<input type="date" data-request-date="${esc(pair.id)}" value="${esc(previous?.makeupDate||'')}" ${checked?'required':''}></label></div>`;
 }).join('');
 const initial=applicationChoices().find(x=>applicationStartPair?x.pair.id===applicationStartPair:true)?.pair.applications?.[teacher];
 $('absenceDate').value=initial?.absenceDate||'';$('applicationNote').value=initial?.note||'';
}
function openApplication(pairId=null){
 if(!savedSwaps.length)return;applicationStartPair=pairId;
 const ids=[...new Set(savedSwaps.flatMap(p=>p.lessons.map(l=>l.teacher)))];
 $('applicationTeacher').innerHTML=ids.map(id=>`<option value="${esc(id)}">${esc(name(id))}</option>`).join('');
 if(pairId)$('applicationTeacher').value=savedSwaps.find(p=>p.id===pairId).lessons[0].teacher;
 renderApplicationRows();$('applicationError').textContent='';$('applicationDialog').showModal();
}
function collectApplication(){
 const teacher=$('applicationTeacher').value,absenceDate=$('absenceDate').value;
 const absent=localDate(absenceDate),usedPeriods=new Set(),rows=[];
 for(const checkbox of $('applicationRows').querySelectorAll('[data-request-pair]:checked')){
  const choice=applicationChoices().find(x=>x.pair.id===checkbox.dataset.requestPair);if(!choice)continue;
  const {pair,own,other}=choice;
  const dateInput=[...$('applicationRows').querySelectorAll('[data-request-date]')].find(x=>x.dataset.requestDate===pair.id);
  const makeupDate=dateInput.value,makeup=localDate(makeupDate);
  if(absent.getDay()!==own.day+1)throw Error(`${name(teacher)} 선생님의 ${time(own)} 수업에 맞는 결보강일자를 선택하세요.`);
  if(makeup.getDay()!==other.day+1)throw Error(`교체 ${pair.number}: ${time(other)}에 맞는 날짜를 선택하세요.`);
  if(own.period>7||usedPeriods.has(own.period))throw Error('한 신청서에는 1~7교시를 중복 없이 입력할 수 있습니다. 날짜별로 나누어 작성하세요.');
  // Confirm actual dated lessons do not overlap across multiple saved pairs.
  if(rows.some(r=>r.makeupDate===makeupDate&&r.other.period===other.period))throw Error('신청 교사의 보강 날짜·교시가 중복됩니다.');
  usedPeriods.add(own.period);rows.push({pairId:pair.id,own,other,makeupDate,otherName:name(other.teacher)});
 }
 if(!rows.length)throw Error('신청서에 넣을 교체를 하나 이상 선택하세요.');
 rows.sort((a,b)=>a.own.period-b.own.period);
 return {teacher,teacherName:name(teacher),absenceDate,reason:'',note:$('applicationNote').value.trim(),rows};
}
function applicationFields(data){
 const fields={45:`( ${[...new Set(data.rows.map(r=>r.own.subject))].join('·')} )과     교 사 : ( ${data.teacherName} ) 인`,55:'  '+dateLabel(data.absenceDate,true),69:data.reason,383:data.note,386:'',389:''};
 for(const hs of HWP_ROW_HEADERS)for(const h of hs)fields[h]='';
 for(const r of data.rows){const values=[r.own.group,r.own.subject,r.other.subject,r.otherName,dateLabel(r.makeupDate),String(r.other.period),''];HWP_ROW_HEADERS[r.own.period-1].forEach((h,i)=>fields[h]=values[i]);}
 return fields;
}
function utf16(value){const b=new Uint8Array(value.length*2),v=new DataView(b.buffer);for(let i=0;i<value.length;i++)v.setUint16(i*2,value.charCodeAt(i),true);return b;}
function hwpRecords(bytes){
 const records=[];let offset=0;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 while(offset<bytes.length){if(offset+4>bytes.length)throw Error('HWP 레코드 오류');const header=view.getUint32(offset,true);offset+=4;let size=header>>>20;if(size===4095){size=view.getUint32(offset,true);offset+=4;}if(offset+size>bytes.length)throw Error('HWP 레코드 크기 오류');records.push({tag:header&1023,level:(header>>>10)&1023,body:bytes.slice(offset,offset+size)});offset+=size;}
 return records;
}
function packHwp(records){
 const result=[];let length=0;
 for(const r of records){const extended=r.body.length>=4095,h=new Uint8Array(extended?8:4),v=new DataView(h.buffer);v.setUint32(0,((Math.min(r.body.length,4095)<<20)|(r.level<<10)|r.tag)>>>0,true);if(extended)v.setUint32(4,r.body.length,true);result.push(h,r.body);length+=h.length+r.body.length;}
 const bytes=new Uint8Array(length);let offset=0;for(const b of result){bytes.set(b,offset);offset+=b.length;}return bytes;
}
function fillHwp(template,fields,summary){
 const cfb=CFB.read(template,{type:'array'}),section=CFB.find(cfb,'/BodyText/Section0');if(!section)throw Error('HWP 본문을 찾지 못했습니다.');
 const records=hwpRecords(fflate.inflateSync(new Uint8Array(section.content))),output=[];
 for(let i=0;i<records.length;i++){
  const current=records[i];
  if(current.tag!==66||!(i in fields)){output.push(current);continue;}
  let end=i+1;while(end<records.length&&records[end].level>current.level)end++;
  const children=records.slice(i+1,end),header=current.body.slice(),view=new DataView(header.buffer),value=String(fields[i]).replace(/[\r\n]/g,' ')+'\r';
  view.setUint32(0,((view.getUint32(0,true)&0x80000000)|value.length)>>>0,true);view.setUint32(4,0,true);view.setUint16(12,1,true);view.setUint16(14,0,true);
  const shape=(children.find(r=>r.tag===68)?.body||new Uint8Array(8)).slice(0,8);new DataView(shape.buffer).setUint32(0,0,true);
  const line=children.find(r=>r.tag===69);view.setUint16(16,line?1:0,true);
  output.push({...current,body:header},{tag:67,level:current.level+1,body:utf16(value)},{tag:68,level:current.level+1,body:shape});
  if(line){const b=line.body.slice(0,36);new DataView(b.buffer).setUint32(0,0,true);output.push({...line,body:b});}
  i=end-1;
 }
 return patchHwpContainer(template,{
  Section0:fflate.deflateSync(packHwp(output)),
  PrvText:utf16(summary),
  // Clear the old sample thumbnail without deleting its directory entry.
  PrvImage:Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
 });
}
// Preserve the supplied OLE directory tree and metadata instead of rebuilding it.
function patchHwpContainer(template,replacements){
 const original=new Uint8Array(template),header=original.slice(0,512),hv=new DataView(header.buffer);
 const sectorSize=1<<hv.getUint16(30,true),miniSize=1<<hv.getUint16(32,true);
 if(sectorSize!==512||miniSize!==64||hv.getUint32(44,true)!==1)throw Error('지원하지 않는 HWP 저장 구조입니다.');
 const FREE=0xffffffff,END=0xfffffffe,fatSector=hv.getUint32(76,true);
 const fat=Array.from(new Uint32Array(original.slice((fatSector+1)*512,(fatSector+2)*512).buffer));
 function chain(start,table=fat){const seen=new Set(),result=[];while(start<0xfffffffa){if(start>=table.length||seen.has(start))throw Error('HWP 저장 체인 오류');seen.add(start);result.push(start);start=table[start];}return result;}
 function readChain(start){const ids=chain(start),b=new Uint8Array(ids.length*512);ids.forEach((id,i)=>b.set(original.slice((id+1)*512,(id+2)*512),i*512));return b;}
 const directoryIds=chain(hv.getUint32(48,true)),directory=readChain(hv.getUint32(48,true));
 const dv=new DataView(directory.buffer),entries=[];
 for(let offset=0;offset<directory.length;offset+=128){const type=dv.getUint8(offset+66),size=dv.getUint16(offset+64,true);if(!type)continue;const name=new TextDecoder('utf-16le').decode(directory.slice(offset,offset+Math.max(0,size-2)));entries.push({offset,type,name,start:dv.getUint32(offset+116,true),size:dv.getUint32(offset+120,true)});}
 const root=entries.find(e=>e.type===5);if(!root)throw Error('HWP 루트 저장소가 없습니다.');
 const originalMini=readChain(root.start).slice(0,root.size),oldMiniFatStart=hv.getUint32(60,true);
 const miniFat=Array.from(new Uint32Array(readChain(oldMiniFatStart).buffer));
 const pieces=[originalMini];let miniLength=originalMini.length;
 for(const [name,content] of Object.entries(replacements)){
  const entry=entries.find(e=>e.type===2&&e.name===name);if(!entry||content.length>=4096)throw Error('신청서 내용이 양식의 저장 범위를 초과했습니다. 하단 내용을 줄여주세요.');
  if(entry.size<4096)for(const id of chain(entry.start,miniFat))miniFat[id]=FREE;
  else for(const id of chain(entry.start))fat[id]=FREE;
  const start=Math.ceil(miniLength/64),count=Math.ceil(content.length/64),part=new Uint8Array(count*64);part.set(content);
 for(let i=0;i<count;i++)miniFat[start+i]=i===count-1?END:start+i+1;
  pieces.push(part);miniLength+=part.length;
  dv.setUint32(entry.offset+116,start,true);dv.setUint32(entry.offset+120,content.length,true);dv.setUint32(entry.offset+124,0,true);
 }
 const newMini=new Uint8Array(miniLength);let p=0;for(const part of pieces){newMini.set(part,p);p+=part.length;}
 const appended=[];let next=original.length/512-1;
 function append(bytes){const count=Math.ceil(bytes.length/512),start=next;if(start+count>fat.length)throw Error('신청서 저장 공간을 초과했습니다.');for(let i=0;i<count;i++){const b=new Uint8Array(512);b.set(bytes.slice(i*512,(i+1)*512));appended.push(b);fat[next]=i===count-1?END:next+1;next++;}return start;}
 for(const id of chain(root.start))fat[id]=FREE;
 for(const id of chain(oldMiniFatStart))fat[id]=FREE;
 const newRootStart=append(newMini),miniFatBytes=new Uint8Array(Math.ceil(miniFat.length/128)*512);miniFatBytes.fill(255);const mfv=new DataView(miniFatBytes.buffer);miniFat.forEach((value,i)=>mfv.setUint32(i*4,value===undefined?FREE:value,true));
 const newMiniFatStart=append(miniFatBytes);dv.setUint32(root.offset+116,newRootStart,true);dv.setUint32(root.offset+120,miniLength,true);dv.setUint32(root.offset+124,0,true);hv.setUint32(60,newMiniFatStart,true);hv.setUint32(64,miniFatBytes.length/512,true);
 const result=new Uint8Array(original.length+appended.length*512);result.set(original);result.set(header);appended.forEach((b,i)=>result.set(b,original.length+i*512));directoryIds.forEach((id,i)=>result.set(directory.slice(i*512,(i+1)*512),(id+1)*512));
 const fv=new DataView(result.buffer,(fatSector+1)*512,512);fat.forEach((value,i)=>fv.setUint32(i*4,value,true));return result;
}
function applicationPreview(data,hwpUrl,filename){
 const fields=applicationFields(data),filled=new Map(data.rows.map(r=>[r.own.period,r]));
 const rows=Array.from({length:7},(_,i)=>{const r=filled.get(i+1);return `<tr class="period-row"><td>${i+1}</td>${r?[r.own.group,r.own.subject,r.other.subject,r.otherName,dateLabel(r.makeupDate),r.other.period,''].map(v=>`<td>${esc(v)}</td>`).join(''):'<td></td>'.repeat(7)}</tr>`;}).join('');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>결보강신청서 · ${esc(data.teacherName)}</title><style>
 *{box-sizing:border-box}body{background:#e8ebee;margin:0;font-family:'바탕',Batang,serif;color:#000}.actions{position:sticky;top:0;padding:12px;background:white;border-bottom:1px solid #ccc;display:flex;gap:10px;z-index:2;font-family:system-ui}.actions a,.actions button{font:13px system-ui;padding:8px 14px;border:1px solid #bbb;border-radius:5px;background:#fff;text-decoration:none;color:#222;cursor:pointer}.actions a{background:#1949a3;color:#fff;border-color:#1949a3}.paper{width:210mm;min-height:297mm;margin:18px auto;background:white;padding:35mm 25mm 20mm}.form-heading{height:30mm;position:relative;padding-top:1mm}.form-heading h1{font-size:15pt;letter-spacing:3px;margin:0;text-align:center;padding-right:28mm}.approval{position:absolute;right:0;top:1mm;width:37mm;border-collapse:collapse;font-size:9pt;text-align:center}.approval td{border:.25mm solid #000;width:50%;height:5mm}.approval tr:last-child td{height:15mm}.applicant{position:absolute;bottom:0;width:100%;text-align:right;padding-right:43mm;font-size:11pt;margin:0 0 1mm;white-space:pre-wrap}.form-table{border-collapse:collapse;table-layout:fixed;width:160mm;font-size:10pt}.form-table td,.form-table th{border:.25mm solid #000;padding:1mm;text-align:center;font-weight:normal;overflow-wrap:anywhere}.date-row{height:12mm}.date-row th{font-weight:bold}.date-row td{text-align:left;padding-left:4mm}.group-row{height:9.5mm}.subhead{height:9mm;font-size:9pt}.period-row{height:12.5mm;font-size:9pt}.period-row:first-of-type{height:13.5mm}.diagonal{position:relative;background:linear-gradient(to top right,transparent 49.5%,#000 50%,transparent 50.5%);font-size:9pt}.diagonal .top{position:absolute;right:2mm;top:2mm}.diagonal .bottom{position:absolute;left:1mm;bottom:1mm}.notes-title{height:11.5mm}.notes{height:43.5mm;vertical-align:top;white-space:pre-wrap;text-align:left!important;padding:4mm!important} @page{size:A4;margin:0}@media print{body{background:white}.actions{display:none}.paper{margin:0;min-height:0;height:297mm;box-shadow:none}.form-table{break-inside:avoid}}@media screen and (max-width:800px){.paper{margin:8px 0}.actions{flex-wrap:wrap}}
 </style></head><body><div class="actions"><a href="${hwpUrl}" download="${esc(filename)}">작성된 HWP 다운로드</a><button onclick="window.print()">인쇄 / PDF 저장</button></div><main class="paper"><header class="form-heading"><h1>결 · 보 강 신청서</h1><table class="approval"><tr><td>담당부원</td><td>교무부장</td></tr><tr><td></td><td></td></tr></table><p class="applicant">${esc(fields[45])}</p></header><table class="form-table"><colgroup>${[13.35,12.33,17.41,17.41,39.73,25.64,11.49,21.6].map(w=>`<col style="width:${w}mm">`).join('')}</colgroup><tr class="date-row"><th colspan="2">결강일자</th><td colspan="6">${esc(dateLabel(data.absenceDate,true))}</td></tr><tr class="date-row"><th colspan="2">결강구분<br>(○표시)</th><td colspan="6">${esc(data.reason)}</td></tr><tr class="group-row"><th rowspan="2" class="diagonal"><span class="top">내<br>용</span><span class="bottom">교<br>시</span></th><th colspan="2">결강 사항</th><th colspan="2">교체 사항</th><th colspan="3">보강 사항</th></tr><tr class="subhead"><th>학반</th><th>과목</th><th>과 목</th><th>교체교사명</th><th>월 일(요일)</th><th>교시</th><th>비고</th></tr>${rows}<tr><td colspan="8" class="notes-title">결 · 보강 내용</td></tr><tr><td colspan="8" class="notes">${esc(data.note)}</td></tr></table></main></body></html>`;
}
$('applicationTeacher').onchange=()=>{applicationStartPair=null;renderApplicationRows();};
$('applicationRows').onchange=e=>{if(!e.target.matches('[data-request-pair]'))return;const row=e.target.closest('.application-row');row.querySelector('input[type=date]').required=e.target.checked;};
$('applicationOpen').onclick=()=>openApplication();$('applicationClose').onclick=()=>$('applicationDialog').close();
$('applicationForm').onsubmit=async e=>{
 e.preventDefault();$('applicationError').textContent='';let data;
 try{data=collectApplication();}catch(err){$('applicationError').textContent=err.message;return;}
 const preview=window.open('about:blank','_blank');if(!preview){$('applicationError').textContent='신청서를 열 수 있도록 브라우저의 팝업 차단을 해제하세요.';return;}
 preview.document.write('<p>결보강신청서를 작성하고 있습니다…</p>');
 try{
  const response=await fetch('./forms/makeup-template.hwp');if(!response.ok)throw Error('원본 양식을 읽지 못했습니다.');
  const fields=applicationFields(data),summary=`결 · 보강 신청서\r${fields[45]}\r${fields[55]}\r${data.rows.map(r=>`${r.own.period}교시 ${r.own.group} ${r.own.subject} / ${r.other.subject} ${r.otherName} / ${dateLabel(r.makeupDate)} ${r.other.period}교시`).join('\r')}`;
  const bytes=fillHwp(new Uint8Array(await response.arrayBuffer()),fields,summary);
  const blobUrl=URL.createObjectURL(new Blob([bytes],{type:'application/x-hwp'}));
  const filename=`결보강신청서_${data.teacherName}_${data.absenceDate}.hwp`.replace(/[\\/:*?"<>|]/g,'_');
  preview.document.open();preview.document.write(applicationPreview(data,blobUrl,filename));preview.document.close();
  const next=savedSwaps.map(pair=>{const row=data.rows.find(r=>r.pairId===pair.id);return row?{...pair,applications:{...pair.applications,[data.teacher]:{absenceDate:data.absenceDate,makeupDate:row.makeupDate,reason:data.reason,note:data.note}}}:pair;});
  if(!persistSwaps(next))$('applicationError').textContent='신청서는 작성했지만 입력 날짜를 브라우저에 저장하지 못했습니다.';
 }catch(err){preview.close();$('applicationError').textContent=err.message||'신청서를 만들지 못했습니다.';}
};
