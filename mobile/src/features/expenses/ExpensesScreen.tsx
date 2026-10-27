import { useMemo, useState } from 'react';
import {
  Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { colors } from '../../theme';
import { CATEGORIES, categoryColors, formatMoney, type Category, type Expense, type NewExpense } from './expenses';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = MONTHS.map(month => month.slice(0, 3));
const sourceLabels: Record<Expense['source'], string> = { purchase: 'Bought via assistant', booking: 'Booked via assistant', assistant: 'Added by assistant', manual: 'Added manually' };

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function CategoryDot({ category, size = 36 }: { category: Category; size?: number }) {
  return (
    <View style={[styles.categoryDot, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${categoryColors[category]}26` }]}>
      <Text style={[styles.categoryInitial, { color: categoryColors[category] }]}>{category[0]}</Text>
    </View>
  );
}

export function ExpensesScreen({ expenses, onAdd, onRemove }: {
  expenses: Expense[]; onAdd: (expense: NewExpense) => void; onRemove: (id: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);

  const inMonth = useMemo(() => expenses.filter(expense => {
    const date = new Date(expense.date);
    return date.getFullYear() === month.year && date.getMonth() === month.month;
  }), [expenses, month]);
  const total = inMonth.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = useMemo(() => CATEGORIES
    .map(category => ({ category, amount: inMonth.filter(expense => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0) }))
    .filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount), [inMonth]);
  const groups = useMemo(() => {
    const result: { label: string; items: Expense[] }[] = [];
    for (const expense of inMonth) {
      const label = dayLabel(expense.date);
      const group = result.at(-1);
      if (group?.label === label) group.items.push(expense); else result.push({ label, items: [expense] });
    }
    return result;
  }, [inMonth]);
  const isCurrentMonth = month.year === now.getFullYear() && month.month === now.getMonth();

  function shift(delta: number) {
    setMonth(previous => {
      const date = new Date(previous.year, previous.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shift(-1)} hitSlop={10} style={styles.monthButton}>
            <Text style={styles.monthArrow}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{MONTHS[month.month]} {month.year}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={isCurrentMonth} onPress={() => shift(1)} hitSlop={10}
            style={[styles.monthButton, isCurrentMonth && styles.disabled]}>
            <Text style={styles.monthArrow}>›</Text>
          </Pressable>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Spent this month</Text>
          <Text style={styles.totalValue}>{formatMoney(total)}</Text>
          <Text style={styles.totalMeta}>{inMonth.length} {inMonth.length === 1 ? 'expense' : 'expenses'}</Text>
          {byCategory.length > 0 && (
            <View style={styles.stack}>
              {byCategory.map(item => (
                <View key={item.category} style={{ flex: item.amount, backgroundColor: categoryColors[item.category] }} />
              ))}
            </View>
          )}
        </View>

        {byCategory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>By category</Text>
            {byCategory.map(item => (
              <View key={item.category} style={styles.categoryRow}>
                <CategoryDot category={item.category} size={30} />
                <View style={styles.categoryBody}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryName}>{item.category}</Text>
                    <Text style={styles.categoryAmount}>{formatMoney(item.amount)}</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.max(4, (item.amount / total) * 100)}%`, backgroundColor: categoryColors[item.category] }]} />
                  </View>
                </View>
                <Text style={styles.percent}>{Math.round((item.amount / total) * 100)}%</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>History</Text>
          {!groups.length && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No expenses in {MONTHS[month.month]}</Text>
              <Text style={styles.emptyText}>Purchases you make through the assistant appear here. You can also say “I spent 1500 on lunch” or tap + to add one.</Text>
            </View>
          )}
          {groups.map(group => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map(expense => (
                <Pressable key={expense.id} accessibilityRole="button" onPress={() => setSelected(expense)}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                  {expense.thumbnail
                    ? <Image source={{ uri: expense.thumbnail }} style={styles.thumb} resizeMode="contain" />
                    : <CategoryDot category={expense.category} />}
                  <View style={styles.itemBody}>
                    <Text numberOfLines={1} style={styles.itemTitle}>{expense.title}</Text>
                    <Text numberOfLines={1} style={styles.itemMeta}>{expense.category}{expense.store ? ` · ${expense.store}` : ''}</Text>
                  </View>
                  <Text style={styles.itemAmount}>{formatMoney(expense.amount)}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="Add expense" onPress={() => setAdding(true)}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <ExpenseDetail expense={selected} onClose={() => setSelected(null)} onDelete={id => { onRemove(id); setSelected(null); }} />
      <AddExpenseSheet visible={adding} onClose={() => setAdding(false)} onSave={expense => { onAdd(expense); setAdding(false); }} />
    </View>
  );
}

function ExpenseDetail({ expense, onClose, onDelete }: { expense: Expense | null; onClose: () => void; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const close = () => { setConfirming(false); onClose(); };
  return (
    <Modal visible={!!expense} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close details" />
        {expense && (
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.detailHeader}>
              {expense.thumbnail
                ? <View style={styles.detailImage}><Image source={{ uri: expense.thumbnail }} style={styles.detailImageInner} resizeMode="contain" /></View>
                : <CategoryDot category={expense.category} size={56} />}
              <View style={styles.detailHeaderText}>
                <Text style={styles.detailAmount}>{formatMoney(expense.amount)}</Text>
                <Text numberOfLines={3} style={styles.detailTitle}>{expense.title}</Text>
              </View>
            </View>
            <View style={styles.detailTable}>
              {[
                ['Category', expense.category],
                ['Date', `${dayLabel(expense.date)}, ${new Date(expense.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`],
                ...(expense.store ? [['Store', expense.store]] : []),
                ['Added', sourceLabels[expense.source]],
                ...(expense.note ? [['Note', expense.note]] : []),
              ].map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => confirming ? onDelete(expense.id) : setConfirming(true)}
                style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
                <Text style={styles.dangerText}>{confirming ? 'Tap again to delete' : 'Delete'}</Text>
              </Pressable>
              {expense.link ? (
                <Pressable accessibilityRole="button" onPress={() => { void Linking.openURL(expense.link!).catch(() => {}); }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryText}>View in store</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryText}>Done</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function AddExpenseSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (expense: NewExpense) => void }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('Food');
  const value = Number(amount.replace(/,/g, ''));
  const valid = title.trim().length > 0 && Number.isFinite(value) && value > 0;
  function save() {
    if (!valid) return;
    onSave({ title, amount: value, category, source: 'manual' });
    setTitle(''); setAmount(''); setCategory('Food');
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cancel" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Add expense</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount (Rs)"
            placeholderTextColor={colors.textMuted} style={[styles.input, styles.amountInput]} accessibilityLabel="Amount" />
          <TextInput value={title} onChangeText={setTitle} placeholder="What was it for?" placeholderTextColor={colors.textMuted}
            style={styles.input} accessibilityLabel="Description" maxLength={120} />
          <View style={styles.chips}>
            {CATEGORIES.map(item => (
              <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === category }} onPress={() => setCategory(item)}
                style={[styles.chip, item === category && { backgroundColor: `${categoryColors[item]}33`, borderColor: categoryColors[item] }]}>
                <Text style={[styles.chipText, item === category && { color: categoryColors[item] }]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!valid} onPress={save}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, !valid && styles.disabled]}>
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 96, gap: 16 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  monthArrow: { color: colors.text, fontSize: 22, lineHeight: 24 },
  monthTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },

  totalCard: { backgroundColor: colors.accentSoft, borderRadius: 20, padding: 20 },
  totalLabel: { color: '#C9D0FF', fontSize: 13, fontWeight: '600' },
  totalValue: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 6 },
  totalMeta: { color: '#C9D0FF', fontSize: 13, marginTop: 2 },
  stack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 16, gap: 2 },

  section: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryDot: { alignItems: 'center', justifyContent: 'center' },
  categoryInitial: { fontWeight: '800', fontSize: 14 },
  categoryBody: { flex: 1, gap: 6 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  categoryName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  categoryAmount: { color: colors.textSecondary, fontSize: 13 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.background, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  percent: { color: colors.textMuted, fontSize: 12, width: 36, textAlign: 'right' },

  empty: { paddingVertical: 12, gap: 6 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  emptyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  group: { gap: 4 },
  groupLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4, marginBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  thumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFFFFF' },
  itemBody: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  itemMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  itemAmount: { color: colors.text, fontSize: 14.5, fontWeight: '700' },

  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabText: { color: colors.onAccent, fontSize: 30, lineHeight: 32, fontWeight: '500' },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3,6,14,0.6)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34, borderWidth: 1, borderColor: colors.border },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 19, fontWeight: '700', marginBottom: 14 },
  detailHeader: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  detailImage: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  detailImageInner: { width: '88%', height: '88%' },
  detailHeaderText: { flex: 1 },
  detailAmount: { color: colors.text, fontSize: 26, fontWeight: '800' },
  detailTitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 2 },
  detailTable: { marginTop: 18, borderRadius: 12, backgroundColor: colors.background, paddingHorizontal: 14 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  detailLabel: { color: colors.textMuted, fontSize: 13 },
  detailValue: { color: colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  input: { backgroundColor: colors.background, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 10 },
  amountInput: { fontSize: 22, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryButton: { flex: 1.3, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  secondaryButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  dangerButton: { flex: 1, backgroundColor: colors.dangerSoft, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: colors.danger, fontWeight: '700', fontSize: 15 },
});
