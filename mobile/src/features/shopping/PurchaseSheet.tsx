import { useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Product } from '../../api/assistant';
import { colors } from '../../theme';

/**
 * Every purchase goes through this confirmation. The app never pays on its own: it opens
 * the store's page and the user reviews and completes checkout there.
 */
export function PurchaseSheet({ product, onClose, onOpened, beforeOpen }: {
  product: Product | null; onClose: () => void; onOpened: (product: Product) => void;
  /** Asks for fingerprint/PIN when the app is showing over the lock screen. */
  beforeOpen?: () => Promise<boolean>;
}) {
  const [error, setError] = useState('');
  async function open() {
    if (!product) return;
    try {
      if (beforeOpen && !await beforeOpen()) { setError('Unlock your phone to continue to the store.'); return; }
      await Linking.openURL(product.link);
      setError('');
      onOpened(product);
      onClose();
    } catch {
      setError('Could not open the store page. Check that a web browser is installed.');
    }
  }
  return (
    <Modal visible={!!product} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cancel purchase" />
        {product && (
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.heading}>Ready to buy?</Text>
            <View style={styles.product}>
              <View style={styles.imageWrap}>
                {product.thumbnail ? <Image source={{ uri: product.thumbnail }} style={styles.image} resizeMode="contain" /> : null}
              </View>
              <View style={styles.details}>
                <Text numberOfLines={3} style={styles.title}>{product.title}</Text>
                <Text style={styles.price}>{product.price}</Text>
                <Text style={styles.store}>Sold by {product.store}</Text>
              </View>
            </View>
            <Text style={styles.note}>
              We’ll open {product.store} in your browser. Check the price, seller and delivery there, then complete checkout yourself. Nothing is charged by this app.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={open} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Go to {product.store}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,6,14,0.6)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, borderWidth: 1, borderColor: colors.border },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  heading: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 14 },
  product: { flexDirection: 'row', gap: 14 },
  imageWrap: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '88%', height: '88%' },
  details: { flex: 1 },
  title: { color: colors.text, fontSize: 14.5, fontWeight: '600', lineHeight: 20 },
  price: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
  store: { color: colors.textSecondary, fontSize: 12.5, marginTop: 2 },
  note: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.background },
  error: { color: colors.danger, fontSize: 13, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondary: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  primary: { flex: 1.4, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.75 },
  centered: { justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  dialogImage: { width: 96, height: 96, marginBottom: 14 },
  dialogTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  dialogText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  dialogPrice: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  dialogHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 6 },
});

/** Shown when the user comes back from the store, so real purchases land in the expense tracker. */
export function DidBuySheet({ product, price, onAnswer }: { product: Product | null; price: string; onAnswer: (bought: boolean) => void }) {
  return (
    <Modal visible={!!product} transparent animationType="fade" onRequestClose={() => onAnswer(false)} statusBarTranslucent>
      <View style={[styles.backdrop, styles.centered]}>
        {product && (
          <View style={styles.dialog}>
            <View style={[styles.imageWrap, styles.dialogImage]}>
              {product.thumbnail ? <Image source={{ uri: product.thumbnail }} style={styles.image} resizeMode="contain" /> : null}
            </View>
            <Text style={styles.dialogTitle}>Did you buy it?</Text>
            <Text numberOfLines={2} style={styles.dialogText}>{product.title}</Text>
            <Text style={styles.dialogPrice}>{price} · {product.store}</Text>
            <Text style={styles.dialogHint}>We’ll add it to your expense tracker.</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => onAnswer(false)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Not yet</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => onAnswer(true)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Yes, add it</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
