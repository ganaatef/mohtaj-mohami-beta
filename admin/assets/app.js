import {download, getAuth, isPlatformAdmin, isStaff, login, logout, qs, request} from './api.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr = (value) => esc(value).replace(/`/g, '&#96;');
const roleLabel = (role) => ({CLIENT:'عميل',LAWYER:'محامي',OPS_AGENT:'تشغيل ودعم',PLATFORM_ADMIN:'مدير المنصة'})[role] || role || '—';
const planLabel = (plan) => ({BASIC:'الأساسية',ACCREDITED:'المحامي المعتمد',ELITE:'النخبة'})[plan] || plan || '—';
const statusLabels = {
  DRAFT:'مسودة',DISPATCHING:'جاري البحث',ASSIGNED:'تم الإسناد',EN_ROUTE:'في الطريق',ARRIVED:'وصل المحامي',IN_PROGRESS:'قيد التنفيذ',AWAITING_CLIENT:'بانتظار العميل',COMPLETED:'مكتملة',DISPUTED:'نزاع',CANCELLED:'ملغاة',OFFERS_PENDING:'بانتظار العروض',OFFER_ACCEPTED:'تم قبول عرض',AWAITING_FUNDING:'بانتظار التمويل',FUNDED:'مموّلة',COMPLETION_SUBMITTED:'تم تقديم الإنهاء',COMPLETION_PENDING_CLIENT:'بانتظار اعتماد الإنهاء',COMPLETION_CONFIRMED:'تم تأكيد الإنهاء',ADMIN_REVIEW:'مراجعة إدارية',SETTLED:'تمت التسوية',
  ACTIVE:'نشط',PENDING:'قيد المراجعة',REJECTED:'مرفوض',VERIFIED:'موثق',NEEDS_RESUBMISSION:'إعادة إرسال',NOT_STARTED:'لم يبدأ',PENDING_ADMIN_ACTIVATION:'بانتظار الإدارة',SUSPENDED:'موقوف',OPEN:'مفتوحة',IN_PROGRESS_SUPPORT:'قيد المعالجة',WAITING_USER:'بانتظار المستخدم',RESOLVED:'محلولة',CLOSED:'مغلقة',PENDING_CLIENT_CONFIRMATION:'بانتظار العميل',PENDING_MANUAL_REVIEW:'مراجعة يدوية',APPROVED_FOR_SETTLEMENT:'جاهز للتسوية',DEAD_LETTER:'فشل نهائي',CAPTURED:'تم التحصيل',AUTHORIZED:'مصرح',FAILED:'فشل'
};
const statusLabel = (s) => statusLabels[s] || s || '—';
const statusClass = (s) => {
  if (['ACTIVE','VERIFIED','CAPTURED','SETTLED','COMPLETED','COMPLETION_CONFIRMED','FUNDED','ARRIVED'].includes(s)) return 'good';
  if (['REJECTED','FAILED','DEAD_LETTER','DISPUTED','CANCELLED','SUSPENDED'].includes(s)) return 'bad';
  if (['PENDING','PENDING_ADMIN_ACTIVATION','DISPATCHING','AWAITING_FUNDING','WAITING_USER','PENDING_MANUAL_REVIEW','PENDING_CLIENT_CONFIRMATION'].includes(s)) return 'warn';
  return 'neutral';
};
const money = (minor, currency='EGP') => `${new Intl.NumberFormat('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(minor || 0)/100)} ${currency === 'EGP' ? 'جنيه' : currency}`;
const feeMoney = (value) => `${new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(value || 0))} جنيه`;
const dt = (value) => value ? new Date(value).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}) : '—';
const shortId = (id) => id ? String(id).slice(0,8) : '—';
const pill = (text, cls='neutral') => `<span class="pill ${cls}">${esc(text)}</span>`;
const empty = (title, body='') => `<div class="empty-state"><strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ''}</div>`;
const kv = (label, value, mono=false) => `<div class="kv"><b>${esc(label)}</b><span class="${mono?'mono':''}">${esc(value)}</span></div>`;

const pages = {
  dashboard:['مركز القيادة','OPERATIONS'], cases:['الطلبات والقضايا','CASE OPERATIONS'], emergency:['غرفة الطوارئ','EMERGENCY CONTROL'],
  'lawyer-review':['اعتماد المحامين','LAWYER REVIEW'], kyc:['مراجعة هوية العملاء','IDENTITY REVIEW'], users:['المستخدمون 360°','USER OPERATIONS'], support:['مكتب الدعم','SUPPORT DESK'],
  payments:['تحويلات InstaPay','FINANCE REVIEW'], subscriptions:['الاشتراكات والباقات','SUBSCRIPTIONS'], settlements:['التسويات','SETTLEMENTS'],
  services:['كتالوج الخدمات','SERVICE CATALOG'], directory:['الدليل القانوني','LEGAL DIRECTORY'], settings:['إعدادات التشغيل','PLATFORM SETTINGS'], audit:['مستكشف العمليات','AUDIT EXPLORER'], system:['صحة النظام','RELIABILITY']
};
const taskStatuses = ['DRAFT','DISPATCHING','ASSIGNED','EN_ROUTE','ARRIVED','IN_PROGRESS','AWAITING_CLIENT','OFFERS_PENDING','OFFER_ACCEPTED','AWAITING_FUNDING','FUNDED','COMPLETION_SUBMITTED','COMPLETION_PENDING_CLIENT','COMPLETION_CONFIRMED','ADMIN_REVIEW','DISPUTED','COMPLETED','SETTLED','CANCELLED'];
const autoRefreshViews = new Set(['dashboard','cases','emergency','support','payments','subscriptions','settlements','system']);

let currentView = 'dashboard';
let refreshTimer = null;
let refreshing = false;
let allUsers = [];
let tickets = [];
let selectedTicket = null;
let ticketTimer = null;
let summaryCache = null;

function toast(message, timeout=3200) {
  const node = $('toast');
  node.textContent = message;
  node.classList.remove('is-hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => node.classList.add('is-hidden'), timeout);
}
function setUpdated() { $('lastUpdated').textContent = `آخر تحديث ${new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}`; }
function loading(node, text='جاري التحميل...') { node.innerHTML = `<div class="loading-row">${esc(text)}</div>`; }
function setBadge(id, count) { const node=$(id); if(!node)return; const n=Number(count||0); node.textContent=n; node.classList.toggle('is-hidden',n<=0); }
function isAdmin() { return isPlatformAdmin(); }
function requireAdminView(view) { return ['payments','subscriptions','settlements','directory','audit','system'].includes(view); }

function applyPermissions() {
  document.querySelectorAll('[data-admin]').forEach((el) => el.classList.toggle('is-hidden', !isAdmin()));
}

function startApp() {
  const auth = getAuth();
  if (!auth || !isStaff()) return showLogin();
  $('loginView').classList.add('is-hidden');
  $('appView').classList.remove('is-hidden');
  $('staffIdentity').textContent = `${auth.display_name || auth.email || 'Staff'} · ${roleLabel(auth.role)}`;
  applyPermissions();
  const requested = location.hash.replace('#/','') || 'dashboard';
  navigate(requireAdminView(requested) && !isAdmin() ? 'dashboard' : (pages[requested] ? requested : 'dashboard'), false);
}
function showLogin() {
  $('appView').classList.add('is-hidden');
  $('loginView').classList.remove('is-hidden');
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); $('loginError').textContent='';
  try { await login($('loginEmail').value, $('loginPassword').value); startApp(); }
  catch (error) { $('loginError').textContent=error.message; }
});
$('logoutButton').addEventListener('click', async () => { await logout(); location.hash=''; showLogin(); });
window.addEventListener('admin-session-expired', () => { stopTimers(); showLogin(); toast('انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.'); });

function stopTimers() { clearInterval(refreshTimer); refreshTimer=null; clearInterval(ticketTimer); ticketTimer=null; }
function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (!autoRefreshViews.has(currentView)) return;
  refreshTimer = setInterval(() => refreshCurrent(true), 20000);
}
async function navigate(view, push=true) {
  if (!pages[view] || (requireAdminView(view) && !isAdmin())) view='dashboard';
  currentView=view;
  document.querySelectorAll('.view').forEach((el)=>el.classList.toggle('active',el.id===`view-${view}`));
  document.querySelectorAll('#sideNav button[data-view]').forEach((el)=>el.classList.toggle('active',el.dataset.view===view));
  $('pageTitle').textContent=pages[view][0]; $('pageEyebrow').textContent=pages[view][1];
  if(push) history.replaceState(null,'',`#/`+view);
  document.body.classList.remove('sidebar-open');
  clearInterval(ticketTimer); ticketTimer=null;
  scheduleRefresh();
  await refreshCurrent(false);
}
$('sideNav').addEventListener('click',(e)=>{const b=e.target.closest('[data-view]');if(b)navigate(b.dataset.view)});
document.addEventListener('click',(e)=>{const b=e.target.closest('[data-jump]');if(b)navigate(b.dataset.jump)});
$('refreshButton').addEventListener('click',()=>refreshCurrent(false));
$('mobileMenu').addEventListener('click',()=>document.body.classList.toggle('sidebar-open'));
window.addEventListener('hashchange',()=>{const v=location.hash.replace('#/','');if(v&&v!==currentView)navigate(v,false)});

