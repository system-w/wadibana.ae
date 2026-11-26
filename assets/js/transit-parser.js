const REQUIRED_TRANSIT_FIELDS = [
    ['name', 'الاسم'],
    ['requestNo', 'رقم الطلب'],
    ['passport', 'رقم الجواز / وثيقة السفر']
];

function normalizeDigits(value) {
    return String(value || '').replace(/[٠-٩۰-۹]/g, digit => {
        const code = digit.charCodeAt(0);
        return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    });
}

function normalizeText(value) {
    return normalizeDigits(value)
        .normalize('NFKC')
        .replace(/\u06cc/g, '\u064a')
        .replace(/\u06a9/g, '\u0643')
        .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
        .replace(/\u0640/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
}

function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1].trim();
    }
    return '';
}

function extractArabicName(text) {
    const nameLabels = /(?:الاسم\s*(?:الكامل)?(?:\s*(?:باللغة\s*العربية|بالعربية))?|الإسم\s*(?:الكامل)?|اسم\s*(?:المتقدم|المسافر|مقدم\s*الطلب)|full\s*name|applicant\s*name)\s*[:：\-]?\s*/i;
    const stopLabels = /(?:رقم\s*(?:الطلب|الجواز|وثيقة\s*السفر|التأشيرة)|تاريخ\s*(?:الموافقة|الإصدار|الاصدار)|الجنسية|نوع\s*التأشيرة|passport|travel\s*document|application\s*(?:no|number)|request\s*(?:no|number)|nationality|visa\s*type)/i;
    const lines = text.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
        const label = nameLabels.exec(lines[index]);
        if (!label) continue;
        const inlineValue = lines[index].slice(label.index + label[0].length);
        const value = inlineValue || lines[index + 1] || '';
        const candidate = value.split(stopLabels)[0]
            .replace(/^(?:باللغة\s*العربية|بالعربية)\s*[:：\-]?\s*/, '');
        const words = candidate.match(/[\u0621-\u064a\u066e-\u06d3]+(?:\s+[\u0621-\u064a\u066e-\u06d3]+){1,6}/);
        if (words && !isBoilerplateName(words[0])) return words[0].replace(/\s+/g, ' ').trim();
    }

    const ignore = [
        'شرطة عمان', 'السلطانية', 'سلطنة عمان', 'تأشيرة', 'إيصال', 'دفع',
        'الادارة العامة', 'الإدارة العامة', 'الجوازات', 'الأحوال المدنية',
        'رقم الطلب', 'تاريخ', 'الجنسية', 'نوع التأشيرة', 'صالح لغاية',
        'تأشيرة عبور', 'الموافقة', 'باللغة العربية', 'بالعربية',
        'يرجى', 'التأكد', 'صلاحيتها', 'والدخول', 'تمت'
    ];
    for (const line of lines) {
        const segments = line.match(/[\u0621-\u064a\u066e-\u06d3]+(?:\s+[\u0621-\u064a\u066e-\u06d3]+){1,6}/g) || [];
        for (const segment of segments) {
            const name = segment.replace(stopLabels, '').trim();
            if (name.split(/\s+/).length >= 2 && !isBoilerplateName(name)
                && !ignore.some(word => name.includes(word))) return name;
        }
    }
    return '';
}

function isBoilerplateName(value) {
    return /(?:شرطة عمان|السلطانية|سلطنة عمان|تأشيرة|إيصال|الجوازات|الإدارة العامة|رقم الطلب|الجنسية|نوع التأشيرة)/.test(value);
}

function extractLabeledValue(text, patterns) {
    return firstMatch(text, patterns);
}

function parseDate(value) {
    const normalized = normalizeDigits(value).trim();
    const match = normalized.match(/^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/);
    if (!match) return '';

    let year;
    let month;
    let day;
    if (match[1].length === 4) {
        year = Number(match[1]);
        month = Number(match[2]);
        day = Number(match[3]);
    } else {
        day = Number(match[1]);
        month = Number(match[2]);
        year = Number(match[3]);
        if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 2200
        || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractRawDate(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) return match[1].trim();
    }
    return '';
}

