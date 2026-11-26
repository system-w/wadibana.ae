# نظام وادي بناء

## ملفات النظام

- `index.html`: التطبيق الموحد؛ يمكن فتح أقسامه مباشرة عبر صفحات التحويل المسماة أدناه.
- `assets/css/app.css`: الأنماط المشتركة.
- `assets/js/app.js`: منطق النظام ومزامنة Firebase.
- `assets/js/firebase-config.js`: إعدادات مشروع Firebase المشتركة بين التطبيق وصفحات تسجيل الدخول والباركود.
- `database.rules.json`: قواعد صلاحيات Realtime Database حسب حالة الحساب ودوره وفرعه.
- `assets/js/transit-parser.js`: تحليل بيانات تأشيرات العبور، ويُحمّل بواسطة التطبيق.
- `assets/js/module-shell.js`: يحوّل صفحات الأقسام إلى القسم المقابل داخل التطبيق الموحد.
- `assets/images/wadi-bina-logo.jpeg`: شعار الشركة.

صفحات التحويل المسماة في المجلد الرئيسي: `login.html`، `dashboard.html`، `passengers.html`، `cargo.html`، `transit.html`، `trips.html`، `buses.html`، `driver-accounts.html`، `payroll-employees.html`، `finance.html`، و`users.html`.

## التشغيل

شغّل الموقع عبر خادم HTTP أو استضافة الموقع المعتادة؛ لا تفتح `index.html` مباشرة من نظام الملفات، لأن التطبيق يستخدم وحدات JavaScript وFirebase.

## تسجيل الدخول بأسماء المستخدمين

- يسجل المستخدم دخوله باسم المستخدم وكلمة المرور المؤقتة؛ اسم المستخدم هو أيضاً Firebase UID، ويحوّله التطبيق داخلياً إلى عنوان `@auth.wadibana.invalid`. هذا العنوان لا يستقبل رسائل بريد.
- ملف تصدير Realtime Database لا يتضمن salts أو ما يكفي لإعادة استخدام بصمات كلمات المرور. أداة الاستيراد تتجاهل `passwordHash` وتنشئ كلمات مرور مؤقتة عشوائية؛ يجب توزيعها على المستخدمين بشكل خاص، ثم يغيّر كل مستخدم كلمة مروره بعد الدخول.
- قواعد `database.rules.json` تمنع الوصول غير المصادق، وتقيّد الملفات والبيانات حسب الدور والفرع. لا تنشر القواعد قبل مراجعتها في Firebase Console أو المحاكي.
- الحسابات الجديدة يجب إنشاؤها عبر Firebase Admin SDK باستخدام UID يطابق اسم المستخدم وبريد داخلي `username@auth.wadibana.invalid`؛ لا يمكن اختيار UID مخصص من Firebase Console.

### استيراد/إعادة تعيين الحسابات

1. فعّل Email/Password في Firebase Authentication، وجهّز صلاحية إدارية عبر Application Default Credentials.
2. من جذر المستودع شغّل فحص الملف دون أي تغييرات سحابية:

   ```powershell
   npm install --prefix tools/firebase-user-migration
   npm --prefix tools/firebase-user-migration run import-users -- --input "C:\path\to\users-export.json"
   ```

3. بعد مراجعة الملف والمشروع الافتراضي في `.firebaserc`، نفّذ الاستيراد بإخراج كلمات المرور إلى ملف خارج المستودع:

   ```powershell
   npm --prefix tools/firebase-user-migration run import-users -- --input "C:\path\to\users-export.json" --credentials-output "C:\secure\wadi-temporary-credentials.json" --apply
   ```

   كل تشغيل مع `--apply` يعيد تعيين كلمات مرور الحسابات الموجودة التي سبق أن أنشأتها الأداة. احتفظ بملف كلمات المرور بسرية واحذفه بعد تسليمها بأمان.

### نشر قواعد Realtime Database

راجع `database.rules.json` وتأكد من اختيار المشروع الصحيح في `.firebaserc`، ثم انشر القواعد باستخدام Firebase CLI:

```powershell
firebase deploy --only database
```

استعادة كلمة المرور عبر البريد غير متاحة للحسابات ذات العناوين الداخلية؛ عند فقدان كلمة المرور، يعيد المسؤول تشغيل أداة الاستيراد للحسابات الموجودة ويوزع كلمة مرور مؤقتة جديدة.