async function refreshCurrent(silent=false) {
  if (refreshing) return;
  refreshing=true;
  try {
    const loader = loaders[currentView];
    if(loader) await loader(silent);
    setUpdated();
  } catch(error) { if(!silent) toast(error.message); }
  finally { refreshing=false; }
}

function metric(label,value,note='',tone='') { return `<div class="metric-card ${tone}"><span class="metric-label">${esc(label)}</span><div class="metric-value">${esc(value)}</div><span class="metric-note">${esc(note)}</span></div>`; }
function miniMetric(label,value) { return `<div class="mini-metric"><b>${esc(value)}</b><span>${esc(label)}</span></div>`; }
function actionItem(title, note, view, label='فتح') { return `<div class="action-item"><div><strong>${esc(title)}</strong><span>${esc(note)}</span></div><button class="button soft tiny" data-jump="${attr(view)}">${esc(label)}</button></div>`; }

async function loadDashboard(silent=false) {
  if(!silent) loading($('dashboardMetrics'),'جاري تجميع مؤشرات المنصة...');
  const [summaryResult,casesResult,reliabilityResult] = await Promise.allSettled([
    request('/admin/console/summary'),
    request('/admin/console/tasks?limit=8'),
    isAdmin()?request('/admin/reliability/status'):Promise.resolve(null),
  ]);
  if(summaryResult.status==='rejected') throw summaryResult.reason;
  const s=summaryResult.value; summaryCache=s; updateNavBadges(s);
  const metrics=[
    ['المستخدمون',s.users,'إجمالي الحسابات',''],['المحامون',s.lawyers,'كل المحامين',''],['طلبات نشطة',s.active_tasks,'غير ملغاة أو مسوّاة',''],
    ['طوارئ نشطة',s.active_emergencies,'تحتاج متابعة لحظية',s.active_emergencies?'attention':''],['دعم مفتوح',s.open_support_tickets,`${s.unassigned_support_tickets||0} غير مسندة`,s.open_support_tickets?'attention':''],
    ['إشعارات فاشلة',s.notification_dead_letter,'Dead letter',s.notification_dead_letter?'risk':'healthy'],
  ];
  if(isAdmin()) metrics.push(['تحويلات للمراجعة',s.pending_manual_payments,'InstaPay خدمات',s.pending_manual_payments?'attention':''],['اشتراكات للمراجعة',s.pending_subscriptions,'InstaPay باقات',s.pending_subscriptions?'attention':''],['تسويات تحتاج قرار',s.settlements_needing_attention,'مراجعة مالية',s.settlements_needing_attention?'attention':''],['نزاعات مفتوحة',s.open_disputes,'تتطلب متابعة',s.open_disputes?'risk':'']);
  $('dashboardMetrics').innerHTML=metrics.map(x=>metric(...x)).join('');

  const actions=[];
  if(s.pending_lawyer_reviews) actions.push(actionItem('طلبات محامين بانتظار الاعتماد',`${s.pending_lawyer_reviews} ملف مكتمل يحتاج قرار`,'lawyer-review'));
  if(s.pending_client_kyc) actions.push(actionItem('هوية عملاء بانتظار المراجعة',`${s.pending_client_kyc} طلب تحقق`,'kyc'));
  if(s.active_emergencies) actions.push(actionItem('طلبات طوارئ نشطة',`${s.active_emergencies} مهمة في رحلة الطوارئ`,'emergency'));
  if(s.unassigned_support_tickets) actions.push(actionItem('تذاكر دعم غير مسندة',`${s.unassigned_support_tickets} تذكرة`,'support'));
  if(isAdmin()&&s.pending_manual_payments) actions.push(actionItem('تحويلات خدمات تحتاج مطابقة',`${s.pending_manual_payments} تحويل InstaPay`,'payments'));
  if(isAdmin()&&s.pending_subscriptions) actions.push(actionItem('اشتراكات تحتاج مطابقة',`${s.pending_subscriptions} تحويل اشتراك`,'subscriptions'));
  if(isAdmin()&&s.settlements_needing_attention) actions.push(actionItem('تسويات مالية تحتاج قرار',`${s.settlements_needing_attention} تسوية`,'settlements'));
  $('attentionCount').textContent=actions.length; $('attentionQueue').innerHTML=actions.join('')||empty('لا توجد قرارات عاجلة','القوائم التشغيلية مستقرة حاليًا.');

  if(casesResult.status==='fulfilled') renderTaskTable($('dashboardCases'),casesResult.value.items,{compact:true});
  else $('dashboardCases').innerHTML=empty('تعذر تحميل الطلبات',casesResult.reason.message);

  renderHealth(reliabilityResult.status==='fulfilled'?reliabilityResult.value:null,s);
}
function updateNavBadges(s) {
  setBadge('navLawyerBadge',s.pending_lawyer_reviews); setBadge('navKycBadge',s.pending_client_kyc); setBadge('navEmergencyBadge',s.active_emergencies); setBadge('navSupportBadge',s.open_support_tickets); setBadge('navPaymentBadge',s.pending_manual_payments); setBadge('navSubscriptionBadge',s.pending_subscriptions);
  const alerts=(s.notification_dead_letter||0)+(s.open_disputes||0)+(s.pending_manual_payments||0)+(s.pending_subscriptions||0); setBadge('navAlertBadge',alerts);
}
function renderHealth(health,s) {
  if(!isAdmin()) { $('systemHealthBadge').className='status-pill good'; $('systemHealthBadge').textContent='تشغيل'; $('dashboardHealth').innerHTML=`<div class="health-row"><span class="health-signal"></span><div><strong>وضع التشغيل</strong><span>متابعة المستخدمين والدعم متاحة</span></div></div>`; return; }
  const degraded=health?.status==='degraded'; $('systemHealthBadge').className=`status-pill ${degraded?'bad':'good'}`; $('systemHealthBadge').textContent=degraded?'يحتاج تدخل':'سليم';
  const rows=[['Outbox',`${health?.outbox?.pending??s.notification_outbox_pending} قيد الانتظار`,health?.outbox?.dead_letter?'bad':health?.outbox?.overdue?'warn':''],['الطوارئ',`${health?.dispatch?.emergency_stuck_over_5m||0} عالقة أكثر من 5 دقائق`,health?.dispatch?.emergency_stuck_over_5m?'bad':''],['موقع المحامين',`${health?.dispatch?.active_missions_stale_location||0} موقع قديم`,health?.dispatch?.active_missions_stale_location?'warn':'']];
  $('dashboardHealth').innerHTML=rows.map(([a,b,c])=>`<div class="health-row"><span class="health-signal ${c}"></span><div><strong>${esc(a)}</strong><span>${esc(b)}</span></div></div>`).join('');
}

