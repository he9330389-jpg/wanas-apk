import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** شاشة بداية ثابتة: خلفية بيضاء، علامة W على أسود قاتم، ونصوص واضحة بلا وميض. */
export function LaunchScreen({ status }: { status?: string }) {
  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel="ونس بيجهزلك الونسة">
      <View style={styles.stack}>
        <Text style={styles.builtBy}>Built and programmed by</Text>
        <Text style={styles.author} allowFontScaling={false}>ABD.ALLAH ZOHAIR OMARA</Text>
        <View style={styles.logoBox}>
          <Text style={styles.logoLetter} allowFontScaling={false}>W</Text>
          <View style={styles.logoDot} />
        </View>
        <Text style={styles.wordmark} allowFontScaling={false}>WANAS</Text>
      </View>
      <View style={styles.footer}>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <View style={styles.loaderDot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  stack: { alignItems: "center" },
  builtBy: {
    color: "#8A6500",
    fontSize: 11,
    letterSpacing: 0.4,
    textAlign: "center",
    fontWeight: "700",
  },
  author: {
    color: "#000000",
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 0.9,
    textAlign: "center",
    marginTop: 3,
    marginBottom: 30,
  },
  logoBox: {
    width: 108,
    height: 108,
    borderRadius: 28,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: {
    color: "#FFFFFF",
    fontSize: 62,
    fontWeight: "900",
    lineHeight: 74,
    textAlign: "center",
    includeFontPadding: false,
  },
  logoDot: {
    position: "absolute",
    top: 20,
    right: 22,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#E8C96A",
  },
  wordmark: {
    color: "#000000",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 3.2,
    marginTop: 24,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 56,
    alignItems: "center",
    gap: 12,
  },
  status: { color: "#6B6B77", fontSize: 11.5 },
  loaderDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E8C96A" },
});
