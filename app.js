// ══════════════════════════════════════════════════════════
//  🤖 AI ASSISTANT MODULE
// ══════════════════════════════════════════════════════════
const AIAssistant = {
  _open: false,

  toggle() {
    this._open = !this._open;
    const panel = document.getElementById('ai-chat-panel');
    panel.classList.toggle('open', this._open);
    if (this._open) document.getElementById('ai-input').focus();
  },

  /** Adds a message bubble to the chat */
  _addMsg(text, role = 'bot') {
    const container = document.getElementById('ai-msgs');
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.innerHTML = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  },

  /** Shows animated typing indicator */
  _showTyping() {
    const container = document.getElementById('ai-msgs');
    const div = document.createElement('div');
    div.className = 'ai-typing'; div.id = 'ai-typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  },

  async sendMsg(text) {
    const input = document.getElementById('ai-input');
    const msg = (text || input.value).trim();
    if (!msg) return;
    input.value = '';
    this._addMsg(msg, 'user');
    const typing = this._showTyping();
    await new Promise(r => setTimeout(r, 600));
    typing.remove();
    await this._processCommand(msg);
  },

  /** Core NLP command processor */
  async _processCommand(msg) {
    const m = msg.trim();

    // ─── COMMAND: Mark absent ────────────────────────────
    // Pattern: سجّل غياب / سجل غياب [اسم التلميذ]
    const absentMatch = m.match(/سج[لّ]\s*غياب\s+(.+)/);
    if (absentMatch) {
      const namePart = absentMatch[1].trim();
      const pupils = PupilMgr.getPupilNames();
      const found = pupils.find(p => p.includes(namePart) || namePart.includes(p.split(' ')[0]));
      if (found) {
        const allAtt = await DB.get('attendance');
        if (!allAtt[State.today]) allAtt[State.today] = {};
        allAtt[State.today][found] = { status: 'absent', reason: '', note: 'مسجّل عبر المساعد الذكي' };
        await DB.set('attendance', allAtt);
        if (State.tab === 'attendance') await UI.renderAttendance();
        if (State.tab === 'dashboard') await UI.renderDashboard();
        this._addMsg(`✅ تم تسجيل <strong>${found}</strong> غائباً بتاريخ اليوم ${State.today}.`);
      } else {
        this._addMsg(`⚠️ لم أجد تلميذاً باسم "<em>${namePart}</em>". تأكد من كتابة الاسم بشكل صحيح.`);
      }
      return;
    }

    // ─── COMMAND: Struggling readers ─────────────────────
    if (m.includes('متعثر') || m.includes('قرائياً') || m.includes('طلاقة')) {
      const pupils = PupilMgr.getPupilNames();
      const results = [];
      for (const p of pupils) {
        let total = 0, count = 0;
        for (let w = 1; w <= 5; w++) {
          const fd = await DB.getFluency('4', w);
          if (fd[p]) {
            if (fd[p].accuracy === 'yes') total += 5;
            if (fd[p].flow === 'yes') total += 5;
            count++;
          }
        }
        const avg = count > 0 ? total / count : 0;
        if (avg < 5) results.push({ name: p, avg });
      }
      if (results.length === 0) {
        this._addMsg('✅ لا يوجد متعثرون قرائياً حالياً. جميع المتعلمين في مستوى جيد!');
      } else {
        results.sort((a, b) => a.avg - b.avg);
        this._addMsg(`⚠️ <strong>المتعثرون قرائياً (${results.length} تلميذ):</strong><br>${results.map(r => `• ${r.name} — معدل طلاقة: <strong>${r.avg.toFixed(1)}/10</strong>`).join('<br>')}`);
      }
      return;
    }

    // ─── COMMAND: Top performers ─────────────────────────
    if (m.includes('أعلى') || m.includes('متفوق') || m.includes('أداء')) {
      const pupils = PupilMgr.getPupilNames();
      const perfs = [];
      for (const p of pupils) {
        const r = await Engine.calculatePI(p, State.level);
        perfs.push({ name: p, pi: r.pi });
      }
      perfs.sort((a, b) => b.pi - a.pi);
      const top5 = perfs.slice(0, 5);
      this._addMsg(`🏆 <strong>أعلى 5 متعلمين أداءً:</strong><br>${top5.map((r, i) => `${['🥇','🥈','🥉','4️⃣','5️⃣'][i]} ${r.name} — PI: <strong>${r.pi.toFixed(1)}</strong>`).join('<br>')}`);
      return;
    }

    // ─── COMMAND: Today stats ─────────────────────────────
    if (m.includes('اليوم') || m.includes('إحصاء') || m.includes('إحصائية')) {
      const pupils = PupilMgr.getPupilNames();
      const allAtt = await DB.get('attendance');
      const todayAtt = allAtt[State.today] || {};
      let absent = 0, late = 0;
      pupils.forEach(p => {
        const v = todayAtt[p]; const st = typeof v === 'object' ? v?.status : v;
        if (st === 'absent') absent++;
        else if (st === 'late') late++;
      });
      this._addMsg(`📊 <strong>إحصائيات ${State.today}:</strong><br>👥 إجمالي: <strong>${pupils.length}</strong><br>✅ حاضرون: <strong>${pupils.length - absent - late}</strong><br>❌ غائبون: <strong>${absent}</strong><br>⏰ متأخرون: <strong>${late}</strong>`);
      return;
    }

    // ─── COMMAND: Who is absent today ────────────────────
    if (m.includes('غائب')) {
      const allAtt = await DB.get('attendance');
      const todayAtt = allAtt[State.today] || {};
      const absentList = PupilMgr.getPupilNames().filter(p => {
        const v = todayAtt[p]; const st = typeof v === 'object' ? v?.status : v;
        return st === 'absent';
      });
      if (absentList.length === 0) {
        this._addMsg('✅ لا يوجد غائبون اليوم — جميع المتعلمين حاضرون!');
      } else {
        this._addMsg(`❌ <strong>الغائبون اليوم (${absentList.length}):</strong><br>${absentList.map(n => `• ${n}`).join('<br>')}`);
      }
      return;
    }

    // ─── DEFAULT ─────────────────────────────────────────
    this._addMsg(`🤔 لم أفهم الأمر. يمكنني مساعدتك في:<br>• <em>سجّل غياب [اسم التلميذ]</em><br>• <em>من هم المتعثرون قرائياً؟</em><br>• <em>أعلى المتعلمين أداءً</em><br>• <em>إحصائيات اليوم</em><br>• <em>من غائب اليوم؟</em>`);
  }
};

// ══════════════════════════════════════════════════════════
//  🏅 GAMIFICATION BADGES MODULE
// ══════════════════════════════════════════════════════════
const BadgeMgr = {
  /** All defined badges with their check logic */
  BADGES: [
    {
      id: 'attendance_star',
      icon: '⭐',
      name: 'نجم المواظبة',
      desc: 'شهر كامل دون غياب',
      color: '#f59e0b',
      /** Returns true if student had zero absences in any calendar month */
      async check(name) {
        const allAtt = await DB.get('attendance');
        // Group by year-month
        const months = {};
        Object.keys(allAtt).forEach(dateStr => {
          const ym = dateStr.substring(0, 7); // YYYY-MM
          if (!months[ym]) months[ym] = { absent: 0, days: 0 };
          months[ym].days++;
          const v = allAtt[dateStr]?.[name];
          const st = typeof v === 'object' ? v?.status : v;
          if (st === 'absent') months[ym].absent++;
        });
        return Object.values(months).some(m => m.days >= 15 && m.absent === 0);
      }
    },
    {
      id: 'avid_reader',
      icon: '📚',
      name: 'قارئ نهم',
      desc: 'قرأ ولخّص 5 كتب',
      color: '#3b82f6',
      /** Returns true if student has 5+ library loans with summarized=yes */
      async check(name) {
        const lib = await DB.get('library');
        const summarized = lib.filter(l => l.student === name && l.summarized === 'yes');
        return summarized.length >= 5;
      }
    },
    {
      id: 'homework_hero',
      icon: '✏️',
      name: 'بطل الواجبات',
      desc: '30 واجباً منجزاً',
      color: '#10b981',
      async check(name) {
        const allHW = await DB.get('homework');
        let done = 0;
        Object.values(allHW).forEach(dayHW => { if (dayHW[name] === 'done') done++; });
        return done >= 30;
      }
    },
    {
      id: 'fluency_master',
      icon: '🗣️',
      name: 'متقن القراءة',
      desc: 'طلاقة قرائية ممتازة',
      color: '#8b5cf6',
      async check(name) {
        let total = 0, count = 0;
        for (let w = 1; w <= 5; w++) {
          const fd = await DB.getFluency('4', w);
          if (fd[name]) {
            if (fd[name].accuracy === 'yes') total += 5;
            if (fd[name].flow === 'yes') total += 5;
            count++;
          }
        }
        return count > 0 && (total / count) >= 8;
      }
    }
  ],

  /** Evaluates all badges for a student and returns earned list */
  async evaluate(name) {
    const earned = [];
    for (const badge of this.BADGES) {
      try {
        if (await badge.check(name)) earned.push(badge.id);
      } catch(e) { console.warn('Badge check error:', badge.id, e); }
    }
    return earned;
  },

  /** Renders the badge display in the student profile sidebar */
  async render(name) {
    const container = document.getElementById('pro-badges-row');
    if (!container) return;
    container.innerHTML = '<div style="font-size:11px;color:var(--text-3)">⏳ جارٍ التحقق...</div>';
    const earned = await this.evaluate(name);
    if (this.BADGES.length === 0) { container.innerHTML = '<div style="font-size:11px;color:var(--text-3)">لا توجد أوسمة</div>'; return; }
    container.innerHTML = this.BADGES.map(b => {
      const isEarned = earned.includes(b.id);
      return `<div class="award-badge ${isEarned ? '' : 'locked'}" title="${b.desc}" style="${isEarned ? `border-color:${b.color}40;background:linear-gradient(135deg,${b.color}15,${b.color}08)` : ''}">
        <span class="badge-icon">${b.icon}</span>
        <span class="badge-name" style="${isEarned ? `color:${b.color}` : ''}">${b.name}</span>
      </div>`;
    }).join('');
    // Notify for newly earned badges
    if (earned.length > 0) {
      const key = `badges_${State.level}_${State.year}_${name}`;
      const prev = await Store.get(key, []);
      const newOnes = earned.filter(id => !prev.includes(id));
      if (newOnes.length > 0) {
        await Store.set(key, earned);
        newOnes.forEach(id => {
          const b = this.BADGES.find(x => x.id === id);
          if (b) UI.toast(`🏅 وسام جديد لـ ${name}: ${b.icon} ${b.name}!`, 'success');
        });
      }
    }
  }
};

// ══════════════════════════════════════════════════════════
//  📅 STUDENT TIMELINE MODULE
// ══════════════════════════════════════════════════════════
const TimelineMgr = {
  /** Collects all events for a student from all data sources and renders chronological timeline */
  async render(name) {
    const container = document.getElementById('pro-timeline');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3)">⏳ جارٍ تجميع الأحداث...</div>';

    const events = [];

    // ─── Absence events ──────────────────────────────────
    const allAtt = await DB.get('attendance');
    Object.keys(allAtt).forEach(dateStr => {
      const v = allAtt[dateStr]?.[name];
      const st = typeof v === 'object' ? v?.status : v;
      if (st === 'absent') {
        events.push({ date: dateStr, icon: '❌', desc: 'تسجيل غياب', color: '#ef4444', type: 'absence' });
      } else if (st === 'late') {
        events.push({ date: dateStr, icon: '⏰', desc: 'تأخر عن الدراسة', color: '#f59e0b', type: 'late' });
      }
    });

    // ─── Grade events ─────────────────────────────────────
    const allGrades = await DB.get('grades');
    const subjNames = { arabic: 'العربية', islamic: 'الإسلامية', social: 'الاجتماعيات', art: 'الفنية', pe: 'البدنية' };
    for (const [subj, subjLabel] of Object.entries(subjNames)) {
      const grades = (allGrades[subj] || {})[name] || {};
      ['t1', 't2', 't3', 't4'].forEach((k, i) => {
        if (grades[k] !== undefined && grades[k] !== '' && !isNaN(grades[k])) {
          const val = parseFloat(grades[k]);
          events.push({
            date: State.today, // use current date as approximate
            icon: val >= 7 ? '🌟' : val >= 5 ? '📊' : '⚠️',
            desc: `نقطة ${subjLabel} - الفرض ${i + 1}: ${val.toFixed(1)}/10`,
            color: val >= 7 ? '#10b981' : val >= 5 ? '#f59e0b' : '#ef4444',
            type: 'grade',
            sort: `grade_${subj}_${k}`
          });
        }
      });
    }

    // ─── Library loans events ─────────────────────────────
    const lib = await DB.get('library');
    lib.filter(l => l.student === name).forEach(l => {
      events.push({
        date: l.date || State.today,
        icon: '📚',
        desc: `إعارة كتاب: "${l.book}"${l.summarized === 'yes' ? ' — ✅ لخّصه' : l.summarized === 'no' ? ' — ❌ لم يلخصه' : ''}`,
        color: '#3b82f6',
        type: 'library'
      });
    });

    // ─── Notes events ─────────────────────────────────────
    const notes = (await DB.get('notes')).filter(n => n.student === name);
    notes.forEach(n => {
      const typeMap = { behavior: { icon: '⚠️', color: '#ef4444' }, academic: { icon: '📋', color: '#3b82f6' }, positive: { icon: '🌟', color: '#10b981' } };
      const tm = typeMap[n.type] || { icon: '📝', color: '#6366f1' };
      events.push({ date: n.date || State.today, icon: tm.icon, desc: `ملاحظة: ${n.text.substring(0, 60)}${n.text.length > 60 ? '...' : ''}`, color: tm.color, type: 'note' });
    });

    // ─── Fluency events ───────────────────────────────────
    for (let w = 1; w <= 5; w++) {
      const fd = await DB.getFluency('4', w);
      if (fd[name] && (fd[name].accuracy || fd[name].flow)) {
        const score = (fd[name].accuracy === 'yes' ? 5 : 0) + (fd[name].flow === 'yes' ? 5 : 0);
        events.push({
          date: State.today,
          icon: '📖',
          desc: `قياس الطلاقة - الأسبوع ${w}: ${score}/10 ${fd[name].tarl ? `(TaRL: ${fd[name].tarl})` : ''}`,
          color: score >= 8 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444',
          type: 'fluency',
          sort: `fluency_w${w}`
        });
      }
    }

    // ─── Remediation events ───────────────────────────────
    const rems = (await DB.get('remediation')).filter(r => r.student === name);
    rems.forEach(r => {
      events.push({
        date: r.date || State.today,
        icon: '🛠️',
        desc: `خطة دعم: ${r.type} — ${r.status === 'resolved' ? '✅ تجاوز' : r.status === 'improving' ? '🟡 يتحسن' : '🔴 نشطة'}`,
        color: '#8b5cf6', type: 'support'
      });
    });

    if (events.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>لا توجد أحداث مسجلة لهذا المتعلم بعد.</p></div>';
      return;
    }

    // Sort by date desc (most recent first)
    events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    container.innerHTML = events.map(ev => `
      <div class="tl-item">
        <div class="tl-dot" style="background:${ev.color}20;box-shadow:0 0 0 2px ${ev.color}60">${ev.icon}</div>
        <div class="tl-card" style="border-right-color:${ev.color};border-right-width:3px">
          <div class="tl-date">${ev.date || '—'}</div>
          <div class="tl-desc">${ev.desc}</div>
        </div>
      </div>`).join('');
  }
};

'use strict';

const SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbw892PPXMWhARemR4MDsI_IiS8D-AdQjppLvGyQGj8CnlOQFbfJ_tEUVdwCshIU_hzdLg/exec';

// ══════════════════════════════════════════════════════════
//  STORAGE MODULE — IndexedDB via LocalForage + Cloud Sync
// ══════════════════════════════════════════════════════════

if (typeof localforage === 'undefined') {
  window.localforage = {
    createInstance() {
      return {
        async getItem(k){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
        async setItem(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); return v; } catch(e){ throw e; } },
        async removeItem(k){ localStorage.removeItem(k); },
        async keys(){ return Object.keys(localStorage); },
        async clear(){ localStorage.clear(); }
      };
    }
  };
}

async function safeInitApp() {
  try {
    await initApp();
    return true;
  } catch (e) {
    console.error('safeInitApp', e);
    const msg = (e && e.message) ? e.message : String(e);
    const box = document.getElementById('loginScreen') || document.body;
    const warn = document.createElement('div');
    warn.style.cssText = 'margin-top:12px;padding:10px 12px;border-radius:10px;background:#7f1d1d;color:#fff;font-size:12px;line-height:1.8';
    warn.textContent = 'وقع خطأ بعد تسجيل الدخول: ' + msg;
    box.appendChild(warn);
    return false;
  }
}

const Store = (() => {
  const db = localforage.createInstance({ name: 'edu_platform_v8', storeName: 'data' });
  return {
    async get(key, defaultVal = null) {
      try { const v = await db.getItem(key); return v !== null ? v : defaultVal; }
      catch { return defaultVal; }
    },
    async set(key, value) {
      try {
        await db.setItem(key, value);
        showSyncStatus();
        SyncMgr.queueSync(key, value);
      } catch(e) { console.error('Store.set', e); }
    },
    async remove(key) { try { await db.removeItem(key); } catch {} },
    async keys() { try { return await db.keys(); } catch { return []; } },
    async exportAll() {
      const keys = await this.keys();
      const data = {};
      for (const k of keys) { data[k] = await this.get(k); }
      return data;
    },
    async importAll(data) { for (const [k, v] of Object.entries(data)) { await this.set(k, v); } },
    async clear() { try { await db.clear(); } catch {} }
  };
})();

function showSyncStatus() {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.style.display = 'block';
  clearTimeout(window._syncTimer);
  window._syncTimer = setTimeout(() => { el.style.display = 'none'; }, 2000);
}

// ══════════════════════════════════════════════════════════
//  SYNC MANAGER — مزامنة حقيقية مع Google Sheets
// ══════════════════════════════════════════════════════════
const SyncMgr = {
  _queue: {},
  _timer: null,
  _online: navigator.onLine,
  _syncing: false,

  init() {
    window.addEventListener('online',  () => { this._online = true;  this._updateIndicator(); this.flushQueue(); });
    window.addEventListener('offline', () => { this._online = false; this._updateIndicator(); });
    this._updateIndicator();
    // تم تعطيل السحب التلقائي مؤقتاً لتفادي تعليق المنصة عند التشغيل
  },

  _updateIndicator() {
    const el = document.getElementById('syncIndicator');
    if (!el) return;
    el.innerHTML = this._online
      ? '🟢 <span>متصل</span>'
      : '🔴 <span>غير متصل</span>';
    el.style.color = this._online ? 'var(--success)' : 'var(--danger)';
  },

  // اختبار الاتصال
  async testConnection() {
    UI.toast('⏳ جارٍ اختبار الاتصال...', 'info');
    try {
      const res = await fetch(`${SHEET_API_URL}?action=test`);
      const json = await res.json();
      if (json.ok) {
        UI.toast('✅ الاتصال بـ Google Sheets يعمل بشكل مثالي!', 'success');
        this._showSyncBadge('✅ متصل بالسحابة', 'success');
      } else {
        UI.toast('⚠️ ' + (json.error || 'خطأ غير معروف'), 'warning');
      }
    } catch(e) {
      UI.toast('❌ فشل الاتصال — تأكد من Deploy settings', 'error');
      console.error(e);
    }
  },

  // إضافة مفتاح لقائمة الانتظار وإرسال بعد 1.5 ثانية (debounce)
  queueSync(key, value) {
    this._queue[key] = value;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flushQueue(), 1500);
  },

  // إرسال كل المفاتيح المنتظرة دفعة واحدة
  async flushQueue() {
    if (!this._online || this._syncing || Object.keys(this._queue).length === 0) return;
    this._syncing = true;
    const batch = { ...this._queue };
    this._queue = {};
    try {
      const res = await fetch(SHEET_API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'setAll', data: batch })
      });
      const json = await res.json();
      if (json.ok) {
        this._showSyncBadge('✅ محفوظ في السحابة', 'success');
      } else {
        this._requeueBatch(batch);
        this._showSyncBadge('⚠️ خطأ في المزامنة', 'warning');
      }
    } catch {
      this._requeueBatch(batch);
      this._showSyncBadge('📴 انتظار الاتصال...', 'warning');
    }
    this._syncing = false;
  },

  _requeueBatch(batch) {
    this._queue = { ...batch, ...this._queue };
  },

  // جلب البيانات من Google Sheets وتحديث المحلية
  async pullFromSheets() {
    if (!this._online) return;
    try {
      this._showSyncBadge('🔄 جارٍ المزامنة...', 'info');
      const res = await fetch(`${SHEET_API_URL}?action=getAll`);
      const json = await res.json();
      if (json.ok && json.data && Object.keys(json.data).length > 0) {
        const db = localforage.createInstance({ name: 'edu_platform_v8', storeName: 'data' });
        const localKeys = await db.keys();
        // نحدّث فقط المفاتيح الموجودة في Sheets ولا تتعارض مع بيانات محلية أحدث
        for (const [k, v] of Object.entries(json.data)) {
          if (!localKeys.includes(k)) {
            await db.setItem(k, v);
          }
        }
        this._showSyncBadge('✅ تمت المزامنة', 'success');
        // إعادة تحميل إذا كانت بيانات جديدة
        await refreshCurrentTab();
      } else {
        this._showSyncBadge('☁️ لا بيانات سحابية بعد', 'info');
      }
    } catch {
      this._showSyncBadge('📴 تعذّر الاتصال بالسحابة', 'warning');
    }
  },

  // نسخ احتياطي كامل يدوي
  async forceFullBackup() {
    if (!this._online) { UI.toast('لا يوجد اتصال بالإنترنت', 'error'); return; }
    UI.toast('⏳ جارٍ رفع النسخة الكاملة...', 'info');
    try {
      const allData = await Store.exportAll();
      const res = await fetch(SHEET_API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'setAll', data: allData })
      });
      const json = await res.json();
      if (json.ok) UI.toast(`✅ تم رفع ${json.count} مفتاح إلى Google Sheets`, 'success');
      else UI.toast('❌ فشل الرفع: ' + (json.error || ''), 'error');
    } catch(e) {
      UI.toast('❌ خطأ في الاتصال', 'error');
      console.error(e);
    }
  },

  // استعادة كاملة من السحابة (تستبدل المحلية)
  async forceFullRestore() {
    if (!this._online) { UI.toast('لا يوجد اتصال بالإنترنت', 'error'); return; }
    if (!confirm('سيتم استبدال جميع البيانات المحلية ببيانات السحابة. هل أنت متأكد؟')) return;
    UI.toast('⏳ جارٍ الاستعادة من السحابة...', 'info');
    try {
      const res = await fetch(`${SHEET_API_URL}?action=getAll`);
      const json = await res.json();
      if (json.ok && json.data) {
        await Store.clear();
        const db = localforage.createInstance({ name: 'edu_platform_v8', storeName: 'data' });
        for (const [k, v] of Object.entries(json.data)) { await db.setItem(k, v); }
        UI.toast(`✅ تمت الاستعادة: ${Object.keys(json.data).length} مفتاح`, 'success');
        setTimeout(() => location.reload(), 1500);
      } else {
        UI.toast('❌ لا توجد بيانات في السحابة', 'error');
      }
    } catch(e) {
      UI.toast('❌ خطأ: ' + e.message, 'error');
    }
  },

  _showSyncBadge(msg, type) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    const colors = { success: 'var(--success)', warning: 'var(--warning)', error: 'var(--danger)', info: 'var(--info)' };
    el.textContent = msg;
    el.style.color = colors[type] || 'var(--success)';
    el.style.display = 'block';
    clearTimeout(window._syncBadgeTimer);
    window._syncBadgeTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
};

// للتوافق مع الكود القديم
const SheetSync = {
  forceBackup: () => SyncMgr.forceFullBackup()
};

// ══════════════════════════════════════════════════════════
//  GLOBAL STATE
// ══════════════════════════════════════════════════════════
let PUPILS = {};
const State = {
  year: '2025-2026', level: '6', tab: 'dashboard',
  charts: {}, wheelList: [], timerInt: null,
  today: new Date().toISOString().split('T')[0],
  currentProfile: '',
  isSp: false, wA: 0
};

// UUID generator
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c=='x'?r:(r&0x3|0x8)).toString(16); }); }

// ══════════════════════════════════════════════════════════
//  AUTH MODULE
// ══════════════════════════════════════════════════════════
const AuthMgr = {
  async login() {
    const pass = document.getElementById('login-pass').value;
    const saved = await Store.get('auth_password', '2322422');
    if (pass === saved) {
      sessionStorage.setItem('auth_ok', '1');
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appLayout').style.display = 'flex';
      await safeInitApp();
    } else {
      UI.toast('كلمة المرور غير صحيحة', 'error');
      document.getElementById('login-pass').value = '';
    }
  },
  logout() { sessionStorage.removeItem('auth_ok'); location.reload(); },
  async changePassword() {
    const np = document.getElementById('new-password').value.trim();
    if (!np || np.length < 3) { UI.toast('كلمة المرور قصيرة جداً', 'error'); return; }
    await Store.set('auth_password', np);
    document.getElementById('new-password').value = '';
    UI.toast('تم تغيير كلمة المرور', 'success');
  }
};

// ══════════════════════════════════════════════════════════
//  DB MODULE
// ══════════════════════════════════════════════════════════
const DB = {
  _k(type) { return `${State.year}_${type}_L${State.level}`; },
  
  async get(type) {
    const def = ['remediation','library','notes','sessions','reports'].includes(type) ? [] : {};
    return await Store.get(this._k(type), def);
  },
  async set(type, data) {
    await Store.set(this._k(type), data);
    Engine.checkAlerts();
  },
  async getFluency(s, w) {
    return await Store.get(`${this._k('flu')}_S${s}_W${w}`, {});
  },
  async setFluency(s, w, data) {
    await Store.set(`${this._k('flu')}_S${s}_W${w}`, data);
  },
  async addNote() {
    const st = getVal('note-student'), ty = getVal('note-type'), tx = getVal('note-text');
    if (!st || !tx.trim()) { UI.toast('يرجى ملء البيانات', 'error'); return; }
    const notes = await this.get('notes');
    notes.unshift({ id: uuid(), student: st, type: ty, text: tx, date: State.today });
    await this.set('notes', notes);
    setVal('note-text', '');
    UI.renderNotes();
    UI.toast('تم الحفظ', 'success');
  },
  async addRemediation() {
    const st = getVal('rem-student'), domain = getVal('rem-domain'), cat = getVal('rem-category');
    const typeFinal = (cat === 'أخرى') ? getVal('rem-other-type') : cat;
    const plan = getVal('rem-plan');
    const days = parseInt(getVal('rem-followup')) || 7;
    if (!st || !typeFinal) { UI.toast('اختر المتعلم والصعوبة', 'error'); return; }
    const rem = await this.get('remediation');
    const next = new Date(); next.setDate(next.getDate() + days);
    rem.push({ id: uuid(), student: st, domain, type: typeFinal, plan, actions: '', date: State.today, status: 'active', followupDays: days, nextFollowup: next.toISOString().split('T')[0] });
    await this.set('remediation', rem);
    setVal('rem-plan', ''); setVal('rem-domain', ''); setVal('rem-category', '');
    const box = document.getElementById('rem-suggestions-box'); if (box) box.style.display = 'none';
    UI.renderRemediation();
    UI.toast('تم التسجيل', 'success');
  },
  async saveRemAction() {
    const idx = parseInt(getVal('er-index')), act = getVal('er-action'), st = getVal('er-status');
    const rem = await this.get('remediation');
    if (rem[idx]) {
      rem[idx].actions = act; rem[idx].status = st;
      if (st !== 'resolved') {
        const days = rem[idx].followupDays || 7;
        const next = new Date(); next.setDate(next.getDate() + days);
        rem[idx].nextFollowup = next.toISOString().split('T')[0];
      }
      await this.set('remediation', rem);
    }
    UI.closeModal('editRemActionModal'); UI.renderRemediation();
  },
  async addLoan() {
    const st = getVal('lib-student'), bk = getVal('lib-book'), dt = getVal('lib-date') || State.today;
    const summarized = getVal('lib-summarized');
    if (!st || !bk.trim()) { UI.toast('اختر المتعلم وأدخل عنوان الكتاب', 'error'); return; }
    const lib = await this.get('library');
    lib.push({ id: uuid(), student: st, book: bk, date: dt, returnDate: null, status: 'pending', summarized });
    await this.set('library', lib);
    setVal('lib-book', ''); setVal('lib-summarized', '');
    UI.renderLibrary();
    UI.toast('تم تسجيل الإعارة', 'success');
  },
  async retLib(i) {
    const lib = await this.get('library');
    lib[i].status = 'returned'; lib[i].returnDate = State.today;
    await this.set('library', lib); UI.renderLibrary(); UI.toast('تم الإرجاع', 'success');
  },
  async delLib(i) {
    if (!confirm('حذف هذا السجل؟')) return;
    const lib = await this.get('library'); lib.splice(i, 1);
    await this.set('library', lib); UI.renderLibrary();
  },
  async toggleLibSummarized(i) {
    const lib = await this.get('library');
    const cur = lib[i].summarized;
    lib[i].summarized = cur === 'yes' ? 'no' : cur === 'no' ? '' : 'yes';
    await this.set('library', lib); UI.renderLibrary();
  },
  async deleteRemediation(i) {
    if (!confirm('حذف هذا التدخل؟')) return;
    const rem = await this.get('remediation'); rem.splice(i, 1);
    await this.set('remediation', rem); UI.renderRemediation();
  },
  async deleteReport(i) {
    if (!confirm('حذف هذا التقرير؟')) return;
    const reports = await this.get('reports'); reports.splice(i, 1);
    await this.set('reports', reports); UI.renderReportEditor();
  },
  async addSession() {    
    const type = getVal('session-type'), date = getVal('session-date') || State.today;
    const title = getVal('session-title'), notes = getVal('session-notes');
    if (!title.trim()) { UI.toast('أدخل عنوان الحصة', 'error'); return; }
    const sessions = await this.get('sessions');
    sessions.unshift({ id: uuid(), type, date, title, notes });
    await this.set('sessions', sessions);
    setVal('session-title', ''); setVal('session-notes', '');
    UI.renderSessions(); UI.toast('تم الحفظ', 'success');
  },
  async delSession(i) {
    const sessions = await this.get('sessions'); sessions.splice(i, 1);
    await this.set('sessions', sessions); UI.renderSessions();
  },
  async saveExamDetails() {
    const subj = getVal('ea-subject'), exam = getVal('ea-exam'), st = getVal('ea-student');
    const qs = [1,2,3,4,5].map(n => parseFloat(getVal('ea-q'+n)) || 0);
    const details = await this.get('exam_details');
    if (!details[subj]) details[subj] = {};
    if (!details[subj][exam]) details[subj][exam] = {};
    details[subj][exam][st] = qs;
    await this.set('exam_details', details);
    const total = qs.reduce((a, b) => a + b, 0);
    const allG = await this.get('grades');
    if (!allG[subj]) allG[subj] = {};
    if (!allG[subj][st]) allG[subj][st] = {};
    allG[subj][st][exam] = total;
    await this.set('grades', allG);
    UI.toast('تم الحفظ', 'success'); UI.loadExamAnalysis();
  }
};