function taskQuery(emergencyOverride) {
  const params={q:$('caseSearch')?.value.trim(),status:$('caseStatus')?.value,emergency:emergencyOverride!==undefined?emergencyOverride:($('caseType')?.value||undefined),limit:100};
  return '/admin/console/tasks'+qs(params);
}
async function loadCases(silent=false) {
  if(!silent) loading($('caseTable'));
  const data=await request(taskQuery());
  const items=data.items||[]; renderTaskTable($('caseTable'),items);
  const emergency=items.filter(x=>x.emergency).length, disputed=items.filter(x=>x.status==='DISPUTED').length, awaiting=items.filter(x=>['AWAITING_FUNDING','COMPLETION_PENDING_CLIENT','ADMIN_REVIEW'].includes(x.status)).length;
  $('caseStats').innerHTML=[['النتائج',data.total],['طوارئ في النتائج',emergency],['تحتاج تدخل',awaiting],['نزاعات',disputed]].map(x=>miniMetric(...x)).join('');
}
async function loadEmergency(silent=false) {
  if(!silent) loading($('emergencyTable'));
  const params={emergency:true,status:$('emergencyStatus').value||undefined,limit:100}; const data=await request('/admin/console/tasks'+qs(params)); const items=data.items||[];
  renderTaskTable($('emergencyTable'),items,{emergency:true});
  const groups={DISPATCHING:0,AWAITING_FUNDING:0,EN_ROUTE:0,IN_PROGRESS:0};items.forEach(x=>{if(groups[x.status]!==undefined)groups[x.status]++});
  $('emergencySummary').innerHTML=[['إجمالي الطوارئ',data.total],['جاري البحث',groups.DISPATCHING],['بانتظار التمويل',groups.AWAITING_FUNDING],['في الطريق',groups.EN_ROUTE],['قيد التنفيذ',groups.IN_PROGRESS]].map(x=>miniMetric(...x)).join('');
}
function renderTaskTable(node,items,opt={}) {
  if(!items?.length){node.innerHTML=empty('لا توجد طلبات مطابقة');return;}
  node.innerHTML=`<table class="data-table"><thead><tr><th>الطلب</th><th>الخدمة</th><th>العميل</th><th>المحامي</th><th>الموقع</th><th>الحالة</th><th>آخر تحديث</th></tr></thead><tbody>${items.map(t=>`<tr class="clickable" data-task-id="${attr(t.id)}"><td><div class="cell-title">${t.emergency?'⚡ ':''}#${esc(shortId(t.id))}</div><div class="cell-sub">${esc(t.emergency?'طوارئ':'عادي')}</div></td><td><div class="cell-title">${esc(t.service_name||t.service_type_id)}</div><div class="cell-sub">${esc(t.discovery_summary||'')}</div></td><td>${esc(t.client_name)}</td><td>${esc(t.lawyer_name||'غير مسند')}</td><td>${esc([t.city,t.area].filter(Boolean).join(' · '))}</td><td>${pill(statusLabel(t.status),statusClass(t.status))}</td><td class="nowrap">${esc(dt(t.updated_at))}</td></tr>`).join('')}</tbody></table>`;
}

async function openTask(id) {
  openDrawer('TASK 360°',`طلب #${shortId(id)}`,loadingHtml('جاري تحميل تفاصيل الطلب...'));
  try {
    const d=await request(`/admin/console/tasks/${encodeURIComponent(id)}`),t=d.task,p=d.payment,s=d.settlement,dis=d.dispute;
    const finance=isAdmin()?`<div class="drawer-section"><h3>التمويل والتسوية</h3><div class="money-box">${kv('حالة الدفع',p?statusLabel(p.status):'لا يوجد')}${kv('الإجمالي',p?money(p.total_client_amount_minor,p.currency):'—')}${kv('أتعاب المحامي',p?money(p.professional_fee_minor,p.currency):'—')}${kv('رسوم المنصة',p?money(p.platform_fee_minor,p.currency):'—')}${kv('حالة التسوية',s?statusLabel(s.status):'لا توجد')}${kv('صافي المحامي',s?money(s.net_lawyer_payout_minor,s.currency):'—')}</div>${p?.provider_reference?`<div class="kv" style="margin-top:7px"><b>مرجع الدفع</b><span class="mono">${esc(p.provider_reference)}</span></div>`:''}${dis?`<div class="card-actions">${pill(`نزاع: ${statusLabel(dis.status)}`,'bad')}<span>${esc(dis.reason_category)}</span></div>`:''}</div>`:'';
    $('drawerBody').innerHTML=`<div class="drawer-section"><div class="kv-grid">${kv('الحالة',statusLabel(t.status))}${kv('النوع',t.emergency?'طوارئ':'طلب عادي')}${kv('الخدمة',t.service_name)}${kv('مرحلة التوزيع',t.dispatch_search_stage)}${kv('العميل',t.client_name)}${kv('المحامي',t.lawyer_name||'غير مسند')}${kv('الموقع',[t.city,t.area].filter(Boolean).join(' · '))}${kv('أنشئ',dt(t.created_at))}</div></div><div class="drawer-section"><h3>وصف الطلب</h3><div class="kv"><span>${esc(t.summary_private||t.discovery_summary)}</span></div></div>${finance}<div class="drawer-section"><h3>المحتوى</h3><div class="mini-metrics">${miniMetric('العروض',d.counts?.offers||0)}${miniMetric('المستندات',d.counts?.documents||0)}${miniMetric('الرسائل',d.counts?.messages||0)}</div></div><div class="drawer-section"><h3>سجل الحالة</h3><div class="timeline">${(d.status_history||[]).map(h=>`<div class="timeline-item"><b>${esc(statusLabel(h.to_status))}</b><span>${esc(dt(h.created_at))}${h.note?` · ${esc(h.note)}`:''}</span></div>`).join('')||'<span class="subtle">لا يوجد سجل حالة.</span>'}</div></div>`;
  } catch(error) { $('drawerBody').innerHTML=empty('تعذر تحميل الطلب',error.message); }
}

