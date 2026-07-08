// ─── App Entry Point ────────────────────────────────────────────────
// Nawaqes Native — Android app built with React Native (Expo)
//
// 🔧 FIX: ErrorBoundary catches JS crashes, SplashScreen explicitly hidden

import React, { Component, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from './src/contexts/AuthContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import AppNavigator from './src/navigation/AppNavigator';

// ─── Error Boundary ─────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorLogo}>
            <Text style={styles.errorLogoText}>N</Text>
          </View>
          <Text style={styles.errorTitle}>حدث خطأ غير متوقع</Text>
          <Text style={styles.errorMsg}>{this.state.error}</Text>
          <TouchableOpacity style={styles.errorBtn} onPress={this.handleReset}>
            <Text style={styles.errorBtnText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: { flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorLogo: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f97316', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  errorLogoText: { color: '#fff', fontSize: 44, fontWeight: '900' },
  errorTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  errorMsg: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  errorBtn: { backgroundColor: '#f97316', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14 },
  errorBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});

export default function App() {
  // Hide splash screen as soon as possible
  useEffect(() => {
    const hideSplash = async () => {
      try {
        await SplashScreen.preventAutoHideAsync().catch(() => {});
        setTimeout(async () => {
          await SplashScreen.hideAsync().catch(() => {});
        }, 100);
      } catch (e) {
        // If splash screen fails, ignore — the app will still render
      }
    };
    hideSplash();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthProvider>
            <NotificationProvider>
              <AppNavigator />
              <StatusBar style="light" backgroundColor="#0f172a" />
            </NotificationProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
