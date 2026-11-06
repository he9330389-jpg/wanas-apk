export function authErrorMessage(error: unknown, fallback = "حصلت مشكلة، جرّب تاني."): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (/error sending confirmation email|error sending recovery email|error sending (magic link|email)/i.test(message)) {
    return "إعداد البريد على الخادم مش مظبوط، فمقدرناش نبعت الرسالة. كلّمنا بعد ما يتظبط مزوّد البريد، وحاول تاني.";
  }
  if (/application-specific password|badcredentials|username and password not accepted/i.test(message)) {
    return "مزوّد البريد رافض بيانات الدخول. لازم إعداد SMTP على الخادم يتصحح قبل ما الأكواد توصل.";
  }
  if (/email address not authorized/i.test(message)) {
    return "خدمة البريد الحالية مش مسموح لها تبعت لعنوان Gmail ده. لازم يتربط مزوّد SMTP مخصص في Supabase.";
  }
  if (/rate limit|too many requests|email rate limit/i.test(message)) {
    return "طلبات إرسال الأكواد كتير دلوقتي. استنى شوية وجرب تاني.";
  }
  if (/(token|otp|code).*(invalid|expired|used)|((invalid|expired|used).*(token|otp|code))/i.test(message)) {
    return "الكود غير صحيح أو انتهت صلاحيته. راجع آخر رسالة واطلب كود جديد لو لزم.";
  }
  return message || fallback;
}