async function loadUsers(silent=false) {
  if(!silent) loading($('userTable'));
  const role=$('userRole').value; allUsers=await request('/admin/users'+qs({role:role||undefined})); renderUsers();
}
function renderUsers() {
  const q=$('userSearch').value.trim().toLowerCase(); const rows=allUsers.filter(u=>!q||`${u.display_name||''} ${u.email||''} ${u.phone||''}`.toLowerCase().includes(q));
  if(!rows.length){$('userTable').innerHTML=empty('لا توجد نتائج');return;}
  $('userTable').innerHTML=`<table class="data-table"><thead><tr><th>المستخدم</th><th>الدور</th><th>الحساب</th><th>التوثيق</th><th>الهاتف</th><th>إجراء</th></tr></thead><tbody>${rows.map(u=>`<tr class="clickable" data-user-id="${attr(u.id)}"><td><div class="cell-title">${esc(u.display_name)}</div><div class="cell-sub">${esc(u.email||u.id)}</div></td><td>${esc(roleLabel(u.role))}</td><td>${pill(statusLabel(u.account_status||(u.active?'ACTIVE':'SUSPENDED')),statusClass(u.active?'ACTIVE':'SUSPENDED'))}</td><td>${pill(u.verified?'موثق':'غير موثق',u.verified?'good':'neutral')}</td><td dir="ltr">${esc(u.phone)}</td><td>${isAdmin()?`<button class="button tiny ${u.active?'danger':'ok'}" data-toggle-user="${attr(u.id)}" data-active="${u.active?'0':'1'}">${u.active?'إيقاف':'إعادة تفعيل'}</button>`:'—'}</td></tr>`).join('')}</tbody></table>`;
}
async function openUser(id) {
  openDrawer('USER 360°','ملف المستخدم',loadingHtml('جاري تحميل ملف المستخدم...'));
  try {
    const d=await request(`/admin/console/users/${encodeURIComponent(id)}`),u=d.user,p=d.profile||{},sub=d.subscription;
    const profileEntries=Object.entries(p).filter(([,v])=>v!==null&&v!==undefined&&v!=='');
    $('drawerTitle').textContent=u.display_name||'المستخدم';
    $('drawerBody').innerHTML=`<div class="drawer-section"><div class="kv-grid">${kv('الدور',roleLabel(u.role))}${kv('الحساب',statusLabel(u.account_status))}${kv('البريد',u.email,true)}${kv('الهاتف',u.phone,true)}${kv('التوثيق',u.verified?'موثق':'غير موثق')}${kv('حالة الهوية',statusLabel(u.identity_status))}${u.role==='LAWYER'?kv('توثيق المحامي',statusLabel(u.lawyer_verification_status)):''}${kv('تاريخ الانضمام',dt(u.created_at))}</div>${isAdmin()?`<div class="card-actions"><button class="button ${u.active?'danger':'ok'}" data-toggle-user="${attr(u.id)}" data-active="${u.active?'0':'1'}">${u.active?'إيقاف الحساب':'إعادة تفعيل الحساب'}</button></div>`:''}</div><div class="drawer-section"><h3>ملخص النشاط</h3><div class="mini-metrics">${miniMetric('الطلبات',d.counts?.tasks||0)}${miniMetric('تذاكر الدعم',d.counts?.support_tickets||0)}${miniMetric('مستندات التحقق',d.counts?.verification_documents||0)}${miniMetric('أجهزة نشطة',d.counts?.active_devices||0)}</div></div>${profileEntries.length?`<div class="drawer-section"><h3>البيانات المهنية / الشخصية</h3><div class="kv-grid">${profileEntries.map(([k,v])=>kv(humanField(k),v)).join('')}</div></div>`:''}${sub?`<div class="drawer-section"><h3>الاشتراك الحالي / الأخير</h3><div class="kv-grid">${kv('الباقة',planLabel(sub.plan))}${kv('الحالة',statusLabel(sub.status))}${kv('السعر',money(sub.price_minor,sub.currency))}${kv('ينتهي',dt(sub.expires_at))}</div></div>`:''}<div class="drawer-section"><h3>آخر الطلبات</h3>${(d.recent_tasks||[]).map(t=>`<button class="ticket-item" data-task-id="${attr(t.id)}"><div class="ticket-item-head"><strong>${t.emergency?'⚡ ':''}#${esc(shortId(t.id))}</strong>${pill(statusLabel(t.status),statusClass(t.status))}</div><div class="ticket-meta">${esc(t.service_type_id)} · ${esc(t.city)} · ${esc(dt(t.updated_at))}</div></button>`).join('')||empty('لا يوجد نشاط طلبات')}</div>${isAdmin()&&d.audit?.length?`<div class="drawer-section"><h3>آخر العمليات المرتبطة</h3><div class="timeline">${d.audit.slice(0,10).map(a=>`<div class="timeline-item"><b>${esc(actionLabel(a.action))}</b><span>${esc(dt(a.created_at))} · ${esc(a.entity_type)}</span></div>`).join('')}</div></div>`:''}`;
  } catch(error){$('drawerBody').innerHTML=empty('تعذر تحميل المستخدم',error.message)}
}
async function toggleUser(id,active) {
  if(!isAdmin())return; const reason=prompt(active?'سبب إعادة تفعيل الحساب:':'سبب إيقاف الحساب:'); if(reason===null||reason.trim().length<3){if(reason!==null)toast('اكتب سببًا واضحًا.');return;}
  if(!confirm(active?'تأكيد إعادة تفعيل الحساب؟':'تأكيد إيقاف الحساب؟'))return;
  try{await request(`/admin/users/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({active})});toast(active?'تمت إعادة تفعيل الحساب.':'تم إيقاف الحساب.');await loadUsers(true);if(!$('detailDrawer').classList.contains('is-hidden'))openUser(id)}catch(e){toast(e.message)}
}

async function loadLawyerReview(silent=false) {
  if(!silent) loading($('lawyerReviewQueue'));
  const rows=(await request('/admin/pending-users')).filter(u=>u.role==='LAWYER'); const q=$('lawyerReviewSearch').value.trim().toLowerCase(); const filtered=rows.filter(u=>!q||`${u.display_name||''} ${u.email||''} ${u.phone||''}`.toLowerCase().includes(q));
  $('lawyerReviewQueue').innerHTML=filtered.map(lawyerCard).join('')||empty('لا توجد ملفات محامين بانتظار القرار'); setBadge('navLawyerBadge',rows.length);
}
function lawyerCard(u){const a=u.lawyer_application||{},docs=a.documents||[];return `<article class="review-card pending"><div class="review-card-head"><div><h3>${esc(u.display_name)}</h3><div class="review-meta">${esc(u.email)} · <span dir="ltr">${esc(u.phone)}</span></div></div>${pill('ملف مكتمل','warn')}</div><div class="kv-grid">${kv('الاسم القانوني',a.full_legal_name)}${kv('المحافظة',a.governorate_code)}${kv('رقم القيد',a.bar_registration_number)}${kv('درجة القيد',a.bar_level)}${kv('سنة القيد',a.registration_year)}${kv('سنوات الخبرة',a.years_of_experience)}${kv('التخصصات',a.specialties)}${kv('مناطق الخدمة',a.service_cities)}</div><div class="card-actions">${docs.map(d=>`<button class="button soft tiny" data-doc-id="${attr(d.id)}">فتح ${esc(humanField(d.document_type))}</button>`).join('')}${isAdmin()?`<button class="button ok" data-account-decision="approve" data-user="${attr(u.user_id||u.id)}">اعتماد كامل</button><button class="button danger" data-account-decision="reject" data-user="${attr(u.user_id||u.id)}">رفض / طلب تعديل</button>`:''}</div></article>`}
async function decideAccount(id,approved){if(!isAdmin())return;let notes=approved?'تمت مراجعة الملف والهوية والقيد والمستندات واعتماد طلب المحامي.':prompt('اكتب سبب الرفض أو البيانات المطلوب استكمالها:');if(notes===null)return;if(!approved&&notes.trim().length<8){toast('سبب الرفض أو طلب التعديل لازم يكون واضحًا.');return}if(!confirm(approved?'اعتماد المحامي وتفعيل حسابه؟':'تأكيد رفض الطلب؟'))return;try{await request('/admin/activate-user',{method:'POST',body:JSON.stringify({user_id:id,approved,notes})});toast(approved?'تم اعتماد المحامي وتفعيل حسابه.':'تم تسجيل قرار الرفض.');loadLawyerReview(true)}catch(e){toast(e.message)}}

async function loadKyc(silent=false){if(!silent)loading($('kycQueue'));const st=$('kycFilter').value;const rows=await request('/admin/verification/queue'+qs({role_filter:'CLIENT',status_filter:st}));$('kycQueue').innerHTML=rows.map(kycCard).join('')||empty('لا توجد مراجعات بهذه الحالة');if(st==='PENDING')setBadge('navKycBadge',rows.length)}
function kycCard(v){const p=v.profile||{},docs=v.documents||[];return `<article class="review-card ${v.identity_status==='PENDING'?'pending':''}"><div class="review-card-head"><div><h3>${esc(v.display_name)}</h3><div class="review-meta">${esc(v.email||'')} · ${esc(roleLabel(v.role||'CLIENT'))}</div></div>${pill(statusLabel(v.identity_status),statusClass(v.identity_status))}</div><div class="kv-grid">${kv('الاسم القانوني',p.full_legal_name)}${kv('تاريخ الميلاد',p.date_of_birth)}${kv('نوع الهوية',humanField(p.id_type))}${kv('الجنسية',p.nationality)}</div><div class="card-actions">${docs.map(d=>`<button class="button soft tiny" data-doc-id="${attr(d.id)}">فتح ${esc(humanField(d.document_type))}</button>`).join('')}${isAdmin()?`<button class="button ok" data-kyc-action="APPROVE" data-user="${attr(v.user_id)}">اعتماد</button><button class="button soft" data-kyc-action="REQUEST_RESUBMISSION" data-user="${attr(v.user_id)}">طلب إعادة إرسال</button><button class="button danger" data-kyc-action="REJECT" data-user="${attr(v.user_id)}">رفض</button>`:''}</div></article>`}
async function reviewKyc(id,action){if(!isAdmin())return;let notes=action==='APPROVE'?'تمت مراجعة مستندات الهوية واعتمادها.':prompt('اكتب سبب القرار وما المطلوب من المستخدم:');if(notes===null)return;if(action!=='APPROVE'&&notes.trim().length<5){toast('اكتب سببًا واضحًا.');return}try{await request(`/admin/verification/${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({action,notes})});toast('تم تسجيل قرار التحقق.');loadKyc(true)}catch(e){toast(e.message)}}
async function openDocument(id){try{const blob=await download(`/documents/${encodeURIComponent(id)}/download`);const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){toast(e.message)}}

