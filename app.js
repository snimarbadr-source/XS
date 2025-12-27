(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const imageInput = $('imageInput');
  const pasteZone = $('pasteZone');
  const previewCanvas = $('previewCanvas');
  const progressText = $('progressText');
  const bar = $('bar');

  const textInput = $('textInput'); 
  const importTextBtn = $('importTextBtn');
  const copyImportBtn = $('copyImportBtn');

  const receiverName = $('receiverName');
  const receiverCode = $('receiverCode');
  const deputyName = $('deputyName');
  const deputyCode = $('deputyCode');

  const addRowBtn = $('addRowBtn');
  const rowsBody = $('rowsBody');
  const clearImageBtn = $('clearImageBtn');
  const clearAllBtn = $('clearAllBtn');

  const finalOut = $('finalOut');
  const copyFinalBtn = $('copyFinalBtn');

  const modal = $('modal');
  const closeModalBtn = $('closeModalBtn');
  const saveRowBtn = $('saveRowBtn');
  const mName = $('mName');
  const mCode = $('mCode');
  const mLoc = $('mLoc');
  const mState = $('mState');

  const LOCS = ['لوس','ساندي','بوليتو'];
  // تم التثبيت: من "خارج الميدان" إلى "خارج الخدمة"
  const STATES = ['في الميدان','مشغول - اختبار','مشغول - تدريب','خارج الخدمة'];

  let rows = []; // {id,name,code,loc,state}
  let editId = null;
  let lastImageFile = null; // للاحتفاظ بالملف بعد اللصق/الرفع

  function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(2,6); }

  function setProgress(p){
    const v = Math.max(0, Math.min(100, Math.round(p)));
    progressText.textContent = v + '%';
    bar.style.setProperty('--w', v + '%');
  }
  
  // ===================================
  // وظائف OCR الجديدة والمحسنة (من كودك)
  // ===================================

  // تحميل مكتبة Tesseract من CDN
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      // تجنب التحميل المكرر
      if ([...document.scripts].some(s => s.src === src)) return resolve(); 
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  
  // قراءة ملف صورة إلى Image
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  // تنظيف نص OCR
  function normalizeOCRText(txt) {
    return (txt || "")
      .replace(/[#!@\$%\^&\*\(\)_+=\[\]{};:'"\\|<>\/?]/g, " ") 
      .replace(/[•·●]/g, " ")                                
      .replace(/\u200e|\u200f|\u202a|\u202b|\u202c|\u202d|\u202e/g, "") 
      .replace(/\s+/g, " ")
      .trim();
  }
  
  // استخراج الكود من سطر: (DS|DA|AD|D|N|C|T|V|A) + رقم أو رقم مكون من 2-4 خانات
  function bestCodeFromString(text) {
    const s = (text || "").toUpperCase().replace(/\s+/g, " ").trim();

    // البحث عن الأكواد القياسية (DA2, N8) أو رقم من 2-4 خانات (115, 311)
    const m = s.match(/\b((DS|DA|AD|D|N|C|T|V|A)\s*-?\s*(\d{1,3})|\d{2,4})\b/);
    
    // نأخذ المطابقة الأولى ونزيل المسافات والشرطات
    const codeMatch = m ? m[0] : '';
    if (codeMatch) return codeMatch.replace(/\s+/g, "").replace('-', '');

    return "";
  }
  
  // تنظيف الكود النهائي
  function sanitizeCode(s) {
    const t = (s || "").toUpperCase().replace(/\s+/g, "");
    const c = bestCodeFromString(t);
    // نغطي الأكواد الرقمية فقط 2-4 خانات
    const digitMatch = t.match(/\d{2,4}/); 
    return c || (digitMatch ? digitMatch[0] : '');
  }

  // تنظيف الاسم (عربي فقط)
  function sanitizeArabicName(s) {
    let t = (s || "")
      .replace(/[0-9]/g, " ")
      .replace(/[•·●]/g, " ")
      .replace(/[~`!@#$%^&*()_+=\[\]{};:'"\\|<>\/?،,.؟…]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // أبقي فقط العربي والمسافات
    const only = t.replace(/[^\u0600-\u06FF\s]/g, " ").replace(/\s+/g, " ").trim();
    return only || t;
  }

  // تحويل نص OCR إلى قائمة {id, name, code, loc, state} 
  function parsePairs(text) {
    const out = [];
    const lines = (text || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);

    for (let ln of lines) {
      ln = normalizeOCRText(ln);

      // إذا كان السطر يحتوي "|"
      const parts = ln.split("|").map(x => x.trim()).filter(Boolean);

      let name = "";
      let code = "";

      if (parts.length >= 2) {
        code = sanitizeCode(parts[1]);
        name = sanitizeArabicName(parts[0]);
      } else {
        code = bestCodeFromString(ln) || sanitizeCode(ln);
        
        if (!code) continue;

        // الاسم = السطر بدون الكود
        name = sanitizeArabicName(ln.replace(new RegExp(code, "i"), " "));
      }

      // إزالة الكود من الاسم في حال التلاصق
      if (name.toUpperCase().includes(code.toUpperCase())) {
        name = sanitizeArabicName(name.replace(new RegExp(code, "i"), " "));
      }
      
      if (!name || !code || name === code) continue; 
      
      out.push({ id: uid(), name, code, loc: 'لوس', state: 'في الميدان' }); // إضافة الحقول الافتراضية
    }
    return out;
  }
  
  // ===================================
  // وظائف التطبيق الرئيسية
  // ===================================
  
  function upsertRow(r){
    const code = sanitizeCode(r.code);
    const name = sanitizeArabicName(r.name);
    if (!code || !name) return;
    const idx = rows.findIndex(x => sanitizeCode(x.code) === sanitizeCode(code));
    const item = { id: r.id || uid(), name, code, loc: LOCS.includes(r.loc)? r.loc:'لوس', state: STATES.includes(r.state)? r.state:'في الميدان' };
    if (idx>=0) rows[idx] = { ...rows[idx], ...item };
    else rows.push(item);
  }

  function removeRow(id){
    rows = rows.filter(r=>r.id !== id);
  }

  function openModal(mode, row){
    modal.classList.remove('hidden');
    editId = row?.id || null;
    mName.value = row?.name || '';
    mCode.value = row?.code || '';
    mLoc.value = row?.loc || 'لوس';
    mState.value = row?.state || 'في الميدان';
    mName.focus();
  }
  function closeModal(){
    modal.classList.add('hidden');
    editId = null;
  }

  function statePill(state){
    const s = state || 'في الميدان';
    let cls = 'field';
    if (s === 'مشغول - اختبار') cls = 'busy1';
    else if (s === 'مشغول - تدريب') cls = 'busy2';
    // تثبيت اسم الحالة
    else if (s === 'خارج الخدمة') cls = 'out';
    return `<span class="pill ${cls}">${s}</span>`;
  }

  function renderRows(){
    rowsBody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.code)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>
          <select data-act="loc" data-id="${r.id}" class="in" style="padding:8px 10px">
            ${LOCS.map(l => `<option value="${l}" ${l===r.loc?'selected':''}>${l}</option>`).join('')}
          </select>
        </td>
        <td>
          <select data-act="state" data-id="${r.id}" class="in" style="padding:8px 10px">
            ${STATES.map(s => `<option value="${s}" ${s===r.state?'selected':''}>${s}</option>`).join('')}
          </select>
          <div style="margin-top:6px">${statePill(r.state)}</div>
        </td>
        <td style="white-space:nowrap">
          <button class="smallBtn" data-act="edit" data-id="${r.id}">تعديل</button>
          <button class="smallBtn danger" data-act="del" data-id="${r.id}">حذف</button>
        </td>
      </tr>
    `).join('');
    updateFinal();
  }

  function updateFinal(){
    const recN = sanitizeArabicName(receiverName.value);
    const recC = sanitizeCode(receiverCode.value);
    const depN = sanitizeArabicName(deputyName.value);
    const depC = sanitizeCode(deputyCode.value);

    // الإقصاء يكون لـ "خارج الخدمة"
    const active = rows.filter(r => r.state !== 'خارج الخدمة');
    const count = active.length;

    const byLoc = {
      'لوس': rows.filter(r=>r.loc==='لوس' && r.state!=='خارج الخدمة'),
      'ساندي': rows.filter(r=>r.loc==='ساندي' && r.state!=='خارج الخدمة'),
      'بوليتو': rows.filter(r=>r.loc==='بوليتو' && r.state!=='خارج الخدمة'),
    };
    // وحدات خارج الخدمة
    const outOfService = rows.filter(r=>r.state==='خارج الخدمة');

    const lines = [];
    lines.push('📌 استلام العمليات 📌\n');
    lines.push(`المستلم : ${recN || ''}${recC ? ' | ' + recC : ''}\n`);
    lines.push(`النائب : ${depN || ''}${depC ? ' | ' + depC : ''}\n`);
    lines.push(`عدد و اسماء الوحدات الاسعافيه في الميدان :{${count}}\n`);

    lines.push('🏥 مستشفى لوس');
    byLoc['لوس'].forEach(r => lines.push(`${r.name} | ${r.code}${(r.state && r.state.startsWith('مشغول')) ? ` ( ${r.state} )` : ''}`));
    lines.push('');
    lines.push('🏥 مستشفى ساندي');
    byLoc['ساندي'].forEach(r => lines.push(`${r.name} | ${r.code}${(r.state && r.state.startsWith('مشغول')) ? ` ( ${r.state} )` : ''}`));
    lines.push('');
    lines.push('🏥 مستشفى بوليتو');
    byLoc['بوليتو'].forEach(r => lines.push(`${r.name} | ${r.code}${(r.state && r.state.startsWith('مشغول')) ? ` ( ${r.state} )` : ''}`));
    lines.push('');
    // إظهار تفاصيل "خارج الخدمة"
    lines.push(`خارج الخدمة : (${outOfService.length})`);
    outOfService.forEach(r => lines.push(`${r.name} | ${r.code}`));
    lines.push('\n🎙️ تم استلام العمليات و جاهزون للتعامل مع البلاغات\n');
    lines.push('الملاحظات : تحديث');
    finalOut.textContent = lines.join('\n');
  }

  function escapeHtml(str){
    return (str||'').toString()
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  async function copyText(text){
    try{
      await navigator.clipboard.writeText(text);
      toast('تم النسخ');
    }catch{
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('تم النسخ');
    }
  }

  function toast(msg){
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:12px;bottom:12px;background:rgba(0,0,0,.75);color:#fff;padding:10px 12px;border-radius:12px;z-index:99;font-weight:800';
    document.body.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 1200);
  }
  
  function drawPreviewFromImage(img){
    const ctx = previewCanvas.getContext('2d');
    const maxW = previewCanvas.clientWidth || 600;
    const scale = Math.min(1, maxW / img.width);
    previewCanvas.width = Math.floor(img.width * scale);
    previewCanvas.height = Math.floor(img.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    ctx.drawImage(img,0,0,previewCanvas.width,previewCanvas.height);
  }

  function clearPreview(){
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0,0,previewCanvas.width,previewCanvas.height);
    setProgress(0);
    lastImageFile = null;
  }

  // Tesseract Worker management
  let workerPromise = null;

  async function ensureWorker(){
    if (workerPromise) return workerPromise;
    workerPromise = (async ()=>{
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      const { createWorker } = window.Tesseract || {};
      if (!createWorker) throw new Error('Tesseract not loaded');
      const w = await createWorker({ 
          logger: m => {
             if (m.status === "recognizing text") {
                setProgress((m.progress || 0) * 100);
             }
          }
      });
      // عربي + إنجليزي (مهم عشان الكود بالحروف)
      await w.loadLanguage("ara+eng");
      await w.initialize("ara+eng");

      // إعدادات تساعد في قراءة القوائم
      await w.setParameters({
          tessedit_pageseg_mode: "6", // assume block of text
          preserve_interword_spaces: "1"
      });
      return w;
    })();
    return workerPromise;
  }

  // الـ OCR الرئيسي
  async function runOCRFromFile(file){
    setProgress(0);
    lastImageFile = file; // حفظ الملف

    try{
      const img = await fileToImage(file);
      drawPreviewFromImage(img); // **الخطوة المفقودة سابقاً**

      const w = await ensureWorker();
      
      const { data } = await w.recognize(img);
      const rawText = data?.text || "";
      const cleaned = normalizeOCRText(rawText); 

      const pairs = parsePairs(cleaned);

      if (!pairs.length){
        alert('لم يتم استخراج أسماء/أكواد بشكل كافٍ. جرّب صورة أوضح/أقرب للقائمة أو استخدم الاستيراد بالنص.');
        setProgress(0);
        textInput.value = cleaned;
        return;
      }
      
      textInput.value = pairs.map(p => `${p.name} | ${p.code}`).join('\n');

      // **الخطوة الحاسمة: توزيع البيانات على النموذج الداخلي**
      pairs.forEach(upsertRow);
      renderRows();
      
      setProgress(100);

    }catch(e){
      console.error(e);
      alert('صار خطأ أثناء الاستخراج. تأكد من الإنترنت (CDN) أو جرّب مرة ثانية.');
      setProgress(0);
    }
  }


  // Events
  imageInput.addEventListener('change', (e)=>{
    const file = e.target.files?.[0];
    if (file) runOCRFromFile(file);
    imageInput.value = '';
  });

  pasteZone.addEventListener('click', ()=> pasteZone.focus());

  // Paste image via CTRL+V
  document.addEventListener('paste', (e)=>{
    const items = e.clipboardData?.items || [];
    for (const it of items){
      if (it.type && it.type.startsWith('image/')){
        const file = it.getAsFile();
        if (file){
          // نحفظ الملف مؤقتاً لتشغيل OCR عليه
          lastImageFile = file; 
          runOCRFromFile(file);
          e.preventDefault();
          return;
        }
      }
    }
  });

  importTextBtn.addEventListener('click', ()=>{
    const items = parsePairs(textInput.value);
    if (!items.length){ alert('الصق نص صحيح أولاً.'); return; }
    items.forEach(upsertRow);
    renderRows();
  });

  copyImportBtn.addEventListener('click', ()=> copyText(textInput.value || ''));

  addRowBtn.addEventListener('click', ()=> openModal('add', null));

  closeModalBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=>{ if (e.target === modal) closeModal(); });

  saveRowBtn.addEventListener('click', ()=>{
    const name = sanitizeArabicName(mName.value);
    const code = sanitizeCode(mCode.value);
    if (!name || !code){ alert('الاسم والكود مطلوبين'); return; }
    const item = { id: editId || uid(), name, code, loc: mLoc.value, state: mState.value };
    upsertRow(item);
    renderRows();
    closeModal();
  });

  rowsBody.addEventListener('click', (e)=>{
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const row = rows.find(r=>r.id===id);
    if (act==='edit' && row) openModal('edit', row);
    if (act==='del'){ removeRow(id); renderRows(); }
  });

  rowsBody.addEventListener('change', (e)=>{
    const el = e.target;
    const act = el.dataset.act;
    const id = el.dataset.id;
    const row = rows.find(r=>r.id===id);
    if (!row) return;
    if (act==='loc') row.loc = LOCS.includes(el.value)? el.value : 'لوس';
    // تثبيت الحالة هنا
    if (act==='state') row.state = STATES.includes(el.value)? el.value : 'في الميدان';
    renderRows();
  });

  [receiverName, receiverCode, deputyName, deputyCode].forEach(inp=>{
    inp.addEventListener('input', updateFinal);
  });

  copyFinalBtn.addEventListener('click', ()=> copyText(finalOut.textContent || ''));

  clearImageBtn.addEventListener('click', clearPreview);

  clearAllBtn.addEventListener('click', ()=>{
    rows = [];
    renderRows();
    textInput.value = '';
    receiverName.value = '';
    receiverCode.value = '';
    deputyName.value = '';
    deputyCode.value = '';
    clearPreview();
  });

  // Initial render
  renderRows();
})();
