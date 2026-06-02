import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  fetchParentHub,
  login,
  markAllNotificationsRead,
  markNotificationRead,
  unregisterPushToken,
} from './lib/api';
import { syncPushTokenWithServer } from './lib/push';

const STORAGE_TOKEN = 'uclass_auth_token';
const STORAGE_USER = 'uclass_user';
const STORAGE_EXPO_TOKEN = 'uclass_expo_push_token';

function typeLabel(type) {
  if (type === 'homework' || type === 'homework_reminder') return '📚 Homework';
  if (type === 'class_moment') return '📸 Class moment';
  if (type === 'school_announcement') return '🏫 School';
  return '🔔 Update';
}

function NotificationRow({ item, onPress }) {
  return (
    <Pressable
      style={[styles.card, !item.is_read && styles.cardUnread]}
      onPress={() => onPress(item)}
    >
      <Text style={styles.cardType}>{typeLabel(item.type)}</Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardBody} numberOfLines={4}>
        {item.body}
      </Text>
      <Text style={styles.cardTime}>
        {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
      </Text>
    </Pressable>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authToken, setAuthToken] = useState(null);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [hub, setHub] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pushStatus, setPushStatus] = useState('');

  const loadHub = useCallback(async (token) => {
    const data = await fetchParentHub(token);
    setHub(data);
    return data;
  }, []);

  const enablePush = useCallback(async (token) => {
    try {
      const result = await syncPushTokenWithServer(token);
      if (result.ok) {
        await AsyncStorage.setItem(STORAGE_EXPO_TOKEN, result.expoToken);
        setPushStatus('Push alerts enabled — you will get homework reminders even when the app is closed.');
      } else {
        setPushStatus(result.reason || 'Could not enable push.');
      }
    } catch (e) {
      setPushStatus(e.message || 'Push setup failed.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(STORAGE_TOKEN),
          AsyncStorage.getItem(STORAGE_USER),
        ]);
        if (t && u) {
          const parsed = JSON.parse(u);
          if (parsed.role !== 'parent') {
            await AsyncStorage.multiRemove([STORAGE_TOKEN, STORAGE_USER, STORAGE_EXPO_TOKEN]);
          } else {
            setAuthToken(t);
            setUser(parsed);
            await loadHub(t);
            await enablePush(t);
          }
        }
      } catch {
        /* ignore */
      } finally {
        setBooting(false);
      }
    })();
  }, [loadHub, enablePush]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      if (authToken) loadHub(authToken).catch(() => {});
    });
    const tap = Notifications.addNotificationResponseReceivedListener(() => {
      if (authToken) loadHub(authToken).catch(() => {});
    });
    return () => {
      sub.remove();
      tap.remove();
    };
  }, [authToken, loadHub]);

  const onLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Sign in', 'Enter your email and password.');
      return;
    }
    setLoggingIn(true);
    try {
      const data = await login(email, password);
      if (data.user?.role !== 'parent') {
        Alert.alert(
          'Parent account only',
          'This app is for parents. Sign in with the Gmail or email you used when linking to your child.'
        );
        return;
      }
      await AsyncStorage.setItem(STORAGE_TOKEN, data.token);
      await AsyncStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      setAuthToken(data.token);
      setUser(data.user);
      await loadHub(data.token);
      await enablePush(data.token);
    } catch (e) {
      Alert.alert('Sign in failed', e.message || 'Could not sign in.');
    } finally {
      setLoggingIn(false);
    }
  };

  const onLogout = async () => {
    try {
      const expoToken = await AsyncStorage.getItem(STORAGE_EXPO_TOKEN);
      if (authToken && expoToken) {
        await unregisterPushToken(authToken, expoToken).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    await AsyncStorage.multiRemove([STORAGE_TOKEN, STORAGE_USER, STORAGE_EXPO_TOKEN]);
    setAuthToken(null);
    setUser(null);
    setHub(null);
    setPushStatus('');
  };

  const onRefresh = async () => {
    if (!authToken) return;
    setRefreshing(true);
    try {
      await loadHub(authToken);
    } catch (e) {
      Alert.alert('Refresh failed', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const onOpenNotification = async (item) => {
    if (!authToken || item.is_read) return;
    try {
      await markNotificationRead(authToken, item.id);
      await loadHub(authToken);
    } catch {
      /* ignore */
    }
  };

  const onMarkAllRead = async () => {
    if (!authToken) return;
    try {
      await markAllNotificationsRead(authToken);
      await loadHub(authToken);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#075e54" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!authToken) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.loginWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={styles.brand}>UClass Parent</Text>
          <Text style={styles.subtitle}>
            Get homework and class updates on your phone — even when you are not in the app.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Email (Gmail or school)"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={styles.primaryBtn} onPress={onLogin} disabled={loggingIn}>
            {loggingIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign in</Text>
            )}
          </Pressable>
        </KeyboardAvoidingView>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  const notifications = hub?.notifications || [];
  const unread = hub?.unread_notifications_count ?? 0;
  const children = hub?.children || [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSmall}>UClass Parent</Text>
          <Text style={styles.hello}>Hello, {user?.name || 'Parent'}</Text>
        </View>
        <Pressable onPress={onLogout}>
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </View>

      {children.length > 0 && (
        <Text style={styles.childrenLine}>
          Children: {children.map((c) => c.name).join(', ')}
        </Text>
      )}

      {pushStatus ? <Text style={styles.pushHint}>{pushStatus}</Text> : null}

      <View style={styles.toolbar}>
        <Text style={styles.sectionTitle}>
          Notifications {unread > 0 ? `(${unread} new)` : ''}
        </Text>
        {unread > 0 && (
          <Pressable onPress={onMarkAllRead}>
            <Text style={styles.link}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <NotificationRow item={item} onPress={onOpenNotification} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No notifications yet. When teachers post homework or class updates, they will appear here and on your lock screen.
          </Text>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#075e54" />
        }
        contentContainerStyle={notifications.length ? styles.listPad : styles.listPadEmpty}
      />
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f0f2f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#075e54' },
  loginWrap: { flex: 1, padding: 24, justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '700', color: '#075e54', marginBottom: 8 },
  brandSmall: { fontSize: 14, fontWeight: '600', color: '#075e54' },
  subtitle: { fontSize: 15, color: '#475569', marginBottom: 24, lineHeight: 22 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#075e54',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  hello: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  logout: { color: '#075e54', fontSize: 15, paddingTop: 4 },
  childrenLine: { paddingHorizontal: 16, color: '#64748b', fontSize: 14, marginBottom: 4 },
  pushHint: { paddingHorizontal: 16, fontSize: 12, color: '#047857', marginBottom: 8 },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#334155' },
  link: { color: '#075e54', fontSize: 14 },
  listPad: { paddingHorizontal: 12, paddingBottom: 24 },
  listPadEmpty: { padding: 24 },
  empty: { textAlign: 'center', color: '#64748b', lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: '#075e54' },
  cardType: { fontSize: 12, color: '#075e54', fontWeight: '600', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  cardBody: { fontSize: 14, color: '#475569', lineHeight: 20 },
  cardTime: { fontSize: 11, color: '#94a3b8', marginTop: 8 },
});
