import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/wanas';

import { themedStyles } from "@/lib/theme-runtime";
export function SafeAreaWrapper({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {children}
    </View>
  );
}

const styles = themedStyles(() => (StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }
})));