async function loadSupport(silent=false){if(!silent)loading($('ticketList'));tickets=await request('/support/tickets');renderTickets();setBadge('navSupportBadge',tickets.filter(t=>!['RESOLVED','CLOSED'].includes(t.status)).length);if(selectedTicket){const fresh=tickets.find(t=>t.id===selectedTicket.id);if(fresh){selectedTicket=fresh;await renderConversation(true)}}}
function renderTickets(){const f=$('ticketFilter').value;const rows=tickets.filter(t=>!f||t.status===f);$('ticketList').innerHTML=rows.map(t=>`<button class="ticket-item ${selectedTicket?.id===t.id?'active':''}" data-ticket-id="${attr(t.id)}"><div class="ticket-item-head"><strong>${esc(subjectLabel(t.subject))}</strong>${pill(priorityLabel(t.priority),priorityClass(t.priority))}</div><div class="ticket-meta">${esc(t.requester_name||t.requester_id)} · ${esc(roleLabel(t.requester_role))} · ${esc(statusLabel(t.status))} · ${esc(dt(t.updated_at||t.created_at))}</div></button>`).join('')||empty('لا توجد تذاكر')}
async function selectTicket(id){selectedTicket=tickets.find(t=>t.id===id);renderTickets();await renderConversation(false);clearInterval(ticketTimer);ticketTimer=setInterval(()=>renderConversation(true),10000)}
async function renderConversation(silent=false){if(!selectedTicket)return;const node=$('ticketConversation');if(!silent)loading(node,'جاري تحميل المحادثة...');try{const [messages,agents]=await Promise.all([request(`/support/tickets/${encodeURIComponent(selectedTicket.id)}/messages`),request('/admin/users?role=OPS_AGENT').catch(()=>[])]);node.className='conversation-panel';node.innerHTML=`<div class="conversation-header"><div class="review-card-head"><div><h3>${esc(subjectLabel(selectedTicket.subject))}</h3><div class="review-meta">${esc(selectedTicket.requester_name||selectedTicket.requester_id)} · ${esc(roleLabel(selectedTicket.requester_role))}</div></div>${pill(statusLabel(selectedTicket.status),statusClass(selectedTicket.status))}</div><div class="conversation-controls"><select id="ticketStatusControl">${['OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED'].map(s=>`<option value="${s}" ${s===selectedTicket.status?'selected':''}>${esc(statusLabel(s))}</option>`).join('')}</select><select id="ticketPriorityControl">${['LOW','NORMAL','HIGH','URGENT'].map(p=>`<option value="${p}" ${p===selectedTicket.priority?'selected':''}>${esc(priorityLabel(p))}</option>`).join('')}</select><select id="ticketAgentControl"><option value="">غير مسند</option>${agents.map(a=>`<option value="${attr(a.id)}" ${a.id===selectedTicket.assigned_agent_id?'selected':''}>${esc(a.display_name)}</option>`).join('')}</select><button class="button soft tiny" data-support-activity="1">سجل المستخدم</button></div></div><div id="supportActivity" class="is-hidden"></div><div id="messageList" class="message-list">${messages.map(m=>`<div class="message ${['OPS_AGENT','PLATFORM_ADMIN'].includes(m.sender_role)?'staff':''}"><div class="meta">${esc(m.sender_name||'')} · ${esc(roleLabel(m.sender_role))} · ${esc(dt(m.created_at))}</div><div>${esc(m.content)}</div></div>`).join('')||empty('لا توجد رسائل')}</div><div class="reply-box"><input id="supportReply" placeholder="اكتب الرد..."><button class="button primary" data-send-support="1">إرسال</button></div>`;const list=$('messageList');if(list)list.scrollTop=list.scrollHeight}catch(e){if(!silent)node.innerHTML=empty('تعذر تحميل المحادثة',e.message)}}
async function updateTicket(){if(!selectedTicket)return;const body={status:$('ticketStatusControl').value,priority:$('ticketPriorityControl').value,assigned_agent_id:$('ticketAgentControl').value||null};try{selectedTicket=await request(`/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}`,{method:'PATCH',body:JSON.stringify(body)});toast('تم تحديث التذكرة.');await loadSupport(true)}catch(e){if(e.status===409&&isAdmin()&&['RESOLVED','CLOSED'].includes(body.status)){const reason=prompt('الإغلاق يحتاج Evidence. اكتب سبب تجاوز إداري موثق (10 أحرف على الأقل):');if(reason?.trim().length>=10){try{selectedTicket=await request(`/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}`,{method:'PATCH',body:JSON.stringify({...body,override_missing_evidence:true,override_reason:reason.trim()})});toast('تم الإغلاق بتجاوز إداري موثق.');await loadSupport(true)}catch(x){toast(x.message)}}}else toast(e.message)}}
async function sendSupport(){const input=$('supportReply'),content=input?.value.trim();if(!selectedTicket||!content)return;try{await request(`/support/tickets/${encodeURIComponent(selectedTicket.id)}/messages`,{method:'POST',body:JSON.stringify({content})});input.value='';await renderConversation(true)}catch(e){toast(e.message)}}
async function showSupportActivity(){if(!selectedTicket)return;const box=$('supportActivity');box.classList.remove('is-hidden');loading(box);try{const d=await request(`/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/requester-activity`);box.innerHTML=`<div class="panel" style="border-radius:0;margin:0"><h3>نشاط المستخدم</h3>${(d.tasks||[]).map(t=>`<button class="ticket-item" data-task-id="${attr(t.id)}"><strong>#${esc(shortId(t.id))} · ${esc(t.venue_type||'طلب')}</strong><div class="ticket-meta">${esc(t.city||'')} · ${esc(statusLabel(t.status))} · ${esc(dt(t.created_at))}</div></button>`).join('')||empty('لا يوجد نشاط مرتبط')}</div>`}catch(e){box.innerHTML=empty('تعذر تحميل النشاط',e.message)}}

async function loadPayments(silent=false){if(!isAdmin())return;if(!silent)loading($('paymentQueue'));const rows=await request('/finance/admin/manual-submissions');setBadge('navPaymentBadge',rows.length);$('paymentQueue').innerHTML=rows.map(p=>`<article class="review-card pending"><div class="review-card-head"><div><h3>${esc(p.client_name||'عميل')}</h3><div class="review-meta">طلب #${esc(shortId(p.task_id))} · محامي: ${esc(p.lawyer_name||'—')}</div></div><strong>${esc(money(p.total_client_amount_minor,p.currency))}</strong></div><div class="kv-grid">${kv('مرجع InstaPay',p.instapay_reference,true)}${kv('وقت الإرسال',dt(p.submitted_at))}${kv('Payment ID',p.payment_id,true)}${kv('Task ID',p.task_id,true)}</div><div class="card-actions"><button class="button ok" data-payment-decision="approve" data-payment="${attr(p.payment_id)}">مطابقة واعتماد</button><button class="button danger" data-payment-decision="reject" data-payment="${attr(p.payment_id)}">رفض التحويل</button><button class="button soft" data-task-id="${attr(p.task_id)}">فتح الطلب</button></div></article>`).join('')||empty('لا توجد تحويلات خدمات بانتظار المراجعة')}
async function decidePayment(id,approved){if(!isAdmin())return;let notes;if(approved){if(!confirm('هل تأكدت من وصول المبلغ الفعلي ومطابقة مرجع InstaPay؟'))return;notes=prompt('ملاحظات المطابقة (اختياري):','تمت مطابقة المرجع ووصول المبلغ.')??''}else{notes=prompt('سبب رفض التحويل:');if(notes===null)return;if(notes.trim().length<5){toast('اكتب سبب رفض واضحًا.');return}}try{await request(`/finance/admin/payments/${encodeURIComponent(id)}/decision`,{method:'POST',body:JSON.stringify({approved,notes:notes.trim()||null})});toast(approved?'تم اعتماد التحويل وتمويل المهمة.':'تم رفض التحويل وإبلاغ العميل.');await loadPayments(true);loadSummaryBadges()}catch(e){toast(e.message)}}

async function loadSubscriptions(silent=false){if(!isAdmin())return;if(!silent){loading($('subscriptionPending'));loading($('subscriptionTable'))}const status=$('subscriptionStatus').value,plan=$('subscriptionPlan').value;const [pending,all]=await Promise.all([request('/finance/admin/subscriptions/pending'),request('/admin/console/subscriptions'+qs({status:status||undefined,plan:plan||undefined,limit:200}))]);setBadge('navSubscriptionBadge',pending.length);$('subscriptionPending').innerHTML=pending.map(s=>`<div class="review-card pending" style="margin-bottom:8px"><div class="review-card-head"><div><h3>${esc(s.lawyer_name||'محامي')}</h3><div class="review-meta">${esc(s.lawyer_email||'')}</div></div>${pill(planLabel(s.plan),'warn')}</div><div class="kv-grid">${kv('المبلغ',money(s.amount_minor,s.currency))}${kv('مرجع InstaPay',s.instapay_reference,true)}${kv('أرسل',dt(s.submitted_at))}</div><div class="card-actions"><button class="button ok" data-sub-decision="approve" data-sub="${attr(s.subscription_id)}">اعتماد وتفعيل</button><button class="button danger" data-sub-decision="reject" data-sub="${attr(s.subscription_id)}">رفض</button></div></div>`).join('')||empty('لا توجد اشتراكات معلقة');const active=all.filter(s=>s.status==='ACTIVE'&&new Date(s.expires_at)>new Date()).length,accredited=all.filter(s=>s.plan==='ACCREDITED'&&s.status==='ACTIVE').length,elite=all.filter(s=>s.plan==='ELITE'&&s.status==='ACTIVE').length,expiring=all.filter(s=>s.status==='ACTIVE'&&s.expires_at&&((new Date(s.expires_at)-Date.now())/86400000)<=7&&new Date(s.expires_at)>new Date()).length;$('subscriptionMetrics').innerHTML=[['سجلات معروضة',all.length],['اشتراكات نشطة',active],['معتمد',accredited],['نخبة',elite],['تنتهي خلال 7 أيام',expiring]].map(x=>miniMetric(...x)).join('');renderSubscriptionTable(all)}
function renderSubscriptionTable(rows){if(!rows.length){$('subscriptionTable').innerHTML=empty('لا توجد اشتراكات مطابقة');return}$('subscriptionTable').innerHTML=`<table class="data-table"><thead><tr><th>المحامي</th><th>الباقة</th><th>الحالة</th><th>السعر</th><th>البداية</th><th>النهاية</th></tr></thead><tbody>${rows.map(s=>`<tr class="clickable" data-user-id="${attr(s.lawyer_id)}"><td><div class="cell-title">${esc(s.lawyer_name)}</div><div class="cell-sub">${esc(s.lawyer_email)}</div></td><td>${pill(planLabel(s.plan),s.plan==='ELITE'?'warn':'blue')}</td><td>${pill(statusLabel(s.status),statusClass(s.status))}</td><td>${esc(money(s.price_minor,s.currency))}</td><td>${esc(dt(s.starts_at))}</td><td>${esc(dt(s.expires_at))}</td></tr>`).join('')}</tbody></table>`}
async function decideSubscription(id,approved){if(!isAdmin())return;let notes;if(approved){if(!confirm('هل تأكدت من وصول مبلغ الاشتراك ومطابقة المرجع؟'))return;notes=prompt('ملاحظات الاعتماد (اختياري):','تمت مطابقة المرجع ووصول المبلغ.')??''}else{notes=prompt('سبب رفض الاشتراك:');if(notes===null)return;if(notes.trim().length<5){toast('اكتب سببًا واضحًا.');return}}try{await request(`/finance/admin/subscriptions/${encodeURIComponent(id)}/decision`,{method:'POST',body:JSON.stringify({approved,notes:notes.trim()||null})});toast(approved?'تم تفعيل الباقة.':'تم رفض طلب الاشتراك.');await loadSubscriptions(true);loadSummaryBadges()}catch(e){toast(e.message)}}

async function loadSettlements(silent=false){if(!isAdmin())return;if(!silent)loading($('settlementTable'));const rows=await request('/admin/console/settlements'+qs({status:$('settlementStatus').value||undefined,limit:200}));const held=rows.filter(x=>x.status!=='SETTLED').reduce((a,x)=>a+Number(x.professional_fee_minor||0)+Number(x.platform_fee_minor||0)+Number(x.approved_expenses_minor||0)-Number(x.refund_amount_minor||0),0),payout=rows.filter(x=>x.status!=='SETTLED').reduce((a,x)=>a+Number(x.net_lawyer_payout_minor||0),0),fees=rows.reduce((a,x)=>a+Number(x.platform_fee_minor||0),0);$('settlementMetrics').innerHTML=[['التسويات المعروضة',rows.length],['مبالغ غير مسوّاة',money(held)],['صافي محامين معلّق',money(payout)],['رسوم منصة مسجلة',money(fees)]].map(x=>miniMetric(...x)).join('');if(!rows.length){$('settlementTable').innerHTML=empty('لا توجد تسويات مطابقة');return}$('settlementTable').innerHTML=`<table class="data-table"><thead><tr><th>الطلب</th><th>العميل</th><th>المحامي</th><th>الحالة</th><th>أتعاب</th><th>رسوم المنصة</th><th>صافي المحامي</th><th>الإفراج</th><th>إجراء</th></tr></thead><tbody>${rows.map(s=>`<tr><td><button class="text-button" data-task-id="${attr(s.task_id)}">#${esc(shortId(s.task_id))}</button></td><td>${esc(s.client_name)}</td><td>${esc(s.lawyer_name)}</td><td>${pill(statusLabel(s.status),statusClass(s.status))}</td><td>${esc(money(s.professional_fee_minor,s.currency))}</td><td>${esc(money(s.platform_fee_minor,s.currency))}</td><td><strong>${esc(money(s.net_lawyer_payout_minor,s.currency))}</strong></td><td>${esc(dt(s.release_due_at))}</td><td>${!['SETTLED','REFUNDED'].includes(s.status)?`<button class="button ok tiny" data-settle="${attr(s.task_id)}">تسوية</button> <button class="button danger tiny" data-hold="${attr(s.task_id)}">إيقاف</button>`:'—'}</td></tr>`).join('')}</tbody></table>`}
async function settlementDecision(taskId,action){const reason=prompt(action==='SETTLE'?'سبب/ملاحظة التسوية:':'سبب الإيقاف الإداري:');if(reason===null||reason.trim().length<4){if(reason!==null)toast('اكتب سببًا واضحًا.');return}if(!confirm(action==='SETTLE'?'تأكيد تنفيذ قرار التسوية؟':'تأكيد إيقاف التسوية؟'))return;try{await request(`/admin/tasks/${encodeURIComponent(taskId)}/settle`,{method:'POST',body:JSON.stringify({action,reason:reason.trim()})});toast('تم تسجيل قرار التسوية.');loadSettlements(true)}catch(e){toast(e.message)}}

async function loadServices(silent=false){if(!silent)loading($('serviceGrid'));const rows=await request('/admin/services');$('serviceGrid').innerHTML=rows.map(s=>`<article class="service-card"><div class="review-card-head"><div><h3>${esc(s.name_ar)}</h3><div class="service-id">${esc(s.id)}</div></div>${pill(s.emergency?'طوارئ':'عادية',s.emergency?'warn':'neutral')}</div><p class="subtle">${esc(s.name_en)}</p><div class="service-card-foot"><span>${pill(s.active?'مفعلة':'متوقفة',s.active?'good':'bad')}</span>${isAdmin()?`<button class="toggle ${s.active?'on':'off'}" data-service="${attr(s.id)}" data-active="${s.active?'0':'1'}">${s.active?'إيقاف الخدمة':'تفعيل الخدمة'}</button>`:''}</div></article>`).join('')||empty('لا توجد خدمات')}
async function toggleService(id,active){if(!isAdmin())return;if(!confirm(active?'تفعيل الخدمة وإظهارها للمستخدمين؟':'إيقاف الخدمة عن استقبال طلبات جديدة؟'))return;try{await request(`/admin/services/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({active})});toast('تم تحديث حالة الخدمة.');loadServices(true)}catch(e){toast(e.message)}}

const settingMeta={
  maintenance_mode:['وضع الصيانة','عام','إيقاف الاستخدام الطبيعي للتطبيق مؤقتًا.'],maintenance_message_ar:['رسالة الصيانة بالعربية','عام','النص الذي يظهر للمستخدم عند وضع الصيانة.'],maintenance_message_en:['رسالة الصيانة بالإنجليزية','عام','النص الإنجليزي لوضع الصيانة.'],support_chat_enabled:['محادثة الدعم','الدعم','تشغيل أو إيقاف محادثة خدمة العملاء.'],safety_center_enabled:['مركز أمان المهمة','الأمان','تشغيل CaseGuard ومركز أمان المهمة.'],b2b_marketplace_enabled:['سوق المحامين B2B','السوق','تشغيل تبادل الأعمال بين المحامين.'],completion_grace_hours:['مهلة مراجعة الإنهاء','التسوية','عدد الساعات الممنوحة للعميل لمراجعة الإنهاء.'],client_cancellation_compensation_percent:['تعويض إلغاء العميل','المالية','نسبة التعويض وفق سياسة الإلغاء.'],delay_grace_minutes:['سماح التأخير','الطوارئ','عدد دقائق السماح قبل اعتبار التأخير حادثة.'],free_plan_monthly_lead_limit:['حد فرص الباقة المجانية','الاشتراكات','عدد الفرص التجريبية/المعاينات الشهرية إذا كانت السياسة تستخدمه.'],lawyer_to_lawyer_platform_fee_minor:['رسم منصة B2B','المالية','رسم المنصة بوحدة القرش على تبادل الأعمال.'],max_travel_expense_without_manual_review_minor:['حد مصروف الانتقال دون مراجعة','المالية','أقصى مصروف انتقال بالقرش قبل طلب مراجعة إدارية.'],auto_settlement_enabled:['التسوية التلقائية','التسوية','تشغيل قواعد التسوية التلقائية حيث يسمح النظام.']
};
async function loadSettings(silent=false){if(!silent)loading($('settingsGrid'));const rows=await request('/admin/settings');$('settingsGrid').innerHTML=rows.map(s=>{const m=settingMeta[s.key]||[humanField(s.key),'متقدم','إعداد تشغيلي متقدم. غيّره فقط إذا كنت تعرف تأثيره.'];return `<article class="setting-card"><div class="review-card-head"><div><h3>${esc(m[0])}</h3><div class="setting-key">${esc(s.key)}</div></div>${pill(m[1],'neutral')}</div><div class="setting-value">${esc(formatSettingValue(s))}</div><div class="setting-desc">${esc(m[2])}</div>${isAdmin()?`<div class="card-actions"><button class="button soft tiny" data-setting="${attr(s.key)}" data-value="${attr(s.value)}" data-type="${attr(s.value_type)}" data-public="${s.public?'1':'0'}">تعديل</button></div>`:''}</article>`}).join('')||empty('لا توجد إعدادات')}
function formatSettingValue(s){if(s.value_type==='boolean')return String(s.value).toLowerCase()==='true'?'مفعّل':'متوقف';if(s.key.endsWith('_minor'))return money(Number(s.value));if(s.key.endsWith('_hours'))return `${s.value} ساعة`;if(s.key.endsWith('_minutes'))return `${s.value} دقيقة`;if(s.key.endsWith('_percent'))return `${s.value}%`;return s.value}
async function editSetting(el){if(!isAdmin())return;const key=el.dataset.setting,old=el.dataset.value,type=el.dataset.type,pub=el.dataset.public==='1',meta=settingMeta[key];let value;if(type==='boolean')value=confirm(`${meta?.[0]||key}\nOK = تفعيل، Cancel = إيقاف`)?'true':'false';else value=prompt(`القيمة الجديدة: ${meta?.[0]||key}`,old);if(value===null)return;if(!confirm('تأكيد تغيير إعداد تشغيل المنصة؟ سيتم تسجيل العملية في سجل المراجعة.'))return;try{await request(`/admin/settings/${encodeURIComponent(key)}`,{method:'PUT',body:JSON.stringify({value,value_type:type,public:pub})});toast('تم حفظ الإعداد.');loadSettings(true)}catch(e){toast(e.message)}}

async function loadDirectory(silent=false){if(!isAdmin())return;if(!silent)loading($('directoryGrid'));const q=$('directorySearch').value.trim(),category=$('directoryCategory').value;const rows=await request('/directory'+qs({q:q||undefined,category:category||undefined}));$('directoryGrid').innerHTML=rows.map(r=>`<article class="directory-card"><div class="review-card-head"><div><h3>${esc(r.official_name_ar)}</h3><div class="review-meta">${esc(r.official_name_en||'')}</div></div>${pill(directoryCategoryLabel(r.category),'neutral')}</div><p>${esc([r.governorate,r.district,r.address].filter(Boolean).join(' · '))}</p>${r.phone_numbers?`<p dir="ltr">${esc(r.phone_numbers)}</p>`:''}${r.website?`<p><a href="${attr(r.website)}" target="_blank" rel="noopener">فتح الموقع ↗</a></p>`:''}</article>`).join('')||empty('لا توجد نتائج في الدليل')}

async function loadAudit(silent=false){if(!isAdmin())return;if(!silent)loading($('auditTable'));const rows=await request('/admin/console/audit'+qs({q:$('auditSearch').value.trim()||undefined,action:$('auditAction').value.trim()||undefined,entity_type:$('auditEntity').value.trim()||undefined,limit:200}));if(!rows.length){$('auditTable').innerHTML=empty('لا توجد عمليات مطابقة');return}$('auditTable').innerHTML=`<table class="data-table"><thead><tr><th>التاريخ</th><th>المنفذ</th><th>العملية</th><th>الكيان</th><th>المعرف</th><th>التفاصيل</th></tr></thead><tbody>${rows.map(a=>`<tr class="clickable" data-audit-id="${attr(a.id)}"><td class="nowrap">${esc(dt(a.created_at))}</td><td>${esc(a.actor_name||shortId(a.actor_user_id))}</td><td><div class="cell-title">${esc(actionLabel(a.action))}</div><div class="cell-sub mono">${esc(a.action)}</div></td><td>${esc(humanField(a.entity_type))}</td><td class="mono">${esc(shortId(a.entity_id))}</td><td>${esc(truncate(a.details,90))}</td></tr>`).join('')}</tbody></table>`;$('auditTable').dataset.rows=JSON.stringify(rows)}
function openAudit(id){let rows=[];try{rows=JSON.parse($('auditTable').dataset.rows||'[]')}catch{}const a=rows.find(x=>x.id===id);if(!a)return;openDrawer('AUDIT EVENT',actionLabel(a.action),`<div class="kv-grid">${kv('التاريخ',dt(a.created_at))}${kv('المنفذ',a.actor_name||a.actor_user_id)}${kv('العملية',a.action,true)}${kv('نوع الكيان',a.entity_type,true)}${kv('معرف الكيان',a.entity_id,true)}</div><div class="drawer-section" style="margin-top:16px"><h3>التفاصيل الخام</h3><div class="kv"><span class="mono">${esc(a.details||'لا توجد تفاصيل')}</span></div></div>`)}

async function loadSystem(silent=false){if(!isAdmin())return;if(!silent){loading($('systemMetrics'));loading($('systemAlerts'))}const [health,summary]=await Promise.all([request('/admin/reliability/status'),request('/admin/console/summary')]);$('systemMetrics').innerHTML=[['حالة النظام',health.status==='healthy'?'سليم':'يحتاج تدخل',health.alerts?.length?'تنبيهات موجودة':'لا توجد تنبيهات',health.status==='healthy'?'healthy':'risk'],['Outbox Pending',health.outbox?.pending||0,'إشعارات تنتظر التسليم',health.outbox?.overdue?'attention':''],['Outbox Overdue',health.outbox?.overdue||0,'تأخر في التسليم',health.outbox?.overdue?'risk':'healthy'],['Dead Letter',health.outbox?.dead_letter||0,'فشل بعد إعادة المحاولة',health.outbox?.dead_letter?'risk':'healthy'],['طوارئ عالقة',health.dispatch?.emergency_stuck_over_5m||0,'أكثر من 5 دقائق',health.dispatch?.emergency_stuck_over_5m?'risk':'healthy'],['موقع قديم',health.dispatch?.active_missions_stale_location||0,'مهام طوارئ نشطة',health.dispatch?.active_missions_stale_location?'attention':'healthy']].map(x=>metric(...x)).join('');$('systemAlerts').innerHTML=`<div class="panel-head"><div><p class="eyebrow">ALERTS</p><h3>تنبيهات الموثوقية</h3></div>${pill(health.status==='healthy'?'سليم':'Degraded',health.status==='healthy'?'good':'bad')}</div><div class="action-list">${(health.alerts||[]).map(a=>`<div class="action-item"><div><strong>تنبيه تشغيلي</strong><span>${esc(a)}</span></div></div>`).join('')||empty('لا توجد تنبيهات','الإشعارات والطوارئ والخدمات التشغيلية ضمن الحدود الحالية.')}</div>`;updateNavBadges(summary)}

const loaders={dashboard:loadDashboard,cases:loadCases,emergency:loadEmergency,'lawyer-review':loadLawyerReview,kyc:loadKyc,users:loadUsers,support:loadSupport,payments:loadPayments,subscriptions:loadSubscriptions,settlements:loadSettlements,services:loadServices,directory:loadDirectory,settings:loadSettings,audit:loadAudit,system:loadSystem};

function openDrawer(eyebrow,title,body){$('drawerEyebrow').textContent=eyebrow;$('drawerTitle').textContent=title;$('drawerBody').innerHTML=body;$('detailDrawer').classList.remove('is-hidden');$('detailDrawer').setAttribute('aria-hidden','false')}
function closeDrawer(){$('detailDrawer').classList.add('is-hidden');$('detailDrawer').setAttribute('aria-hidden','true')}
function loadingHtml(text){return `<div class="loading-row">${esc(text)}</div>`}
document.addEventListener('click',async(e)=>{
  const close=e.target.closest('[data-close-drawer]');if(close){closeDrawer();return}
  const task=e.target.closest('[data-task-id]');if(task){await openTask(task.dataset.taskId);return}
  const user=e.target.closest('[data-user-id]');if(user&&!e.target.closest('[data-toggle-user]')){await openUser(user.dataset.userId);return}
  const toggle=e.target.closest('[data-toggle-user]');if(toggle){e.stopPropagation();await toggleUser(toggle.dataset.toggleUser,toggle.dataset.active==='1');return}
  const doc=e.target.closest('[data-doc-id]');if(doc){await openDocument(doc.dataset.docId);return}
  const acc=e.target.closest('[data-account-decision]');if(acc){await decideAccount(acc.dataset.user,acc.dataset.accountDecision==='approve');return}
  const kyc=e.target.closest('[data-kyc-action]');if(kyc){await reviewKyc(kyc.dataset.user,kyc.dataset.kycAction);return}
  const ticket=e.target.closest('[data-ticket-id]');if(ticket){await selectTicket(ticket.dataset.ticketId);return}
  if(e.target.closest('[data-send-support]')){await sendSupport();return}
  if(e.target.closest('[data-support-activity]')){await showSupportActivity();return}
  const payment=e.target.closest('[data-payment-decision]');if(payment){await decidePayment(payment.dataset.payment,payment.dataset.paymentDecision==='approve');return}
  const sub=e.target.closest('[data-sub-decision]');if(sub){await decideSubscription(sub.dataset.sub,sub.dataset.subDecision==='approve');return}
  const settle=e.target.closest('[data-settle]');if(settle){await settlementDecision(settle.dataset.settle,'SETTLE');return}
  const hold=e.target.closest('[data-hold]');if(hold){await settlementDecision(hold.dataset.hold,'HOLD');return}
  const service=e.target.closest('[data-service]');if(service){await toggleService(service.dataset.service,service.dataset.active==='1');return}
  const setting=e.target.closest('[data-setting]');if(setting){await editSetting(setting);return}
  const audit=e.target.closest('[data-audit-id]');if(audit){openAudit(audit.dataset.auditId);return}
});
document.addEventListener('change',(e)=>{if(['ticketStatusControl','ticketPriorityControl','ticketAgentControl'].includes(e.target.id))updateTicket()});

function debounce(fn,delay=300){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay)}}
$('caseSearch').addEventListener('input',debounce(()=>loadCases(true)));$('caseStatus').addEventListener('change',()=>loadCases(true));$('caseType').addEventListener('change',()=>loadCases(true));$('emergencyStatus').addEventListener('change',()=>loadEmergency(true));
$('userSearch').addEventListener('input',renderUsers);$('userRole').addEventListener('change',()=>loadUsers(true));$('lawyerReviewSearch').addEventListener('input',debounce(()=>loadLawyerReview(true)));$('kycFilter').addEventListener('change',()=>loadKyc(true));$('ticketFilter').addEventListener('change',renderTickets);$('subscriptionStatus').addEventListener('change',()=>loadSubscriptions(true));$('subscriptionPlan').addEventListener('change',()=>loadSubscriptions(true));$('settlementStatus').addEventListener('change',()=>loadSettlements(true));$('directorySearch').addEventListener('input',debounce(()=>loadDirectory(true)));$('directoryCategory').addEventListener('change',()=>loadDirectory(true));$('auditSearch').addEventListener('input',debounce(()=>loadAudit(true)));$('auditAction').addEventListener('input',debounce(()=>loadAudit(true)));$('auditEntity').addEventListener('input',debounce(()=>loadAudit(true)));
for(const s of taskStatuses){const o=document.createElement('option');o.value=s;o.textContent=statusLabel(s);$('caseStatus').appendChild(o)}

async function loadSummaryBadges(){try{const s=await request('/admin/console/summary');summaryCache=s;updateNavBadges(s)}catch{}}

const commands=[
  ['مركز القيادة','dashboard','مؤشرات وتنبيهات'],['الطلبات والقضايا','cases','كل رحلات الخدمة'],['غرفة الطوارئ','emergency','الطلبات العاجلة'],['اعتماد المحامين','lawyer-review','الملفات المعلقة'],['مراجعة هوية العملاء','kyc','KYC'],['المستخدمون 360°','users','الحسابات والنشاط'],['مكتب الدعم','support','التذاكر والمحادثات'],['تحويلات InstaPay','payments','مراجعة الدفع',true],['الاشتراكات','subscriptions','الباقات والتجديدات',true],['التسويات','settlements','الأموال المحتجزة',true],['كتالوج الخدمات','services','الخدمات المتاحة'],['إعدادات التشغيل','settings','ضوابط المنصة'],['مستكشف العمليات','audit','Audit',true],['صحة النظام','system','Reliability',true]
];
function openPalette(query=''){const p=$('commandPalette');p.classList.remove('is-hidden');p.setAttribute('aria-hidden','false');$('commandSearch').value=query;renderCommands();setTimeout(()=>$('commandSearch').focus(),10)}
function closePalette(){$('commandPalette').classList.add('is-hidden');$('commandPalette').setAttribute('aria-hidden','true')}
function renderCommands(){const q=$('commandSearch').value.trim().toLowerCase();const rows=commands.filter(c=>(!c[3]||isAdmin())&&(!q||`${c[0]} ${c[2]}`.toLowerCase().includes(q)));$('commandResults').innerHTML=rows.map(c=>`<button class="palette-item" data-command-view="${c[1]}"><strong>${esc(c[0])}</strong><span>${esc(c[2])}</span></button>`).join('')||empty('لا توجد أوامر مطابقة')}
$('commandButton').addEventListener('click',()=>openPalette());$('commandSearch').addEventListener('input',renderCommands);document.addEventListener('click',(e)=>{if(e.target.closest('[data-close-palette]'))closePalette();const c=e.target.closest('[data-command-view]');if(c){closePalette();navigate(c.dataset.commandView)}});
document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openPalette()}else if(e.key==='Escape'){closeDrawer();closePalette();document.body.classList.remove('sidebar-open')}else if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();$('globalSearch').focus()}});
$('globalSearch').addEventListener('keydown',(e)=>{if(e.key==='Enter'){const q=e.currentTarget.value.trim();if(q){navigate('users').then(()=>{$('userSearch').value=q;renderUsers()})}}});

function humanField(key){const labels={full_legal_name:'الاسم القانوني',governorate_code:'المحافظة',national_id:'الرقم القومي',bar_registration_number:'رقم القيد بالنقابة',bar_level:'درجة القيد',registration_year:'سنة القيد',bar_syndicate_branch:'فرع النقابة',years_of_experience:'سنوات الخبرة',specialties:'التخصصات',service_cities:'مناطق الخدمة',professional_bio:'النبذة المهنية',date_of_birth:'تاريخ الميلاد',id_type:'نوع الهوية',nationality:'الجنسية',NATIONAL_ID_FRONT:'وجه بطاقة الرقم القومي',NATIONAL_ID_BACK:'ظهر بطاقة الرقم القومي',PASSPORT:'جواز سفر',OTHER_IDENTITY_DOCUMENT:'مستند هوية',LAWYER_BAR_CARD_FRONT:'وجه كارنيه النقابة',LAWYER_BAR_CARD_BACK:'ظهر كارنيه النقابة',PROFESSIONAL_DOCUMENT:'مستند مهني',SELFIE_PHOTO:'صورة شخصية',legal_task:'طلب قانوني',payment_intent:'عملية دفع',lawyer_subscription:'اشتراك محامي',support_ticket:'تذكرة دعم'};return labels[key]||String(key||'—').replaceAll('_',' ')}
function subjectLabel(subject){return ({ACCOUNT_DELETION_REQUEST:'طلب حذف الحساب'})[subject]||subject||'تذكرة دعم'}
function priorityLabel(p){return ({LOW:'منخفضة',NORMAL:'عادية',HIGH:'عالية',URGENT:'عاجلة'})[p]||p||'عادية'}
function priorityClass(p){return p==='URGENT'?'bad':p==='HIGH'?'warn':'neutral'}
function directoryCategoryLabel(c){return ({COURT:'محكمة',POLICE:'شرطة',PROSECUTION:'نيابة',NOTARY:'شهر عقاري',BAR_ASSOCATION:'نقابة المحامين',GOVERNMENT:'جهة حكومية',OTHER:'أخرى'})[c]||c||'—'}
function actionLabel(a){const m={USER_LOGIN:'تسجيل دخول',PUSH_DELIVERY_FAILED:'فشل إرسال إشعار',OUTBOX_DEAD_LETTER:'إشعار وصل Dead Letter',TASK_OFFER_ACCEPTED:'قبول عرض محامي',TASK_SHARE_LINK_CREATED:'إنشاء رابط مشاركة مهمة',TASK_DOCUMENT_DOWNLOADED:'تنزيل مستند مهمة',MANUAL_INSTAPAY_PAYMENT_SUBMITTED:'إرسال مرجع InstaPay',MANUAL_INSTAPAY_PAYMENT_CONFIRMED:'اعتماد تحويل InstaPay',MANUAL_INSTAPAY_PAYMENT_REJECTED:'رفض تحويل InstaPay',FEE_AGREEMENT_FUNDED:'تمويل اتفاق الأتعاب',LAWYER_SUBSCRIPTION_MANUAL_SUBMITTED:'إرسال اشتراك للمراجعة',LAWYER_SUBSCRIPTION_MANUAL_APPROVED:'اعتماد اشتراك',LAWYER_SUBSCRIPTION_MANUAL_REJECTED:'رفض اشتراك'};return m[a]||humanField(a)}
function truncate(v,n=80){const s=String(v??'');return s.length>n?s.slice(0,n-1)+'…':s}

startApp();