export function validateTransitRecord(record = {}) {
    const missingFields = [];
    for (const [field, label] of REQUIRED_TRANSIT_FIELDS) {
        if (!String(record[field] || '').trim()) missingFields.push({ field, label });
    }

    const errors = missingFields.map(item => `حقل ${item.label} مفقود`);
    if (record.approvalDate && !parseDate(record.approvalDate)) {
        errors.push('تاريخ الموافقة غير صالح');
    }
    if (Array.isArray(record.errors)) {
        record.errors.forEach(error => {
            if (typeof error === 'string' && !errors.includes(error)) errors.push(error);
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        missingFields: missingFields.map(item => item.field)
    };
}

export function parseOmanEvisaText(fullText) {
    const rawText = normalizeText(fullText);
    const requestNo = extractLabeledValue(rawText, [
        /(?:application|request)\s*(?:no\.?|number|reference|id)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9/-]{4,19})/i,
        /(?:رقم\s*(?:الطلب|طلب\s*التأشيرة|التأشيرة)|طلب\s*التأشيرة)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9/-]{4,19})/i
    ]) || (rawText.match(/\b(1000\d{4,10})\b/) || [])[1] || '';

    const passportCandidate = extractLabeledValue(rawText, [
        /(?:travel\s*document\s*(?:no\.?|number)|passport\s*(?:no\.?|number)|document\s*number|رقم\s*(?:وثيقة\s*السفر|الجواز))\s*[:#\-]?\s*([A-Z0-9][A-Z0-9-]{4,19})/i,
        /([A-Z0-9][A-Z0-9-]{4,19})\s*(?:number\s*document\s*travel|document\s*number|travel\s*document|passport|رقم\s*(?:الجواز|وثيقة\s*السفر))/i
    ]);
    const visaNumber = extractLabeledValue(rawText, [
        /(?:visa\s*(?:no\.?|number)|رقم\s*التأشيرة)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9-]{4,19})/i
    ]);
    const passport = (passportCandidate || '').toUpperCase();

    const approvalDateRaw = extractRawDate(rawText, [
        /(?:approval\s*date|date\s*of\s*approval|issue\s*date|date\s*of\s*issue|approved\s*(?:on|date)|visa\s*(?:issue|approval)\s*date|تاريخ\s*(?:الموافقة|الإصدار|الاصدار)(?:\s*على\s*طلب\s*التأشيرة)?)\s*[:#\-]?\s*(\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4})/i
    ]);
    const approvalDate = parseDate(approvalDateRaw);
    const receiptEvidence = /(?:payment\s*receipt|receipt\s*(?:no\.?|number|date)|payment\s*received|إيصال\s*(?:الدفع|دفع)|سند\s*دفع)/i.test(rawText);
    const pendingApproval = /(?:not\s+approved|pending\s+approval|awaiting\s+approval|بانتظار\s*الموافقة|قيد\s*الموافقة|غير\s*موافق)/i.test(rawText);
    const approvalEvidence = !pendingApproval
        && /(?:\bapproved\b|visa\s*(?:validity|issued)|electronic\s*visa|تاريخ\s*الموافقة|تأشيرة\s*إلكترونية|تمت\s*الموافقة)/i.test(rawText);
    const isReceipt = receiptEvidence && !approvalDate && !approvalEvidence;
    const name = extractArabicName(rawText);
    const documentType = isReceipt ? 'receipt' : (approvalDate || approvalEvidence ? 'approval' : 'unknown');
    const appStatus = approvalDate || approvalEvidence
        ? 'صادرة'
        : (/rejected|مرفوض/i.test(rawText) ? 'مرفوضة' : (/returned|معادة/i.test(rawText) ? 'معادة' : 'قيد الانتظار'));
    const record = {
        name,
        requestNo: requestNo.trim(),
        passport,
        approvalDate: isReceipt ? '' : approvalDate,
        appStatus: isReceipt ? 'قيد الانتظار' : appStatus,
        documentType,
        isReceipt,
        rawText
    };
    const validation = validateTransitRecord(record);
    if (approvalDateRaw && !approvalDate && !validation.errors.includes('تاريخ الموافقة غير صالح')) {
        validation.valid = false;
        validation.errors.push('تاريخ الموافقة غير صالح');
    }

    return {
        ...record,
        valid: validation.valid,
        errors: validation.errors,
        missingFields: validation.missingFields
    };
}
