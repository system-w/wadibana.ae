# نظام وادي بناء

## ملفات النظام

- `index.html`: التطبيق الموحد؛ يمكن فتح أقسامه مباشرة عبر صفحات التحويل المسماة أدناه.
- `assets/css/app.css`: الأنماط المشتركة.
- `assets/js/app.js`: منطق النظام ومزامنة Firebase.
- `assets/js/transit-parser.js`: تحليل بيانات تأشيرات العبور، ويُحمّل بواسطة التطبيق.
- `assets/js/module-shell.js`: يحوّل صفحات الأقسام إلى القسم المقابل داخل التطبيق الموحد.
- `assets/images/wadi-bina-logo.jpeg`: شعار الشركة.

صفحات التحويل المسماة في المجلد الرئيسي: `login.html`، `dashboard.html`، `passengers.html`، `cargo.html`، `transit.html`، `trips.html`، `buses.html`، `driver-accounts.html`، `payroll-employees.html`، `finance.html`، و`users.html`.

## التشغيل

شغّل الموقع عبر خادم HTTP أو استضافة الموقع المعتادة؛ لا تفتح `index.html` مباشرة من نظام الملفات، لأن التطبيق يستخدم وحدات JavaScript وFirebase.
