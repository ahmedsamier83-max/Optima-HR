let curLat = null, curLng = null, curAddr = '';
let pingTimer = null;
const PING_MS = 2 * 60 * 1000; // matches LOCATION_PING_MINUTES default

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireRole('employee')) return;
  if (sessionStorage.getItem('optima_force_pw_change') === '1') {
    showTab('settings', document.querySelector('.tab:nth-child(4)'));
    toast('يجب تغيير كلمة المرور المبدئية أولاً', 'err');
  }
  await loadMe();
  await refreshStatus();
  await loadLeaveTab();
  await loadPayroll();
  locate();
});

function logout() { Api.clearSession(); location.href = 'login.html'; }

const TAB_LOADERS = {
  attendance: refreshStatus,
  leaves: loadLeaveTab,
  payroll: loadPayroll,
};

function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.ap').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ap-' + name).classList.add('active');
  // re-fetch this tab's data every time it's opened (e.g. admin may have
  // approved a leave request while this tab sat open in the background)
  const loader = TAB_LOADERS[name];
  if (loader) loader();
}

async function loadMe() {
  const me = await Api.get('/api/auth/me');
  const e = me.employee;
  document.getElementById('eName').textContent = e.full_name;
  document.getElementById('eTitle').textContent = e.title || '';
  const av = document.getElementById('eAvatar');
  av.textContent = e.full_name.charAt(0);
  av.style.background = e.color || '#1a3c5e';
}

function locate() {
  const el = document.getElementById('locVal');
  if (!navigator.geolocation) { el.textContent = 'المتصفح لا يدعم تحديد الموقع'; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      curLat = pos.coords.latitude; curLng = pos.coords.longitude;
      curAddr = `${curLat.toFixed(5)}, ${curLng.toFixed(5)}`;
      el.textContent = '📍 ' + curAddr;
    },
    () => { el.textContent = 'تعذر تحديد الموقع — يرجى السماح بالوصول'; },
    { enableHighAccuracy: true }
  );
}

async function refreshStatus() {
  const s = await Api.get('/api/attendance/status');
  const pill = document.getElementById('statusPill');
  const btnIn = document.getElementById('btnIn');
  const btnOut = document.getElementById('btnOut');
  const note = document.getElementById('liveNote');
  if (s.clockedIn) {
    pill.textContent = '✅ في العمل منذ ' + new Date(s.last.ts).toLocaleTimeString('ar-EG');
    pill.className = 'pill on';
    btnIn.disabled = true; btnOut.disabled = false;
    note.textContent = 'يتم إرسال موقعك الحي كل بضع دقائق أثناء الحضور.';
    startLivePing();
  } else {
    pill.textContent = 'غير مسجل حضور';
    pill.className = 'pill off';
    btnIn.disabled = false; btnOut.disabled = true;
    note.textContent = '';
    stopLivePing();
  }
  await loadAttendanceRows();
}

