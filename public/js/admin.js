let liveMapInstance = null, liveMapMarker = null, liveMapTrail = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireRole('admin')) return;
  const now = new Date();
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  document.getElementById('pyYear').value = prevYear;
  document.getElementById('pyMonth').value = prevMonth;

  await loadDashboard();
  await loadEmployees();
  await loadLive();
  await loadLeaves();
  await loadRuns();
});

function logout() { Api.clearSession(); location.href = 'login.html'; }

function showTab(name, btn) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.ap').forEach((p) => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ap-' + name).classList.add('active');
  if (name === 'live') refreshLiveMapIfOpen();
}

// ── dashboard ──

async function loadDashboard() {
  const [employees, live, pending, runs] = await Promise.all([
    Api.get('/api/employees'),
    Api.get('/api/attendance/live'),
    Api.get('/api/leaves?status=pending'),
    Api.get('/api/payroll/runs'),
  ]);
  const clockedIn = live.filter((r) => r.clockedIn).length;
  const lastRun = runs[0];
  let lastRunTotal = '—';
  if (lastRun) {
    const detail = await Api.get('/api/payroll/runs/' + lastRun.id);
    lastRunTotal = detail.slips.reduce((s, x) => s + x.net_pay, 0).toLocaleString();
  }
  document.getElementById('dashKpi').innerHTML = `
    <div class="kc"><div class="kl">إجمالي الموظفين</div><div class="kv">${employees.filter((e) => e.active).length}</div></div>
    <div class="kc"><div class="kl">حاضرون الآن</div><div class="kv">${clockedIn}</div></div>
    <div class="kc"><div class="kl">طلبات إجازة معلقة</div><div class="kv">${pending.length}</div></div>
    <div class="kc"><div class="kl">إجمالي آخر رواتب</div><div class="kv" style="font-size:18px">${lastRunTotal}</div></div>`;

  const att = await Api.get('/api/attendance');
  document.getElementById('recentAtt').innerHTML = att.slice(0, 15).map((r) => `
    <tr>
      <td>${r.full_name}</td>
      <td>${r.type === 'checkin' ? '<span class="bdg bs">حضور</span>' : '<span class="bdg bd">انصراف</span>'}</td>
      <td>${new Date(r.ts).toLocaleDateString('ar-EG')}</td>
      <td>${new Date(r.ts).toLocaleTimeString('ar-EG')}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted center">لا توجد سجلات بعد</td></tr>';
}

// ── employees ──

async function loadEmployees() {
  const rows = await Api.get('/api/employees');
  document.getElementById('empRows').innerHTML = rows.map((e) => `
    <tr>
      <td>${e.full_name}</td>
      <td>${e.title || '—'}</td>
      <td><code>${e.username || '—'}</code></td>
      <td>${e.base_salary.toLocaleString()}</td>
      <td>${e.active ? '<span class="bdg bs">نشط</span>' : '<span class="bdg bd">موقوف</span>'}</td>
      <td>
        <button class="btn bsm ba" onclick="resetPassword(${e.id},'${escapeAttr(e.full_name)}')">إعادة تعيين كلمة السر</button>
        ${e.active ? `<button class="btn bsm br2" onclick="deactivateEmployee(${e.id},'${escapeAttr(e.full_name)}')">إيقاف</button>` : ''}
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted center">لا يوجد موظفون بعد</td></tr>';
}

function escapeAttr(s) { return String(s).replace(/'/g, "\\'"); }

async function addEmployee() {
  const full_name = document.getElementById('neName').value.trim();
  const title = document.getElementById('neTitle').value.trim();
  const phone = document.getElementById('nePhone').value.trim();
  const email = document.getElementById('neEmail').value.trim();
  const base_salary = Number(document.getElementById('neSalary').value) || 0;
  const annual_leave_days = Number(document.getElementById('neLeave').value) || 21;
  if (!full_name) { toast('اسم الموظف مطلوب', 'err'); return; }
  try {
    const res = await Api.post('/api/employees', { full_name, title, phone, email, base_salary, annual_leave_days });
    toast('✅ تم إضافة الموظف', 'ok');
    alert(
      `تم إنشاء حساب دخول للموظف:\n\nاسم المستخدم: ${res.credentials.username}\nكلمة المرور المبدئية: ${res.credentials.tempPassword}\n\nسلّم هذه البيانات للموظف — سيُطلب منه تغيير كلمة المرور عند أول دخول.`
    );
    ['neName', 'neTitle', 'nePhone', 'neEmail', 'neSalary'].forEach((id) => (document.getElementById(id).value = ''));
    document.getElementById('neLeave').value = 21;
    await loadEmployees();
  } catch (e) { toast(e.message, 'err'); }
}

async function resetPassword(id, name) {
  if (!confirm(`إعادة تعيين كلمة سر ${name}؟`)) return;
  try {
    const res = await Api.post(`/api/employees/${id}/reset-password`, {});
    alert(`تم إعادة تعيين كلمة المرور لـ ${name}:\n\nاسم المستخدم: ${res.username}\nكلمة المرور المؤقتة: ${res.tempPassword}`);
  } catch (e) { toast(e.message, 'err'); }
}

async function deactivateEmployee(id, name) {
  if (!confirm(`إيقاف حساب ${name}؟ سيتم منعه من الدخول.`)) return;
  try {
    await Api.del('/api/employees/' + id);
    toast('تم إيقاف الموظف', 'ok');
    await loadEmployees();
  } catch (e) { toast(e.message, 'err'); }
}

// ── live map ──

async function loadLive() {
  const rows = await Api.get('/api/attendance/live');
  const active = rows.filter((r) => r.clockedIn);
  document.getElementById('liveList').innerHTML = active.map((r) => `
    <div class="livecard" onclick="openLiveMap(${r.employee.id}, '${escapeAttr(r.employee.full_name)}')">
      <div class="lav" style="background:${r.employee.color}">${r.employee.full_name.charAt(0)}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${r.employee.full_name}</div>
        <div class="muted">منذ ${new Date(r.since).toLocaleTimeString('ar-EG')}${r.lastLocation ? ' • ' + r.lastLocation.lat.toFixed(4) + ', ' + r.lastLocation.lng.toFixed(4) : ''}</div>
      </div>
      <span class="bdg bs">مباشر</span>
    </div>`).join('') || '<p class="muted center">لا يوجد موظفون حاضرون الآن</p>';
}

let currentLiveEmp = null;
async function openLiveMap(employeeId, name) {
  currentLiveEmp = employeeId;
  document.getElementById('liveMapCard').style.display = 'block';
  document.getElementById('liveMapTitle').textContent = 'خريطة تتبع — ' + name;
  const pings = await Api.get('/api/attendance/live/' + employeeId);
  if (!liveMapInstance) {
    liveMapInstance = L.map('liveMap');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(liveMapInstance);
  }
  setTimeout(() => liveMapInstance.invalidateSize(), 50);
  if (liveMapMarker) liveMapInstance.removeLayer(liveMapMarker);
  if (liveMapTrail) liveMapInstance.removeLayer(liveMapTrail);
  if (!pings.length) { toast('لا يوجد موقع مسجل اليوم بعد', 'err'); return; }
  const latlngs = pings.map((p) => [p.lat, p.lng]);
  liveMapTrail = L.polyline(latlngs, { color: '#1a3c5e' }).addTo(liveMapInstance);
  const last = latlngs[latlngs.length - 1];
  liveMapMarker = L.marker(last).addTo(liveMapInstance);
  liveMapInstance.fitBounds(liveMapTrail.getBounds(), { padding: [30, 30] });
}

function refreshLiveMapIfOpen() {
  loadLive();
  if (currentLiveEmp) openLiveMap(currentLiveEmp, document.getElementById('liveMapTitle').textContent.replace('خريطة تتبع — ', ''));
}

// ── leaves ──

async function loadLeaves() {
  const status = document.getElementById('lvFilter').value;
  const rows = await Api.get('/api/leaves' + (status ? '?status=' + status : ''));
  const statusBdg = { pending: 'bw', approved: 'bs', rejected: 'bd', cancelled: 'bi' };
  const statusTxt = { pending: 'قيد المراجعة', approved: 'موافق عليها', rejected: 'مرفوضة', cancelled: 'ملغاة' };
  const typeTxt = { annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب', other: 'أخرى' };
  document.getElementById('lvRows').innerHTML = rows.map((r) => `
    <tr>
      <td>${r.full_name}</td>
      <td>${typeTxt[r.leave_type] || r.leave_type}</td>
      <td>${r.start_date}</td>
      <td>${r.end_date}</td>
      <td>${r.days}</td>
      <td>${r.reason || '—'}</td>
      <td><span class="bdg ${statusBdg[r.status]}">${statusTxt[r.status]}</span></td>
      <td>${r.status === 'pending' ? `
        <button class="btn bsm bg" onclick="decideLeave(${r.id},'approved')">قبول</button>
        <button class="btn bsm br2" onclick="decideLeave(${r.id},'rejected')">رفض</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="muted center">لا توجد طلبات</td></tr>';
}

async function decideLeave(id, decision) {
  try {
    await Api.post(`/api/leaves/${id}/decide`, { decision });
    toast(decision === 'approved' ? '✅ تم قبول الطلب' : 'تم رفض الطلب', 'ok');
    await loadLeaves();
  } catch (e) { toast(e.message, 'err'); }
}

// ── payroll ──

async function runPayroll() {
  const year = Number(document.getElementById('pyYear').value);
  const month = Number(document.getElementById('pyMonth').value);
  if (!year || !month) { toast('أدخل السنة والشهر', 'err'); return; }
  try {
    const res = await Api.post('/api/payroll/generate', { year, month });
    toast(`✅ تم تشغيل رواتب ${res.count} موظف`, 'ok');
    await loadRuns();
  } catch (e) { toast(e.message, 'err'); }
}

async function loadRuns() {
  const runs = await Api.get('/api/payroll/runs');
  const months = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  document.getElementById('runRows').innerHTML = runs.map((r) => `
    <tr>
      <td>${months[r.period_month]} ${r.period_year}</td>
      <td>${r.employee_count}</td>
      <td>${new Date(r.generated_at).toLocaleString('ar-EG')}</td>
      <td><button class="btn bsm ba" onclick="viewRun(${r.id})">عرض التفاصيل</button></td>
    </tr>`).join('') || '<tr><td colspan="4" class="muted center">لم يتم تشغيل أي رواتب بعد</td></tr>';
}

async function viewRun(id) {
  const { run, slips } = await Api.get('/api/payroll/runs/' + id);
  document.getElementById('runDetailCard').style.display = 'block';
  document.getElementById('runDetailTitle').textContent = `تفاصيل رواتب ${run.period_month}/${run.period_year}`;
  document.getElementById('runDetailRows').innerHTML = slips.map((s) => `
    <tr>
      <td>${s.full_name}</td>
      <td>${s.base_salary.toLocaleString()}</td>
      <td>${s.working_days}</td>
      <td>${s.present_days}</td>
      <td>${s.unpaid_leave_days}</td>
      <td>${s.deductions.toLocaleString()}</td>
      <td><strong>${s.net_pay.toLocaleString()}</strong></td>
    </tr>`).join('');
  document.getElementById('runDetailCard').scrollIntoView({ behavior: 'smooth' });
}
