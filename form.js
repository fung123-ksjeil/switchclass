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
 const applicant=`( ${[...new Set(data.rows.map(r=>r.own.subject))].join('·')} )과     교 사 : ( ${data.teacherName} ) 인`,filled=new Map(data.rows.map(r=>[r.own.period,r]));
 const rows=Array.from({length:7},(_,i)=>{const r=filled.get(i+1);return `<tr class="period-row"><td>${i+1}</td>${r?[r.own.group,r.own.subject,r.other.subject,r.otherName,dateLabel(r.makeupDate),r.other.period,''].map(v=>`<td>${esc(v)}</td>`).join(''):'<td></td>'.repeat(7)}</tr>`;}).join('');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>결보강신청서 · ${esc(data.teacherName)}</title><style>
 *{box-sizing:border-box}body{background:#e8ebee;margin:0;font-family:'바탕',Batang,serif;color:#000}.actions{position:sticky;top:0;padding:12px;background:white;border-bottom:1px solid #ccc;display:flex;gap:10px;z-index:2;font-family:system-ui}.actions a,.actions button{font:13px system-ui;padding:8px 14px;border:1px solid #bbb;border-radius:5px;background:#fff;text-decoration:none;color:#222;cursor:pointer}.actions a{background:#1949a3;color:#fff;border-color:#1949a3}.paper{width:210mm;min-height:297mm;margin:18px auto;background:white;padding:35mm 25mm 20mm}.form-heading{height:30mm;position:relative;padding-top:1mm}.form-heading h1{font-size:15pt;letter-spacing:3px;margin:0;text-align:center;padding-right:28mm}.approval{position:absolute;right:0;top:1mm;width:37mm;border-collapse:collapse;font-size:9pt;text-align:center}.approval td{border:.25mm solid #000;width:50%;height:5mm}.approval tr:last-child td{height:15mm}.applicant{position:absolute;bottom:0;width:100%;text-align:right;padding-right:43mm;font-size:11pt;margin:0 0 1mm;white-space:pre-wrap}.form-table{border-collapse:collapse;table-layout:fixed;width:160mm;font-size:10pt}.form-table td,.form-table th{border:.25mm solid #000;padding:1mm;text-align:center;font-weight:normal;overflow-wrap:anywhere}.date-row{height:12mm}.date-row th{font-weight:bold}.date-row td{text-align:left;padding-left:4mm}.group-row{height:9.5mm}.subhead{height:9mm;font-size:9pt}.period-row{height:12.5mm;font-size:9pt}.period-row:first-of-type{height:13.5mm}.diagonal{position:relative;font-size:9pt}.diagonal svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.diagonal .top{position:absolute;right:2mm;top:2mm}.diagonal .bottom{position:absolute;left:1mm;bottom:1mm}.notes-title{height:11.5mm}.notes{height:43.5mm;vertical-align:top;white-space:pre-wrap;text-align:left!important;padding:4mm!important} @page{size:A4;margin:0}@media print{body{background:white}.actions{display:none}.paper{margin:0;min-height:0;height:297mm;box-shadow:none}.form-table{break-inside:avoid}}@media screen and (max-width:800px){.paper{margin:8px 0}.actions{flex-wrap:wrap}}
 </style></head><body><div class="actions"><button onclick="window.print()">인쇄 / PDF 저장</button></div><main class="paper"><header class="form-heading"><h1>결 · 보 강 신청서</h1><table class="approval"><tr><td>담당부원</td><td>교무부장</td></tr><tr><td></td><td></td></tr></table><p class="applicant">${esc(applicant)}</p></header><table class="form-table"><colgroup>${[13.35,12.33,17.41,17.41,39.73,25.64,11.49,21.6].map(w=>`<col style="width:${w}mm">`).join('')}</colgroup><tr class="date-row"><th colspan="2">결강일자</th><td colspan="6">${esc(dateLabel(data.absenceDate,true))}</td></tr><tr class="date-row"><th colspan="2">결강구분<br>(○표시)</th><td colspan="6">${esc(data.reason)}</td></tr><tr class="group-row"><th rowspan="2" class="diagonal"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="100" stroke="black" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><span class="top">내<br>용</span><span class="bottom">교<br>시</span></th><th colspan="2">결강 사항</th><th colspan="2">교체 사항</th><th colspan="3">보강 사항</th></tr><tr class="subhead"><th>학반</th><th>과목</th><th>과 목</th><th>교체교사명</th><th>월 일(요일)</th><th>교시</th><th>비고</th></tr>${rows}<tr><td colspan="8" class="notes-title">결 · 보강 내용</td></tr><tr><td colspan="8" class="notes">${esc(data.note)}</td></tr></table></main></body></html>`;
}
$('applicationTeacher').onchange=renderApplicationRows;

$('applicationOpen').onclick=()=>openApplication();$('applicationClose').onclick=()=>$('applicationDialog').close();
$('applicationForm').onsubmit=e=>{
 e.preventDefault();$('applicationError').textContent='';let data;
 try{data=collectApplication();}catch(err){$('applicationError').textContent=err.message;return;}
 const preview=window.open('about:blank','_blank');if(!preview){$('applicationError').textContent='신청서를 열 수 있도록 브라우저의 팝업 차단을 해제하세요.';return;}
 preview.document.write('<p>결보강신청서를 작성하고 있습니다…</p>');
 try{
  preview.document.open();preview.document.write(applicationPreview(data));preview.document.close();
  const next=savedSwaps.map(pair=>{const row=data.rows.find(r=>r.pairId===pair.id);return row?{...pair,applications:{...pair.applications,[data.teacher]:{absenceDate:data.absenceDate,makeupDate:row.makeupDate,reason:data.reason,note:data.note}}}:pair;});
  if(!persistSwaps(next))$('applicationError').textContent='신청서는 작성했지만 입력 날짜를 브라우저에 저장하지 못했습니다.';
 }catch(err){preview.close();$('applicationError').textContent=err.message||'신청서를 만들지 못했습니다.';}
};
