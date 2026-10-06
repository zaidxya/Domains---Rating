const T = {
  en: {
    title: 'Rate Domains',
    subtitle: 'Domains by Sankari holdings — connecting university life with the job market.',
    name: 'Name (optional)', university: 'University (optional)',
    overall: 'Overall rating *', studyZone: 'Study zone', courses: 'Free courses',
    comment: 'Your feedback', submit: 'Submit rating',
    needOverall: 'Please give an overall rating.', thanks: 'Thank you for your feedback!',
    error: 'Something went wrong. Please try again.', other: 'العربية'
  },
  ar: {
    title: 'قيّم دومينز',
    subtitle: 'دومينز من سنكري القابضة — ربط الحياة الجامعية بسوق العمل.',
    name: 'الاسم (اختياري)', university: 'الجامعة (اختياري)',
    overall: 'التقييم العام *', studyZone: 'منطقة الدراسة', courses: 'الدورات المجانية',
    comment: 'ملاحظاتك', submit: 'إرسال التقييم',
    needOverall: 'يرجى إدخال التقييم العام.', thanks: 'شكرًا لك على ملاحظاتك!',
    error: 'حدث خطأ. حاول مرة أخرى.', other: 'English'
  }
};

let lang = localStorage.getItem('lang') || 'en';
const values = { overall: 0, study_zone: 0, courses: 0 };
const msg = document.getElementById('msg');

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = T[lang].title;
  document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = T[lang][el.dataset.i18n]);
  document.getElementById('langBtn').textContent = T[lang].other;
  msg.textContent = '';
}

document.querySelectorAll('.stars').forEach(box => {
  const name = box.dataset.name;
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '★';
    b.setAttribute('aria-label', `${i}/5`);
    b.onclick = () => {
      values[name] = i;
      box.querySelectorAll('button').forEach((s, idx) => s.classList.toggle('on', idx < i));
    };
    box.appendChild(b);
  }
});

document.getElementById('langBtn').onclick = () => {
  lang = lang === 'en' ? 'ar' : 'en';
  localStorage.setItem('lang', lang);
  applyLang();
};

document.getElementById('form').onsubmit = async e => {
  e.preventDefault();
  if (!values.overall) { msg.textContent = T[lang].needOverall; return; }
  const f = e.target;
  const body = {
    name: f.name.value, university: f.university.value, comment: f.comment.value,
    ...values, lang
  };
  try {
    const r = await fetch('/api/ratings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('Server replied ' + r.status);
    msg.textContent = T[lang].thanks;
    f.reset();
    Object.keys(values).forEach(k => values[k] = 0);
    document.querySelectorAll('.stars button').forEach(s => s.classList.remove('on'));
   } catch (err) { console.error(err); msg.textContent = T[lang].error; }
};

applyLang();
