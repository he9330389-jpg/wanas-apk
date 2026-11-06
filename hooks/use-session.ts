import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** أقصى وقت نستنى فيه استرجاع الجلسة المحفوظة قبل ما نعتبر المستخدم غير مسجّل. */
const SESSION_TIMEOUT_MS = 5000;

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const finish = (next: Session | null) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    };

    const timer = setTimeout(() => {
      if (active) setLoading(false);
    }, SESSION_TIMEOUT_MS);

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (__DEV__ && error) console.warn("[WANAS] تعذّر استرجاع الجلسة:", error.message);
        finish(data.session ?? null);
      })
      .catch(() => finish(null))
      .finally(() => clearTimeout(timer));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, userId: session?.user.id ?? null };
}