// ══════════════════════════════════════════════════════════
//  PUPIL MANAGER
// ══════════════════════════════════════════════════════════
const PupilMgr = {
  async init() {
    PUPILS = await Store.get('pupils', null);
    if (!PUPILS || !PUPILS['6'] || PUPILS['6'].length === 0) {
      PUPILS = {
        "6": [
          {id:uuid(),name:"ايت المعطي محمد"},{id:uuid(),name:"ايت علي اسالم زينب"},
          {id:uuid(),name:"كاوي هاجر"},{id:uuid(),name:"ايت القاضي عزيزة"},
          {id:uuid(),name:"صميري رضوان"},{id:uuid(),name:"كحيل يوسف"},
          {id:uuid(),name:"اصباحي سامية"},{id:uuid(),name:"علو زكرياء"},
          {id:uuid(),name:"جركوك هشام"}
        ],
        "5": [
          {id:uuid(),name:"ابوزرار زكرياء"},{id:uuid(),name:"البعمراني سلمى"},
          {id:uuid(),name:"الفضيلي سليمان"},{id:uuid(),name:"بنحميدة يونس"},
          {id:uuid(),name:"ادحماد ريان"},{id:uuid(),name:"بنحميدة إلياس"},
          {id:uuid(),name:"بوريك فاطمة الزهراء"},{id:uuid(),name:"بوزكارن مريم"},
          {id:uuid(),name:"باحنيني حميد"},{id:uuid(),name:"بنحميدة إيمان"}
        ],
        "4": [
          {id:uuid(),name:"ايت السياس فاطمة الزهراء"},{id:uuid(),name:"ايت سياس عبد الصمد"},
          {id:uuid(),name:"جركوك فاطمة الزهراء"},{id:uuid(),name:"ادم حداد"},
          {id:uuid(),name:"صمري عائشة"},{id:uuid(),name:"ايت القاضي ريان"},
          {id:uuid(),name:"ايت حبان مريم"},{id:uuid(),name:"ايت علي أسالم فدوى"},
          {id:uuid(),name:"الفيوني زكرياء"},{id:uuid(),name:"اد عثمان عمران"},
          {id:uuid(),name:"الصوصي أنور"},{id:uuid(),name:"الناصري توفيق"}
        ]
      };
      await this.save();
    }
    for (const lvl of Object.keys(PUPILS)) {
      if (PUPILS[lvl].length > 0 && typeof PUPILS[lvl][0] === 'string') {
        PUPILS[lvl] = PUPILS[lvl].map(n => ({ id: uuid(), name: n }));
        await this.save();
      }
    }
  },
  async save() { await Store.set('pupils', PUPILS); },
  getPupils() { return (PUPILS[State.level] || []).map(p => (typeof p === 'string' ? { id: p, name: p } : p)); },
  getPupilNames() { return this.getPupils().map(p => p.name); },
  async addPupil() {
    const name = getVal('new-pupil-name').trim();
    if (!name) return;
    if (!PUPILS[State.level]) PUPILS[State.level] = [];
    if (this.getPupilNames().includes(name)) { UI.toast('هذا الاسم موجود', 'error'); return; }
    PUPILS[State.level].push({ id: uuid(), name });
    await this.save();
    setVal('new-pupil-name', '');
    initDropdowns(); UI.renderSettingsPupils();
    UI.toast('تم الإضافة', 'success');
  },
  async removePupil(id) {
    if (!confirm('حذف هذا المتعلم من القائمة؟')) return;
    PUPILS[State.level] = PUPILS[State.level].filter(p => p.id !== id);
    await this.save();
    initDropdowns(); UI.renderSettingsPupils();
    UI.toast('تم الحذف', 'info');
  },
  async editPupilName(id, currentName) {
    const newName = prompt('تعديل اسم المتعلم:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    const nn = newName.trim();
    if (this.getPupilNames().includes(nn)) { UI.toast('هذا الاسم موجود', 'error'); return; }
    const pupil = PUPILS[State.level].find(p => p.id === id);
    if (pupil) { pupil.name = nn; await this.save(); initDropdowns(); UI.renderSettingsPupils(); UI.toast('تم التعديل', 'success'); }
  },
  async editPupilLevel(id, currentName) {
    const lvl = prompt('انقل المتعلم إلى مستوى (4/5/6):', State.level);
    if (!lvl || lvl === State.level || !['4','5','6'].includes(lvl)) return;
    if (!PUPILS[lvl]) PUPILS[lvl] = [];
    const idx = PUPILS[State.level].findIndex(p => p.id === id);
    if (idx > -1) {
      const pupil = PUPILS[State.level].splice(idx, 1)[0];
      PUPILS[lvl].push(pupil);
      await this.save(); initDropdowns(); UI.renderSettingsPupils();
      UI.toast(`تم نقل ${pupil.name} إلى المستوى ${lvl}`, 'success');
    }
  }
};

// ══════════════════════════════════════════════════════════
//  ENGINE — CALCULATIONS & ANALYTICS
// ══════════════════════════════════════════════════════════
const Engine = {
  _cache: {},
  invalidate() { this._cache = {}; },
  
  async calculatePI(name, level) {
    const cacheKey = `${name}_${level}_${State.year}`;
    if (this._cache[cacheKey]) return this._cache[cacheKey];
    
    let fluScore = 0, fluCount = 0, totalStars = 0;
    for (let s = 1; s <= 4; s++) {
      for (let w = 1; w <= 5; w++) {
        const fd = await DB.getFluency(s, w);
        if (fd[name]) {
          fluCount++;
          let ws = 0;
          if (fd[name].accuracy === 'yes') ws += 5;
          if (fd[name].flow === 'yes') ws += 5;
          fluScore += ws;
          if (ws === 10) totalStars++;
        }
      }
    }
    const fluAvg = fluCount > 0 ? fluScore / fluCount : 0;
    
    const allGrades = await DB.get('grades');
    let tgSum = 0, tgCnt = 0;
    Object.keys(allGrades).forEach(subj => {
      const stData = (allGrades[subj] || {})[name] || {};
      Object.values(stData).forEach(val => { if (val !== '' && !isNaN(val)) { tgSum += parseFloat(val); tgCnt++; } });
    });
    const gAvg = tgCnt > 0 ? tgSum / tgCnt : 5;
    
    const allAtt = await DB.get('attendance');
    let absCount = 0;
    Object.keys(allAtt).forEach(d => { if ((allAtt[d] || {})[name] === 'absent') absCount++; });
    
    const hwData = await DB.get('homework');
    let hwMisses = 0;
    Object.keys(hwData).forEach(d => { if ((hwData[d] || {})[name] === 'not_done') hwMisses++; });
    
    const actData = await DB.get('activities');
    const stAct = actData[name] || {};
    const actTotal = (stAct.projects || 0) + (stAct.environment || 0) + (stAct.research || 0) + (stAct.initiatives || 0);
    
    const pi = Math.max(0, Math.min(10,
      gAvg * 0.5 + fluAvg * 0.3 + Math.max(0, 10 - absCount * 2) * 0.1 + Math.max(0, 10 - hwMisses * 2) * 0.1
    ));
    const xp = (totalStars * 50) + (gAvg * 40) + ((10 - Math.min(10, absCount)) * 20) + ((10 - Math.min(10, hwMisses)) * 15) + (actTotal * 10);
    const lvl = Math.floor(Math.max(0, xp) / 100) + 1;
    
    const result = { pi, xp, lvl, raw: { fluAvg, totalStars, gAvg, absCount, hwMisses, actTotal } };
    this._cache[cacheKey] = result;
    return result;
  },

  async checkAlerts() {
    const pupils = PupilMgr.getPupilNames();
    const dismissed = await Store.get('dismissed_alerts', []);
    const alerts = [];
    let sumPI = 0;
    for (const p of pupils) {
      const res = await Engine.calculatePI(p, State.level);
      sumPI += res.pi;
      const allAtt = await DB.get('attendance');
      let abs = 0; Object.values(allAtt).forEach(d => { if ((d||{})[p]==='absent') abs++; });
      if (abs >= 5) alerts.push({ id: `abs_${p}`, type: 'warning', msg: `${p}: ${abs} غيابات — يحتاج متابعة` });
    }
    const avg = sumPI / (pupils.length || 1);
    if (avg < 5.5) alerts.push({ id: 'hlth', type: 'danger', msg: `تنبيه: مؤشر صحة القسم منخفض (${(avg * 10).toFixed(1)}%) — مراجعة عاجلة` });
    
    const bar = document.getElementById('smartAlertsContainer'); if (!bar) return;
    const visible = alerts.filter(a => !dismissed.includes(a.id));
    bar.innerHTML = visible.map(a => `<div class="smart-alert ${a.type}" id="alrt-${a.id}"><span>${a.msg}</span><button class="close-alert" onclick="UI.dismissAlert('${a.id}')">✕</button></div>`).join('');
  },

  async checkEarlyWarning(name) {
    const grades = await DB.get('grades');
    const arabicG = (grades.arabic || {})[name] || {};
    const vals = ['t1','t2','t3','t4'].map(k => parseFloat(arabicG[k])).filter(v => !isNaN(v));
    for (let i = 0; i <= vals.length - 3; i++) {
      if (vals[i] < 5 && vals[i+1] < 5 && vals[i+2] < 5) return true;
    }
    return false;
  }
};

// ══════════════════════════════════════════════════════════
//  IMPORT MANAGER
// ══════════════════════════════════════════════════════════
const ImportMgr = {
  importPupils(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        let names = [];
        json.forEach(row => {
          let name = '';
          for (const key in row) {
            if ((key.includes('اسم') || key.includes('نسب') || key.toLowerCase().includes('nom')) && typeof row[key] === 'string') { name = row[key]; break; }
          }
          if (!name) { const v = Object.values(row).find(v => typeof v === 'string' && v.trim().includes(' ')); if (v) name = v; }
          if (name && name.trim().length > 2) names.push(name.trim());
        });
        names = [...new Set(names)];
        if (!PUPILS[State.level]) PUPILS[State.level] = [];
        const existing = PupilMgr.getPupilNames();
        let added = 0;
        names.forEach(n => { if (!existing.includes(n)) { PUPILS[State.level].push({ id: uuid(), name: n }); added++; } });
        await PupilMgr.save(); initDropdowns(); UI.renderSettingsPupils();
        UI.toast(`تم استيراد ${added} متعلم جديد`, 'success');
      } catch { UI.toast('خطأ في قراءة الملف', 'error'); }
    };
    reader.readAsArrayBuffer(file); input.value = '';
  },
  async importFromPaste() {
    const text = document.getElementById('paste-names').value;
    const names = text.split('\n').map(n => n.trim()).filter(n => n.length > 2);
    if (!PUPILS[State.level]) PUPILS[State.level] = [];
    const existing = PupilMgr.getPupilNames();
    let added = 0;
    names.forEach(n => { if (!existing.includes(n)) { PUPILS[State.level].push({ id: uuid(), name: n }); added++; } });
    await PupilMgr.save(); initDropdowns(); UI.renderSettingsPupils();
    UI.closeModal('pasteImportModal');
    document.getElementById('paste-names').value = '';
    UI.toast(`تم استيراد ${added} متعلم`, 'success');
  },
  importGrades(input) {
    const file = input.files[0]; if (!file) return;
    const subject = getVal('grade-subject') || 'arabic';
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        const allG = await DB.get('grades');
        if (!allG[subject]) allG[subject] = {};
        let mapped = 0;
        json.forEach(row => {
          let name = ''; let grade = null;
          for (const key in row) { if (key.includes('اسم') && typeof row[key] === 'string') { name = row[key]; break; } }
          for (const key in row) { const v = parseFloat(row[key]); if (!isNaN(v) && v >= 0 && v <= 10) { grade = v; break; } }
          if (name && grade !== null) {
            const match = PupilMgr.getPupilNames().find(p => p === name || p.includes(name) || name.includes(p));
            if (match) { if (!allG[subject][match]) allG[subject][match] = {}; allG[subject][match]['t1'] = grade; mapped++; }
          }
        });
        if (mapped > 0) { await DB.set('grades', allG); UI.renderGrades(); UI.toast(`استيراد ${mapped} نقطة`, 'success'); }
        else UI.toast('لا تطابق', 'warning');
      } catch { UI.toast('خطأ في القراءة', 'error'); }
    };
    reader.readAsArrayBuffer(file); input.value = '';
  }
};

// ══════════════════════════════════════════════════════════
//  LEGACY MIGRATOR 
// ══════════════════════════════════════════════════════════
const LegacyMigrator = {
  _parseValue(val) {
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch { return val; }
  },
  _normalizeKey(key, currentYear) {
    let k = key;
    k = k.replace(/^edu_v[0-9]+_/, '');
    k = k.replace(/^(\d{4}-\d{4})_\d+_/, '$1_');
    if (k === 'dynamic_pupils') return 'pupils';
    if (/^\d{4}-\d{4}_/.test(k)) {
      k = k.replace(/^\d{4}-\d{4}_/, `${currentYear}_`);
    }
    return k;
  },
  _migrateLibraryRecords(records) {
    if (!Array.isArray(records)) return [];
    return records.map(rec => {
      const r = { ...rec };
      if (!r.id || typeof r.id === 'number' || /^\d+$/.test(String(r.id))) r.id = uuid();
      if (!r.date && r.borrowDate) r.date = r.borrowDate;
      if (!r.date) r.date = new Date().toISOString().split('T')[0];
      delete r.borrowDate; delete r.isSummarized;
      if (r.returnDate && String(r.returnDate).length < 8) r.returnDate = null;
      if (!r.status) r.status = r.returnDate ? 'returned' : 'pending';
      return r;
    });
  },
  _migratePupils(pupilsData) {
    if (!pupilsData || typeof pupilsData !== 'object') return pupilsData;
    const result = {};
    for (const [lvl, list] of Object.entries(pupilsData)) {
      if (!Array.isArray(list)) { result[lvl] = list; continue; }
      result[lvl] = list.map(p => {
        if (typeof p === 'string') return { id: uuid(), name: p };
        if (typeof p === 'object' && p.name) return p;
        return p;
      });
    }
    return result;
  },
  async migrate(importedData) {
    const currentYear = State.year || '2025-2026';
    const result = {};
    let libMigratedCount = 0;
    let keysMigrated = 0;
    const isLegacy = Object.keys(importedData).some(k => /^edu_v[0-9]+_/.test(k));

    for (const [origKey, rawValue] of Object.entries(importedData)) {
      if (origKey === '__version' || origKey === '__date') continue;
      const value = isLegacy ? this._parseValue(rawValue) : rawValue;
      const newKey = isLegacy ? this._normalizeKey(origKey, currentYear) : origKey;
      if (newKey !== origKey) keysMigrated++;

      if (newKey === 'pupils') {
        result[newKey] = this._migratePupils(value);
        continue;
      }
      if (newKey.includes('_library_')) {
        const migratedLib = this._migrateLibraryRecords(value);
        const existingLib = await Store.get(newKey, []);
        const existingSig = new Set(existingLib.map(r => `${r.student}|${r.book}|${r.date}`));
        const newRecords = migratedLib.filter(r => !existingSig.has(`${r.student}|${r.book}|${r.date}`));
        result[newKey] = [...existingLib, ...newRecords];
        libMigratedCount += newRecords.length;
        continue;
      }
      result[newKey] = value;
    }
    if (isLegacy) setTimeout(() => UI.toast(`🔄 ملف قديم: تم ترحيل ${keysMigrated} مفتاح`, 'success'), 1500);
    return result;
  },
  async seedIfEmpty() {
    const libKey = `${State.year}_library_L${State.level}`;
    const existing = await Store.get(libKey, []);
    if (existing.length > 0) return;
    const pupils = PupilMgr.getPupilNames();
    if (!pupils.length) return;
    const seed = [
      { id: uuid(), student: pupils[0], book: '«الذئب الثري»', date: '2026-02-25', returnDate: '2026-03-05', status: 'returned' },
      { id: uuid(), student: pupils[1] || pupils[0], book: '«ابن بطوطة يحكي»', date: '2026-02-25', returnDate: '2026-03-05', status: 'returned' }
    ];
    await Store.set(libKey, seed);
  }
};

// ══════════════════════════════════════════════════════════
//  BACKUP MANAGER
// ══════════════════════════════════════════════════════════
const BackupMgr = {
  async exportJSON() {
    const data = await Store.exportAll();
    data.__version = '9.0'; data.__date = new Date().toISOString();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `backup_edu_${State.year}_${State.today}.json`; a.click();
    UI.toast('تم التصدير بنجاح', 'success');
  },
  async exportCSV() {
    const pupils = PupilMgr.getPupilNames();
    let csv = '\ufeffالاسم,مؤشر الأداء (PI),معدل الفروض,الغيابات,XP,المستوى\n';
    for (const p of pupils) {
      const r = await Engine.calculatePI(p, State.level);
      csv += `${p},${r.pi.toFixed(2)},${r.raw.gAvg.toFixed(2)},${r.raw.absCount},${r.xp.toFixed(0)},${r.lvl}\n`;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `نتائج_${State.year}_L${State.level}.csv`; a.click();
    UI.toast('تم التصدير', 'success');
  },
  async exportGradesExcel() {
    const subject = getVal('grade-subject') || 'arabic';
    const subjNames = {arabic:'اللغة العربية',islamic:'التربية الإسلامية',social:'الاجتماعيات',art:'التربية الفنية',pe:'التربية البدنية'};
    const allGrades = await DB.get('grades');
    const grades = allGrades[subject] || {};
    const cols = subject === 'social' ? [
        {id:'h1',lbl:'تاريخ ف1'},{id:'h2',lbl:'تاريخ ف2'},
        {id:'g1',lbl:'جغرافيا ف1'},{id:'g2',lbl:'جغرافيا ف2'},
        {id:'c1',lbl:'مدنية ف1'},{id:'c2',lbl:'مدنية ف2'}
      ] : [{id:'t1',lbl:'الفرض 1'},{id:'t2',lbl:'الفرض 2'}];
    const teacher = await Store.get('setting_teacher', 'ذ. عبد الحق جعايط');
    const school = await Store.get('setting_school', 'م/م المصامدة');
    const wb = XLSX.utils.book_new();
    const wsData = [
      [`${subjNames[subject]} — الموسم: ${State.year} — المستوى: ${State.level} — ${school}`],
      [],
      ['الرتبة', 'الاسم', ...cols.map(c=>c.lbl), 'المعدل']
    ];
    const pupils = PupilMgr.getPupilNames();
    pupils.forEach((p, i) => {
      const g = grades[p] || {};
      let tot = 0, cnt = 0;
      cols.forEach(c => { if (g[c.id] !== '' && g[c.id] !== undefined && !isNaN(g[c.id])) { tot += parseFloat(g[c.id]); cnt++; }});
      const avg = cnt > 0 ? (tot/cnt).toFixed(2) : '—';
      wsData.push([i+1, p, ...cols.map(c => g[c.id] !== undefined ? g[c.id] : ''), avg]);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:cols.length+2}}];
    ws['!cols'] = [{wch:6},{wch:30},...cols.map(()=>({wch:12})),{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, subjNames[subject].substring(0,31));
    XLSX.writeFile(wb, `فروض_${subjNames[subject]}_${State.year}_L${State.level}.xlsx`);
    UI.toast('تم تصدير ملف الفروض', 'success');
  },
  importJSON(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!confirm('سيتم دمج هذه البيانات. هل أنت متأكد؟')) return;
        delete data.__version; delete data.__date;
        const migrated = await LegacyMigrator.migrate(data);
        await Store.importAll(migrated);
        await PupilMgr.init();
        initDropdowns(); await refreshCurrentTab();
        UI.toast('تم الاستيراد بنجاح ✅', 'success');
      } catch(err) { console.error(err); UI.toast('خطأ في الملف', 'error'); }
    };
    reader.readAsText(file); input.value = '';
  },
  async clearAll() {
    await Store.clear(); sessionStorage.removeItem('auth_ok'); location.reload();
  },
  async saveSettings() {
    const teacher = getVal('setting-teacher'), school = getVal('setting-school');
    if (teacher) await Store.set('setting_teacher', teacher);
    if (school) await Store.set('setting_school', school);
    document.getElementById('sb-teacher') && (document.getElementById('sb-teacher').textContent = teacher || 'ذ. عبد الحق جعايط');
    document.getElementById('print-school') && (document.getElementById('print-school').textContent = school || 'م/م المصامدة');
    UI.toast('تم الحفظ', 'success');
  }
};

