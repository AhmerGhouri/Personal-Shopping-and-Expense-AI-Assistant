import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Product } from '../../api/assistant';
import { colors } from '../../theme';

/** Badges come from the real numbers, not the model, so they are always accurate. */
function badges(products: Product[]): Map<string, string[]> {
  const result = new Map<string, string[]>(products.map(product => [product.id, []]));
  const priced = products.filter(product => product.priceValue !== undefined);
  if (priced.length > 1) {
    const cheapest = priced.reduce((best, product) => product.priceValue! < best.priceValue! ? product : best);
    result.get(cheapest.id)!.push('Best price');
  }
  const rated = products.filter(product => product.rating !== undefined && (product.reviews ?? 0) >= 10);
  if (rated.length > 1) {
    const top = rated.reduce((best, product) => product.rating! > best.rating! ? product : best);
    result.get(top.id)!.push('Top rated');
  }
  return result;
}

function formatReviews(count: number) {
  return count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k` : String(count);
}

export function ProductCards({ products, onBuy }: { products: Product[]; onBuy: (product: Product) => void }) {
  const labels = badges(products);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
      {products.map((product, index) => (
        <View key={product.id} style={styles.card}>
          <View style={styles.imageWrap}>
            {product.thumbnail
              ? <Image source={{ uri: product.thumbnail }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
              : <Text style={styles.imagePlaceholder}>No image</Text>}
            <View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View>
          </View>
          {!!labels.get(product.id)?.length && (
            <View style={styles.badges}>
              {labels.get(product.id)!.map(label => (
                <View key={label} style={[styles.badge, label === 'Best price' ? styles.badgePrice : styles.badgeRated]}>
                  <Text style={[styles.badgeText, label === 'Best price' ? styles.badgePriceText : styles.badgeRatedText]}>{label}</Text>
                </View>
              ))}
            </View>
          )}
          <Text numberOfLines={2} style={styles.title}>{product.title}</Text>
          <Text style={styles.price}>{product.price}</Text>
          <Text numberOfLines={1} style={styles.meta}>
            {product.store}
            {product.rating !== undefined ? `  ·  ★ ${product.rating.toFixed(1)}${product.reviews ? ` (${formatReviews(product.reviews)})` : ''}` : ''}
          </Text>
          {product.delivery ? <Text numberOfLines={1} style={styles.delivery}>{product.delivery}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Buy ${product.title} from ${product.store}`}
            onPress={() => onBuy(product)} style={({ pressed }) => [styles.buy, pressed && styles.pressed]}>
            <Text style={styles.buyText}>View & buy</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { marginHorizontal: -16, marginTop: 10 },
  row: { paddingHorizontal: 16, gap: 10 },
  card: { width: 196, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 12 },
  imageWrap: { height: 116, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' },
  image: { width: '88%', height: '88%' },
  imagePlaceholder: { color: colors.textMuted, fontSize: 12 },
  number: { position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgePrice: { backgroundColor: '#15392B' },
  badgeRated: { backgroundColor: '#3A2F15' },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  badgePriceText: { color: colors.success },
  badgeRatedText: { color: colors.warning },
  title: { color: colors.text, fontSize: 13.5, fontWeight: '600', lineHeight: 18, minHeight: 36 },
  price: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  delivery: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  buy: { marginTop: 10, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  buyText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.75 },
});