async function loadAttendanceRows() {
  const rows = await Api.get('/api/attendance/me');
  const tbody = document.getElementById('attRows');
  tbody.innerHTML = rows.slice(0, 20).map((r) => `
    <tr>
      <td>${r.type === 'checkin' ? '<span class="bdg bs">حضور</span>' : '<span class="bdg bd">انصراف</span>'}</td>
      <td>${new Date(r.ts).toLocaleDateString('ar-EG')}</td>
      <td>${new Date(r.ts).toLocaleTimeString('ar-EG')}</td>
      <td>${r.lat ? r.lat.toFixed(4) + ', ' + r.lng.toFixed(4) : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted center">لا توجد سجلات بعد</td></tr>';
}

async function doCheckin() {
  try {
    await Api.post('/api/attendance/checkin', { lat: curLat, lng: curLng, address: curAddr });
    toast('✅ تم تسجيل الحضور', 'ok');
    await refreshStatus();
  } catch (e) { toast(e.message, 'err'); }
}

async function doCheckout() {
  try {
    await Api.post('/api/attendance/checkout', { lat: curLat, lng: curLng, address: curAddr });
    toast('🚪 تم تسجيل الانصراف', 'ok');
    await refreshStatus();
  } catch (e) { toast(e.message, 'err'); }
}

function startLivePing() {
  if (pingTimer) return;
  const ping = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      curLat = pos.coords.latitude; curLng = pos.coords.longitude;
      document.getElementById('locVal').textContent = '📍 ' + curLat.toFixed(5) + ', ' + curLng.toFixed(5);
      Api.post('/api/attendance/ping', { lat: curLat, lng: curLng, accuracy: pos.coords.accuracy }).catch(() => {});
    }, () => {}, { enableHighAccuracy: true });
  };
  ping();
  pingTimer = setInterval(ping, PING_MS);
}

function stopLivePing() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}

// ── leaves ──

async function loadLeaveTab() {
  const bal = await Api.get('/api/leaves/balance');
  document.getElementById('leaveKpi').innerHTML = `
    <div class="kc"><div class="kl">رصيد الإجازات السنوي</div><div class="kv">${bal.total}</div></div>
    <div class="kc"><div class="kl">المستخدم هذا العام</div><div class="kv">${bal.used}</div></div>
    <div class="kc"><div class="kl">المتبقي</div><div class="kv">${bal.remaining}</div></div>`;

  const rows = await Api.get('/api/leaves/me');
  const statusBdg = { pending: 'bw', approved: 'bs', rejected: 'bd', cancelled: 'bi' };
  const statusTxt = { pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة', cancelled: 'ملغاة' };
  const typeTxt = { annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب', other: 'أخرى' };
  document.getElementById('lvRows').innerHTML = rows.map((r) => `
    <tr>
      <td>${typeTxt[r.leave_type] || r.leave_type}</td>
      <td>${r.start_date}</td>
      <td>${r.end_date}</td>
      <td>${r.days}</td>
      <td><span class="bdg ${statusBdg[r.status]}">${statusTxt[r.status]}</span></td>
      <td>${r.status === 'pending' ? `<button class="btn bsm br2" onclick="cancelLeave(${r.id})">إلغاء</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted center">لا توجد طلبات بعد</td></tr>';
}

async function requestLeave() {
  const leave_type = document.getElementById('lvType').value;
  const start_date = document.getElementById('lvStart').value;
  const end_date = document.getElementById('lvEnd').value;
  const reason = document.getElementById('lvReason').value;
  if (!start_date || !end_date) { toast('اختر تاريخ البداية والنهاية', 'err'); return; }
  try {
    await Api.post('/api/leaves', { leave_type, start_date, end_date, reason });
    toast('✅ تم إرسال طلب الإجازة', 'ok');
    document.getElementById('lvReason').value = '';
    await loadLeaveTab();
  } catch (e) { toast(e.message, 'err'); }
}

async function cancelLeave(id) {
  try {
    await Api.del('/api/leaves/' + id);
    toast('تم إلغاء الطلب', 'ok');
    await loadLeaveTab();
  } catch (e) { toast(e.message, 'err'); }
}

// ── payroll ──

async function loadPayroll() {
  const rows = await Api.get('/api/payroll/me');
  const months = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  document.getElementById('paySlipRows').innerHTML = rows.map((r) => `
    <tr>
      <td>${months[r.period_month]} ${r.period_year}</td>
      <td>${r.base_salary.toLocaleString()}</td>
      <td>${r.working_days}</td>
      <td>${r.present_days}</td>
      <td>${r.unpaid_leave_days}</td>
      <td>${r.deductions.toLocaleString()}</td>
      <td><strong>${r.net_pay.toLocaleString()}</strong></td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted center">لا توجد كشوف رواتب بعد</td></tr>';
}

// ── settings ──

async function changePassword() {
  const currentPassword = document.getElementById('curPw').value;
  const newPassword = document.getElementById('newPw').value;
  try {
    await Api.post('/api/auth/change-password', { currentPassword, newPassword });
    sessionStorage.removeItem('optima_force_pw_change');
    toast('✅ تم تحديث كلمة المرور', 'ok');
    document.getElementById('curPw').value = '';
    document.getElementById('newPw').value = '';
  } catch (e) { toast(e.message, 'err'); }
}