// ══════════════════════════════════════════════════════════
//  UI MODULE
// ══════════════════════════════════════════════════════════
const UI = {
  toast(msg, type = 'success') {
    const cont = document.getElementById('toastContainer'); if (!cont) return;
    const t = document.createElement('div'); t.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    t.innerHTML = `${icons[type] || 'ℹ️'} ${msg}`;
    cont.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
  },
  async dismissAlert(id) {
    const d = await Store.get('dismissed_alerts', []);
    d.push(id); await Store.set('dismissed_alerts', d);
    const el = document.getElementById(`alrt-${id}`); if (el) el.remove();
  },
  closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); },

  // ─── DASHBOARD ─────────────────────────────
  async renderDashboard() {
    const pupils = PupilMgr.getPupilNames();
    let stable = 0, watch = 0, urgent = 0, sumPI = 0;
    const perfList = [];
    const todayAtt = (await DB.get('attendance'))[State.today] || {};
    let absC = 0;
    Engine.invalidate();
    for (const p of pupils) {
      const res = await Engine.calculatePI(p, State.level);
      if (res.pi >= 7) stable++; else if (res.pi >= 5) watch++; else urgent++;
      if (todayAtt[p] === 'absent') absC++;
      sumPI += res.pi;
      perfList.push({ name: p, pi: res.pi });
    }
    const avgPI = sumPI / (pupils.length || 1);
    setTxt('dash-health', (avgPI * 10).toFixed(1) + '%');
    setTxt('dash-stable', stable); setTxt('dash-watch', watch);
    setTxt('dash-urgent', urgent); setTxt('dash-absent', absC);
    setTxt('dash-total', pupils.length);
    
    // Urgent intervention cards
    const urgentPupils = perfList.filter(p => p.pi < 5);
    const urgSec = document.getElementById('urgent-section');
    if (urgSec) urgSec.style.display = urgentPupils.length ? 'block' : 'none';
    setHtml('urgentCards', urgentPupils.map(s => `
      <div class="intervention-card">
        <div class="int-avatar">${s.name[0]}</div>
        <div class="int-info">
          <div class="int-name">${s.name}</div>
          <div class="int-reason">PI: ${s.pi.toFixed(1)} — يحتاج دعماً فورياً</div>
        </div>
        <button class="btn btn-danger btn-xs" onclick="UI.openProfile('${s.name}')">ملف</button>
      </div>`).join(''));
    
    perfList.sort((a, b) => b.pi - a.pi);
    setHtml('dash-top-students', perfList.slice(0, 5).map((s, i) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:var(--r-md);cursor:pointer" onclick="UI.openProfile('${s.name}')">
        <span style="font-size:12px;font-weight:700">${i+1}. ${s.name}</span>
        <span class="badge ${s.pi>=7?'badge-green':s.pi>=5?'badge-orange':'badge-red'}">${s.pi.toFixed(1)}</span>
      </div>`).join(''));
    
    // Progress chart
    const wAvgs = [5.2, 6.1, 6.8, 7.5, avgPI];
    this._updateChart('classProg', 'chartClassProgress', {
      type: 'line',
      data: { labels: ['و.1', 'و.2', 'و.3', 'و.4', 'الحالي'], datasets: [{ label: 'معدل القسم', data: wAvgs, borderColor: '#6366f1', tension: 0.3, fill: true, backgroundColor: 'rgba(99,102,241,.1)', pointBackgroundColor: '#6366f1', pointRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 10 } } }
    });
    
    // Distribution
    this._updateChart('distrib', 'chartDistribution', {
      type: 'doughnut',
      data: { labels: ['متحكمون', 'متوسطون', 'تعثر'], datasets: [{ data: [stable, watch, urgent], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    
    // Subject averages
    const allGrades = await DB.get('grades');
    const subjects = ['arabic', 'islamic', 'social', 'art', 'pe'];
    const subjLabels = ['عربية', 'إسلامية', 'اجتماعيات', 'فنية', 'بدنية'];
    const subjAvgs = subjects.map(s => {
      const g = allGrades[s] || {}; let sum = 0, cnt = 0;
      pupils.forEach(p => { const pg = g[p] || {}; Object.values(pg).forEach(v => { if (!isNaN(parseFloat(v))) { sum += parseFloat(v); cnt++; } }); });
      return cnt > 0 ? (sum / cnt).toFixed(2) : 0;
    });
    this._updateChart('subjects', 'chartSubjects', {
      type: 'bar',
      data: { labels: subjLabels, datasets: [{ data: subjAvgs, backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6'], borderRadius: 5 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 10 } } }
    });
    
    await Engine.checkAlerts();
    await UI.renderPulseCard();
    await QuickAtt.render();
    await Engine.checkEarlyWarnings();
  },

  // ─── HEATMAP ─────────────────────────────
  async renderHeatmap() {
    const pupils = PupilMgr.getPupilNames();
    const allGrades = await DB.get('grades');
    const subjects = ['arabic', 'islamic', 'social', 'art', 'pe'];
    const subjLabels = ['العربية', 'الإسلامية', 'الاجتماعيات', 'الفنية', 'البدنية'];
    
    let html = `<table class="heatmap-table"><thead><tr><th>المتعلم</th>`;
    subjLabels.forEach(s => { html += `<th>${s}</th>`; });
    html += `<th>PI</th></tr></thead><tbody>`;
    
    for (const p of pupils) {
      html += `<tr><td style="cursor:pointer" onclick="UI.openProfile('${p}')">${p}</td>`;
      subjects.forEach(s => {
        const g = (allGrades[s] || {})[p] || {};
        const vals = Object.values(g).filter(v => !isNaN(parseFloat(v))).map(parseFloat);
        if (vals.length === 0) { html += `<td class="heat-gray">—</td>`; return; }
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const cls = avg >= 7 ? 'heat-green' : avg >= 5 ? 'heat-orange' : 'heat-red';
        html += `<td class="${cls}">${avg.toFixed(1)}</td>`;
      });
      const res = await Engine.calculatePI(p, State.level);
      const piCls = res.pi >= 7 ? 'heat-green' : res.pi >= 5 ? 'heat-orange' : 'heat-red';
      html += `<td class="${piCls}" style="font-weight:900">${res.pi.toFixed(1)}</td></tr>`;
    }
    html += '</tbody></table>';
    setHtml('heatmapContainer', html);
  },

  // ─── HONOR ROLL ─────────────────────────────
  async renderHonorRoll() {
    const list = [];
    for (const p of PupilMgr.getPupilNames()) {
      const r = await Engine.calculatePI(p, State.level);
      list.push({ name: p, xp: r.xp, lvl: r.lvl, pi: r.pi });
    }
    list.sort((a, b) => b.xp - a.xp);
    
    let bHtml = '';
    if (list[0]) bHtml += `<div style="background:rgba(245,158,11,.1);padding:14px;border-radius:var(--r-lg);text-align:center;border:1px solid #fcd34d"><div style="font-size:28px">👑</div><div style="font-size:10.5px;font-weight:900;color:#b45309">بطل القسم</div><div style="font-size:13px;font-weight:700">${list[0].name}</div></div>`;
    if (list[1]) bHtml += `<div style="background:rgba(16,185,129,.1);padding:14px;border-radius:var(--r-lg);text-align:center;border:1px solid #6ee7b7"><div style="font-size:28px">🚀</div><div style="font-size:10.5px;font-weight:900;color:#047857">وصيف البطل</div><div style="font-size:13px;font-weight:700">${list[1].name}</div></div>`;
    setHtml('honor-badges', bHtml);
    
    setHtml('honor-table-body', list.map((item, i) => {
      const progress = ((item.xp % 100));
      const trend = item.pi >= 7 ? '<span class="evo-trend evo-up">⬆ متحسن</span>' : item.pi >= 5 ? '<span class="evo-trend evo-same">→ مستقر</span>' : '<span class="evo-trend evo-down">⬇ يحتاج دعم</span>';
      return `<tr>
        <td class="td-center"><span class="row-num">${i+1}</span></td>
        <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${item.name}')">${item.name}</strong></td>
        <td class="td-center font-bold" style="color:var(--warning)">${item.xp.toFixed(0)}</td>
        <td class="td-center">
          <div style="font-size:10.5px;color:var(--text-3)">Lv ${item.lvl}</div>
          <div class="xp-bar" style="width:80px"><div class="xp-fill" style="width:${progress}%"></div></div>
        </td>
        <td class="td-center">${trend}</td>
      </tr>`;
    }).join(''));
  },

  generateCertificate() {
    const list = PupilMgr.getPupilNames();
    if (!list.length) { this.toast('لا توجد بيانات', 'error'); return; }
    setTxt('cert-name-val', list[0]);
    setTxt('cert-date-val', State.today);
    document.body.className = 'print-mode-cert'; window.print(); document.body.className = '';
  },

  // ─── FLUENCY ─────────────────────────────
  async renderFluency() {
    const s = document.getElementById('flu-stage')?.value || '4';
    const w = document.getElementById('flu-week')?.value || '4';
    const flu = await DB.getFluency(s, w);
    setHtml('fluencyBody', PupilMgr.getPupilNames().map((p, i) => {
      const fd = flu[p] || {};
      const acc = fd.accuracy === 'yes', flw = fd.flow === 'yes';
      const tarl = fd.tarl || '—';
      const speed = fd.speed || '';
      return `<tr>
        <td class="td-center"><span class="row-num">${i+1}</span></td>
        <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${p}')">${p}</strong></td>
        <td class="td-center"><div class="flu-toggle ${acc?'flu-y':'flu-n'}" onclick="UI.toggleFlu('${p}','accuracy')">${acc?'✓ نعم':'✗ لا'}</div></td>
        <td class="td-center"><div class="flu-toggle ${flw?'flu-y':'flu-n'}" onclick="UI.toggleFlu('${p}','flow')">${flw?'✓ نعم':'✗ لا'}</div></td>
        <td class="td-center"><span class="tarl-badge tarl-${tarl}" style="cursor:pointer" onclick="UI.changePupilTaRL('${p}')">${tarl==='—'?'— تحديد':tarl}</span></td>
        <td class="td-center"><input type="number" min="0" max="300" class="form-control" style="width:70px;text-align:center;padding:3px;font-size:12px" value="${speed}" onblur="UI.saveFluSpeed('${p}',this.value)" placeholder="ك/د"></td>
        <td class="td-center" style="font-size:18px">${acc && flw ? '⭐' : '<span style="opacity:.2;font-size:16px">☆</span>'}</td>
        <td><input type="text" class="form-control" style="padding:3px 7px;height:28px;font-size:12px" value="${fd.notes||''}" onblur="UI.saveFluNote('${p}',this.value)" placeholder="ملاحظة..."></td>
        <td class="td-center no-print"><button class="btn btn-ghost btn-xs" onclick="UI.openProfile('${p}')">ملف</button></td>
      </tr>`;
    }).join(''));
  },
  async toggleFlu(name, field) {
    const s = document.getElementById('flu-stage')?.value || '4', w = document.getElementById('flu-week')?.value || '4';
    const flu = await DB.getFluency(s, w);
    if (!flu[name]) flu[name] = {};
    flu[name][field] = flu[name][field] === 'yes' ? 'no' : 'yes';
    await DB.setFluency(s, w, flu); this.renderFluency();
  },
  async saveFluNote(name, val) {
    const s = document.getElementById('flu-stage')?.value || '4', w = document.getElementById('flu-week')?.value || '4';
    const flu = await DB.getFluency(s, w);
    if (!flu[name]) flu[name] = {};
    flu[name].notes = val; await DB.setFluency(s, w, flu);
  },
  async saveFluSpeed(name, val) {
    const s = document.getElementById('flu-stage')?.value || '4', w = document.getElementById('flu-week')?.value || '4';
    const flu = await DB.getFluency(s, w);
    if (!flu[name]) flu[name] = {};
    flu[name].speed = val; await DB.setFluency(s, w, flu);
  },
  async changePupilTaRL(name) {
    const levels = ['letter','word','sentence','paragraph','text'];
    const labels = {letter:'🔤 حرف',word:'🔡 كلمة',sentence:'📝 جملة',paragraph:'📄 فقرة',text:'📚 نص'};
    const chosen = prompt(`اختر مستوى TaRL لـ ${name}:\n1- حرف\n2- كلمة\n3- جملة\n4- فقرة\n5- نص\nأدخل رقم أو الكلمة:`, '');
    if (!chosen) return;
    const levelMap = {'1':'letter','2':'word','3':'sentence','4':'paragraph','5':'text','حرف':'letter','كلمة':'word','جملة':'sentence','فقرة':'paragraph','نص':'text','letter':'letter','word':'word','sentence':'sentence','paragraph':'paragraph','text':'text'};
    const level = levelMap[chosen.trim()];
    if (!level) { UI.toast('مستوى غير معروف', 'error'); return; }
    const s = document.getElementById('flu-stage')?.value || '4', w = document.getElementById('flu-week')?.value || '4';
    const flu = await DB.getFluency(s, w);
    if (!flu[name]) flu[name] = {};
    flu[name].tarl = level;
    await DB.setFluency(s, w, flu); this.renderFluency();
    UI.toast(`تم تحديد مستوى ${labels[level]} لـ ${name}`, 'success');
  },
  async setTaRLLevel(level) {
    const name = prompt('اكتب اسم المتعلم (أو اتركه فارغاً للتطبيق على الكل):');
    const s = document.getElementById('flu-stage')?.value || '4', w = document.getElementById('flu-week')?.value || '4';
    const flu = await DB.getFluency(s, w);
    const targets = name ? [name] : PupilMgr.getPupilNames();
    targets.forEach(p => { if (!flu[p]) flu[p] = {}; flu[p].tarl = level; });
    await DB.setFluency(s, w, flu); this.renderFluency();
    UI.toast(`تم تسجيل مستوى TaRL: ${level}`, 'success');
  },

  // ─── ATTENDANCE ─────────────────────────────
  async renderAttendance() {
    const date = getVal('att-date'); if (!date) return;
    const allAtt = await DB.get('attendance');
    const todayAtt = allAtt[date] || {};
    setHtml('attendanceBody', await Promise.all(PupilMgr.getPupilNames().map(async (p, i) => {
      const st = todayAtt[p]?.status || todayAtt[p] || 'present';
      const reason = todayAtt[p]?.reason || '';
      const note = todayAtt[p]?.note || '';
      let totalAbs = 0;
      Object.keys(allAtt).forEach(d => { const v = allAtt[d]?.[p]; const s = typeof v === 'object' ? v?.status : v; if (s === 'absent') totalAbs++; });
      const absColor = totalAbs >= 5 ? 'var(--danger)' : totalAbs >= 3 ? 'var(--warning)' : 'var(--text-1)';
      const isAbsent = st === 'absent';
      return `<tr>
        <td class="td-center"><span class="row-num">${i+1}</span></td>
        <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${p}')">${p}</strong></td>
        <td class="td-center"><input type="radio" name="att_${i}" ${st==='present'?'checked':''} onchange="UI.saveAtt('${p}','present')"></td>
        <td class="td-center"><input type="radio" name="att_${i}" ${st==='absent'?'checked':''} onchange="UI.saveAtt('${p}','absent')"></td>
        <td class="td-center"><input type="radio" name="att_${i}" ${st==='late'?'checked':''} onchange="UI.saveAtt('${p}','late')"></td>
        <td class="td-center" style="color:${absColor};font-weight:900">${totalAbs}</td>
        <td style="min-width:140px">
          <select class="form-control" style="padding:3px 6px;font-size:11px;height:28px" onchange="UI.saveAttReason('${p}',this.value)">
            <option value="" ${!reason?'selected':''}>— سبب الخروج —</option>
            <option value="illness" ${reason==='illness'?'selected':''}>🤒 مرض</option>
            <option value="parent" ${reason==='parent'?'selected':''}>👨‍👩 حضور ولي الأمر</option>
            <option value="family" ${reason==='family'?'selected':''}>🏠 ظرف عائلي</option>
            <option value="other" ${reason==='other'?'selected':''}>📌 أخرى</option>
          </select>
        </td>
        <td><input type="text" class="form-control" style="padding:3px 7px;height:28px;font-size:11px" value="${note}" onblur="UI.saveAttNote('${p}',this.value)" placeholder="ملاحظة..."></td>
      </tr>`;
    })).then(rows => rows.join('')));
  },
  async saveAtt(p, st) {
    const date = getVal('att-date'); if (!date) return;
    const a = await DB.get('attendance');
    if (!a[date]) a[date] = {};
    const old = a[date][p] || {};
    const oldReason = typeof old === 'object' ? old.reason || '' : '';
    const oldNote = typeof old === 'object' ? old.note || '' : '';
    a[date][p] = { status: st, reason: oldReason, note: oldNote };
    await DB.set('attendance', a);
  },
  async saveAttReason(p, reason) {
    const date = getVal('att-date'); if (!date) return;
    const a = await DB.get('attendance');
    if (!a[date]) a[date] = {};
    const old = a[date][p] || {};
    const st = typeof old === 'object' ? old.status || 'present' : old || 'present';
    const note = typeof old === 'object' ? old.note || '' : '';
    a[date][p] = { status: st, reason, note };
    await DB.set('attendance', a);
  },
  async saveAttNote(p, note) {
    const date = getVal('att-date'); if (!date) return;
    const a = await DB.get('attendance');
    if (!a[date]) a[date] = {};
    const old = a[date][p] || {};
    const st = typeof old === 'object' ? old.status || 'present' : old || 'present';
    const reason = typeof old === 'object' ? old.reason || '' : '';
    a[date][p] = { status: st, reason, note };
    await DB.set('attendance', a);
  },
  async markAllPresent() {
    const date = getVal('att-date'); if (!date) return;
    const a = await DB.get('attendance');
    if (!a[date]) a[date] = {};
    PupilMgr.getPupilNames().forEach(p => { a[date][p] = { status: 'present', reason: '', note: '' }; });
    await DB.set('attendance', a); this.renderAttendance();
    this.toast('تم تسجيل الكل حاضراً', 'success');
  },

  // ─── HOMEWORK ─────────────────────────────
  async renderHomework() {
    const date = getVal('hw-date'); if (!date) return;
    const allHW = await DB.get('homework');
    const todayHW = allHW[date] || {};
    const missTotals = {};
    Object.keys(allHW).forEach(d => { if (allHW[d]) Object.keys(allHW[d]).forEach(p => { if (allHW[d][p] === 'not_done') missTotals[p] = (missTotals[p] || 0) + 1; }); });
    setHtml('homeworkBody', PupilMgr.getPupilNames().map((p, i) => {
      const st = todayHW[p] || '', ms = missTotals[p] || 0;
      const msHtml = ms >= 3 ? `<span class="badge badge-red">${ms} مرات</span>` : ms > 0 ? `<span class="badge badge-orange">${ms}</span>` : `<span style="color:var(--text-3)">0</span>`;
      return `<tr>
        <td class="td-center"><span class="row-num">${i+1}</span></td>
        <td><strong>${p}</strong></td>
        <td class="td-center"><input type="radio" name="hw_${i}" ${st==='done'?'checked':''} onchange="UI.saveHW('${p}','done')"></td>
        <td class="td-center"><input type="radio" name="hw_${i}" ${st==='not_done'?'checked':''} onchange="UI.saveHW('${p}','not_done')"></td>
        <td class="td-center">${msHtml}</td>
      </tr>`;
    }).join(''));
  },
  async saveHW(p, st) {
    const d = getVal('hw-date');
    const a = await DB.get('homework');
    if (!a[d]) a[d] = {};
    a[d][p] = st; await DB.set('homework', a);
  },

  // ─── GRADES ─────────────────────────────
  async renderGrades() {
    const subject = getVal('grade-subject') || 'arabic';
    const allGrades = await DB.get('grades');
    if (!allGrades[subject]) allGrades[subject] = {};
    const grades = allGrades[subject];

    // الاجتماعيات: 3 مكونات × فرضان = 6 أعمدة
    let cols, isSocial = subject === 'social';
    if (isSocial) {
      cols = [
        {id:'h1',lbl:'تاريخ ف1'},{id:'h2',lbl:'تاريخ ف2'},
        {id:'g1',lbl:'جغرافيا ف1'},{id:'g2',lbl:'جغرافيا ف2'},
        {id:'c1',lbl:'مدنية ف1'},{id:'c2',lbl:'مدنية ف2'}
      ];
    } else {
      cols = [{id:'t1',lbl:'الفرض 1'},{id:'t2',lbl:'الفرض 2'}];
    }

    setHtml('gradesThead', `<tr><th style="width:36px">ر.ت</th><th>الاسم</th>${cols.map(c=>`<th class="td-center">${c.lbl}</th>`).join('')}<th class="td-center">المعدل</th>${isSocial?'<th class="td-center">تفصيل</th>':''}</tr>`);
    setHtml('gradesBody', PupilMgr.getPupilNames().map((p, i) => {
      const g = grades[p] || {};
      let avg, detailHtml = '';
      if (isSocial) {
        const hAvg = GradeCalc.subjectAvg(g,['h1','h2']);
        const gAvg = GradeCalc.subjectAvg(g,['g1','g2']);
        const cAvg = GradeCalc.subjectAvg(g,['c1','c2']);
        avg = GradeCalc.socialAvg(g);
        const parts = [{n:'تاريخ',v:hAvg},{n:'جغرافيا',v:gAvg},{n:'مدنية',v:cAvg}].filter(x=>x.v!==null);
        const strongest = parts.length ? parts.reduce((a,b)=>a.v>b.v?a:b) : null;
        const weakest   = parts.length ? parts.reduce((a,b)=>a.v<b.v?a:b) : null;
        if (strongest && weakest && strongest.n !== weakest.n) {
          detailHtml = `<td class="td-center" style="font-size:10px"><span style="color:var(--success)">↑${strongest.n}</span><br><span style="color:var(--danger)">↓${weakest.n}</span></td>`;
        } else {
          detailHtml = `<td></td>`;
        }
      } else {
        let t=0,c=0;
        cols.forEach(col => { const v=parseFloat(g[col.id]); if(!isNaN(v)){t+=v;c++;} });
        avg = c>0 ? t/c : null;
      }
      const avgFmt = avg !== null ? avg.toFixed(2) : '—';
      const avgColor = avg !== null ? (avg >= 7 ? 'var(--success)' : avg >= 5 ? 'var(--warning)' : 'var(--danger)') : 'var(--text-3)';
      return `<tr>
        <td class="td-center"><span class="row-num">${i+1}</span></td>
        <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${p}')">${p}</strong></td>
        ${cols.map(c => `<td class="td-center"><input type="number" min="0" max="10" step="0.25" class="form-control grade-input" value="${g[c.id]!==undefined?g[c.id]:''}" onblur="UI.saveGrade('${subject}','${p}','${c.id}',this.value)" onkeydown="UI.gradeTabNav(event,this)" data-pupil="${p}" data-col="${c.id}" data-subject="${subject}"></td>`).join('')}
        <td class="td-center" style="font-weight:900;color:${avgColor};font-size:14px">${avgFmt}</td>
        ${isSocial ? detailHtml : ''}
      </tr>`;
    }).join(''));
  },
  async saveGrade(subj, p, test, val) {
    const allG = await DB.get('grades');
    if (!allG[subj]) allG[subj] = {};
    if (!allG[subj][p]) allG[subj][p] = {};
    allG[subj][p][test] = val !== '' ? parseFloat(val) : '';
    await DB.set('grades', allG);
    Engine.invalidate();
  },
  gradeTabNav(e, input) {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      this.saveGrade(input.dataset.subject, input.dataset.pupil, input.dataset.col, input.value);
      const all = Array.from(document.querySelectorAll('.grade-input'));
      const idx = all.indexOf(input);
      if (all[idx + 1]) { all[idx + 1].focus(); all[idx + 1].select(); }
    }
  },

  // ─── ACTIVITIES ─────────────────────────────
  async renderActivities() {
    const data = await DB.get('activities');
    setHtml('activitiesBody', PupilMgr.getPupilNames().map((p, i) => {
      const d = data[p] || { projects:0, environment:0, research:0, initiatives:0 };
      const total = (d.projects||0)+(d.environment||0)+(d.research||0)+(d.initiatives||0);
      const rank = total>=20?'ذهبي 🥇':total>=10?'فضي 🥈':total>=5?'برونزي 🥉':'مبتدئ 🌱';
      const counter = (type, val) => `<div style="display:flex;align-items:center;justify-content:center;gap:6px"><button class="counter-btn" onclick="UI.updateActivity('${p}','${type}',-1)">-</button><span style="width:18px;text-align:center;font-weight:900">${val}</span><button class="counter-btn" onclick="UI.updateActivity('${p}','${type}',1)">+</button></div>`;
      return `<tr>
        <td class="td-center"><span class="row-num">${i+1}</span></td>
        <td><strong>${p}</strong></td>
        <td class="td-center">${counter('projects',d.projects||0)}</td>
        <td class="td-center">${counter('environment',d.environment||0)}</td>
        <td class="td-center">${counter('research',d.research||0)}</td>
        <td class="td-center">${counter('initiatives',d.initiatives||0)}</td>
        <td class="td-center" style="font-weight:900;color:var(--warning);font-size:16px">${total}</td>
        <td class="td-center" style="font-weight:900">${rank}</td>
      </tr>`;
    }).join(''));
  },
  async updateActivity(p, type, delta) {
    const data = await DB.get('activities');
    if (!data[p]) data[p] = { projects:0, environment:0, research:0, initiatives:0 };
    data[p][type] = Math.max(0, (data[p][type]||0) + delta);
    await DB.set('activities', data); this.renderActivities();
  },

  // ─── REMEDIATION ─────────────────────────────
  REM_CATEGORIES: {
    reading:['بطء التهجي','صعوبة الربط بين الحروف','الخلط بين الحروف المتشابهة','ضعف الطلاقة القرائية','قراءة مقطعية متقطعة'],
    spelling:['الخلط بين التاءين','همزتا الوصل والقطع','الشدة والتنوين','الألف اللينة والمقصورة'],
    writing:['ضعف الخط','عدم احترام السطر','الحذف والزيادة','عدم التمييز بين الحروف'],
    comprehension:['صعوبة استيعاب النص','ضعف الفهم الحرفي','ضعف الفهم الاستنتاجي','صعوبة الفكرة الرئيسية'],
    oral_expression:['صعوبة التعبير الشفهي','ضعف المفردات','الخجل والتردد','عدم احترام بنية الجملة'],
    written_expression:['صعوبة بناء الجملة','ضعف الإنتاج الكتابي','صعوبة استعمال الروابط'],
    math:['ضعف الحساب الذهني','صعوبة المسائل','الخلط بين العمليات'],
    behavior:['كثرة الحركة وعدم التركيز','التأخر عن الدروس','الإزعاج','رفض المشاركة'],
    other:['أخرى']
  },
  REM_INTERVENTIONS: {
    'بطء التهجي':['تدريبات قراءة مقطعية يومية (5 دقائق)','بطاقات الحروف والمقاطع','المزاوجة بين الصوت والصورة'],
    'ضعف الطلاقة القرائية':['قراءة مقاطع قصيرة بصوت عالٍ','تمارين نطق الكلمات الشائعة','التسجيل الصوتي والاستماع للنفس'],
    'ضعف الفهم الحرفي':['أسئلة صريحة حول النص','تحديد شخصيات القصة','ترتيب أحداث النص'],
    'ضعف الفهم الاستنتاجي':['أسئلة "لماذا؟ كيف؟"','ربط النص بالواقع','تلخيص الفقرة بكلمات المتعلم'],
    'كثرة الحركة وعدم التركيز':['جلوس قريب من الأستاذ','مهام قصيرة متعددة','تعزيز إيجابي فوري'],
    'الخلط بين الحروف المتشابهة':['بطاقات المقارنة البصرية','كتابة الحرف في الهواء','اختبارات إملاء تشخيصية'],
    'default':['تعزيز إيجابي متواصل','عمل في مجموعات صغيرة','تبسيط المهام وتجزئتها']
  },
  updateRemCategories() {
    const domain = getVal('rem-domain');
    const cats = this.REM_CATEGORIES[domain] || [];
    const sel = document.getElementById('rem-category');
    if (!sel) return;
    sel.innerHTML = `<option disabled selected>— اختر —</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    document.getElementById('rem-other-container').style.display = 'none';
    document.getElementById('rem-suggestions-box').style.display = 'none';
  },
  suggestRemPlan() {
    const cat = getVal('rem-category');
    const interventions = this.REM_INTERVENTIONS[cat] || this.REM_INTERVENTIONS['default'];
    if (!interventions) return;
    document.getElementById('rem-suggestions-box').style.display = 'block';
    setHtml('rem-suggestions-list', interventions.map(i => `• ${i}`).join('<br>'));
    setVal('rem-plan', interventions.join('\n'));
    if (cat === 'أخرى') document.getElementById('rem-other-container').style.display = 'block';
  },
  async renderRemediation() {
    const rem = await DB.get('remediation');
    const today = State.today;
    let dueCount = 0;
    setHtml('remediationBody', rem.map((r, i) => {
      const isDue = r.nextFollowup && r.nextFollowup <= today && r.status !== 'resolved';
      if (isDue) dueCount++;
      const stClass = r.status === 'resolved' ? 'rem-resolved' : r.status === 'improving' ? 'rem-improving' : 'rem-active';
      const stLabel = r.status === 'resolved' ? '🟢 تجاوز' : r.status === 'improving' ? '🟡 يتحسن' : '🔴 نشط';
      return `<tr>
        <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${r.student}')">${r.student}</strong></td>
        <td style="font-size:11px">${r.type}</td>
        <td style="font-size:10.5px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.nextFollowup||'—'}</td>
        <td class="no-print"><span class="rem-status ${stClass}">${stLabel}</span>${isDue?'<span class="badge badge-red" style="margin-right:4px">⏰</span>':''}<button class="btn btn-xs btn-ghost" style="margin-right:4px" onclick="UI.openRemModal(${i})">✏️ تحديث</button><button class="btn btn-xs btn-info" style="margin-right:4px" onclick="UI.viewSupportPlan(${i})">📋 الخطة</button><button class="btn btn-xs btn-danger" onclick="DB.deleteRemediation(${i})">🗑️</button></td>
      </tr>`;
    }).join(''));
    const badge = document.getElementById('rem-due-badge');
    if (badge) { badge.style.display = dueCount ? 'inline-flex' : 'none'; setTxt('rem-due-count', dueCount); }
  },
  openRemModal(i) {
    DB.get('remediation').then(rem => {
      const r = rem[i];
      setVal('er-index', i); setVal('er-action', r.actions||'');
      setVal('er-status', r.status === 'ongoing' ? 'active' : (r.status || 'active'));
      document.getElementById('editRemActionModal').classList.add('active');
    });
  },
  async viewSupportPlan(i) {
    const rem = await DB.get('remediation');
    const r = rem[i]; if (!r) return;
    const stLabel = r.status === 'resolved' ? '🟢 تجاوز' : r.status === 'improving' ? '🟡 يتحسن' : '🔴 نشط';
    const domainLabels = {reading:'📖 قرائي',spelling:'✍️ إملائي',writing:'🖊️ كتابي',comprehension:'🧠 فهم النص',oral_expression:'🗣️ تعبير شفهي',written_expression:'📝 تعبير كتابي',math:'🔢 رياضيات',behavior:'⚠️ سلوكي',other:'🔹 أخرى'};
    const content = `
      <div style="background:var(--surface-2);border-radius:var(--r-lg);padding:16px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div><span style="font-size:16px;font-weight:900">${r.student}</span> &nbsp;
          <span class="badge badge-purple">${domainLabels[r.domain]||r.domain||''}</span></div>
          <span class="rem-status ${r.status==='resolved'?'rem-resolved':r.status==='improving'?'rem-improving':'rem-active'}">${stLabel}</span>
        </div>
        <div style="font-size:12px;color:var(--text-2);margin-bottom:4px"><strong>الصعوبة المُحدَّدة:</strong> ${r.type}</div>
        <div style="font-size:12px;color:var(--text-2);margin-bottom:4px"><strong>تاريخ البدء:</strong> ${r.date}</div>
        <div style="font-size:12px;color:var(--text-2);margin-bottom:4px"><strong>موعد المتابعة القادم:</strong> ${r.nextFollowup||'—'}</div>
      </div>
      <div style="margin-bottom:14px">
        <h4 style="font-size:12px;font-weight:900;color:var(--brand-600);margin-bottom:8px">📋 الخطة المقترحة:</h4>
        <div style="background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:var(--r-md);padding:12px;font-size:12px;line-height:1.9;white-space:pre-wrap">${r.plan||'—'}</div>
      </div>
      <div style="margin-bottom:14px">
        <h4 style="font-size:12px;font-weight:900;color:var(--success);margin-bottom:8px">✅ التدخلات المُنجزة:</h4>
        <div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:var(--r-md);padding:12px;font-size:12px;line-height:1.9;white-space:pre-wrap">${r.actions||'لم يُسجَّل أي تدخل بعد'}</div>
      </div>
      <div style="background:${r.status==='resolved'?'rgba(16,185,129,.08)':r.status==='improving'?'rgba(245,158,11,.08)':'rgba(239,68,68,.06)'};border-radius:var(--r-md);padding:12px;text-align:center">
        <div style="font-size:11px;font-weight:900">هل أتت الخطة أُكُلها؟</div>
        <div style="font-size:18px;margin-top:6px">${r.status==='resolved'?'✅ نعم — تم التجاوز':r.status==='improving'?'🔄 في طور التحسن':'⏳ لا تزال جارية'}</div>
      </div>`;
    const modal = document.getElementById('supportPlanModal');
    setHtml('supportPlanContent', content);
    modal.classList.add('active');
  },

  // ─── SUPPORT GROUPS (AUTO) ─────────────────────────────
  async generateSupportGroups() {
    const pupils = PupilMgr.getPupilNames();
    const groups = {
      reading: { name: 'مجموعة دعم القراءة 📖', members: [], color: 'var(--info)' },
      comprehension: { name: 'مجموعة دعم الفهم 🧠', members: [], color: 'var(--warning)' },
      spelling: { name: 'مجموعة دعم الإملاء ✍️', members: [], color: 'var(--danger)' },
      general: { name: 'مجموعة الدعم العام 🎯', members: [], color: 'var(--success)' }
    };
    const allGrades = await DB.get('grades');
    for (const p of pupils) {
      const res = await Engine.calculatePI(p, State.level);
      const arabicG = (allGrades.arabic || {})[p] || {};
      const arabicAvg = Object.values(arabicG).filter(v => !isNaN(parseFloat(v))).reduce((a, b) => a + parseFloat(b), 0) / (Object.values(arabicG).filter(v => !isNaN(parseFloat(v))).length || 1);
      const fluAvg = res.raw.fluAvg;
      if (fluAvg < 5) groups.reading.members.push(p);
      else if (arabicAvg < 5 && fluAvg >= 5) groups.comprehension.members.push(p);
      else if (arabicAvg < 6) groups.spelling.members.push(p);
      else if (res.pi < 5) groups.general.members.push(p);
    }
    const html = Object.values(groups).filter(g => g.members.length > 0).map(g => `
      <div class="support-group">
        <div class="support-group-header">
          <div class="support-group-name">${g.name}</div>
          <span class="badge" style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}66">${g.members.length} متعلم</span>
        </div>
        <div class="support-group-members">
          ${g.members.map(m => `<span class="support-member-tag" onclick="UI.openProfile('${m}')">${m}</span>`).join('')}
        </div>
      </div>`).join('') || '<div class="empty-state"><div class="empty-icon">🌟</div><p>لا توجد مجموعات دعم مقترحة حالياً — جميع المتعلمين في مستوى جيد!</p></div>';
    setHtml('supportGroupsContainer', html);
    this.toast('تم تحليل البيانات وتوليد المجموعات', 'success');
  },

  // ─── NOTES ─────────────────────────────
  async renderNotes() {
    const notes = (await DB.get('notes')).slice(0, 20);
    if (!notes.length) { setHtml('recentNotesContainer', '<div class="empty-state"><div class="empty-icon">📋</div><p>لا توجد ملاحظات مسجلة</p></div>'); return; }
    setHtml('recentNotesContainer', notes.map(n => `
      <div class="note-item ${n.type}">
        <div class="note-meta"><span>${n.student}</span><span>${n.date}</span></div>
        <div class="note-text">${n.text}</div>
      </div>`).join(''));
  },

  // ─── LIBRARY ─────────────────────────────
  async renderLibrary() {
    const lib = await DB.get('library');
    if (!lib.length) { setHtml('libraryBody', '<tr><td colspan="6" class="td-center" style="padding:20px;color:var(--text-3)">لا توجد إعارات مسجلة</td></tr>'); return; }
    setHtml('libraryBody', lib.map((l, i) => {
      const sumHtml = l.summarized === 'yes'
        ? `<span class="badge badge-green" style="cursor:pointer" onclick="DB.toggleLibSummarized(${i})">✅ نعم</span>`
        : l.summarized === 'no'
          ? `<span class="badge badge-red" style="cursor:pointer" onclick="DB.toggleLibSummarized(${i})">❌ لا</span>`
          : `<span class="badge badge-gray" style="cursor:pointer" onclick="DB.toggleLibSummarized(${i})">⏳ لم يُحدد</span>`;
      return `<tr>
        <td><strong>${l.student}</strong></td>
        <td>${l.book}</td>
        <td>${l.date||'—'}</td>
        <td class="td-center">${sumHtml}</td>
        <td>${l.status==='pending'?'<span class="badge badge-orange">⏳ إعارة</span>':'<span class="badge badge-green">✅ مسترجع</span>'}</td>
        <td class="no-print" style="white-space:nowrap">
          ${l.status==='pending'?`<button class="btn btn-sm btn-success" onclick="DB.retLib(${i})">إرجاع</button>`:''}
          <button class="btn btn-sm btn-danger" onclick="DB.delLib(${i})">✕</button>
        </td></tr>`;
    }).join(''));
  },

  // ─── SESSIONS ─────────────────────────────
  async renderSessions() {
    const sessions = await DB.get('sessions');
    const typeLabels = { reading:'📖 قراءة', expression:'🗣️ تعبير', writing:'✍️ كتابة', sport:'🏃 رياضي', art:'🎨 فني', science:'🔬 علمي', other:'📌 أخرى' };
    if (!sessions.length) { setHtml('sessionsBody', '<tr><td colspan="5" class="td-center" style="padding:20px;color:var(--text-3)">لا توجد حصص مسجلة</td></tr>'); return; }
    setHtml('sessionsBody', sessions.map((s, i) => `<tr>
      <td><span class="badge badge-purple">${typeLabels[s.type]||s.type}</span></td>
      <td>${s.date}</td>
      <td><strong>${s.title}</strong></td>
      <td style="font-size:12px;color:var(--text-2);max-width:200px">${s.notes||'—'}</td>
      <td class="no-print"><button class="btn btn-xs btn-danger" onclick="DB.delSession(${i})">✕</button></td>
    </tr>`).join(''));
  },

  // ─── REPORTS ─────────────────────────────
  async renderReports(filter = '') {
    const pupils = PupilMgr.getPupilNames().filter(p => !filter || p.includes(filter));
    if (!pupils.length) { setHtml('reportsContainer', '<div class="empty-state"><div class="empty-icon">📑</div><p>لا توجد نتائج</p></div>'); return; }
    
    const cards = await Promise.all(pupils.map(async (p) => {
      const r = await Engine.calculatePI(p, State.level);
      const piColor = r.pi >= 7 ? 'var(--success)' : r.pi >= 5 ? 'var(--warning)' : 'var(--danger)';
      const warn = await Engine.checkEarlyWarning(p);
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="UI.openProfile('${p}')">
        <div>
          <div style="font-weight:900;font-size:13.5px">${p}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:3px">XP: ${r.xp.toFixed(0)} · Lv ${r.lvl} · غياب: ${r.raw.absCount}</div>
          ${warn ? '<span class="badge badge-red" style="margin-top:6px">⚠ إنذار مبكر</span>' : ''}
        </div>
        <div style="text-align:center">
          <div style="font-size:28px;font-weight:900;color:${piColor};font-family:Cairo">${r.pi.toFixed(1)}</div>
          <div style="font-size:9.5px;color:var(--text-3)">مؤشر PI</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();UI.printStudentReport('${p}')">🖨️</button>
      </div>`;
    }));
    setHtml('reportsContainer', `<div style="display:flex;flex-direction:column;gap:10px">${cards.join('')}</div>`);
  },

  // ─── PROFILE MODAL ─────────────────────────────
  async openProfile(name) {
    State.currentProfile = name;
    this.switchProfileTab('overview');
    const perf = await Engine.calculatePI(name, State.level);
    
    setTxt('pro-name', name);
    setTxt('pro-level', 'المستوى ' + State.level);
    setTxt('pro-pi-val', perf.pi.toFixed(2));
    setColor('pro-pi-val', perf.pi >= 7 ? 'var(--success)' : perf.pi >= 5 ? 'var(--warning)' : 'var(--danger)');
    setTxt('pro-pi-cat', perf.pi >= 7 ? 'متحكم ✅' : perf.pi >= 5 ? 'متوسط 🟡' : 'يحتاج دعم 🔴');
    setTxt('pro-avg', perf.raw.gAvg.toFixed(2));
    setTxt('pro-abs', perf.raw.absCount);
    setTxt('pro-trend', perf.pi >= 7 ? '⬆ تحسن' : perf.pi >= 5 ? '→ مستقر' : '⬇ تراجع');
    
    const strengths = [], weaknesses = [];
    if (perf.raw.fluAvg >= 7) strengths.push('طلاقة قرائية ممتازة.');
    else if (perf.raw.fluAvg < 5) weaknesses.push('يحتاج تدريباً مكثفاً على الطلاقة.');
    if (perf.raw.totalStars >= 4) strengths.push('مواظبة ممتازة (حصد النجوم).');
    if (perf.raw.absCount >= 3) weaknesses.push(`كثرة الغياب (${perf.raw.absCount} أيام).`);
    if (perf.raw.gAvg >= 7) strengths.push('معدل فروض ممتاز.');
    else if (perf.raw.gAvg < 5) weaknesses.push('معدل الفروض ضعيف — يحتاج تدخلاً.');
    if (perf.raw.hwMisses <= 1) strengths.push('التزام بالواجبات المنزلية.');
    else if (perf.raw.hwMisses >= 3) weaknesses.push(`تقصير في الواجبات (${perf.raw.hwMisses} مرات).`);
    if (strengths.length === 0) strengths.push('لا توجد بيانات كافية لتحديد نقاط القوة.');
    if (weaknesses.length === 0) weaknesses.push('لا توجد ملاحظات سلبية مسجلة حالياً. 🌟');
    
    setHtml('pro-strengths', strengths.map(s => `<li>${s}</li>`).join(''));
    setHtml('pro-weaknesses', weaknesses.map(w => `<li>${w}</li>`).join(''));
    
    // Fluency chart
    const fluHistory = [];
    for (let w = 1; w <= 5; w++) {
      const fd = await DB.getFluency('4', w);
      let pt = 0;
      if (fd[name]) { if (fd[name].accuracy === 'yes') pt += 5; if (fd[name].flow === 'yes') pt += 5; }
      fluHistory.push(pt);
    }
    const proCanvas = document.getElementById('proChart');
    if (proCanvas) {
      if (State.charts.pro) State.charts.pro.destroy();
      State.charts.pro = new Chart(proCanvas, {
        type: 'bar',
        data: { labels: ['أ.1','أ.2','أ.3','أ.4','أ.5'], datasets: [{ label: 'نقطة الطلاقة', data: fluHistory, backgroundColor: '#818cf8', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { max: 10, min: 0 } }, plugins: { legend: { display: false } } }
      });
    }
    
    // Evolution tab data
    const allGrades = await DB.get('grades');
    const arabicG = (allGrades.arabic || {})[name] || {};
    const evoData = ['t1','t2','t3','t4'].map(k => arabicG[k] !== undefined ? parseFloat(arabicG[k]) : null).filter(v => v !== null);
    const evoCanvas = document.getElementById('proEvolutionChart');
    if (evoCanvas) {
      if (State.charts.proEvo) State.charts.proEvo.destroy();
      State.charts.proEvo = new Chart(evoCanvas, {
        type: 'line',
        data: {
          labels: ['الفرض 1','الفرض 2','الفرض 3','الفرض 4'].slice(0, evoData.length),
          datasets: [{ label: 'اللغة العربية', data: evoData, borderColor: '#6366f1', tension: 0.3, fill: true, backgroundColor: 'rgba(99,102,241,.1)', pointRadius: 5, pointBackgroundColor: '#6366f1' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 10 } } }
      });
    }
    const evoSummary = evoData.length >= 2 ? (evoData[evoData.length-1] > evoData[0] ? `⬆ تطور إيجابي: من ${evoData[0]} إلى ${evoData[evoData.length-1]}` : evoData[evoData.length-1] < evoData[0] ? `⬇ تراجع: من ${evoData[0]} إلى ${evoData[evoData.length-1]}` : '→ أداء مستقر') : 'لا توجد بيانات كافية للمقارنة';
    setHtml('pro-evolution-summary', `<p>${evoSummary}</p>`);
    
    // Remediation history
    const rem = (await DB.get('remediation')).filter(r => r.student === name);
    setHtml('pro-rem-history', rem.length ? rem.map(r => `
      <div style="background:var(--surface-2);padding:12px;border-radius:var(--r-md);border-right:4px solid var(--brand-600)">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <strong style="font-size:12px">الصعوبة: ${r.type}</strong>
          <span style="font-size:10px;font-weight:900;color:${r.status==='resolved'?'var(--success)':r.status==='improving'?'var(--warning)':'var(--danger)'}">${r.status==='resolved'?'🟢 تجاوز':r.status==='improving'?'🟡 يتحسن':'🔴 نشط'}</span>
        </div>
        <div style="font-size:11px"><strong>الخطة:</strong> ${r.plan||'—'}</div>
        <div style="font-size:11px"><strong>الإجراء:</strong> ${r.actions||'لم يسجل'}</div>
        <div style="font-size:10px;color:var(--text-3);margin-top:6px">${r.date}</div>
      </div>`).join('') : '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">لا توجد تدخلات مسجلة</div>');
    
    // Notes tab
    const notes = (await DB.get('notes')).filter(n => n.student === name);
    setHtml('pro-notes-list', notes.length ? notes.map(n => `
      <div class="note-item ${n.type}">
        <div class="note-meta"><span>${n.type}</span><span>${n.date}</span></div>
        <div class="note-text">${n.text}</div>
      </div>`).join('') : '<div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">لا توجد ملاحظات</div>');
    
    document.getElementById('profileModal').classList.add('active');
    // Render gamification badges for this student
    BadgeMgr.render(name);
  },
  
  switchProfileTab(tabId) {
    document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ptab-content').forEach(c => c.classList.remove('active'));
    const tabNames = ['overview','evolution','rem','notes_tab','timeline'];
    const btn = document.querySelectorAll('.ptab-btn')[tabNames.indexOf(tabId)];
    if (btn) btn.classList.add('active');
    const tab = document.getElementById('ptab-' + tabId);
    if (tab) tab.classList.add('active');
    // Lazy-load timeline when tab is activated
    if (tabId === 'timeline' && State.currentProfile) {
      TimelineMgr.render(State.currentProfile);
    }
  },

  sendWhatsAppReport() {
    const name = State.currentProfile; if (!name) return;
    Engine.calculatePI(name, State.level).then(r => {
      const msg = `السلام عليكم ورحمة الله وبركاته،\nأحيطكم علماً بالوضعية التربوية للمتعلم(ة) *${name}*:\n\n📊 مؤشر الأداء العام: ${r.pi.toFixed(1)}/10\n📅 أيام الغياب: ${r.raw.absCount}\n📚 معدل الفروض: ${r.raw.gAvg.toFixed(2)}/10\n📝 الواجبات المنزلية: ${r.raw.hwMisses===0?'التزام ممتاز':r.raw.hwMisses<=2?'التزام متوسط':'تقصير متكرر'}\n\nنقدر تعاونكم لضمان مسار دراسي موفق.\nمع التحيات: ذ. عبد الحق جعايط`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    });
  },

  async printStudentReport(name) {
    const n = name || State.currentProfile; if (!n) return;
    const r = await Engine.calculatePI(n, State.level);
    const content = `
      <div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #4f46e5">
        <h1 style="font-size:22px;font-weight:900;color:#312e81;font-family:Cairo">بطاقة أداء المتعلم</h1>
        <div style="font-size:12px;color:#64748b;margin-top:6px">الأستاذ: ذ. عبد الحق جعايط | الموسم: ${State.year} | المستوى: ${State.level}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div style="background:#eef2ff;padding:16px;border-radius:10px">
          <div style="font-size:16px;font-weight:900;margin-bottom:8px">${n}</div>
          <div>مؤشر الأداء: <strong style="color:#4f46e5;font-size:20px">${r.pi.toFixed(2)}/10</strong></div>
          <div>معدل الفروض: <strong>${r.raw.gAvg.toFixed(2)}/10</strong></div>
          <div>أيام الغياب: <strong>${r.raw.absCount}</strong></div>
          <div>الواجبات المتروكة: <strong>${r.raw.hwMisses}</strong></div>
          <div>نقاط XP: <strong>${r.xp.toFixed(0)}</strong></div>
        </div>
        <div style="background:#f0fdf4;padding:16px;border-radius:10px">
          <div style="font-weight:900;margin-bottom:8px;color:#047857">التوجيهات التربوية:</div>
          <div style="font-size:12px;line-height:1.8;color:#065f46">
            ${r.pi >= 7 ? '• المتعلم في مستوى ممتاز. تشجيعه على الاستمرار.' : ''}
            ${r.pi >= 5 && r.pi < 7 ? '• المتعلم في مستوى متوسط. يحتاج متابعة دورية.' : ''}
            ${r.pi < 5 ? '• المتعلم يحتاج تدخلاً تربوياً عاجلاً.' : ''}
            ${r.raw.absCount >= 3 ? `<br>• تنبيه: ${r.raw.absCount} غيابات — التواصل مع الأسرة ضروري.` : ''}
            ${r.raw.hwMisses >= 3 ? `<br>• تقصير في الواجبات (${r.raw.hwMisses} مرات).` : ''}
            ${r.raw.fluAvg < 5 ? '<br>• ضعف في الطلاقة القرائية — دعم قرائي مكثف.' : ''}
          </div>
        </div>
      </div>`;
    const modal = document.getElementById('studentReportModal');
    setHtml('studentReportContent', content);
    modal.classList.add('active');
  },

  // ─── GROUPS ─────────────────────────────
  async generateGroups() {
    const num = parseInt(getVal('group-count'));
    if (num < 2 || num > 8 || isNaN(num)) return;
    const crit = getVal('group-criteria');
    const sorted = [];
    for (const p of PupilMgr.getPupilNames()) {
      const r = await Engine.calculatePI(p, State.level);
      let score = crit === 'fluency' ? r.raw.fluAvg : crit === 'discipline' ? (10 - r.raw.absCount - r.raw.hwMisses * 0.5) : r.pi;
      sorted.push({ name: p, score });
    }
    sorted.sort((a, b) => b.score - a.score);
    const groups = Array.from({ length: num }, () => []);
    let dir = 1, idx = 0;
    for (const s of sorted) {
      groups[idx].push(s); idx += dir;
      if (idx >= num || idx < 0) { dir *= -1; idx += dir; }
    }
    setHtml('groupsOutput', groups.map((g, i) => `
      <div class="group-card">
        <div class="group-header">المجموعة ${i+1}</div>
        ${g.map((m, j) => `<div class="group-member"><span>${m.name}</span><span class="g-role">${j===0?'مُسير 🌟':j===g.length-1?'مُستفيد 🎯':'عضو'}</span></div>`).join('')}
      </div>`).join(''));
    this.toast('تم تشكيل المجموعات', 'success');
  },

  // ─── SETTINGS ─────────────────────────────
  async renderSettingsPupils() {
    const list = PupilMgr.getPupils();
    setHtml('dynamic-pupils-list', list.length ? list.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);padding:7px 11px;border-radius:var(--r-sm);border:1px solid var(--border)">
        <span style="font-size:12.5px">${p.name}</span>
        <div style="display:flex;gap:5px">
          <button class="btn btn-xs btn-ghost" onclick="PupilMgr.editPupilName('${p.id}','${p.name.replace(/'/g,'\\'+'').replace(/"/g,'&quot;')}')">✏️</button>
          <button class="btn btn-xs btn-danger" onclick="PupilMgr.removePupil('${p.id}')">✕</button>
        </div>
      </div>`).join('') : '<div class="empty-state"><div class="empty-icon">👤</div><p>لا يوجد متعلمون في هذا المستوى</p></div>');
    
    // Storage info
    try {
      const keys = await Store.keys();
      setTxt('storage-info', `${keys.length} سجل محفوظ`);
    } catch {}
  },
  showPasteImport() { document.getElementById('pasteImportModal').classList.add('active'); },

  // ─── EXAM ANALYSIS ─────────────────────────────
  openExamAnalysis() {
    const opts = PupilMgr.getPupilNames().map(p => `<option value="${p}">${p}</option>`).join('');
    setHtml('ea-student', opts);
    document.getElementById('examAnalysisModal').classList.add('active');
    this.loadExamAnalysis();
  },
  async loadExamAnalysis() {
    const subj = getVal('ea-subject'), exam = getVal('ea-exam');
    const details = (await DB.get('exam_details'))[subj]?.[exam] || {};
    const qStats = [0,0,0,0,0], qCounts = [0,0,0,0,0];
    PupilMgr.getPupilNames().forEach(p => {
      if (details[p]) details[p].forEach((val, i) => { if (!isNaN(val)) { qStats[i] += val; qCounts[i]++; } });
    });
    const percentages = qStats.map((sum, i) => qCounts[i] > 0 ? Math.round((sum / (qCounts[i] * 2)) * 100) : 0);
    const maxP = Math.max(...percentages), minP = Math.min(...percentages.filter(x => x > 0).length ? percentages.filter(x => x > 0) : [0]);
    setTxt('ea-easiest', maxP > 0 ? `السؤال ${percentages.indexOf(maxP)+1} (${maxP}%)` : '—');
    setTxt('ea-hardest', minP > 0 ? `السؤال ${percentages.indexOf(minP)+1} (${minP}%)` : '—');
    const canvas = document.getElementById('examAnalysisChart');
    if (canvas) {
      if (State.charts.exam) State.charts.exam.destroy();
      State.charts.exam = new Chart(canvas, {
        type: 'bar',
        data: { labels: ['س1','س2','س3','س4','س5'], datasets: [{ label: 'نسبة النجاح %', data: percentages, backgroundColor: '#818cf8', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { max: 100, min: 0 } }, plugins: { legend: { display: false } } }
      });
    }
  },

  // ─── WHEEL ─────────────────────────────
  spinWheel() {
    if (State.isSp) return; State.isSp = true;
    let v = Math.random() * 0.2 + 0.3, a = State.wA || 0;
    const anim = () => {
      a += v; v *= 0.985; this.drawWheel(a);
      if (v > 0.002) requestAnimationFrame(anim);
      else {
        State.isSp = false; State.wA = a;
        const arc = Math.PI * 2 / State.wheelList.length;
        const pA = (3 * Math.PI / 2 - a % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2);
        const idx = Math.floor(pA / arc);
        const w = State.wheelList[idx];
        setTxt('wheelWinner', `🎉 ${w} 🎉`);
        setTimeout(() => { State.wheelList.splice(idx, 1); this.drawWheel(a); }, 1500);
      }
    };
    anim();
  },
  drawWheel(ang = 0) {
    const c = document.getElementById('wheelCanvas'); if (!c) return;
    const ctx = c.getContext('2d'), cx = c.width / 2, r = cx - 5;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!State.wheelList.length) { ctx.fillStyle = 'var(--border)'; ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.fill(); return; }
    const arc = Math.PI * 2 / State.wheelList.length;
    const cols = ['#4f46e5','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316'];
    State.wheelList.forEach((n, i) => {
      const a = ang + i * arc;
      ctx.beginPath(); ctx.moveTo(cx, cx); ctx.arc(cx, cx, r, a, a + arc); ctx.fillStyle = cols[i % cols.length]; ctx.fill();
      ctx.save(); ctx.translate(cx, cx); ctx.rotate(a + arc / 2); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Cairo'; ctx.fillText(n.split(' ').slice(0, 2).join(' '), r - 12, 5); ctx.restore();
    });
  },
  resetWheel() { State.wheelList = [...PupilMgr.getPupilNames()]; setTxt('wheelWinner', ''); this.drawWheel(); },

  // ─── TIMER ─────────────────────────────
  startTimer(sec) {
    clearInterval(State.timerInt); let t = sec;
    const el = document.getElementById('timerDisplay'); if (!el) return;
    State.timerInt = setInterval(() => {
      const m = Math.floor(t / 60), s = t % 60;
      setTxt('timerDisplay', `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`);
      el.className = t <= 10 ? 'urgent' : '';
      if (t <= 0) { clearInterval(State.timerInt); setTxt('timerDisplay', 'انتهى!'); }
      t--;
    }, 1000);
  },
  stopTimer() { clearInterval(State.timerInt); setTxt('timerDisplay', '00:00'); const el = document.getElementById('timerDisplay'); if (el) el.className = ''; },

  // ─── REPORT EDITOR ─────────────────────────────
  async renderReportEditor() {
    setVal('rpt-date', State.today);
    const reports = await DB.get('reports');
    if (!reports.length) { setHtml('savedReportsBody', '<tr><td colspan="5" class="td-center" style="padding:20px;color:var(--text-3)">لا توجد تقارير محفوظة</td></tr>'); return; }
    const typeLabels = { incident:'🚨 حادثة', violence:'⚠️ سلوك عنيف', 'case-study':'🔍 دراسة حالة', absence:'📅 غياب', progress:'📈 متابعة', meeting:'👨‍👩 لقاء ولي الأمر' };
    setHtml('savedReportsBody', reports.map((r, i) => `<tr>
      <td><strong>${r.title}</strong></td>
      <td>${r.student || '—'}</td>
      <td>${r.date || '—'}</td>
      <td><span class="badge badge-purple">${typeLabels[r.type] || r.type}</span></td>
      <td class="no-print" style="white-space:nowrap">
        <button class="btn btn-xs btn-ghost" onclick="UI.loadSavedReport(${i})">📂 فتح</button>
        <button class="btn btn-xs btn-success" onclick="UI.printSavedReport(${i})">🖨️</button>
        <button class="btn btn-xs btn-danger" onclick="DB.deleteReport(${i})">✕</button>
      </td></tr>`).join(''));
  },
  loadReportTemplate(type) {
    const student = getVal('rpt-student');
    const date = getVal('rpt-date') || State.today;
    const teacher = document.getElementById('sb-teacher')?.textContent || 'ذ. عبد الحق جعايط';
    const school = document.getElementById('print-school')?.textContent || 'م/م المصامدة';
    const titles = { incident:'تقرير حادثة مدرسية', violence:'تقرير سلوك عنيف', 'case-study':'دراسة حالة تربوية', absence:'تقرير متابعة الغياب', progress:'تقرير المتابعة التربوية', meeting:'تقرير لقاء ولي الأمر' };
    setVal('rpt-title', titles[type] || '');
    const templates = {
      incident: `<p><strong>اسم المتعلم(ة):</strong> ${student}</p><p><strong>تاريخ الحادثة:</strong> ${date}</p><p><strong>مكان الحادثة:</strong> ...</p><p><strong>وصف الحادثة:</strong></p><p>...</p><p><strong>الأطراف المعنية:</strong></p><p>...</p><p><strong>الإجراءات المتخذة:</strong></p><p>...</p><p><strong>توصيات:</strong></p><p>...</p><p><strong>الأستاذ(ة): ${teacher}</strong></p>`,
      violence: `<p><strong>اسم المتعلم(ة):</strong> ${student}</p><p><strong>تاريخ الواقعة:</strong> ${date}</p><p><strong>نوع السلوك العنيف:</strong> (لفظي / جسدي / رمزي)</p><p><strong>وصف السلوك:</strong></p><p>...</p><p><strong>الضحية / المتضرر:</strong></p><p>...</p><p><strong>السياق والملابسات:</strong></p><p>...</p><p><strong>التدخل الفوري:</strong></p><p>...</p><p><strong>التواصل مع الأسرة:</strong></p><p>...</p><p><strong>الإجراءات المتبعة:</strong></p><p>...</p><p><strong>الأستاذ(ة): ${teacher}</strong></p>`,
      'case-study': `<p><strong>الاسم:</strong> ${student}&nbsp;&nbsp;<strong>المستوى:</strong> ${State.level}&nbsp;&nbsp;<strong>الموسم:</strong> ${State.year}</p><hr/><p><strong>1. المعطيات الشخصية والأسرية:</strong></p><p>...</p><p><strong>2. الوضعية الأكاديمية:</strong></p><p>...</p><p><strong>3. الصعوبات المُلاحظة:</strong></p><p>...</p><p><strong>4. نقاط القوة والموارد:</strong></p><p>...</p><p><strong>5. التدخلات المنجزة:</strong></p><p>...</p><p><strong>6. نتائج التدخلات:</strong></p><p>...</p><p><strong>7. التوصيات والخطوات القادمة:</strong></p><p>...</p><p><strong>الأستاذ(ة): ${teacher}</strong>&nbsp;&nbsp;<strong>التاريخ: ${date}</strong></p>`,
      absence: `<p><strong>اسم المتعلم(ة):</strong> ${student}</p><p><strong>الفترة:</strong> من: .......... إلى: ..........</p><p><strong>عدد أيام الغياب:</strong> .....</p><p><strong>أسباب الغياب المُصرَّح بها:</strong></p><p>...</p><p><strong>التواصل مع الأسرة:</strong></p><p>...</p><p><strong>تأثير الغياب على الأداء الدراسي:</strong></p><p>...</p><p><strong>الإجراءات المتخذة:</strong></p><p>...</p><p><strong>الأستاذ(ة): ${teacher}</strong></p>`,
      progress: `<p><strong>اسم المتعلم(ة):</strong> ${student}&nbsp;&nbsp;<strong>التاريخ:</strong> ${date}</p><p><strong>مجال المتابعة:</strong> ...</p><p><strong>الوضع الراهن:</strong></p><p>...</p><p><strong>التطور المُلاحَظ:</strong></p><p>...</p><p><strong>الأنشطة والتدخلات المُنجزة:</strong></p><p>...</p><p><strong>الصعوبات المتبقية:</strong></p><p>...</p><p><strong>الخطوات القادمة:</strong></p><p>...</p><p><strong>الأستاذ(ة): ${teacher}</strong></p>`,
      meeting: `<p><strong>اسم المتعلم(ة):</strong> ${student}</p><p><strong>اسم ولي الأمر:</strong> ...</p><p><strong>صفة ولي الأمر:</strong> (أب / أم / وصي)</p><p><strong>تاريخ اللقاء:</strong> ${date}</p><p><strong>مكان اللقاء:</strong> ...</p><p><strong>موضوع اللقاء:</strong></p><p>...</p><p><strong>ملخص النقاشات:</strong></p><p>...</p><p><strong>القرارات والتوصيات:</strong></p><p>...</p><p><strong>توقيع ولي الأمر:</strong> .................&nbsp;&nbsp;<strong>توقيع الأستاذ(ة):</strong> .................</p>`
    };
    document.getElementById('rpt-body').innerHTML = templates[type] || '';
    document.getElementById('rpt-body').dataset.type = type;
    UI.toast(`تم تحميل قالب: ${titles[type]}`, 'success');
  },
  async saveReport() {
    const title = getVal('rpt-title');
    const student = getVal('rpt-student');
    const date = getVal('rpt-date') || State.today;
    const body = document.getElementById('rpt-body')?.innerHTML || '';
    const type = document.getElementById('rpt-body')?.dataset.type || 'other';
    if (!title.trim()) { UI.toast('أدخل عنوان التقرير', 'error'); return; }
    const reports = await DB.get('reports');
    reports.unshift({ id: uuid(), title, student, date, body, type });
    await DB.set('reports', reports);
    UI.renderReportEditor();
    UI.toast('تم حفظ التقرير', 'success');
  },
  async loadSavedReport(i) {
    const reports = await DB.get('reports');
    const r = reports[i]; if (!r) return;
    setVal('rpt-title', r.title);
    setVal('rpt-student', r.student);
    setVal('rpt-date', r.date);
    document.getElementById('rpt-body').innerHTML = r.body;
    document.getElementById('rpt-body').dataset.type = r.type;
    UI.toast('تم فتح التقرير', 'info');
  },
  async printReport() {
    const title = getVal('rpt-title') || 'تقرير تربوي';
    const body = document.getElementById('rpt-body')?.innerHTML || '';
    const student = getVal('rpt-student');
    const date = getVal('rpt-date') || State.today;
    await this._doPrintReport(title, student, date, body);
  },
  async printSavedReport(i) {
    const reports = await DB.get('reports');
    const r = reports[i]; if (!r) return;
    await this._doPrintReport(r.title, r.student, r.date, r.body);
  },
  async _doPrintReport(title, student, date, body) {
    const teacher = await Store.get('setting_teacher', 'ذ. عبد الحق جعايط');
    const school = await Store.get('setting_school', 'م/م المصامدة');
    const zone = document.getElementById('reportPrintZone');
    zone.innerHTML = buildPrintHeader(title, teacher, school, State.year, State.level) + `<div style="margin-top:16px;font-size:13px;line-height:2;direction:rtl">${body}</div>`;
    document.body.className = 'print-report-editor'; window.print(); document.body.className = '';
  },

  _updateChart(key, id, config) {
    const canvas = document.getElementById(id); if (!canvas) return;
    if (State.charts[key]) State.charts[key].destroy();
    State.charts[key] = new Chart(canvas, config);
  }
};

// ══════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
function setTxt(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function setHtml(id, v) { const el = document.getElementById(id); if (el) el.innerHTML = v; }
function setColor(id, v) { const el = document.getElementById(id); if (el) el.style.color = v; }

// ══════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
//  GRADES CALCULATOR — حسابات المعدلات الصحيحة
// ══════════════════════════════════════════════════════════
const GradeCalc = {
  getLabel(avg) {
    if (avg === null || isNaN(avg)) return '—';
    if (avg >= 9)  return 'ممتاز';
    if (avg >= 8)  return 'جيد';
    if (avg >= 7)  return 'مقبول';
    if (avg >= 5)  return 'يحتاج دعم';
    return 'يحتاج دعم مكثف';
  },
  getLabelClass(avg) {
    if (avg === null || isNaN(avg)) return '';
    if (avg >= 9) return 'badge-green';
    if (avg >= 8) return 'badge-green';
    if (avg >= 7) return 'badge-orange';
    if (avg >= 5) return 'badge-orange';
    return 'badge-red';
  },
  // حساب معدل مادة واحدة (فرضان)
  subjectAvg(g, cols) {
    const vals = cols.map(c => parseFloat(g[c])).filter(v => !isNaN(v));
    return vals.length > 0 ? vals.reduce((a,b) => a+b, 0) / vals.length : null;
  },
  // حساب معدل الاجتماعيات من 3 مكونات (كل مكون له فرضان)
  socialAvg(g) {
    const hist  = this.subjectAvg(g, ['h1','h2']);
    const geo   = this.subjectAvg(g, ['g1','g2']);
    const civic = this.subjectAvg(g, ['c1','c2']);
    const parts = [hist, geo, civic].filter(v => v !== null);
    return parts.length > 0 ? parts.reduce((a,b)=>a+b,0) / parts.length : null;
  },
  // المعدل العام للتلميذ
  async generalAvg(name, level, year) {
    const allG = await DB.get('grades');
    const arabic  = this.subjectAvg((allG.arabic  ||{})[name]||{}, ['t1','t2']);
    const islamic = this.subjectAvg((allG.islamic ||{})[name]||{}, ['t1','t2']);
    const art     = this.subjectAvg((allG.art     ||{})[name]||{}, ['t1','t2']);
    const pe      = this.subjectAvg((allG.pe      ||{})[name]||{}, ['t1','t2']);
    // الاجتماعيات: كل مكون له مفتاح مستقل في grades.social[name] = {h1,h2,g1,g2,c1,c2}
    const social  = this.socialAvg((allG.social   ||{})[name]||{});
    const avgs = [arabic, islamic, social, art, pe].filter(v => v !== null);
    return avgs.length > 0 ? avgs.reduce((a,b)=>a+b,0) / avgs.length : null;
  }
};

// ══════════════════════════════════════════════════════════
//  CLASS ANALYSIS — تحليل القسم الكامل
// ══════════════════════════════════════════════════════════
const ClassAnalysis = {
  _data: null,
  _chartInstance: null,

  async render() {
    await this._computeData();
    this._renderStats();
    this._renderSubjects();
    this._renderRanking();
    this._renderLevels();
    this._renderStruggling();
    // init student select for parent report
    ParentReport.initSelect();
  },

  async _computeData() {
    const pupils = PupilMgr.getPupilNames();
    const allG = await DB.get('grades');
    const rows = [];
    for (const name of pupils) {
      const arabicG  = (allG.arabic  ||{})[name]||{};
      const islamicG = (allG.islamic ||{})[name]||{};
      const socialG  = (allG.social  ||{})[name]||{};
      const artG     = (allG.art     ||{})[name]||{};
      const peG      = (allG.pe      ||{})[name]||{};

      const arabic_t1  = parseFloat(arabicG.t1);
      const arabic_t2  = parseFloat(arabicG.t2);
      const islamic_t1 = parseFloat(islamicG.t1);
      const islamic_t2 = parseFloat(islamicG.t2);
      const art_t1     = parseFloat(artG.t1);
      const art_t2     = parseFloat(artG.t2);
      const pe_t1      = parseFloat(peG.t1);
      const pe_t2      = parseFloat(peG.t2);

      const arabic_avg  = GradeCalc.subjectAvg(arabicG,  ['t1','t2']);
      const islamic_avg = GradeCalc.subjectAvg(islamicG, ['t1','t2']);
      const art_avg     = GradeCalc.subjectAvg(artG,     ['t1','t2']);
      const pe_avg      = GradeCalc.subjectAvg(peG,      ['t1','t2']);

      // الاجتماعيات
      const hist_t1  = parseFloat(socialG.h1), hist_t2  = parseFloat(socialG.h2);
      const geo_t1   = parseFloat(socialG.g1), geo_t2   = parseFloat(socialG.g2);
      const civic_t1 = parseFloat(socialG.c1), civic_t2 = parseFloat(socialG.c2);
      const hist_avg  = GradeCalc.subjectAvg(socialG, ['h1','h2']);
      const geo_avg   = GradeCalc.subjectAvg(socialG, ['g1','g2']);
      const civic_avg = GradeCalc.subjectAvg(socialG, ['c1','c2']);
      const social_avg = GradeCalc.socialAvg(socialG);

      const avgs = [arabic_avg, islamic_avg, social_avg, art_avg, pe_avg].filter(v => v!==null);
      const general = avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : null;

      rows.push({
        name, arabic_avg, arabic_t1, arabic_t2,
        islamic_avg, islamic_t1, islamic_t2,
        art_avg, art_t1, art_t2,
        pe_avg, pe_t1, pe_t2,
        hist_avg, hist_t1, hist_t2,
        geo_avg,  geo_t1,  geo_t2,
        civic_avg,civic_t1,civic_t2,
        social_avg, general
      });
    }
    rows.sort((a,b) => (b.general||0) - (a.general||0));
    this._data = rows;
  },

  _fmt(v) { return v !== null && !isNaN(v) ? v.toFixed(2) : '—'; },
  _fmtDiff(t1, t2) {
    if (isNaN(t1) || isNaN(t2)) return '<span style="color:var(--text-3)">—</span>';
    const d = t2 - t1;
    if (d > 0) return `<span style="color:var(--success)">↑ +${d.toFixed(2)}</span>`;
    if (d < 0) return `<span style="color:var(--danger)">↓ ${d.toFixed(2)}</span>`;
    return `<span style="color:var(--text-3)">= 0</span>`;
  },

  _renderStats() {
    const rows = this._data;
    if (!rows.length) { document.getElementById('ca-stats-boxes').innerHTML = '<div style="color:var(--text-3);padding:12px">لا توجد بيانات بعد.</div>'; return; }
    const total = rows.length;
    const withData = rows.filter(r => r.general !== null);
    const classAvg = withData.length ? withData.reduce((a,r)=>a+(r.general||0),0)/withData.length : 0;
    const excellent = withData.filter(r => r.general >= 9).length;
    const struggling = withData.filter(r => r.general < 5).length;
    const needSupport = withData.filter(r => r.general < 7).length;
    document.getElementById('ca-stats-boxes').innerHTML = `
      <div class="stat-box" style="--c:var(--brand-500)"><span class="stat-lbl">عدد التلاميذ</span><div class="stat-val">${total}</div></div>
      <div class="stat-box" style="--c:var(--success)"><span class="stat-lbl">متوسط القسم</span><div class="stat-val">${classAvg.toFixed(2)}</div></div>
      <div class="stat-box" style="--c:var(--warning)"><span class="stat-lbl">ممتازون</span><div class="stat-val">${excellent}</div></div>
      <div class="stat-box" style="--c:var(--danger)"><span class="stat-lbl">دعم مكثف</span><div class="stat-val critical">${struggling}</div></div>
      <div class="stat-box" style="--c:var(--info)"><span class="stat-lbl">يحتاجون دعم</span><div class="stat-val">${needSupport}</div></div>
      <div class="stat-box" style="--c:#8b5cf6"><span class="stat-lbl">تغطية البيانات</span><div class="stat-val">${withData.length}/${total}</div></div>
    `;
  },

  _renderSubjects() {
    const rows = this._data;
    const subjs = [
      { name:'اللغة العربية',    t1k:'arabic_t1',  t2k:'arabic_t2',  avgk:'arabic_avg' },
      { name:'التربية الإسلامية',name:'التربية الإسلامية', t1k:'islamic_t1', t2k:'islamic_t2', avgk:'islamic_avg' },
      { name:'الاجتماعيات',     t1k:'',           t2k:'',           avgk:'social_avg' },
      { name:'التربية الفنية',   t1k:'art_t1',     t2k:'art_t2',     avgk:'art_avg' },
      { name:'التربية البدنية',  t1k:'pe_t1',      t2k:'pe_t2',      avgk:'pe_avg' },
    ];
    const html = subjs.map(s => {
      const avgs  = rows.filter(r => r[s.avgk] !== null).map(r => r[s.avgk]);
      const t1s   = s.t1k ? rows.filter(r => !isNaN(r[s.t1k])).map(r => r[s.t1k]) : [];
      const t2s   = s.t2k ? rows.filter(r => !isNaN(r[s.t2k])).map(r => r[s.t2k]) : [];
      const avg   = avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : null;
      const avg1  = t1s.length ? t1s.reduce((a,b)=>a+b,0)/t1s.length : null;
      const avg2  = t2s.length ? t2s.reduce((a,b)=>a+b,0)/t2s.length : null;
      const label = avg !== null ? GradeCalc.getLabel(avg) : '—';
      const cls   = avg !== null ? GradeCalc.getLabelClass(avg) : '';
      const diff  = (avg1!==null && avg2!==null) ? this._fmtDiff(avg1,avg2) : '—';
      return `<tr>
        <td><strong>${s.name}</strong></td>
        <td class="td-center">${avg1 !== null ? avg1.toFixed(2) : '—'}</td>
        <td class="td-center">${avg2 !== null ? avg2.toFixed(2) : '—'}</td>
        <td class="td-center" style="font-weight:900">${avg !== null ? avg.toFixed(2) : '—'}</td>
        <td class="td-center">${diff}</td>
        <td class="td-center"><span class="badge ${cls}">${label}</span></td>
      </tr>`;
    });
    document.getElementById('ca-subjects-body').innerHTML = html.join('');
  },

  _renderRanking(filter='', levelFilter='') {
    const rows = this._data;
    const search = filter || document.getElementById('ca-search')?.value.toLowerCase() || '';
    const lf = levelFilter || document.getElementById('ca-filter-level')?.value || '';
    let html = '', rank = 0;
    rows.forEach(r => {
      if (search && !r.name.toLowerCase().includes(search)) return;
      const label = r.general !== null ? GradeCalc.getLabel(r.general) : '—';
      if (lf) {
        if (lf==='ممتاز' && r.general < 9) return;
        if (lf==='جيد' && (r.general < 8 || r.general >= 9)) return;
        if (lf==='مقبول' && (r.general < 7 || r.general >= 8)) return;
        if (lf==='دعم' && (r.general < 5 || r.general >= 7)) return;
        if (lf==='مكثف' && r.general >= 5) return;
      }
      rank++;
      const cls = GradeCalc.getLabelClass(r.general);
      const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
      html += `<tr>
        <td class="td-center"><strong>${medal||rank}</strong></td>
        <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${r.name}')">${r.name}</strong></td>
        <td class="td-center">${this._fmt(r.arabic_avg)}</td>
        <td class="td-center">${this._fmt(r.islamic_avg)}</td>
        <td class="td-center">${this._fmt(r.social_avg)}</td>
        <td class="td-center">${this._fmt(r.art_avg)}</td>
        <td class="td-center">${this._fmt(r.pe_avg)}</td>
        <td class="td-center" style="font-weight:900;font-size:14px">${this._fmt(r.general)}</td>
        <td class="td-center"><span class="badge ${cls}">${label}</span></td>
      </tr>`;
    });
    document.getElementById('ca-ranking-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:20px">لا توجد نتائج</td></tr>';
  },

  filterTable() { this._renderRanking(); },

  _renderLevels() {
    const rows = this._data.filter(r => r.general !== null);
    const levels = [
      { label:'ممتاز (9-10)',      color:'#10b981', check: r => r.general >= 9 },
      { label:'جيد (8-9)',         color:'#3b82f6', check: r => r.general >= 8 && r.general < 9 },
      { label:'مقبول (7-8)',       color:'#f59e0b', check: r => r.general >= 7 && r.general < 8 },
      { label:'يحتاج دعم (5-7)',   color:'#f97316', check: r => r.general >= 5 && r.general < 7 },
      { label:'دعم مكثف (&lt;5)', color:'#ef4444', check: r => r.general < 5 },
    ];
    const total = rows.length || 1;
    document.getElementById('ca-levels-body').innerHTML = levels.map(l => {
      const count = rows.filter(l.check).length;
      const pct = ((count/total)*100).toFixed(1);
      return `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${l.color};margin-left:6px"></span>${l.label}</td><td class="td-center"><strong>${count}</strong></td><td class="td-center">${pct}%</td></tr>`;
    }).join('');

    // Chart
    const ctx = document.getElementById('ca-chart-levels');
    if (ctx) {
      if (this._chartInstance) this._chartInstance.destroy();
      this._chartInstance = new Chart(ctx, {
        type:'doughnut',
        data:{
          labels: levels.map(l => l.label.replace('(&lt;5)','(<5)')),
          datasets:[{ data: levels.map(l => rows.filter(l.check).length), backgroundColor: levels.map(l=>l.color) }]
        },
        options:{ plugins:{ legend:{ position:'bottom', labels:{ font:{size:10} } } } }
      });
    }
  },

  _renderStruggling() {
    const rows = this._data;
    const subjMap = [
      { key:'arabic_avg',  name:'اللغة العربية' },
      { key:'islamic_avg', name:'التربية الإسلامية' },
      { key:'social_avg',  name:'الاجتماعيات' },
      { key:'art_avg',     name:'التربية الفنية' },
      { key:'pe_avg',      name:'التربية البدنية' },
    ];
    let html = '';
    rows.forEach(r => {
      subjMap.forEach(s => {
        const avg = r[s.key];
        if (avg !== null && avg < 7) {
          const type = avg < 5 ? 'يحتاج دعم مكثف' : 'يحتاج دعم';
          const cls  = avg < 5 ? 'badge-red' : 'badge-orange';
          html += `<tr>
            <td><strong style="cursor:pointer;color:var(--brand-600)" onclick="UI.openProfile('${r.name}')">${r.name}</strong></td>
            <td class="td-center">${s.name}</td>
            <td class="td-center" style="font-weight:900;color:${avg<5?'var(--danger)':'var(--warning)'}">${avg.toFixed(2)}</td>
            <td class="td-center"><span class="badge ${cls}">${type}</span></td>
          </tr>`;
        }
      });
    });
    document.getElementById('ca-struggling-body').innerHTML = html || '<tr><td colspan="4" style="text-align:center;color:var(--success);padding:16px">✅ لا يوجد تلاميذ متعثرون</td></tr>';
  },

  async exportCSV() {
    if (!this._data) await this._computeData();
    const rows = this._data;
    const header = ['الاسم','عربية','إسلامية','اجتماعيات','فنية','بدنية','المعدل العام','المستوى'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      lines.push([r.name, this._fmt(r.arabic_avg), this._fmt(r.islamic_avg), this._fmt(r.social_avg), this._fmt(r.art_avg), this._fmt(r.pe_avg), this._fmt(r.general), GradeCalc.getLabel(r.general)].join(','));
    });
    const bom = '\uFEFF'; const blob = new Blob([bom + lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`تحليل_القسم_${State.year}_L${State.level}.csv`; a.click();
  },

  async exportExcel() {
    if (!this._data) await this._computeData();
    const wb = XLSX.utils.book_new();
    // ورقة الترتيب العام
    const ws1Data = [
      ['الاسم','عربية ف1','عربية ف2','معدل عربية','إسلامية ف1','إسلامية ف2','معدل إسلامية','تاريخ ف1','تاريخ ف2','جغرافيا ف1','جغرافيا ف2','مدنية ف1','مدنية ف2','معدل اجتماعيات','فنية ف1','فنية ف2','معدل فنية','بدنية ف1','بدنية ف2','معدل بدنية','المعدل العام','المستوى'],
      ...this._data.map(r => [r.name, r.arabic_t1||'', r.arabic_t2||'', this._fmt(r.arabic_avg), r.islamic_t1||'', r.islamic_t2||'', this._fmt(r.islamic_avg), r.hist_t1||'', r.hist_t2||'', r.geo_t1||'', r.geo_t2||'', r.civic_t1||'', r.civic_t2||'', this._fmt(r.social_avg), r.art_t1||'', r.art_t2||'', this._fmt(r.art_avg), r.pe_t1||'', r.pe_t2||'', this._fmt(r.pe_avg), this._fmt(r.general), GradeCalc.getLabel(r.general)])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws1Data), 'نتائج القسم');
    XLSX.writeFile(wb, `تحليل_القسم_${State.year}_L${State.level}.xlsx`);
  },

  async print() {
    if (!this._data) await this._computeData();
    // Build chart images from existing canvases
    const levelsCanvas = document.getElementById('ca-chart-levels');
    const levelsImg = levelsCanvas ? levelsCanvas.toDataURL('image/png') : '';

    // Build a subjects bar chart as image
    let subjectsChartImg = '';
    const subjectsData = [];
    const grades = await DB.get('grades');
    const subjects = ['arabic','islamic','social','art','pe'];
    const sLabels = ['عربية','إسلامية','اجتماعيات','فنية','بدنية'];
    const sColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6'];
    const pupils = PupilMgr.getPupilNames();
    subjects.forEach(s => {
      const g = grades[s]||{}; let sum=0,cnt=0;
      pupils.forEach(p => { const pg=g[p]||{}; Object.values(pg).forEach(v => { if(!isNaN(parseFloat(v))){sum+=parseFloat(v);cnt++;}}); });
      subjectsData.push(cnt>0?(sum/cnt):0);
    });

    // Render off-screen canvas for subjects bar chart
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 500; offCanvas.height = 280;
    const tempChart = new Chart(offCanvas, {
      type:'bar',
      data:{ labels:sLabels, datasets:[{ data:subjectsData, backgroundColor:sColors, borderRadius:6 }] },
      options:{ responsive:false, animation:false, plugins:{ legend:{display:false} }, scales:{ y:{min:0,max:10} } }
    });
    await new Promise(r => setTimeout(r, 300));
    subjectsChartImg = offCanvas.toDataURL('image/png');
    tempChart.destroy();

    // Performance distribution pie
    const rows = this._data.filter(r => r.general !== null);
    const lvlCounts = [
      rows.filter(r=>r.general>=9).length,
      rows.filter(r=>r.general>=8&&r.general<9).length,
      rows.filter(r=>r.general>=7&&r.general<8).length,
      rows.filter(r=>r.general>=5&&r.general<7).length,
      rows.filter(r=>r.general<5).length
    ];
    const pieCanvas = document.createElement('canvas');
    pieCanvas.width = 320; pieCanvas.height = 280;
    const pieChart = new Chart(pieCanvas, {
      type:'pie',
      data:{
        labels:['ممتاز','جيد','مقبول','يحتاج دعم','دعم مكثف'],
        datasets:[{ data:lvlCounts, backgroundColor:['#10b981','#3b82f6','#f59e0b','#f97316','#ef4444'], borderWidth:2, borderColor:'#fff' }]
      },
      options:{ responsive:false, animation:false, plugins:{ legend:{ position:'bottom', labels:{font:{size:11}} } } }
    });
    await new Promise(r => setTimeout(r, 300));
    const pieImg = pieCanvas.toDataURL('image/png');
    pieChart.destroy();

    // Radar chart for subject comparison
    const radarCanvas = document.createElement('canvas');
    radarCanvas.width = 320; radarCanvas.height = 280;
    const radarChart = new Chart(radarCanvas, {
      type:'radar',
      data:{
        labels:sLabels,
        datasets:[{ label:'معدل القسم', data:subjectsData, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,.15)', pointBackgroundColor:'#6366f1', pointRadius:4 }]
      },
      options:{ responsive:false, animation:false, scales:{ r:{ min:0, max:10, ticks:{stepSize:2} } }, plugins:{ legend:{display:false} } }
    });
    await new Promise(r => setTimeout(r, 300));
    const radarImg = radarCanvas.toDataURL('image/png');
    radarChart.destroy();

    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>تحليل القسم</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&family=Tajawal:wght@400;700&display=swap" rel="stylesheet">
    <style>
      body{font-family:'Tajawal',sans-serif;padding:28px;color:#111;font-size:13px;direction:rtl}
      h1{font-family:'Cairo',sans-serif;color:#312e81;font-size:22px;text-align:center;margin-bottom:4px}
      h2{font-family:'Cairo',sans-serif;color:#4f46e5;font-size:15px;border-bottom:2px solid #4f46e5;padding-bottom:6px;margin:18px 0 10px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}
      th{background:#eef2ff;color:#3730a3;font-weight:900;padding:7px 10px;border:1px solid #c7d2fe;text-align:center}
      td{padding:6px 10px;border:1px solid #e5e7eb;text-align:center}
      tr:nth-child(even){background:#f9fafb}
      .charts-row{display:flex;gap:20px;margin:16px 0;align-items:flex-start;flex-wrap:wrap}
      .chart-box{flex:1;min-width:240px;text-align:center}
      .chart-box h3{font-size:12px;font-weight:900;color:#374151;margin-bottom:8px}
      .chart-box img{max-width:100%;border-radius:8px;border:1px solid #e5e7eb}
      .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
      .stat-box{background:#eef2ff;border-radius:8px;padding:12px;text-align:center;border:1px solid #c7d2fe}
      .stat-val{font-size:24px;font-weight:900;color:#4f46e5;font-family:Cairo,sans-serif}
      .stat-lbl{font-size:10px;color:#6b7280;font-weight:700;margin-top:2px}
      .badge-good{background:#d1fae5;color:#065f46;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:900}
      .badge-warn{background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:900}
      .badge-bad{background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:900}
      @media print{body{padding:14px} h2{page-break-after:avoid} table{page-break-inside:avoid}}
    
/* ─── JOURNAL IMPROVEMENTS ─── */
.journal-save-state{padding:6px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:11px;font-weight:900;color:var(--text-2)}
.journal-save-state.saving{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.35);color:#b45309}
.journal-save-state.saved{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.28);color:#047857}
.journal-day-head{cursor:pointer}
.journal-day-head .head-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.journal-day-toggle{width:32px;height:32px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-weight:900}
.journal-day-card.collapsed .journal-day-body,.journal-day-card.collapsed .journal-day-note{display:none}
.journal-day-note{padding:0 16px 14px}
.journal-day-note textarea{min-height:68px}
.journal-day-actions{display:flex;gap:8px;flex-wrap:wrap}
.journal-day-meta{font-size:11px;color:var(--text-3);font-weight:700}
.journal-session.compact .journal-grid textarea{min-height:64px}
.journal-session.compact .journal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.journal-session .danger-link{color:var(--danger);font-weight:900;cursor:pointer;background:none;border:none}
.journal-help-note{font-size:10.5px;color:var(--text-3);font-weight:700;margin-top:4px}
@media (max-width:900px){.journal-day-actions{width:100%}.journal-day-actions .btn-outline-mini{flex:1 1 auto}}

</style></head><body>
    <h1>📈 تحليل القسم الكامل</h1>
    <p style="text-align:center;color:#6b7280;font-size:12px;margin-bottom:18px">الموسم الدراسي: ${State.year} | المستوى: ${State.level} | ${new Date().toLocaleDateString('ar-MA')}</p>

    <!-- إحصائيات سريعة -->
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-val">${pupils.length}</div><div class="stat-lbl">عدد التلاميذ</div></div>
      <div class="stat-box"><div class="stat-val">${this._data.filter(r=>r.general>=9).length}</div><div class="stat-lbl">ممتاز (9+)</div></div>
      <div class="stat-box"><div class="stat-val">${this._data.filter(r=>r.general!==null&&r.general<5).length}</div><div class="stat-lbl">يحتاجون دعماً</div></div>
      <div class="stat-box"><div class="stat-val">${this._data.filter(r=>r.general!==null).length>0?((this._data.filter(r=>r.general!==null).reduce((s,r)=>s+(r.general||0),0)/this._data.filter(r=>r.general!==null).length).toFixed(2)):'—'}</div><div class="stat-lbl">معدل القسم</div></div>
    </div>

    <h2>📊 المخططات البيانية</h2>
    <div class="charts-row">
      ${subjectsChartImg ? `<div class="chart-box"><h3>📊 معدلات المواد (مخطط أعمدة)</h3><img src="${subjectsChartImg}"></div>` : ''}
      ${pieImg ? `<div class="chart-box"><h3>🥧 توزيع المستويات (مخطط دائري)</h3><img src="${pieImg}"></div>` : ''}
      ${radarImg ? `<div class="chart-box"><h3>🕸️ مقارنة المواد (مخطط راداري)</h3><img src="${radarImg}"></div>` : ''}
      ${levelsImg ? `<div class="chart-box"><h3>🍩 توزيع المتعلمين (حلقي)</h3><img src="${levelsImg}"></div>` : ''}
    </div>

    <h2>🏆 ترتيب التلاميذ حسب المعدل</h2>
    <table>
      <thead><tr><th>الرتبة</th><th style="text-align:right">الاسم</th><th>عربية</th><th>إسلامية</th><th>اجتماعيات</th><th>فنية</th><th>بدنية</th><th>المعدل</th><th>المستوى</th></tr></thead>
      <tbody>${this._data.map((r,i) => {
        const label = r.general!==null?GradeCalc.getLabel(r.general):'—';
        const badge = r.general>=9?`<span class="badge-good">${label}</span>`:r.general>=7?`<span class="badge-warn">${label}</span>`:`<span class="badge-bad">${label}</span>`;
        const m = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
        return `<tr><td>${m||i+1}</td><td style="text-align:right;font-weight:700">${r.name}</td><td>${r.arabic_avg!==null?r.arabic_avg.toFixed(2):'—'}</td><td>${r.islamic_avg!==null?r.islamic_avg.toFixed(2):'—'}</td><td>${r.social_avg!==null?r.social_avg.toFixed(2):'—'}</td><td>${r.art_avg!==null?r.art_avg.toFixed(2):'—'}</td><td>${r.pe_avg!==null?r.pe_avg.toFixed(2):'—'}</td><td style="font-weight:900">${r.general!==null?r.general.toFixed(2):'—'}</td><td>${badge}</td></tr>`;
      }).join('')}</tbody>
    </table>
    <script>window.onload=()=>{setTimeout(()=>window.print(),600)}<\/script>
    

</body></html>`);
    w.document.close();
  }
};

// ══════════════════════════════════════════════════════════
//  PARENT REPORT — تقرير ولي الأمر
// ══════════════════════════════════════════════════════════
const ParentReport = {
  initSelect() {
    const sel = document.getElementById('pr-student');
    if (!sel) return;
    const pupils = PupilMgr.getPupilNames();
    sel.innerHTML = pupils.map(p => `<option value="${p}">${p}</option>`).join('');
  },

  async render() {},

  async generate() {
    const name = document.getElementById('pr-student')?.value;
    if (!name) { UI.toast('اختر تلميذاً أولاً', 'warning'); return; }
    const teacherNote = document.getElementById('pr-teacher-note')?.value || '';
    const teacher = await Store.get('setting_teacher', 'الأستاذ');
    const school  = await Store.get('setting_school',  'المدرسة');

    const allG = await DB.get('grades');
    const arabicG  = (allG.arabic  ||{})[name]||{};
    const islamicG = (allG.islamic ||{})[name]||{};
    const socialG  = (allG.social  ||{})[name]||{};
    const artG     = (allG.art     ||{})[name]||{};
    const peG      = (allG.pe      ||{})[name]||{};

    const arabic_avg  = GradeCalc.subjectAvg(arabicG,  ['t1','t2']);
    const islamic_avg = GradeCalc.subjectAvg(islamicG, ['t1','t2']);
    const art_avg     = GradeCalc.subjectAvg(artG,     ['t1','t2']);
    const pe_avg      = GradeCalc.subjectAvg(peG,      ['t1','t2']);
    const hist_avg    = GradeCalc.subjectAvg(socialG,  ['h1','h2']);
    const geo_avg     = GradeCalc.subjectAvg(socialG,  ['g1','g2']);
    const civic_avg   = GradeCalc.subjectAvg(socialG,  ['c1','c2']);
    const social_avg  = GradeCalc.socialAvg(socialG);

    const avgs = [arabic_avg, islamic_avg, social_avg, art_avg, pe_avg].filter(v=>v!==null);
    const general = avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : null;

    const fmt = v => v!==null&&!isNaN(v) ? v.toFixed(2) : '—';
    const badge = v => {
      if (v===null||isNaN(v)) return '<span style="color:#999">—</span>';
      const col = v>=9?'#10b981':v>=8?'#3b82f6':v>=7?'#f59e0b':v>=5?'#f97316':'#ef4444';
      return `<span style="background:${col};color:#fff;padding:2px 8px;border-radius:99px;font-weight:700;font-size:12px">${GradeCalc.getLabel(v)}</span>`;
    };
    const fmtDiff = (t1,t2) => {
      if(isNaN(parseFloat(t1))||isNaN(parseFloat(t2))) return '—';
      const d=(parseFloat(t2)-parseFloat(t1));
      return d>0?`<span style="color:#10b981">↑ +${d.toFixed(2)}</span>`:d<0?`<span style="color:#ef4444">↓ ${d.toFixed(2)}</span>`:'<span style="color:#999">= 0</span>';
    };

    // تحديد المواد القوية والضعيفة
    const subjAvgsArr = [
      {name:'العربية',   avg:arabic_avg},
      {name:'الإسلامية', avg:islamic_avg},
      {name:'الاجتماعيات',avg:social_avg},
      {name:'الفنية',    avg:art_avg},
      {name:'البدنية',   avg:pe_avg},
    ].filter(s=>s.avg!==null);
    const strong = subjAvgsArr.filter(s=>s.avg>=7).map(s=>s.name).join('، ') || '—';
    const weak   = subjAvgsArr.filter(s=>s.avg<7).map(s=>s.name).join('، ')  || '—';

    const html = `
      <div id="pr-printable">
        <!-- رأس التقرير -->
        <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #4f46e5">
          <div style="font-size:20px;font-weight:900;color:#4f46e5;font-family:'Cairo',sans-serif">بطاقة نتائج المتعلم</div>
          <div style="font-size:12px;color:#666;margin-top:4px">${school} — الموسم الدراسي: ${State.year} — المستوى: ${State.level}</div>
          <div style="font-size:11px;color:#888">أستاذ القسم: ${teacher}</div>
        </div>

        <!-- معلومات التلميذ -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #e0e0e0">
          <tr style="background:#f3f4f6">
            <td style="padding:8px 12px;font-weight:700;width:50%">اسم المتعلم: <strong style="color:#4f46e5">${name}</strong></td>
            <td style="padding:8px 12px;font-weight:700">المعدل العام: <strong style="font-size:18px;color:${general>=7?'#10b981':general>=5?'#f59e0b':'#ef4444'}">${fmt(general)}/10</strong></td>
          </tr>
          <tr>
            <td style="padding:8px 12px">المستوى العام: ${badge(general)}</td>
            <td style="padding:8px 12px">المواد القوية: <span style="color:#10b981;font-weight:700">${strong}</span></td>
          </tr>
          <tr style="background:#fef9f0">
            <td colspan="2" style="padding:8px 12px">المواد التي تحتاج دعماً: <span style="color:#ef4444;font-weight:700">${weak}</span></td>
          </tr>
        </table>

        <!-- نتائج المواد -->
        <div style="font-size:13px;font-weight:900;margin-bottom:8px;color:#374151">📊 تفصيل النتائج</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px">
          <thead><tr style="background:#4f46e5;color:#fff">
            <th style="padding:8px;text-align:right">المادة</th>
            <th style="padding:8px;text-align:center">الفرض 1</th>
            <th style="padding:8px;text-align:center">الفرض 2</th>
            <th style="padding:8px;text-align:center">المعدل</th>
            <th style="padding:8px;text-align:center">التطور</th>
            <th style="padding:8px;text-align:center">المستوى</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 8px;font-weight:700">اللغة العربية</td>
              <td style="text-align:center;padding:7px">${arabicG.t1||'—'}</td>
              <td style="text-align:center;padding:7px">${arabicG.t2||'—'}</td>
              <td style="text-align:center;font-weight:900;padding:7px">${fmt(arabic_avg)}</td>
              <td style="text-align:center;padding:7px">${fmtDiff(arabicG.t1,arabicG.t2)}</td>
              <td style="text-align:center;padding:7px">${badge(arabic_avg)}</td>
            </tr>
            <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 8px;font-weight:700">التربية الإسلامية</td>
              <td style="text-align:center;padding:7px">${islamicG.t1||'—'}</td>
              <td style="text-align:center;padding:7px">${islamicG.t2||'—'}</td>
              <td style="text-align:center;font-weight:900;padding:7px">${fmt(islamic_avg)}</td>
              <td style="text-align:center;padding:7px">${fmtDiff(islamicG.t1,islamicG.t2)}</td>
              <td style="text-align:center;padding:7px">${badge(islamic_avg)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 8px;font-weight:700">الاجتماعيات (إجمالي)</td>
              <td colspan="2" style="text-align:center;font-size:10px;color:#6b7280;padding:7px">انظر التفصيل أدناه</td>
              <td style="text-align:center;font-weight:900;padding:7px">${fmt(social_avg)}</td>
              <td style="text-align:center;padding:7px">—</td>
              <td style="text-align:center;padding:7px">${badge(social_avg)}</td>
            </tr>
            <tr style="background:#fef9f0;border-bottom:1px solid #e5e7eb">
              <td style="padding:5px 8px 5px 24px;font-size:11px;color:#6b7280">— التاريخ</td>
              <td style="text-align:center;font-size:11px;padding:5px">${socialG.h1||'—'}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${socialG.h2||'—'}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${fmt(hist_avg)}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${fmtDiff(socialG.h1,socialG.h2)}</td>
              <td style="text-align:center;padding:5px">${badge(hist_avg)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:5px 8px 5px 24px;font-size:11px;color:#6b7280">— الجغرافيا</td>
              <td style="text-align:center;font-size:11px;padding:5px">${socialG.g1||'—'}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${socialG.g2||'—'}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${fmt(geo_avg)}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${fmtDiff(socialG.g1,socialG.g2)}</td>
              <td style="text-align:center;padding:5px">${badge(geo_avg)}</td>
            </tr>
            <tr style="background:#fef9f0;border-bottom:1px solid #e5e7eb">
              <td style="padding:5px 8px 5px 24px;font-size:11px;color:#6b7280">— التربية المدنية</td>
              <td style="text-align:center;font-size:11px;padding:5px">${socialG.c1||'—'}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${socialG.c2||'—'}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${fmt(civic_avg)}</td>
              <td style="text-align:center;font-size:11px;padding:5px">${fmtDiff(socialG.c1,socialG.c2)}</td>
              <td style="text-align:center;padding:5px">${badge(civic_avg)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 8px;font-weight:700">التربية الفنية</td>
              <td style="text-align:center;padding:7px">${artG.t1||'—'}</td>
              <td style="text-align:center;padding:7px">${artG.t2||'—'}</td>
              <td style="text-align:center;font-weight:900;padding:7px">${fmt(art_avg)}</td>
              <td style="text-align:center;padding:7px">${fmtDiff(artG.t1,artG.t2)}</td>
              <td style="text-align:center;padding:7px">${badge(art_avg)}</td>
            </tr>
            <tr style="background:#f9fafb;border-bottom:2px solid #4f46e5">
              <td style="padding:7px 8px;font-weight:700">التربية البدنية</td>
              <td style="text-align:center;padding:7px">${peG.t1||'—'}</td>
              <td style="text-align:center;padding:7px">${peG.t2||'—'}</td>
              <td style="text-align:center;font-weight:900;padding:7px">${fmt(pe_avg)}</td>
              <td style="text-align:center;padding:7px">${fmtDiff(peG.t1,peG.t2)}</td>
              <td style="text-align:center;padding:7px">${badge(pe_avg)}</td>
            </tr>
          </tbody>
        </table>

        ${teacherNote ? `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:16px"><div style="font-size:12px;font-weight:900;color:#0369a1;margin-bottom:4px">💬 ملاحظة الأستاذ</div><div style="font-size:13px;color:#374151">${teacherNote}</div></div>` : ''}

        <!-- توقيع -->
        <div style="display:flex;justify-content:space-between;margin-top:24px;font-size:12px;color:#6b7280">
          <div>توقيع ولي الأمر: ________________</div>
          <div>التاريخ: ${new Date().toLocaleDateString('ar-MA')}</div>
          <div>أستاذ القسم: ${teacher}</div>
        </div>
      </div>
    `;

    const card = document.getElementById('pr-report-card');
    card.style.display = 'block';
    card.innerHTML = html;
    UI.toast('✅ تم إنشاء تقرير التلميذ', 'success');
    card.scrollIntoView({behavior:'smooth', block:'start'});
  },

  print() {
    const content = document.getElementById('pr-printable');
    if (!content) { UI.toast('أنشئ التقرير أولاً', 'warning'); return; }
    const w = window.open('','_blank');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>تقرير المتعلم</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;900&family=Tajawal:wght@400;700&display=swap" rel="stylesheet"><style>body{font-family:'Tajawal',sans-serif;padding:28px;max-width:800px;margin:auto;font-size:13px} @media print{body{padding:10px}}
/* ─── JOURNAL IMPROVEMENTS ─── */
.journal-save-state{padding:6px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--border);font-size:11px;font-weight:900;color:var(--text-2)}
.journal-save-state.saving{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.35);color:#b45309}
.journal-save-state.saved{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.28);color:#047857}
.journal-day-head{cursor:pointer}
.journal-day-head .head-main{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.journal-day-toggle{width:32px;height:32px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-weight:900}
.journal-day-card.collapsed .journal-day-body,.journal-day-card.collapsed .journal-day-note{display:none}
.journal-day-note{padding:0 16px 14px}
.journal-day-note textarea{min-height:68px}
.journal-day-actions{display:flex;gap:8px;flex-wrap:wrap}
.journal-day-meta{font-size:11px;color:var(--text-3);font-weight:700}
.journal-session.compact .journal-grid textarea{min-height:64px}
.journal-session.compact .journal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.journal-session .danger-link{color:var(--danger);font-weight:900;cursor:pointer;background:none;border:none}
.journal-help-note{font-size:10.5px;color:var(--text-3);font-weight:700;margin-top:4px}
@media (max-width:900px){.journal-day-actions{width:100%}.journal-day-actions .btn-outline-mini{flex:1 1 auto}}

</style></head><body>${content.outerHTML}

</body></html>`);
    w.document.close(); w.focus(); setTimeout(()=>w.print(),800);
  }
};




// ══════════════════════════════════════════════════════════
//  WEEKLY JOURNAL MODULE
// ══════════════════════════════════════════════════════════

const Journal = {
  template: [
    { day:'الإثنين', subject:'اللغة العربية' }, { day:'الإثنين', subject:'التربية الإسلامية' }, { day:'الإثنين', subject:'التربية الفنية' },
    { day:'الثلاثاء', subject:'اللغة العربية' }, { day:'الثلاثاء', subject:'التربية الإسلامية' }, { day:'الثلاثاء', subject:'التاريخ' },
    { day:'الأربعاء', subject:'اللغة العربية' }, { day:'الأربعاء', subject:'التربية الإسلامية' }, { day:'الأربعاء', subject:'التربية الفنية' },
    { day:'الخميس', subject:'اللغة العربية' }, { day:'الخميس', subject:'الجغرافيا' }, { day:'الخميس', subject:'أنشطة الحياة المدرسية' },
    { day:'الجمعة', subject:'اللغة العربية' }, { day:'الجمعة', subject:'التربية الإسلامية' }, { day:'الجمعة', subject:'التربية المدنية' },
    { day:'السبت', subject:'اللغة العربية' }, { day:'السبت', subject:'التربية البدنية' }
  ],
  dayOrder: ['الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
  levelOptions: ['الرابع','الخامس والسادس','الخامس','السادس','الرابع قسم مستقل'],
  defaultOpen: 'ترحيب\nتذكير بشروط الحصة\nالتصريح بالأهداف\nنشاط اعتيادي',
  defaultClose: 'ماذا تعلمت اليوم؟\nتقويم شفهي سريع\nتلخيص الدرس',
  componentMap: {
    'التربية الإسلامية': ['قرآن كريم','عقيدة','اقتداء','استجابة','قسط','حكمة'],
    'التاريخ': ['تاريخ'],
    'الجغرافيا': ['جغرافيا'],
    'التربية المدنية': ['تربية مدنية'],
    'التربية الفنية': ['تشكيل','موسيقى / أناشيد','مسرح'],
    'التربية البدنية': ['تربية بدنية'],
    'أنشطة الحياة المدرسية': ['أنشطة الحياة المدرسية']
  },
  _saveTimer: null,
  _lastStateTimer: null,

  async getData() {
    const data = await DB.get('weekly_journal');
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : { currentWeekId: '', weeks: {} };
  },
  async setData(data) { await DB.set('weekly_journal', data); },
  getMonday(date = new Date()) {
    const d = new Date(date); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff); d.setHours(0,0,0,0); return d;
  },
  weekIdFromDate(date = new Date()) { return this.getMonday(date).toISOString().split('T')[0]; },
  weekLabel(weekId) {
    const s = new Date(weekId + 'T00:00:00'); const e = new Date(s); e.setDate(e.getDate() + 5);
    const fmt = d => d.toLocaleDateString('ar-MA', { day:'2-digit', month:'2-digit', year:'numeric' });
    return `أسبوع ${fmt(s)} → ${fmt(e)}`;
  },
  defaultLevelLabel() { return State.level === '4' ? 'الرابع' : State.level === '5' ? 'الخامس' : 'السادس'; },
  isArabic(subject) { return subject === 'اللغة العربية'; },
  esc(v='') { return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
  escAttr(v='') { return this.esc(v).replace(/"/g,'&quot;'); },
  dateForDay(weekId, day) {
    const idx = this.dayOrder.indexOf(day); const d = new Date(weekId + 'T00:00:00'); d.setDate(d.getDate() + (idx < 0 ? 0 : idx));
    return d;
  },
  formatDate(d) { return d.toLocaleDateString('ar-MA', { weekday:'long', year:'numeric', month:'2-digit', day:'2-digit' }); },
  makeRow(item, idx) {
    return {
      id: uuid(), order: idx, day: item.day, subject: item.subject, level: this.defaultLevelLabel(),
      component: (this.componentMap[item.subject] || [''])[0], componentOther: '',
      opening: this.defaultOpen, activity1: '', activity2: '', closing: this.defaultClose,
      achieved: '', hasHomework: false, homeworkText: '', notes: ''
    };
  },
  buildRows() { return this.template.map((item, idx) => this.makeRow(item, idx)); },
  normalizeWeek(week, weekId) {
    if (!week.rows) week.rows = this.buildRows();
    if (!week.label) week.label = this.weekLabel(weekId || week.id);
    if (!week.dayNotes) week.dayNotes = {};
    if (!week.openDays) week.openDays = { 'الإثنين': true };
    week.rows = week.rows.map((r, idx) => ({
      id: r.id || uuid(), order: typeof r.order === 'number' ? r.order : idx, day: r.day || 'الإثنين', subject: r.subject || 'اللغة العربية',
      level: r.level || this.defaultLevelLabel(), component: r.component || ((this.componentMap[r.subject] || [''])[0] || ''), componentOther: r.componentOther || '',
      opening: r.opening ?? (this.isArabic(r.subject) ? this.defaultOpen : ''), activity1: r.activity1 || '', activity2: r.activity2 || '',
      closing: r.closing ?? (this.isArabic(r.subject) ? this.defaultClose : ''), achieved: r.achieved || '', hasHomework: !!r.hasHomework,
      homeworkText: r.homeworkText || '', notes: r.notes || ''
    }));
    return week;
  },
  groupRows(rows) {
    const out = {}; rows.forEach(r => { if (!out[r.day]) out[r.day] = []; out[r.day].push(r); });
    Object.values(out).forEach(arr => arr.sort((a,b)=>(a.order||0)-(b.order||0)));
    return out;
  },
  async ensureData() {
    const data = await this.getData();
    if (!data.currentWeekId) data.currentWeekId = this.weekIdFromDate();
    if (!data.weeks[data.currentWeekId]) {
      data.weeks[data.currentWeekId] = this.normalizeWeek({ id:data.currentWeekId, label:this.weekLabel(data.currentWeekId), rows:this.buildRows(), createdAt:new Date().toISOString(), dayNotes:{}, openDays:{ 'الإثنين': true } }, data.currentWeekId);
      await this.setData(data);
    }
    Object.keys(data.weeks).forEach(id => this.normalizeWeek(data.weeks[id], id));
    return data;
  },
  getComponentOptions(subject) { return this.isArabic(subject) ? [] : [...new Set([...(this.componentMap[subject] || []), 'مكون آخر'])]; },
  isFilled(row) {
    return !!((row.opening||'').trim() || (row.activity1||'').trim() || (row.activity2||'').trim() || (row.closing||'').trim() || (row.achieved||'').trim() || (row.notes||'').trim() || (row.homeworkText||'').trim());
  },
  subjectStats(rows) {
    const map = {};
    rows.forEach(r => {
      if (!map[r.subject]) map[r.subject] = { total:0, filled:0 };
      map[r.subject].total += 1;
      if (this.isFilled(r)) map[r.subject].filled += 1;
    });
    return map;
  },
  setSaveState(state='ready', txt='جاهز') {
    const el = document.getElementById('journalSaveState'); if (!el) return;
    el.textContent = txt; el.className = 'journal-save-state' + (state === 'saving' ? ' saving' : state === 'saved' ? ' saved' : '');
    clearTimeout(this._lastStateTimer);
    if (state === 'saved') this._lastStateTimer = setTimeout(() => this.setSaveState('ready','جاهز'), 1400);
  },
  renderStats(rows) {
    const statsBox = document.getElementById('journalStats');
    const subjectBox = document.getElementById('journalSubjectStats');
    if (!statsBox || !subjectBox) return;
    const total = rows.length;
    const filled = rows.filter(r => this.isFilled(r)).length;
    const homework = rows.filter(r => r.hasHomework && (r.homeworkText||'').trim()).length;
    const pct = total ? Math.round((filled / total) * 100) : 0;
    statsBox.innerHTML = `
      <div class="journal-stat"><div class="label">إجمالي الحصص</div><div class="value">${total}</div></div>
      <div class="journal-stat"><div class="label">حصص معبأة</div><div class="value">${filled}</div></div>
      <div class="journal-stat"><div class="label">نسبة الإنجاز الأسبوعي</div><div class="value">${pct}%</div></div>
      <div class="journal-stat"><div class="label">واجبات مسجلة</div><div class="value">${homework}</div></div>`;
    const statMap = this.subjectStats(rows);
    const order = ['اللغة العربية','التربية الإسلامية','التاريخ','الجغرافيا','التربية المدنية','التربية الفنية','التربية البدنية','أنشطة الحياة المدرسية'];
    subjectBox.innerHTML = order.filter(s => statMap[s]).map(subject => {
      const st = statMap[subject];
      const p = st.total ? Math.round((st.filled / st.total) * 100) : 0;
      return `<div class="journal-subject-card"><h4>${subject}</h4><p>الحصص المعبأة: ${st.filled} / ${st.total}</p><p>نسبة الإنجاز: ${p}%</p></div>`;
    }).join('');
  },
  async render() {
    const holder = document.getElementById('journalDays'); if (!holder) return;
    const data = await this.ensureData();
    const current = data.weeks[data.currentWeekId];
    this.normalizeWeek(current, data.currentWeekId);
    document.getElementById('journalWeekBadge').textContent = current.label;
    const weekIds = Object.keys(data.weeks).sort().reverse();
    document.getElementById('journalWeekSelect').innerHTML = weekIds.map(id => `<option value="${id}" ${id===data.currentWeekId?'selected':''}>${data.weeks[id].label}</option>`).join('');
    const grouped = this.groupRows(current.rows || []);
    this.renderStats(current.rows || []);
    holder.innerHTML = this.dayOrder.map(day => {
      const rows = grouped[day] || [];
      const collapsed = current.openDays && current.openDays[day] === false;
      const dayDate = this.formatDate(this.dateForDay(data.currentWeekId, day));
      return `<div class="journal-day-card ${collapsed ? 'collapsed' : ''}" id="journal-day-${day}">
        <div class="journal-day-head" onclick="Journal.toggleDay('${day}')">
          <div class="head-main"><span class="journal-day-toggle">${collapsed ? '+' : '−'}</span><div><h3>${day}</h3><div class="sub">${rows.length} حصة مبرمجة</div><div class="journal-day-meta">${dayDate}</div></div></div>
          <div class="journal-day-actions no-print" onclick="event.stopPropagation()">
            <button class="btn-outline-mini" onclick="Journal.copyDay('${day}')">📋 نسخ اليوم</button>
            <button class="btn-outline-mini" onclick="Journal.addSession('${day}')">➕ إضافة حصة</button>
            <button class="btn-outline-mini" onclick="Journal.printDay('${day}')">🖨️ طباعة اليوم</button>
          </div>
        </div>
        <div class="journal-day-note no-print"><label class="form-label">ملاحظات عامة لليوم</label><textarea class="form-control" placeholder="ملاحظات عامة حول هذا اليوم" oninput="Journal.updateDayNote('${day}',this.value)">${this.esc(current.dayNotes[day] || '')}</textarea></div>
        <div class="journal-day-body">${rows.map((row, idx) => this.renderSession(row, idx)).join('')}</div>
      </div>`;
    }).join('');
  },
  renderSession(row, idx) {
    const compact = !this.isArabic(row.subject) ? ' compact' : '';
    const levelSelect = `<div><label class="form-label">المستوى</label><select class="form-control" onchange="Journal.updateRow('${row.id}','level',this.value)">${this.levelOptions.map(l => `<option value="${l}" ${row.level===l?'selected':''}>${l}</option>`).join('')}</select></div>`;
    const delBtn = `<button class="danger-link" onclick="Journal.deleteRow('${row.id}')">حذف الحصة</button>`;
    const actionBtns = `<div class="journal-session-actions no-print">${this.isArabic(row.subject) ? `<button class="btn-outline-mini" onclick="Journal.copyArabicPatternFromRow('${row.id}')">🔁 تعميم العربية</button>` : ''}${delBtn}</div>`;
    const homeworkBlock = `<div class="full"><div class="journal-toggle-row"><label>الواجب المنزلي</label><label><input type="radio" name="hw_${row.id}" ${row.hasHomework ? 'checked' : ''} onchange="Journal.updateRow('${row.id}','hasHomework',true,true)"> نعم</label><label><input type="radio" name="hw_${row.id}" ${!row.hasHomework ? 'checked' : ''} onchange="Journal.updateRow('${row.id}','hasHomework',false,true)"> لا</label></div>${row.hasHomework ? `<textarea class="form-control" placeholder="اكتب الواجب المنزلي" oninput="Journal.updateRow('${row.id}','homeworkText',this.value)">${this.esc(row.homeworkText||'')}</textarea>` : `<div class="journal-mini-note">لا يوجد واجب منزلي مسجل</div>`}</div>`;
    const notesBlock = `<div class="full"><label class="form-label">ملاحظات الأستاذ</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','notes',this.value)">${this.esc(row.notes||'')}</textarea></div>`;
    const componentOpts = this.getComponentOptions(row.subject).map(opt => `<option value="${this.escAttr(opt)}" ${row.component===opt?'selected':''}>${opt}</option>`).join('');
    const componentBlock = this.isArabic(row.subject) ? '' : `<div><label class="form-label">المكون</label><select class="form-control" onchange="Journal.updateComponent('${row.id}',this.value)">${componentOpts}</select>${row.component === 'مكون آخر' ? `<input class="form-control" style="margin-top:8px" placeholder="اكتب المكون الآخر" value="${this.escAttr(row.componentOther||'')}" oninput="Journal.updateRow('${row.id}','componentOther',this.value)">` : ''}</div>`;

    if (this.isArabic(row.subject)) {
      return `<div class="journal-session${compact}"><div class="journal-session-head"><div class="journal-session-title"><span class="journal-chip subject">${row.subject}</span><span class="journal-chip level">الحصة ${idx+1}</span></div>${actionBtns}</div><div class="journal-grid">${levelSelect}<div class="full"><div class="journal-help-note">في اللغة العربية فقط: لا تظهر خانة المكون، وتُكتب الحصة عبر افتتاح + نشاط 1 + نشاط 2 + اختتام.</div></div><div class="full"><label class="form-label">افتتاح الحصة</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','opening',this.value)">${this.esc(row.opening||'')}</textarea></div><div><label class="form-label">نشاط 1</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','activity1',this.value)">${this.esc(row.activity1||'')}</textarea></div><div><label class="form-label">نشاط 2</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','activity2',this.value)">${this.esc(row.activity2||'')}</textarea></div><div class="full"><label class="form-label">اختتام الحصة</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','closing',this.value)">${this.esc(row.closing||'')}</textarea></div>${homeworkBlock}${notesBlock}</div></div>`;
    }
    return `<div class="journal-session${compact}"><div class="journal-session-head"><div class="journal-session-title"><span class="journal-chip subject">${row.subject}</span><span class="journal-chip level">الحصة ${idx+1}</span></div>${actionBtns}</div><div class="journal-grid">${levelSelect}${componentBlock}<div class="full"><label class="form-label">ما أُنجز في الحصة</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','achieved',this.value)">${this.esc(row.achieved||'')}</textarea></div>${homeworkBlock}${notesBlock}</div></div>`;
  },
  async changeWeek(id) { const data = await this.ensureData(); if (!data.weeks[id]) return; data.currentWeekId = id; await this.setData(data); await this.render(); },
  async updateComponent(rowId, value) {
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId]; const row = week.rows.find(r => r.id === rowId); if (!row) return;
    row.component = value; if (value !== 'مكون آخر') row.componentOther = '';
    this.setSaveState('saving','جارٍ الحفظ...'); await this.setData(data); await this.render(); this.setSaveState('saved','تم الحفظ');
  },
  async updateRow(rowId, field, value, rerender=false) {
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId]; const row = week.rows.find(r => r.id === rowId); if (!row) return;
    row[field] = value; clearTimeout(this._saveTimer); this.setSaveState('saving','جارٍ الحفظ...');
    this._saveTimer = setTimeout(async () => { await this.setData(data); this.setSaveState('saved','تم الحفظ'); }, 180);
    if (rerender) await this.render(); else this.renderStats(week.rows || []);
  },
  async updateDayNote(day, value) {
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId]; if (!week.dayNotes) week.dayNotes = {};
    week.dayNotes[day] = value; clearTimeout(this._saveTimer); this.setSaveState('saving','جارٍ الحفظ...');
    this._saveTimer = setTimeout(async () => { await this.setData(data); this.setSaveState('saved','تم الحفظ'); }, 180);
  },
  async toggleDay(day) {
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId]; if (!week.openDays) week.openDays = {};
    week.openDays[day] = week.openDays[day] === false ? true : false; await this.setData(data); await this.render();
  },
  async createNewWeek() {
    const data = await this.ensureData();
    const latest = Object.keys(data.weeks).sort().pop() || this.weekIdFromDate();
    const next = new Date(latest + 'T00:00:00'); next.setDate(next.getDate() + 7);
    const nextId = next.toISOString().split('T')[0];
    data.currentWeekId = nextId;
    data.weeks[nextId] = this.normalizeWeek({ id: nextId, label: this.weekLabel(nextId), rows: this.buildRows(), createdAt: new Date().toISOString(), dayNotes: {}, openDays: { 'الإثنين': true } }, nextId);
    await this.setData(data); await this.render(); UI.toast('تم إنشاء أسبوع جديد', 'success');
  },
  async copyPreviousWeek() {
    const data = await this.ensureData();
    const ids = Object.keys(data.weeks).sort(); const currentId = data.currentWeekId; const prevId = ids.filter(id => id < currentId).pop();
    if (!prevId) { UI.toast('لا يوجد أسبوع سابق للنسخ', 'warning'); return; }
    const src = this.normalizeWeek(structuredClone(data.weeks[prevId]), prevId);
    data.weeks[currentId] = this.normalizeWeek({ id: currentId, label: this.weekLabel(currentId), createdAt: new Date().toISOString(), dayNotes: {}, openDays: { 'الإثنين': true }, rows: src.rows.map((r, idx) => ({ ...r, id: uuid(), order: idx, opening: this.isArabic(r.subject) ? (r.opening || this.defaultOpen) : '', activity1: '', activity2: '', closing: this.isArabic(r.subject) ? (r.closing || this.defaultClose) : '', achieved: '', homeworkText: '', hasHomework: false, notes: '' })) }, currentId);
    await this.setData(data); await this.render(); UI.toast('تم نسخ بنية الأسبوع السابق', 'success');
  },
  async copyDay(day) {
    const data = await this.ensureData(); const ids = Object.keys(data.weeks).sort(); const currentId = data.currentWeekId; const prevId = ids.filter(id => id < currentId).pop();
    if (!prevId) { UI.toast('لا يوجد أسبوع سابق لنسخ هذا اليوم', 'warning'); return; }
    const srcWeek = this.normalizeWeek(data.weeks[prevId], prevId); const currentWeek = this.normalizeWeek(data.weeks[currentId], currentId);
    const prevRows = srcWeek.rows.filter(r => r.day === day); const currRows = currentWeek.rows.filter(r => r.day === day);
    currRows.forEach((row, idx) => {
      const src = prevRows[idx]; if (!src) return;
      if (this.isArabic(row.subject) && this.isArabic(src.subject)) { row.opening = src.opening || this.defaultOpen; row.activity1 = src.activity1 || ''; row.activity2 = src.activity2 || ''; row.closing = src.closing || this.defaultClose; }
      if (!this.isArabic(row.subject) && !this.isArabic(src.subject)) { row.component = src.component || row.component; row.componentOther = src.componentOther || ''; row.achieved = src.achieved || ''; }
      row.notes = src.notes || ''; row.hasHomework = src.hasHomework || false; row.homeworkText = src.homeworkText || ''; row.level = src.level || row.level;
    });
    currentWeek.dayNotes[day] = srcWeek.dayNotes?.[day] || '';
    await this.setData(data); await this.render(); UI.toast(`تم نسخ ${day} من الأسبوع السابق`, 'success');
  },
  async addSession(day) {
    const data = await this.ensureData(); const week = this.normalizeWeek(data.weeks[data.currentWeekId], data.currentWeekId);
    const existing = week.rows.filter(r => r.day === day); const subject = prompt('أدخل اسم المادة للحصة الجديدة', 'التربية الإسلامية');
    if (!subject) return;
    const row = this.makeRow({ day, subject }, week.rows.length + 1);
    row.order = existing.length ? Math.max(...existing.map(r => r.order || 0)) + 1 : 0;
    if (!this.isArabic(subject)) { row.opening = ''; row.closing = ''; row.component = (this.componentMap[subject] || [''])[0] || ''; }
    week.rows.push(row);
    await this.setData(data); await this.render(); UI.toast('تمت إضافة حصة جديدة', 'success');
  },
  async deleteRow(rowId) {
    if (!confirm('حذف هذه الحصة؟')) return;
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId];
    week.rows = week.rows.filter(r => r.id !== rowId);
    await this.setData(data); await this.render(); UI.toast('تم حذف الحصة', 'success');
  },
  async copyArabicPatternFromRow(rowId) {
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId]; const src = week.rows.find(r => r.id === rowId);
    if (!src || !this.isArabic(src.subject)) return;
    week.rows.forEach(r => { if (r.id !== rowId && this.isArabic(r.subject)) { r.opening = src.opening || this.defaultOpen; r.closing = src.closing || this.defaultClose; } });
    await this.setData(data); await this.render(); UI.toast('تم تعميم افتتاح واختتام العربية على بقية حصصها', 'success');
  },
  async copyArabicToAllDays() {
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId];
    const src = week.rows.find(r => this.isArabic(r.subject) && ((r.activity1||'').trim() || (r.activity2||'').trim() || (r.opening||'').trim() || (r.closing||'').trim()));
    if (!src) { UI.toast('املأ حصة عربية واحدة أولاً', 'warning'); return; }
    week.rows.forEach(r => {
      if (this.isArabic(r.subject)) { r.opening = src.opening; r.activity1 = src.activity1; r.activity2 = src.activity2; r.closing = src.closing; }
    });
    await this.setData(data); await this.render(); UI.toast('تم نسخ العربية إلى بقية الأيام', 'success');
  },
  async resetCurrentWeekTexts() {
    if (!confirm('تفريغ النصوص الحالية لهذا الأسبوع؟')) return;
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId];
    week.rows = week.rows.map(r => ({ ...r, opening: this.isArabic(r.subject) ? this.defaultOpen : '', activity1:'', activity2:'', closing: this.isArabic(r.subject) ? this.defaultClose : '', achieved:'', homeworkText:'', hasHomework:false, notes:'' }));
    week.dayNotes = {};
    await this.setData(data); await this.render(); UI.toast('تم تفريغ نصوص الأسبوع', 'success');
  },
  buildMergedContent(row) {
    if (this.isArabic(row.subject)) {
      return [row.opening && `افتتاح الحصة:\n${row.opening}`, row.activity1 && `نشاط 1:\n${row.activity1}`, row.activity2 && `نشاط 2:\n${row.activity2}`, row.closing && `اختتام الحصة:\n${row.closing}`].filter(Boolean).join('\n\n');
    }
    return row.achieved || '';
  },
  buildPrintableHalf(title, rows, generalNote='') {
    const bodyRows = rows.length ? rows.map((row, idx) => `<tr>
      <td>${idx+1}</td>
      <td>${this.esc(row.subject)}</td>
      <td>${this.esc(this.isArabic(row.subject) ? '—' : (row.component === 'مكون آخر' ? (row.componentOther || 'مكون آخر') : (row.component || '—')))}</td>
      <td style="white-space:pre-wrap">${this.esc(this.buildMergedContent(row) || '—')}</td>
      <td style="white-space:pre-wrap">${row.hasHomework ? this.esc(row.homeworkText || '—') : '—'}</td>
      <td style="white-space:pre-wrap">${this.esc(row.notes || '—')}</td>
    </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#666">لا توجد حصص لهذا المستوى في هذا اليوم</td></tr>`;
    return `<div class="print-half"><div class="print-half-title">${title}</div><table class="print-table"><thead><tr><th>الحصة</th><th>المادة</th><th>المكون</th><th>مضامين الأنشطة</th><th>الواجب المنزلي</th><th>ملاحظات</th></tr></thead><tbody>${bodyRows}</tbody></table><div class="teacher-box"><strong>إطار خاص بالأستاذ</strong><div>${this.esc(generalNote || '—')}</div></div></div>`;
  },
  async printDay(day) {
    const data = await this.ensureData(); const week = this.normalizeWeek(data.weeks[data.currentWeekId], data.currentWeekId);
    const rows = week.rows.filter(r => r.day === day);
    const fourth = rows.filter(r => (r.level || '').includes('الرابع'));
    const upper = rows.filter(r => !((r.level || '').includes('الرابع')));
    const dateLabel = this.formatDate(this.dateForDay(data.currentWeekId, day));
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${day}</title><style>
      @page{size:A4;margin:10mm} body{font-family:'Tajawal',Arial,sans-serif;color:#111;margin:0} .page{display:flex;flex-direction:column;gap:12px;height:100%} .head{border:1px solid #222;padding:10px 12px;margin-bottom:8px} .head h1{font-size:18px;margin:0 0 6px} .meta{display:flex;justify-content:space-between;gap:12px;font-size:12px;flex-wrap:wrap} .print-half{border:1px solid #222;padding:8px 8px 10px;min-height:46vh} .print-half-title{font-size:14px;font-weight:700;margin-bottom:8px;border-bottom:1px solid #222;padding-bottom:4px} .print-table{width:100%;border-collapse:collapse;font-size:11px} .print-table th,.print-table td{border:1px solid #444;padding:6px;vertical-align:top} .teacher-box{margin-top:8px;border:1px solid #444;padding:8px;font-size:11px;min-height:48px;white-space:pre-wrap} .divider{font-size:12px;font-weight:700;text-align:center;border:1px dashed #666;padding:4px;margin:4px 0}
    </style></head><body><div class="page"><div class="head"><h1>المذكرة التربوية اليومية</h1><div class="meta"><div>اليوم: ${day}</div><div>التاريخ: ${dateLabel}</div><div>${this.esc(week.label)}</div></div></div>${this.buildPrintableHalf('المستوى: الرابع', fourth, week.dayNotes?.[day] || '')}<div class="divider">فترة الاستراحة</div>${this.buildPrintableHalf('المستوى: الخامس والسادس', upper, week.dayNotes?.[day] || '')}</div><script>window.onload=function(){window.print();}<\/script>

</body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close();
  },
  async exportPrintablePDF() {
    const data = await this.ensureData(); const week = this.normalizeWeek(data.weeks[data.currentWeekId], data.currentWeekId);
    const daysHtml = this.dayOrder.map(day => {
      const rows = week.rows.filter(r => r.day === day);
      const fourth = rows.filter(r => (r.level || '').includes('الرابع'));
      const upper = rows.filter(r => !((r.level || '').includes('الرابع')));
      return `<section style="page-break-after:always">${this.buildPrintableHalf(`${day} — المستوى: الرابع`, fourth, week.dayNotes?.[day] || '')}<div style="height:8px"></div>${this.buildPrintableHalf(`${day} — المستوى: الخامس والسادس`, upper, week.dayNotes?.[day] || '')}</section>`;
    }).join('');
    const blob = new Blob([`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>المذكرة_${data.currentWeekId}</title><style>body{font-family:Tajawal,Arial,sans-serif;padding:20px}.print-half{border:1px solid #222;padding:8px 8px 10px;min-height:45vh}.print-half-title{font-size:14px;font-weight:700;margin-bottom:8px;border-bottom:1px solid #222;padding-bottom:4px}.print-table{width:100%;border-collapse:collapse;font-size:11px}.print-table th,.print-table td{border:1px solid #444;padding:6px;vertical-align:top}.teacher-box{margin-top:8px;border:1px solid #444;padding:8px;font-size:11px;min-height:48px;white-space:pre-wrap}</style></head><body>${daysHtml}

</body></html>`], { type:'text/html;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `المذكرة_${data.currentWeekId}.html`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    UI.toast('تم تنزيل ملف طباعة للأسبوع. افتحه ثم اختر حفظ PDF من المتصفح', 'success');
  }
};
UI.renderJournal = async () => { await Journal.render(); };


const TAB_TITLES = {
  dashboard:'التحليل الفوري', heatmap:'الخريطة الحرارية', honor:'نظام التحفيز',
  fluency:'سجل الطلاقة القرائية', attendance:'تتبع الحضور', homework:'الواجبات المنزلية',
  grades:'الفروض والتقييم', activities:'الأنشطة المندمجة', remediation:'خطط الدعم التربوي',
  'support-groups':'مجموعات الدعم التلقائية', notes:'السلوكات والملاحظات',
  tools:'أدوات القسم', library:'مكتبة القسم', sessions:'سجل الحصص', journal:'المذكرة التربوية',
  'class-analysis':'📈 تحليل القسم', 'parent-report':'👨‍👩‍👧 تقرير ولي الأمر',
  reports:'تقارير المتعلمين', 'report-editor':'محرر التقارير', settings:'الإعدادات',
  hypothesis:'🧪 مختبر الفرضيات التربوية', equity:'🎯 مؤشر العدالة التعليمية', biography:'📖 سيرة المتعلم التراكمية'
};

async function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('tab-' + tabId);
  const btn = document.getElementById('btn-' + tabId);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
  setTxt('tabTitle', TAB_TITLES[tabId] || tabId);
  State.tab = tabId;
  
  // Close mobile sidebar
  document.getElementById('appSidebar').classList.remove('active');
  document.getElementById('mobileOverlay').classList.remove('active');
  
  await refreshCurrentTab(tabId);
}

async function refreshCurrentTab(tabId) {
  const t = tabId || State.tab;
  Engine.invalidate();
  switch (t) {
    case 'dashboard': await UI.renderDashboard(); break;
    case 'heatmap': await UI.renderHeatmap(); break;
    case 'honor': await UI.renderHonorRoll(); break;
    case 'fluency': await UI.renderFluency(); break;
    case 'attendance': await UI.renderAttendance(); break;
    case 'homework': await UI.renderHomework(); break;
    case 'grades': await UI.renderGrades(); break;
    case 'activities': await UI.renderActivities(); break;
    case 'remediation': await UI.renderRemediation(); break;
    case 'support-groups': break;
    case 'notes': await UI.renderNotes(); break;
    case 'library': await UI.renderLibrary(); break;
    case 'sessions': await UI.renderSessions(); break;
    case 'journal': await UI.renderJournal(); break;
    case 'reports': await UI.renderReports(); break;
    case 'report-editor': await UI.renderReportEditor(); break;
    case 'settings': await UI.renderSettingsPupils(); break;
    case 'hypothesis': await HypLab.render(); break;
    case 'equity': break;
    case 'biography': break;
    case 'class-analysis': await ClassAnalysis.render(); break;
    case 'parent-report': ParentReport.initSelect(); break;
  }
}

function toggleSidebar() {
  const s = document.getElementById('appSidebar'), o = document.getElementById('mobileOverlay');
  s.classList.toggle('active'); o.classList.toggle('active');
}

function changeYear(y) { State.year = y; Engine.invalidate(); initDropdowns(); refreshCurrentTab(); }
function changeLevel(l) { State.level = l; Engine.invalidate(); initDropdowns(); refreshCurrentTab(); }

function handleGlobalSearch(input) {
  const name = input.value;
  if (PupilMgr.getPupilNames().includes(name)) UI.openProfile(name);
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  Store.set('theme', isDark ? 'light' : 'dark');
}

function toggleClassroomMode() { document.body.classList.add('classroom-mode'); document.getElementById('exitClassroomBtnInner').style.display='inline-flex'; document.getElementById('enterClassroomBtn').style.display='none'; }
function removeClassroomMode() { document.body.classList.remove('classroom-mode'); document.getElementById('exitClassroomBtnInner').style.display='none'; document.getElementById('enterClassroomBtn').style.display='inline-flex'; }

function initDropdowns() {
  const pupils = PupilMgr.getPupilNames();
  const dl = document.getElementById('dl-students');
  if (dl) dl.innerHTML = pupils.map(p => `<option value="${p}">`).join('');
  ['note-student','rem-student','lib-student','ea-student','rpt-student','hyp-student','bio-student'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = pupils.map(p => `<option value="${p}">${p}</option>`).join('');
  });
}

// ─── PRINT HELPER ─────────────────────────────
function buildPrintHeader(title, teacher, school, year, level) {
  return `<div style="border-bottom:3px double #312e81;padding-bottom:12px;margin-bottom:18px">
    <table style="width:100%;border:none;min-width:0"><tr>
      <td style="text-align:right;padding:0;border:none;vertical-align:top">
        <div style="font-size:9px;color:#64748b">وزارة التربية الوطنية والتعليم الأولي والرياضة</div>
        <div style="font-size:12px;font-weight:900;color:#312e81">${school}</div>
        <div style="font-size:9px;color:#64748b">المديرية الإقليمية تارودانت</div>
      </td>
      <td style="text-align:center;padding:0;border:none">
        <h1 style="font-size:18px;font-weight:900;color:#312e81;font-family:Cairo,sans-serif;margin:0">${title}</h1>
        <div style="font-size:10px;color:#475569;margin-top:3px">الموسم: ${year} | المستوى: ${level} | الأستاذ: ${teacher}</div>
      </td>
      <td style="text-align:left;padding:0;border:none;font-size:28px;vertical-align:top">🎓</td>
    </tr></table>
  </div>`;
}

async function printSection(section) {
  const year = State.year, level = State.level;
  const teacher = await Store.get('setting_teacher', 'ذ. عبد الحق جعايط');
  const school = await Store.get('setting_school', 'م/م المصامدة');
  const titleMap = { fluency:'سجل الطلاقة القرائية', attendance:'تتبع الحضور والغياب', homework:'الواجبات المنزلية', grades:'الفروض والتقييم', library:'مكتبة القسم', reports:'تقارير المتعلمين', notes:'الملاحظات التربوية', sessions:'سجل الحصص' };
  const title = titleMap[section] || 'تقرير القسم';
  
  const content = document.getElementById(section + 'Body')?.closest('table')?.outerHTML || '';
  if (!content) { UI.toast('لا توجد بيانات لطباعتها', 'error'); return; }
  
  const zone = document.getElementById('printSectionZone');
  zone.innerHTML = buildPrintHeader(title, teacher, school, year, level) + `<div style="margin-top:16px">${content}</div>`;
  
  document.body.className = 'print-section'; window.print(); document.body.className = '';
}

async function printFluencyAllWeeks() {
  const year = State.year, level = State.level;
  const teacher = await Store.get('setting_teacher', 'ذ. عبد الحق جعايط');
  const school = await Store.get('setting_school', 'م/م المصامدة');
  const s = document.getElementById('flu-stage')?.value || '4';
  
  let html = buildPrintHeader('الطلاقة القرائية - جميع الأسابيع (المرحلة ' + s + ')', teacher, school, year, level);
  html += `<table style="width:100%;border-collapse:collapse;font-size:12px;text-align:right"><thead><tr><th>الاسم</th><th>أ.1</th><th>أ.2</th><th>أ.3</th><th>أ.4</th><th>أ.5</th><th>مستوى TaRL</th></tr></thead><tbody>`;
  
  const pupils = PupilMgr.getPupilNames();
  for (const p of pupils) {
    html += `<tr><td><strong>${p}</strong></td>`;
    let lastTarl = '—';
    for (let w = 1; w <= 5; w++) {
      const flu = await DB.getFluency(s, w);
      const fd = flu[p] || {};
      const acc = fd.accuracy === 'yes', flw = fd.flow === 'yes';
      const star = (acc && flw) ? '⭐' : '—';
      if (fd.tarl) lastTarl = fd.tarl;
      html += `<td class="td-center">${star}</td>`;
    }
    html += `<td class="td-center">${lastTarl}</td></tr>`;
  }
  html += `</tbody></table>`;
  
  const zone = document.getElementById('fluencyAllZone');
  zone.innerHTML = html;
  
  document.body.className = 'print-fluency-all'; window.print(); document.body.className = '';
}

async function printClassReportUI() {
  const year = State.year, level = State.level;
  const teacher = await Store.get('setting_teacher', 'ذ. عبد الحق جعايط');
  const school = await Store.get('setting_school', 'م/م المصامدة');
  
  setTxt('print-school', school);
  setTxt('print-year', year);
  setTxt('print-level', level);
  
  const pupils = PupilMgr.getPupilNames();
  let content = `<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:right"><thead><tr><th>الاسم</th><th class="td-center">مؤشر الأداء (PI)</th><th class="td-center">معدل الفروض</th><th class="td-center">الغياب</th><th class="td-center">XP</th></tr></thead><tbody>`;
  
  for (const p of pupils) {
    const r = await Engine.calculatePI(p, level);
    content += `<tr>
      <td><strong>${p}</strong></td>
      <td class="td-center font-bold" style="color:${r.pi>=7?'#047857':r.pi>=5?'#b45309':'#b91c1c'}">${r.pi.toFixed(2)}</td>
      <td class="td-center">${r.raw.gAvg.toFixed(2)}</td>
      <td class="td-center">${r.raw.absCount}</td>
      <td class="td-center">${r.xp.toFixed(0)}</td>
    </tr>`;
  }
  content += `</tbody></table>`;
  
  setHtml('print-content', content);
  document.body.className = 'print-mode-report'; window.print(); document.body.className = '';
}

// ══════════════════════════════════════════════════════════
//  EQUITY & BIOGRAPHY
// ══════════════════════════════════════════════════════════
const EquityMgr = {
  async analyze() {
    const pupils = PupilMgr.getPupilNames();
    const allNotes = await DB.get('notes');
    let intCounts = {};
    allNotes.forEach(n => { if(n.type==='positive') intCounts[n.student] = (intCounts[n.student]||0)+1; });
    const sorted = Object.entries(intCounts).sort((a,b)=>b[1]-a[1]);
    const max = sorted.length ? sorted[0][1] : 1;
    
    let html = `<div class="g2"><div class="card mb-0"><div class="card-header"><div class="card-title">توزيع التعزيز الإيجابي</div></div><div class="card-body">`;
    if (!sorted.length) html += `<div class="empty-state">لا توجد بيانات للتعزيز</div>`;
    else {
      sorted.slice(0,10).forEach(([p, c]) => {
        const pct = (c/max)*100;
        html += `<div class="equity-bar-wrap"><div class="equity-bar-name">${p}</div><div class="equity-bar-track"><div class="equity-bar-fill" style="width:${pct}%;background:var(--success)"></div></div><div class="equity-bar-val">${c}</div></div>`;
      });
      const unrewarded = pupils.filter(p => !intCounts[p]);
      if (unrewarded.length) {
        html += `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:11px;font-weight:900;color:var(--danger);margin-bottom:8px">⚠️ تلاميذ لم يتلقوا تعزيزاً إيجابياً:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${unrewarded.map(p=>`<span class="badge badge-red">${p}</span>`).join('')}</div>
        </div>`;
      }
    }
    html += `</div></div></div>`;
    setHtml('equityContainer', html);
  }
};

const HypLab = {
  async render() {
    const hyps = await Store.get('hypotheses', []);
    setHtml('hypList', hyps.length ? hyps.map((h, i) => {
      const isPending = !h.afterVal;
      const stClass = isPending ? 'hyp-pending' : (parseFloat(h.afterVal) > parseFloat(h.baseline) ? 'hyp-confirmed' : 'hyp-rejected');
      return `<div class="hyp-card ${stClass}">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong style="font-size:13.5px">${h.student}</strong>
          <span class="badge">${h.date}</span>
        </div>
        <div style="font-size:12.5px;margin-bottom:8px;line-height:1.6"><strong>الفرضية:</strong> ${h.text}</div>
        <div style="font-size:11.5px;color:var(--text-2);display:flex;gap:12px;margin-bottom:8px">
          <span><strong>المؤشر:</strong> ${h.metric}</span>
          <span><strong>القيمة قبل:</strong> ${h.baseline}</span>
          ${!isPending ? `<span><strong>القيمة بعد:</strong> <span style="color:${parseFloat(h.afterVal) > parseFloat(h.baseline)?'var(--success)':'var(--danger)'};font-weight:900">${h.afterVal}</span></span>` : ''}
        </div>
        ${isPending ? `<button class="btn btn-sm btn-ghost" onclick="HypLab.openUpdate(${i})">تحديث النتيجة</button>` : `<div style="font-size:11.5px;background:var(--surface);padding:8px;border-radius:var(--r-sm)"><strong>استنتاج:</strong> ${h.conclusion||'—'}</div>`}
      </div>`;
    }).join('') : '<div class="empty-state"><div class="empty-icon">🔬</div><p>لم تُسجَّل أي فرضية بعد</p></div>');
  },
  async save() {
    const student = getVal('hyp-student'), text = getVal('hyp-text'), metric = getVal('hyp-metric');
    const baseline = getVal('hyp-baseline'), date = getVal('hyp-date') || State.today;
    if (!text.trim() || !baseline) { UI.toast('أدخل الفرضية والقيمة الأساسية', 'error'); return; }
    const hyps = await Store.get('hypotheses', []);
    hyps.unshift({ id: uuid(), student, text, metric, baseline, date, afterVal: null, conclusion: '' });
    await Store.set('hypotheses', hyps);
    setVal('hyp-text', ''); setVal('hyp-baseline', '');
    this.render(); UI.toast('تم تسجيل الفرضية', 'success');
  },
  openUpdate(i) {
    setVal('hyp-update-id', i); setVal('hyp-after-val', ''); setVal('hyp-conclusion', '');
    document.getElementById('hypUpdateModal').classList.add('active');
  },
  async conclude() {
    const idx = getVal('hyp-update-id'), after = getVal('hyp-after-val'), conc = getVal('hyp-conclusion');
    if (!after) return;
    const hyps = await Store.get('hypotheses', []);
    if (hyps[idx]) { hyps[idx].afterVal = after; hyps[idx].conclusion = conc; await Store.set('hypotheses', hyps); }
    UI.closeModal('hypUpdateModal'); this.render(); UI.toast('تم تحديث الفرضية', 'success');
  }
};

const BioMgr = {
  async render() {
    const student = getVal('bio-student'); if (!student) return;
    
    const allAtt = await DB.get('attendance');
    let absCount = 0; Object.values(allAtt).forEach(d => { if((d||{})[student]==='absent') absCount++; });
    
    const r = await Engine.calculatePI(student, State.level);
    
    const notes = (await DB.get('notes')).filter(n => n.student === student);
    
    const transferNote = await Store.get(`transfer_note_${student}`, '');
    setVal('bio-transfer-note', transferNote);
    
    let html = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--border)">
        <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--brand-500),var(--brand-400));display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;font-weight:900">👤</div>
        <div>
          <h3 style="font-size:18px;font-weight:900;margin:0;font-family:'Cairo'">${student}</h3>
          <div style="font-size:12px;color:var(--text-3)">السجل التراكمي الشامل</div>
        </div>
      </div>
      
      <div class="bio-year-block">
        <div class="bio-year-title">الموسم الدراسي ${State.year} (المستوى ${State.level})</div>
        <div class="bio-stat-row">
          <div class="bio-stat"><span>${r.pi.toFixed(1)}</span><span>PI</span></div>
          <div class="bio-stat"><span>${r.raw.gAvg.toFixed(1)}</span><span>المعدل</span></div>
          <div class="bio-stat"><span>${absCount}</span><span>غيابات</span></div>
          <div class="bio-stat"><span>${r.xp.toFixed(0)}</span><span>XP</span></div>
        </div>
        <div style="font-size:11.5px;color:var(--text-2);margin-top:8px">
          <strong>أبرز الملاحظات:</strong> ${notes.length ? notes.map(n=>n.text).join(' | ') : 'لا توجد ملاحظات مسجلة.'}
        </div>
      </div>
    `;
    setHtml('bioProfile', html);
  },
  async saveNote() {
    const student = getVal('bio-student'); if (!student) return;
    const note = getVal('bio-transfer-note');
    await Store.set(`transfer_note_${student}`, note);
    UI.toast('تم حفظ ملاحظة الانتقال', 'success');
  }
};

// ══════════════════════════════════════════════════════════
//  INITIALIZATION
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
//  ⚡ QUICK ATTENDANCE MODULE
// ══════════════════════════════════════════════════════════
const QuickAtt = {
  async render() {
    const date = State.today;
    const allAtt = await DB.get('attendance');
    const todayAtt = allAtt[date] || {};
    const pupils = PupilMgr.getPupilNames();
    const el = document.getElementById('quickAttList');
    const lbl = document.getElementById('quick-att-date-lbl');
    if (!el) return;
    if (lbl) lbl.textContent = date;
    el.innerHTML = pupils.map(p => {
      const st = typeof todayAtt[p] === 'object' ? todayAtt[p]?.status : todayAtt[p];
      const isAbsent = st === 'absent';
      return `<div class="quick-att-item${isAbsent ? ' absent' : ''}" id="qatt-${p.replace(/\s/g,'_')}" onclick="QuickAtt.toggle('${p.replace(/'/g,"\\'")}')">
        ${isAbsent ? '❌' : '✅'} ${p}
      </div>`;
    }).join('');
  },
  async toggle(name) {
    const date = State.today;
    const allAtt = await DB.get('attendance');
    if (!allAtt[date]) allAtt[date] = {};
    const cur = allAtt[date][name];
    const curSt = typeof cur === 'object' ? cur?.status : cur;
    const newSt = curSt === 'absent' ? 'present' : 'absent';
    const old = typeof cur === 'object' ? cur : {};
    allAtt[date][name] = { status: newSt, reason: old.reason || '', note: old.note || '' };
    await Store.set(DB._k('attendance'), allAtt);
    Engine.invalidate();
    this.render();
    await UI.renderPulseCard();
    await Engine.checkEarlyWarnings();
    UI.toast(`${name}: ${newSt === 'absent' ? '❌ غائب' : '✅ حاضر'}`, newSt === 'absent' ? 'warning' : 'success');
  },
  async markAllPresent() {
    const date = State.today;
    const allAtt = await DB.get('attendance');
    if (!allAtt[date]) allAtt[date] = {};
    PupilMgr.getPupilNames().forEach(p => { allAtt[date][p] = { status: 'present', reason: '', note: '' }; });
    await Store.set(DB._k('attendance'), allAtt);
    Engine.invalidate();
    this.render();
    await UI.renderPulseCard();
    UI.toast('تم تسجيل الكل حاضراً', 'success');
  }
};

// ══════════════════════════════════════════════════════════
//  💓 PULSE CARD
// ══════════════════════════════════════════════════════════
UI.renderPulseCard = async function() {
  const pupils = PupilMgr.getPupilNames();
  const date = State.today;
  const allAtt = await DB.get('attendance');
  const todayAtt = allAtt[date] || {};
  let presentCount = 0, absentCount = 0, strugglingCount = 0;

  for (const p of pupils) {
    const st = typeof todayAtt[p] === 'object' ? todayAtt[p]?.status : todayAtt[p];
    if (st === 'absent') absentCount++;
    else presentCount++;
    const res = await Engine.calculatePI(p, State.level);
    if (res.pi < 5) strugglingCount++;
  }

  // Count participations today from sessions (activity counter proxy = homework done)
  const hwData = await DB.get('homework');
  const todayHW = hwData[date] || {};
  const participations = Object.values(todayHW).filter(v => v === 'done').length;

  const pulseDateEl = document.getElementById('pulse-date');
  if (pulseDateEl) pulseDateEl.textContent = date;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('pulse-total', pupils.length);
  set('pulse-present', presentCount);
  set('pulse-absent', absentCount);
  set('pulse-struggling', strugglingCount);
  set('pulse-participations', participations);
};

// ══════════════════════════════════════════════════════════
//  🚨 EARLY WARNING SYSTEM
// ══════════════════════════════════════════════════════════
Engine.checkEarlyWarnings = async function() {
  const pupils = PupilMgr.getPupilNames();
  const warnings = [];

  for (const p of pupils) {
    const reasons = [];

    // Check: score < 50 (out of 100, i.e. < 5 on 10) in 2 consecutive tests
    const grades = await DB.get('grades');
    for (const subj of ['arabic', 'islamic', 'social', 'art', 'pe']) {
      const g = (grades[subj] || {})[p] || {};
      const keys = ['t1','t2','t3','t4'];
      const vals = keys.map(k => g[k]).filter(v => v !== '' && v !== undefined && !isNaN(v)).map(Number);
      for (let i = 0; i < vals.length - 1; i++) {
        if (vals[i] < 5 && vals[i+1] < 5) {
          const subjMap = { arabic:'العربية', islamic:'الإسلامية', social:'الاجتماعيات', art:'الفنية', pe:'البدنية' };
          reasons.push(`نقطتان متتاليتان ضعيفتان في ${subjMap[subj]}`);
          break;
        }
      }
    }

    // Check: more than 2 absences this week
    const allAtt = await DB.get('attendance');
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((dayOfWeek + 1) % 7)); // Saturday start
    let weekAbsences = 0;
    Object.keys(allAtt).forEach(d => {
      const dDate = new Date(d);
      if (dDate >= weekStart && dDate <= now) {
        const v = allAtt[d]?.[p];
        const st = typeof v === 'object' ? v?.status : v;
        if (st === 'absent') weekAbsences++;
      }
    });
    if (weekAbsences > 2) reasons.push(`${weekAbsences} غيابات هذا الأسبوع`);

    if (reasons.length > 0) warnings.push({ name: p, reasons });
  }

  const sec = document.getElementById('earlyWarningSection');
  const cards = document.getElementById('earlyWarningCards');
  if (!sec || !cards) return;

  if (warnings.length === 0) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  cards.innerHTML = warnings.map(w => `
    <div class="intervention-card">
      <div class="int-avatar" style="background:linear-gradient(135deg,#f59e0b,#ef4444)">${w.name[0]}</div>
      <div class="int-info">
        <div class="int-name">${w.name}</div>
        <div class="int-reason">${w.reasons.join(' | ')}</div>
      </div>
      <button class="btn btn-warning btn-xs" onclick="UI.openProfile('${w.name}')">ملف</button>
    </div>`).join('');

  // Also add to smartAlerts
  const dismissed = await Store.get('dismissed_alerts', []);
  const bar = document.getElementById('smartAlertsContainer');
  if (!bar) return;
  warnings.forEach(w => {
    const id = `ew_${w.name.replace(/\s/g,'_')}`;
    if (!dismissed.includes(id) && !document.getElementById(`alrt-${id}`)) {
      const div = document.createElement('div');
      div.className = 'smart-alert danger';
      div.id = `alrt-${id}`;
      div.innerHTML = `<span>⚠️ تنبيه مبكر: ${w.name} — ${w.reasons[0]}</span><button class="close-alert" onclick="UI.dismissAlert('${id}')">✕</button>`;
      bar.appendChild(div);
    }
  });
};

async function initApp() {
  await PupilMgr.init();
  SyncMgr.init();
  
  // Load theme
  const theme = await Store.get('theme', 'light');
  document.documentElement.setAttribute('data-theme', theme);
  
  // Set today's date defaults
  const dateInputs = ['att-date', 'hw-date', 'lib-date', 'session-date', 'rpt-date', 'hyp-date'];
  dateInputs.forEach(id => setVal(id, State.today));
  
  // Init year/level selectors
  setVal('globalYear', State.year);
  setVal('globalLevel', State.level);
  
  initDropdowns();
  Chart.defaults.font.family = "'Tajawal', sans-serif";
  
  await UI.renderDashboard();
  UI.resetWheel();
  
  // Seed library only if empty (uses real pupil names from current level)
  await LegacyMigrator.seedIfEmpty();
}

window.addEventListener('load', async () => {
  Chart.defaults.font.family = "'Tajawal', sans-serif";
  
  // Show loading, then login
  setTimeout(async () => {
    document.getElementById('loadingScreen').style.display = 'none';
    
    if (sessionStorage.getItem('auth_ok') === '1') {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appLayout').style.display = 'flex';
      await safeInitApp();
    } else {
      document.getElementById('loginScreen').style.display = 'flex';
    }
  }, 1500); // 1.5s loading animation
});

(function(){
  const GoalBank = {
    key(){ return `goal_bank_${State.year}_L${State.level}`; },
    async getAll(){ return await Store.get(this.key(), {}); },
    async saveAll(data){ await Store.set(this.key(), data); },
    async getForSubject(subject){
      const all = await this.getAll();
      const arr = Array.isArray(all[subject]) ? all[subject] : [];
      return arr.sort((a,b)=>(b.count||0)-(a.count||0) || (b.lastUsed||'').localeCompare(a.lastUsed||''));
    },
    async remember(subject, text){
      text = String(text||'').trim();
      if(!subject || !text) return;
      const all = await this.getAll();
      if(!Array.isArray(all[subject])) all[subject] = [];
      const found = all[subject].find(x => (x.text||'') === text);
      if(found){ found.count = (found.count||0)+1; found.lastUsed = State.today; }
      else all[subject].push({ text, count:1, lastUsed:State.today });
      await this.saveAll(all);
    }
  };

  const SupportReports = {
    async getLastResult(name){
      const allG = await DB.get('grades');
      const values = [];
      const pull = (obj, keys) => keys.forEach(k => { const v = parseFloat(obj?.[name]?.[k]); if(!isNaN(v)) values.push(v); });
      pull(allG.arabic || {}, ['t1','t2','t3','t4']);
      pull(allG.islamic || {}, ['t1','t2','t3','t4']);
      pull(allG.art || {}, ['t1','t2','t3','t4']);
      pull(allG.pe || {}, ['t1','t2','t3','t4']);
      pull(allG.social || {}, ['h1','h2','g1','g2','c1','c2']);
      return values.length ? values[values.length - 1].toFixed(2) : '—';
    },
    async getLastNote(name){
      const notes = (await DB.get('notes')).filter(n => n.student === name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      return notes[0] ? notes[0].text : 'لا توجد ملاحظة';
    },
    async getSupportStatus(name){
      const rem = (await DB.get('remediation')).filter(r => r.student === name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      if(!rem.length) return {text:'غير مسجل', cls:'badge-gray'};
      const s = rem[0].status;
      if(s === 'resolved') return {text:'تم تجاوز الصعوبة', cls:'badge-green'};
      if(s === 'improving') return {text:'في تحسن', cls:'badge-orange'};
      return {text:'دعم نشط', cls:'badge-red'};
    },
    async printStudentSupport(name){
      const rem = (await DB.get('remediation')).filter(r => r.student === name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      const notes = (await DB.get('notes')).filter(n => n.student === name).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
      const perf = await Engine.calculatePI(name, State.level);
      const teacher = await Store.get('setting_teacher', 'الأستاذ');
      const school = await Store.get('setting_school', 'المدرسة');
      const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>تقرير دعم ${name}</title><style>body{font-family:Tajawal,Arial,sans-serif;padding:24px;max-width:900px;margin:auto;color:#111}h1,h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:13px}th{background:#f3f4f6}.box{border:1px solid #ddd;border-radius:10px;padding:12px;margin:12px 0}.muted{color:#666;font-size:12px}</style></head><body><div style="border-bottom:3px double #4338ca;padding-bottom:12px;margin-bottom:16px"><h1 style="font-size:22px;color:#4338ca">تقرير دعم المتعلم</h1><div class="muted">${school} — ${State.year} — المستوى ${State.level} — ${teacher}</div></div><div class="box"><strong>اسم المتعلم:</strong> ${name}<br><strong>مؤشر الأداء:</strong> ${perf.pi.toFixed(2)}/10<br><strong>المعدل العام:</strong> ${perf.raw.gAvg.toFixed(2)}/10<br><strong>الغيابات:</strong> ${perf.raw.absCount}</div><h2 style="font-size:18px;margin-top:14px">خطة الدعم</h2>${rem.length ? `<table><thead><tr><th>التاريخ</th><th>المجال</th><th>الصعوبة</th><th>الخطة</th><th>الإجراءات</th><th>الحالة</th></tr></thead><tbody>${rem.map(r=>`<tr><td>${r.date||'—'}</td><td>${r.domain||'—'}</td><td>${r.type||'—'}</td><td>${r.plan||'—'}</td><td>${r.actions||'—'}</td><td>${r.status||'—'}</td></tr>`).join('')}</tbody></table>` : `<div class="box">لا توجد خطط دعم مسجلة.</div>`}<h2 style="font-size:18px;margin-top:18px">آخر الملاحظات</h2>${notes.length ? `<table><thead><tr><th>التاريخ</th><th>النوع</th><th>الملاحظة</th></tr></thead><tbody>${notes.slice(0,5).map(n=>`<tr><td>${n.date||'—'}</td><td>${n.type||'—'}</td><td>${n.text||'—'}</td></tr>`).join('')}</tbody></table>` : `<div class="box">لا توجد ملاحظات مسجلة.</div>`}<script>window.onload=function(){window.print();}<\/script></body></html>`;
      const w = window.open('', '_blank'); w.document.write(html); w.document.close();
    },
    async printStrugglingReport(){
      const pupils = PupilMgr.getPupilNames();
      const rows = [];
      for(const p of pupils){
        const perf = await Engine.calculatePI(p, State.level);
        const status = await this.getSupportStatus(p);
        if(perf.pi < 5 || status.text !== 'غير مسجل') rows.push({name:p, pi:perf.pi.toFixed(2), avg:perf.raw.gAvg.toFixed(2), abs:perf.raw.absCount, status:status.text, note: await this.getLastNote(p)});
      }
      const teacher = await Store.get('setting_teacher', 'الأستاذ');
      const school = await Store.get('setting_school', 'المدرسة');
      const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>تقرير دعم المتعثرين</title><style>body{font-family:Tajawal,Arial,sans-serif;padding:24px;max-width:980px;margin:auto}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:13px}th{background:#f3f4f6}.muted{color:#666;font-size:12px}</style></head><body><div style="border-bottom:3px double #4338ca;padding-bottom:12px;margin-bottom:16px"><h1 style="font-size:22px;color:#4338ca">تقرير دعم المتعثرين</h1><div class="muted">${school} — ${State.year} — المستوى ${State.level} — ${teacher}</div></div>${rows.length ? `<table><thead><tr><th>الاسم</th><th>PI</th><th>المعدل</th><th>الغيابات</th><th>حالة الدعم</th><th>آخر ملاحظة</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.name}</td><td>${r.pi}</td><td>${r.avg}</td><td>${r.abs}</td><td>${r.status}</td><td>${r.note}</td></tr>`).join('')}</tbody></table>` : '<p>لا توجد حالات دعم حالياً.</p>'}<script>window.onload=function(){window.print();}<\/script></body></html>`;
      const w = window.open('', '_blank'); w.document.write(html); w.document.close();
    }
  };

  const origMakeRow = Journal.makeRow.bind(Journal);
  Journal.makeRow = function(item, idx){
    const row = origMakeRow(item, idx);
    row.goalText = row.goalText || '';
    row.exitTicket = row.exitTicket || null;
    return row;
  };
  const origNormalizeWeek = Journal.normalizeWeek.bind(Journal);
  Journal.normalizeWeek = function(week, weekId){
    const out = origNormalizeWeek(week, weekId);
    out.rows = out.rows.map(r => ({...r, goalText: r.goalText || '', exitTicket: r.exitTicket || null}));
    return out;
  };

  Journal.selectGoal = async function(rowId, value){
    const val = String(value||'').trim();
    await this.updateRow(rowId, 'goalText', val, true);
    const data = await this.ensureData(); const row = data.weeks[data.currentWeekId].rows.find(r=>r.id===rowId);
    if(row && val) await GoalBank.remember(row.subject, val);
  };
  Journal.addGoalPrompt = async function(rowId){
    const data = await this.ensureData(); const row = data.weeks[data.currentWeekId].rows.find(r=>r.id===rowId); if(!row) return;
    const text = prompt(`أدخل هدف الحصة لمادة ${row.subject}`, row.goalText || '');
    if(text === null) return;
    await this.updateRow(rowId, 'goalText', text.trim(), true);
    if(text.trim()) await GoalBank.remember(row.subject, text.trim());
  };
  Journal.editExitTicket = async function(rowId){
    const data = await this.ensureData(); const week = data.weeks[data.currentWeekId]; const row = week.rows.find(r=>r.id===rowId); if(!row) return;
    const current = row.exitTicket || {};
    const question = prompt('سؤال بطاقة الخروج', current.question || '');
    if(question === null) return;
    const choices = prompt('الاختيارات السريعة مفصولة بعلامة |', Array.isArray(current.choices) ? current.choices.join(' | ') : '');
    if(choices === null) return;
    row.exitTicket = { question: question.trim(), choices: String(choices||'').split('|').map(s=>s.trim()).filter(Boolean), date: State.today, day: row.day, subject: row.subject, goalText: row.goalText || '' };
    await this.setData(data); await this.render(); UI.toast('تم ربط بطاقة الخروج بحصة اليوم', 'success');
  };

  Journal.renderSession = async function(row, idx){
    const compact = !this.isArabic(row.subject) ? ' compact' : '';
    const goals = await GoalBank.getForSubject(row.subject);
    const levelSelect = `<div><label class="form-label">المستوى</label><select class="form-control" onchange="Journal.updateRow('${row.id}','level',this.value)">${this.levelOptions.map(l => `<option value="${l}" ${row.level===l?'selected':''}>${l}</option>`).join('')}</select></div>`;
    const delBtn = `<button class="danger-link" onclick="Journal.deleteRow('${row.id}')">حذف الحصة</button>`;
    const quickTools = `<div class="journal-quick-tools no-print"><button class="btn btn-ghost btn-xs" onclick="Journal.editExitTicket('${row.id}')">🎟️ بطاقة خروج</button>${row.exitTicket?.question ? `<span class="exit-ticket-chip" title="${this.escAttr(row.exitTicket.question)}">مرتبطة بالحصة</span>` : ''}</div>`;
    const actionBtns = `<div class="journal-session-actions no-print">${this.isArabic(row.subject) ? `<button class="btn-outline-mini" onclick="Journal.copyArabicPatternFromRow('${row.id}')">🔁 تعميم العربية</button>` : ''}${delBtn}</div>`;
    const goalBlock = `<div class="goal-bank-wrap no-print"><label class="form-label" style="margin:0">هدف الحصة</label><select class="form-control goal-select" onchange="Journal.selectGoal('${row.id}',this.value)"><option value="">اختر هدفاً مستعملاً أو اتركه فارغاً</option>${goals.map(g=>`<option value="${this.escAttr(g.text)}" ${row.goalText===g.text?'selected':''}>${this.esc(g.text)} (${g.count||1})</option>`).join('')}</select><button class="btn btn-ghost btn-xs" onclick="Journal.addGoalPrompt('${row.id}')">➕ هدف جديد</button>${row.goalText ? `<span class="goal-chip">${this.esc(row.goalText)}</span>` : ''}</div>`;
    const homeworkBlock = `<div class="full"><div class="journal-toggle-row"><label>الواجب المنزلي</label><label><input type="radio" name="hw_${row.id}" ${row.hasHomework ? 'checked' : ''} onchange="Journal.updateRow('${row.id}','hasHomework',true,true)"> نعم</label><label><input type="radio" name="hw_${row.id}" ${!row.hasHomework ? 'checked' : ''} onchange="Journal.updateRow('${row.id}','hasHomework',false,true)"> لا</label></div>${row.hasHomework ? `<textarea class="form-control" placeholder="اكتب الواجب المنزلي" oninput="Journal.updateRow('${row.id}','homeworkText',this.value)">${this.esc(row.homeworkText||'')}</textarea>` : `<div class="journal-mini-note">لا يوجد واجب منزلي مسجل</div>`}</div>`;
    const notesBlock = `<div class="full"><label class="form-label">ملاحظات الأستاذ</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','notes',this.value)">${this.esc(row.notes||'')}</textarea></div>`;
    const componentOpts = this.getComponentOptions(row.subject).map(opt => `<option value="${this.escAttr(opt)}" ${row.component===opt?'selected':''}>${opt}</option>`).join('');
    const componentBlock = this.isArabic(row.subject) ? '' : `<div><label class="form-label">المكون</label><select class="form-control" onchange="Journal.updateComponent('${row.id}',this.value)">${componentOpts}</select>${row.component === 'مكون آخر' ? `<input class="form-control" style="margin-top:8px" placeholder="اكتب المكون الآخر" value="${this.escAttr(row.componentOther||'')}" oninput="Journal.updateRow('${row.id}','componentOther',this.value)">` : ''}</div>`;
    if (this.isArabic(row.subject)) {
      return `<div class="journal-session${compact}"><div class="journal-session-head"><div class="journal-session-title"><span class="journal-chip subject">${row.subject}</span><span class="journal-chip level">الحصة ${idx+1}</span></div>${actionBtns}</div><div class="journal-grid">${levelSelect}${goalBlock}<div class="full"><div class="journal-help-note">في اللغة العربية فقط: لا تظهر خانة المكون، وتُكتب الحصة عبر افتتاح + نشاط 1 + نشاط 2 + اختتام.</div></div><div class="full"><label class="form-label">افتتاح الحصة</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','opening',this.value)">${this.esc(row.opening||'')}</textarea></div><div><label class="form-label">نشاط 1</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','activity1',this.value)">${this.esc(row.activity1||'')}</textarea></div><div><label class="form-label">نشاط 2</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','activity2',this.value)">${this.esc(row.activity2||'')}</textarea></div><div class="full"><label class="form-label">اختتام الحصة</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','closing',this.value)">${this.esc(row.closing||'')}</textarea></div>${quickTools}${homeworkBlock}${notesBlock}</div></div>`;
    }
    return `<div class="journal-session${compact}"><div class="journal-session-head"><div class="journal-session-title"><span class="journal-chip subject">${row.subject}</span><span class="journal-chip level">الحصة ${idx+1}</span></div>${actionBtns}</div><div class="journal-grid">${levelSelect}${componentBlock}${goalBlock}<div class="full"><label class="form-label">ما أُنجز في الحصة</label><textarea class="form-control" oninput="Journal.updateRow('${row.id}','achieved',this.value)">${this.esc(row.achieved||'')}</textarea></div>${quickTools}${homeworkBlock}${notesBlock}</div></div>`;
  };

  const origJournalRender = Journal.render.bind(Journal);
  Journal.render = async function(){
    const holder = document.getElementById('journalDays'); if (!holder) return;
    const data = await this.ensureData();
    const current = data.weeks[data.currentWeekId];
    this.normalizeWeek(current, data.currentWeekId);
    document.getElementById('journalWeekBadge').textContent = current.label;
    const weekIds = Object.keys(data.weeks).sort().reverse();
    document.getElementById('journalWeekSelect').innerHTML = weekIds.map(id => `<option value="${id}" ${id===data.currentWeekId?'selected':''}>${data.weeks[id].label}</option>`).join('');
    const grouped = this.groupRows(current.rows || []);
    this.renderStats(current.rows || []);
    const dayHtml = [];
    for (const day of this.dayOrder){
      const rows = grouped[day] || [];
      const collapsed = current.openDays && current.openDays[day] === false;
      const dayDate = this.formatDate(this.dateForDay(data.currentWeekId, day));
      const sessionsHtml = [];
      for (let i=0;i<rows.length;i++) sessionsHtml.push(await this.renderSession(rows[i], i));
      dayHtml.push(`<div class="journal-day-card ${collapsed ? 'collapsed' : ''}" id="journal-day-${day}"><div class="journal-day-head" onclick="Journal.toggleDay('${day}')"><div class="head-main"><span class="journal-day-toggle">${collapsed ? '+' : '−'}</span><div><h3>${day}</h3><div class="sub">${rows.length} حصة مبرمجة</div><div class="journal-day-meta">${dayDate}</div></div></div><div class="journal-day-actions no-print" onclick="event.stopPropagation()"><button class="btn-outline-mini" onclick="Journal.copyDay('${day}')">📋 نسخ اليوم</button><button class="btn-outline-mini" onclick="Journal.addSession('${day}')">➕ إضافة حصة</button><button class="btn-outline-mini" onclick="Journal.printDay('${day}')">🖨️ طباعة اليوم</button></div></div><div class="journal-day-note no-print"><label class="form-label">ملاحظات عامة لليوم</label><textarea class="form-control" placeholder="ملاحظات عامة حول هذا اليوم" oninput="Journal.updateDayNote('${day}',this.value)">${this.esc(current.dayNotes[day] || '')}</textarea></div><div class="journal-day-body">${sessionsHtml.join('')}</div></div>`);
    }
    holder.innerHTML = dayHtml.join('');
  };

  const origRenderReports = UI.renderReports.bind(UI);
  UI.renderReports = async function(filter=''){
    const pupils = PupilMgr.getPupilNames().filter(p => !filter || p.includes(filter));
    if (!pupils.length) { setHtml('reportsContainer', '<div class="empty-state"><div class="empty-icon">📑</div><p>لا توجد نتائج</p></div>'); return; }
    const miniCards = [];
    const cards = [];
    for (const p of pupils){
      const r = await Engine.calculatePI(p, State.level);
      const piColor = r.pi >= 7 ? 'var(--success)' : r.pi >= 5 ? 'var(--warning)' : 'var(--danger)';
      const warn = await Engine.checkEarlyWarning(p);
      const lastResult = await SupportReports.getLastResult(p);
      const lastNote = await SupportReports.getLastNote(p);
      const supportStatus = await SupportReports.getSupportStatus(p);
      miniCards.push(`<div class="mini-learner-card"><h4>${p}</h4><div class="mini-learner-meta"><div><strong>آخر ملاحظة:</strong> ${lastNote}</div><div><strong>آخر نتيجة:</strong> ${lastResult}</div><div><strong>حالة الدعم:</strong> <span class="badge ${supportStatus.cls}">${supportStatus.text}</span></div></div></div>`);
      cards.push(`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);padding:16px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap"><div style="cursor:pointer;flex:1" onclick="UI.openProfile('${p}')"><div style="font-weight:900;font-size:13.5px">${p}</div><div style="font-size:11px;color:var(--text-3);margin-top:3px">XP: ${r.xp.toFixed(0)} · Lv ${r.lvl} · غياب: ${r.raw.absCount}</div>${warn ? '<span class="badge badge-red" style="margin-top:6px">⚠ إنذار مبكر</span>' : ''}<div style="font-size:11px;color:var(--text-2);margin-top:6px">آخر نتيجة: ${lastResult} · حالة الدعم: ${supportStatus.text}</div></div><div style="text-align:center;min-width:74px"><div style="font-size:28px;font-weight:900;color:${piColor};font-family:Cairo">${r.pi.toFixed(1)}</div><div style="font-size:9.5px;color:var(--text-3)">مؤشر PI</div></div><div class="report-action-row no-print"><button class="btn btn-ghost btn-sm" onclick="UI.openProfile('${p}')">الملف الفردي</button><button class="btn btn-info btn-sm" onclick="event.stopPropagation();switchTab('parent-report');setVal('pr-student','${p}');ParentReport.generate();">تقرير ولي الأمر</button><button class="btn btn-warning btn-sm" onclick="event.stopPropagation();SupportReports.printStudentSupport('${p}')">تقرير الدعم</button></div></div>`);
    }
    setHtml('reportsContainer', `<div class="mini-learner-cards">${miniCards.join('')}</div><div style="display:flex;flex-direction:column;gap:10px">${cards.join('')}</div>`);
    const headerRow = document.querySelector('#tab-reports .card-header .flex-row');
    if (headerRow && !document.getElementById('strugglingReportBtn')) {
      const btn = document.createElement('button');
      btn.id = 'strugglingReportBtn'; btn.className = 'btn btn-warning btn-sm no-print'; btn.textContent = '📄 تقرير دعم المتعثرين';
      btn.onclick = () => SupportReports.printStrugglingReport();
      headerRow.appendChild(btn);
    }
  };

  window.SupportReports = SupportReports;
})();
