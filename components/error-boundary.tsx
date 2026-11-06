import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { reportCrash } from "@/lib/crash-report";

type Props = { children: React.ReactNode };
type State = { error: Error | null; details: string | null };

/**
 * حائط أمان: لو أي شاشة رمت خطأ أثناء الرسم، التطبيق ما يقفلش —
 * بنعرض رسالة عربية واضحة، وبنبعت تفاصيل الخطأ لجدول البلاغات،
 * وبنسمح للمستخدم يحاول تاني أو يبدأ من جديد.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, details: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const details = info?.componentStack ?? null;
    this.setState({ details });
    void reportCrash({
      phase: "render-error",
      message: error?.message ?? "Unknown render error",
      stack: `${error?.stack ?? ""}\n--- component stack ---\n${details ?? ""}`,
    });
  }

  reset = () => {
    this.setState({ error: null, details: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>حصلت مشكلة صغيرة</Text>
        <Text style={styles.body}>
          ونس قابل خطأ غير متوقع في الشاشة دي. جرّب تحاول تاني، ولو المشكلة كررت معاك هتكون اتبعتتلنا تلقائيًا
          عشان نصلّحها.
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.code} numberOfLines={6}>
            {this.state.error.message}
          </Text>
        </View>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>جرّب تاني</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
  },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", textAlign: "center" },
  body: { color: "#B4B4BE", fontSize: 14, lineHeight: 22, textAlign: "center" },
  codeBox: {
    backgroundColor: "#111116",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A33",
    padding: 12,
    width: "100%",
  },
  code: { color: "#ED5565", fontSize: 12, textAlign: "left" },
  button: {
    backgroundColor: "#E8C96A",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 6,
  },
  buttonText: { color: "#0B0B0F", fontSize: 15, fontWeight: "700" },
});
