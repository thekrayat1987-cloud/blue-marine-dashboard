#!/usr/bin/env node
/**
 * Bulk-register Arabic translations for the remaining customer-facing
 * Shopify system strings (notices, errors, addresses, collections sort, etc.).
 *
 * Skips internal/edge strings that won't be seen by storefront shoppers
 * (e.g. shopify.errors.shop_404.* — only visible when a store doesn't exist).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "..", ".env.local"), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const URL = `https://${STORE}/admin/api/${VERSION}/graphql.json`;

const todo = JSON.parse(readFileSync(resolve(__dirname, "..", "ar-todo.json"), "utf8"));

// key -> Arabic translation
const AR = {
  // --- sentence connectors ---
  "shopify.sentence.two_words_connector": "و",
  "shopify.sentence.last_word_connector": "، و",

  // --- pagination ---
  "shopify.pagination.previous": "السابق",
  "shopify.pagination.next": "التالي",

  // --- links ---
  "shopify.links.powered_by_shopify": "مدعوم من Shopify",
  "shopify.links.learn_more": "اعرف المزيد",

  // --- feed ---
  "shopify.feed.more": "المزيد",

  // --- attributes (form field names) ---
  "shopify.attributes.email": "البريد الإلكتروني",
  "shopify.attributes.password": "كلمة المرور",
  "shopify.attributes.password_confirmation": "تأكيد كلمة المرور",
  "shopify.attributes.first_name": "الاسم الأول",
  "shopify.attributes.last_name": "اسم العائلة",
  "shopify.attributes.body": "النص",
  "shopify.attributes.signature": "العنوان",

  // --- addresses (form field names) ---
  "shopify.addresses.zip_code": "الرمز البريدي",
  "shopify.addresses.postal_code": "الرمز البريدي",
  "shopify.addresses.postcode": "الرمز البريدي",
  "shopify.addresses.pincode": "الرمز البريدي",
  "shopify.addresses.region": "المنطقة",
  "shopify.addresses.prefecture": "المحافظة",
  "shopify.addresses.province": "المقاطعة",
  "shopify.addresses.state": "الولاية",
  "shopify.addresses.state_and_territory": "الولاية/الإقليم",
  "shopify.addresses.county": "المقاطعة",
  "shopify.addresses.emirate": "الإمارة",
  "shopify.addresses.governorate": "المحافظة",
  "shopify.addresses.confirm": "هل أنت متأكد أنك تريد حذف هذا العنوان؟",

  // --- collection sorting ---
  "shopify.collections.sorting.manual": "المميزة",
  "shopify.collections.sorting.best_selling": "الأكثر مبيعاً",
  "shopify.collections.sorting.az": "أبجدياً، أ-ي",
  "shopify.collections.sorting.za": "أبجدياً، ي-أ",
  "shopify.collections.sorting.price_ascending": "السعر، من الأقل إلى الأعلى",
  "shopify.collections.sorting.price_descending": "السعر، من الأعلى إلى الأقل",
  "shopify.collections.sorting.date_ascending": "التاريخ، من الأقدم إلى الأحدث",
  "shopify.collections.sorting.date_descending": "التاريخ، من الأحدث إلى الأقدم",
  "shopify.collections.sorting.most_relevant": "الأكثر صلة",

  // --- email marketing (newsletter) ---
  "shopify.email_marketing.subscribed.confirmation": "شكراً لاشتراكك في قائمتنا البريدية.",
  "shopify.email_marketing.subscribed.disclaimer": "يمكنك إلغاء الاشتراك في أي وقت.",
  "shopify.email_marketing.subscribed.unsubscribe": "إلغاء الاشتراك",
  "shopify.email_marketing.unsubscribed.confirmation": "لقد ألغيت اشتراكك من قائمتنا البريدية.",
  "shopify.email_marketing.unsubscribed.disclaimer": "لن تتلقى منا أي تحديثات تسويقية بعد الآن. يمكنك الاشتراك من جديد في أي وقت.",
  "shopify.email_marketing.unsubscribed.preview": "أنت تشاهد معاينة لما سيراه العملاء عند إلغاء الاشتراك.",
  "shopify.email_marketing.sms_unsubscribe_confirm.message": "هل أنت متأكد أنك تريد إلغاء الاشتراك في الرسائل التسويقية القصيرة؟",
  "shopify.email_marketing.sms_unsubscribe_confirm.button": "إلغاء الاشتراك",
  "shopify.email_marketing.open_tracking.opt_in.opted_in_html": "<b>لقد وافقت على تتبع فتح البريد الإلكتروني.</b>",
  "shopify.email_marketing.open_tracking.opt_in.visibility": "سيتم الإبلاغ عن معدلات فتح البريد الإلكتروني بشكل مجهول. سنرى فقط ما إذا كنت قد فتحت بريداً إلكترونياً كجزء من معدل فتح إجمالي.",
  "shopify.email_marketing.open_tracking.opt_in.opt_out_html": "يمكنك <a style='text-decoration:underline;' href='%{link}'>إلغاء الموافقة</a> على تتبع فتح البريد الإلكتروني إذا كنت لا ترغب في مشاركة هذه المعلومات.",

  // --- notices: customer ---
  "shopify.notices.customer.password_reset_error": "خطأ في إعادة تعيين كلمة المرور",
  "shopify.notices.customer.subscribe_error": "خطأ في الاشتراك",
  "shopify.notices.customer.unsubscribe_error": "خطأ في إلغاء الاشتراك",
  "shopify.notices.customer.no_account_found": "لم يتم العثور على حساب بهذا البريد الإلكتروني.",
  "shopify.notices.customer.invalid_credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "shopify.notices.customer.denylisted_reset_password": "تعذّر الوصول إلى حسابك لأن كلمة المرور الحالية ليست آمنة. ستتلقى رسالة بريد إلكتروني لتحديث كلمة المرور.",
  "shopify.notices.customer.signup_disabled": "تم تعطيل إنشاء حسابات العملاء.",

  // --- notices: address ---
  "shopify.notices.address.updated": "تم تحديث العنوان بنجاح.",
  "shopify.notices.address.error_updating": "خطأ في تحديث العنوان",
  "shopify.notices.address.created": "تم إنشاء العنوان بنجاح",
  "shopify.notices.address.error_creating": "خطأ في إنشاء العنوان.",
  "shopify.notices.address.deleted": "تم حذف العنوان بنجاح",
  "shopify.notices.address.error_deleting": "خطأ في حذف العنوان.",

  // --- notices: line item / order ---
  "shopify.notices.line_item.item_status.add_variant": "تم إضافة %{delta}",
  "shopify.notices.line_item.item_status.increment_item": "تم إضافة %{delta}",
  "shopify.notices.line_item.item_status.decrement_item": "تم إزالة %{delta} من %{total}",
  "shopify.notices.line_item.item_status.decrement_fulfilled_line_item": "تم إرجاع %{delta} من %{total}",
  "shopify.notices.line_item.item_status.decrement_return_line_item": "تم إزالة %{delta} من المرتجعات",
  "shopify.notices.order.not_available": "هذا الطلب غير متاح",
  "shopify.notices.order.financial_status.authorized": "مُصرَّح به",
  "shopify.notices.order.financial_status.pending": "قيد الانتظار",
  "shopify.notices.order.financial_status.paid": "مدفوع",
  "shopify.notices.order.financial_status.unpaid": "غير مدفوع",
  "shopify.notices.order.financial_status.voided": "مُلغى",
  "shopify.notices.order.financial_status.partially_paid": "مدفوع جزئياً",
  "shopify.notices.order.financial_status.partially_refunded": "مُسترَد جزئياً",
  "shopify.notices.order.financial_status.refunded": "مُسترَد",
  "shopify.notices.order.financial_status.expired": "منتهي الصلاحية",
  "shopify.notices.order.fulfillment_status.fulfilled": "تم التنفيذ",
  "shopify.notices.order.fulfillment_status.complete": "مكتمل",
  "shopify.notices.order.fulfillment_status.partial": "جزئي",
  "shopify.notices.order.fulfillment_status.unfulfilled": "لم يُنفَّذ بعد",
  "shopify.notices.order.fulfillment_status.restocked": "أُعيد إلى المخزون",
  "shopify.notices.order.transaction_status.success": "نجاح",
  "shopify.notices.order.transaction_status.pending": "قيد الانتظار",
  "shopify.notices.order.transaction_status.failure": "فشل",
  "shopify.notices.order.transaction_status.error": "خطأ",
  "shopify.notices.order.cancel_reason.declined": "تم رفض الدفع",
  "shopify.notices.order.cancel_reason.inventory": "المنتجات غير متوفرة",
  "shopify.notices.order.cancel_reason.fraud": "طلب احتيالي",
  "shopify.notices.order.cancel_reason.customer": "العميل غيّر/ألغى الطلب",
  "shopify.notices.order.cancel_reason.staff": "خطأ من الموظفين",
  "shopify.notices.order.cancel_reason.other": "أخرى",
  "shopify.notices.order.cash_on_delivery": "الدفع عند الاستلام",

  // --- notices: cart ---
  "shopify.notices.cart.not_found": "لم يتم العثور على السلة",
  "shopify.notices.cart.only_n_items_available": "يمكنك إضافة %{count} %{name} فقط إلى السلة.",
  "shopify.notices.cart.too_many_items_in_cart": "لا يمكنك إضافة المزيد من %{name} إلى السلة.",
  "shopify.notices.cart.only_one_added_to_cart": "تمت إضافة منتج واحد فقط إلى سلتك بسبب التوفر.",
  "shopify.notices.cart.only_n_added_to_cart": "تمت إضافة %{quantity} منتجات فقط إلى سلتك بسبب التوفر.",
  "shopify.notices.cart.maximum_available_quantity_reached": "الحد الأقصى لكمية هذا المنتج موجود بالفعل في سلتك.",
  "shopify.notices.cart.less_than_minimum": "الحد الأدنى لهذا المنتج هو %{min}.",
  "shopify.notices.cart.more_than_maximum": "الحد الأقصى لهذا المنتج هو %{max}.",
  "shopify.notices.cart.not_respect_step": "يمكنك إضافة هذا المنتج فقط بمضاعفات %{step}.",
  "shopify.notices.cart.all_items_in_cart": "كل %{count} %{name} موجودة في سلتك.",
  "shopify.notices.cart.empty_update": "لا يمكن تحديث سلة فارغة",
  "shopify.notices.cart.missing_parameters": "لا يوجد معرّف أو سطر صالح",
  "shopify.notices.cart.generic_error": "خطأ في السلة",
  "shopify.notices.cart.invalid_input": "المعامل %{parameter} غير صالح.",
  "shopify.notices.cart.product_not_available": "المنتج غير متوفر",
  "shopify.notices.cart.too_many_line_items_error": "لا يمكن أن تحتوي سلتك على أكثر من %{max} منتج.",
  "shopify.notices.cart.link_expired": "انتهت صلاحية الرابط",
  "shopify.notices.cart.link_no_longer_exists": "الرابط لم يعد موجوداً.",
  "shopify.notices.cart.stock_problems_html": "منتج واحد أو أكثر لم يعد متوفراً. لقد قمنا بتزويدك <a href='%{link}'>بسلة محدّثة</a>.",
  "shopify.notices.cart.changed": "تم تغيير السلة",
  "shopify.notices.cart.items_changed": "تم تغيير منتج واحد أو أكثر.",
  "shopify.notices.cart.product_sold_out": "المنتج '%{name}' نفد من المخزون بالفعل.",
  "shopify.notices.cart.variant_not_found": "تعذّر العثور على المتغير",
  "shopify.notices.cart.variant_requires_selling_plan": "لا يمكن شراء هذا المتغير إلا من خلال خطة بيع.",
  "shopify.notices.cart.selling_plan_not_available_for_company_locations": "متاح الشراء لمرة واحدة فقط لطلبات الشركات",
  "shopify.notices.cart.digital_product_not_available_for_company_locations": "لا يمكن إضافة هذا المنتج إلى طلب شركة",
  "shopify.notices.cart.buyer_cannot_purchase_for_company_locations": "لا يمكنك الشراء لهذا الموقع",
  "shopify.notices.cart.selling_plan_not_applicable": "لا يمكن تطبيق خطة البيع على هذا المتغير",
  "shopify.notices.cart.shipping_address_not_required": "لا تتطلب هذه السلة شحناً",
  "shopify.notices.cart.shipping_address_invalid": "حدثت مشكلة في حساب أسعار الشحن. تابع إلى الدفع لاختيار سعر الشحن قبل إتمام الطلب.",
  "shopify.notices.cart.bundle_requires_components": "لا يمكن إضافة المنتج المجمّع '%{name}' إلى السلة.",
  "shopify.notices.cart.gift_card_with_components_not_supported": "لا يمكن إضافة المنتج المجمّع '%{name}' إلى السلة.",
  "shopify.notices.cart.gift_card_price_must_be_greater_than_zero": "لا يمكن إضافة المنتج المجمّع '%{name}' إلى السلة.",
  "shopify.notices.cart.gift_card_recipient_validation_error": "مستلم بطاقة الهدية المحدد غير صالح",
  "shopify.notices.cart.view_lines_limit_reached": "يجب أن تكون السطور أقل من أو تساوي %{limit}",
  "shopify.notices.cart.cart_too_large": "السلة كبيرة جداً.",
  "shopify.notices.cart.cart_attributes_error": "تحتوي خصائص السلة على بيانات غير صالحة.",
  "shopify.notices.cart.merchandise_line_transformers.run_error": "حدث خطأ في سلتك.",
  "shopify.notices.cart.merchandise_not_applicable": "لا يمكن شراء هذا المنتج بهذه التهيئة.",

  // --- notices: storefront / tags ---
  "shopify.notices.storefront.invalid_password": "كلمة المرور غير صحيحة، حاول مرة أخرى.",
  "shopify.notices.tags.add_articles": "تضييق البحث ليشمل المقالات التي تحمل أيضاً الوسم %{tag}",
  "shopify.notices.tags.add_products": "تضييق التحديد على المنتجات التي تطابق الوسم %{tag}",
  "shopify.notices.tags.remove_articles": "توسيع البحث ليشمل المقالات التي لا تحمل الوسم %{tag}",
  "shopify.notices.tags.remove_products": "إزالة الوسم %{tag}",

  // --- errors (form validation) ---
  "shopify.errors.blank": "لا يمكن أن يكون فارغاً",
  "shopify.errors.blocked_address": "هذا الموقع غير مدعوم",
  "shopify.errors.credit_card_session_expired": "انتهت صلاحية تفويض البطاقة الائتمانية، يرجى إدخال معلومات الدفع مرة أخرى. لم يتم خصم أي مبلغ من بطاقتك.",
  "shopify.errors.empty": "لا يمكن أن يكون فارغاً",
  "shopify.errors.invalid_email": "يجب أن يكون عنوان بريد إلكتروني صالحاً",
  "shopify.errors.discount_disabled": "تم تعطيل هذا الخصم",
  "shopify.errors.discount_expired": "هذا الخصم لم يعد ساري المفعول",
  "shopify.errors.discount_limit_reached": "وصل هذا الخصم إلى حد الاستخدام",
  "shopify.errors.discount_not_found": "تعذّر العثور على خصم صالح يطابق الرمز المُدخل",
  "shopify.errors.customer_already_used_once_per_customer_discount_notice": "وصل هذا الخصم إلى حد الاستخدام",
  "shopify.errors.gift_card_already_applied": "تم تطبيق الرمز بالفعل على عملية الدفع",
  "shopify.errors.gift_card_code_invalid": "الرمز غير صالح",
  "shopify.errors.gift_card_currency_mismatch": "لا يمكن استخدام بطاقة الهدية هذه لإتمام عملية الشراء. تواصل مع %{shop_name} لإعادة إصدارها.",
  "shopify.errors.gift_card_depleted": "لم يتبقَ رصيد على بطاقة الهدية",
  "shopify.errors.gift_card_disabled": "بطاقة الهدية معطّلة",
  "shopify.errors.gift_card_expired": "انتهت صلاحية بطاقة الهدية",
  "shopify.errors.invalid": "غير صالح",
  "shopify.errors.bad_domain": "يحتوي على اسم نطاق غير صالح",
  "shopify.errors.taken": "مُستخدَم بالفعل",
  "shopify.errors.contains_html_tags": "لا يمكن أن يحتوي على وسوم HTML",
  "shopify.errors.too_short": "قصير جداً (الحد الأدنى هو %{count} حرفاً)",
  "shopify.errors.too_long": "طويل جداً (الحد الأقصى هو %{count} حرفاً)",
  "shopify.errors.password_mismatch": "يجب أن تطابق كلمة المرور المُدخلة",
  "shopify.errors.contains_spaces": "يبدأ أو ينتهي بمسافات.",
  "shopify.errors.invalid_for_country": "غير صالح في %{country}",
  "shopify.errors.invalid_for_country_and_province": "غير صالح في %{province} و %{country}",
  "shopify.errors.invalid_province_in_country": "ليست مقاطعة صالحة في %{country}",
  "shopify.errors.invalid_state_in_country": "ليست ولاية صالحة في %{country}",
  "shopify.errors.invalid_region_in_country": "ليست منطقة صالحة في %{country}",
  "shopify.errors.less_than_or_equal_to": "يجب أن يكون أقل من أو يساوي %{count}",
  "shopify.errors.not_supported": "غير مدعوم",
  "shopify.errors.full_name_required": "أدخل الاسم الأول واسم العائلة",
  "shopify.errors.invalid_for_card_type": "غير صالح",
  "shopify.errors.invalid_type": "نأسف، لا نقبل البطاقات من هذا النوع",
  "shopify.errors.invalid_format": "التنسيق غير صالح",
  "shopify.errors.expired": "انتهت صلاحيته",
  "shopify.errors.invalid_start_date_or_issue_number_for_debit": "يجب إدخال تاريخ بدء صالح أو رقم إصدار صالح",
  "shopify.errors.invalid_expiry_year": "سنة انتهاء صلاحية غير صالحة",
  "shopify.errors.reset_password_html": "هذا البريد الإلكتروني مُسجّل بالفعل في حساب. إذا كان هذا الحساب لك، يمكنك <a href=\"/account/login#recover\">إعادة تعيين كلمة المرور</a>",
  "shopify.errors.verify_email": "لقد أرسلنا رسالة بريد إلكتروني إلى %{customer_email}، يرجى النقر على الرابط المُرفق للتحقق من بريدك الإلكتروني.",
  "shopify.errors.product_not_available": "المنتج غير منشور لهذا العميل.",
};

// Skip the shopify.errors.shop_404.* keys — only relevant when a store doesn't exist.

async function gql(query, variables = {}) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const MUTATION = `
  mutation translationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      userErrors { message field }
      translations { key value locale }
    }
  }
`;

let registered = 0;
let skipped = 0;
let failed = 0;
const failures = [];

// Group by resource id (all the theme strings share one resourceId so we can batch).
const byResource = new Map();
for (const item of todo) {
  const ar = AR[item.key];
  if (!ar) {
    skipped++;
    continue;
  }
  if (!byResource.has(item.rid)) byResource.set(item.rid, []);
  byResource.get(item.rid).push({
    key: item.key,
    value: ar,
    locale: "ar",
    translatableContentDigest: item.digest,
  });
}

console.log(
  `Mapped ${[...byResource.values()].reduce((a, b) => a + b.length, 0)} translations across ${byResource.size} resource(s). Skipped ${skipped} keys without a mapping.`,
);

// Shopify caps translationsRegister at 250 per call. We're under that per resource,
// but chunk to be safe.
const CHUNK = 100;
for (const [rid, all] of byResource) {
  for (let i = 0; i < all.length; i += CHUNK) {
    const batch = all.slice(i, i + CHUNK);
    const j = await gql(MUTATION, { resourceId: rid, translations: batch });
    const errs = j.data?.translationsRegister?.userErrors || [];
    if (j.errors) {
      failed += batch.length;
      failures.push({ rid, errors: j.errors });
      console.log(`❌ ${rid} chunk ${i}: ${JSON.stringify(j.errors)}`);
      continue;
    }
    if (errs.length) {
      failed += errs.length;
      failures.push({ rid, errors: errs });
      console.log(`⚠️  ${rid} chunk ${i}: ${errs.length} userErrors`);
      for (const e of errs.slice(0, 5)) console.log(`     ${JSON.stringify(e)}`);
    }
    registered += batch.length - errs.length;
    console.log(`✅ ${rid} chunk starting ${i}: ${batch.length - errs.length}/${batch.length} ok`);
  }
}

console.log(`\nDone. Registered=${registered}  Failed=${failed}  Skipped=${skipped}`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f).slice(0, 300));
}
