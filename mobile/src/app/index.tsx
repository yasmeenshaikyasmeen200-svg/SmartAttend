import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { loginUser } from './api';

export default function LoginScreen() {
  const router = useRouter();
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  const roles = [
    { label: 'Student', value: 'student' },
    { label: 'Faculty', value: 'faculty' },
    { label: 'College Admin', value: 'college_admin' },
    { label: 'System Admin', value: 'smartattend_admin' }
  ];

  // By adding `: any` to codeToUse, we tell TypeScript to allow strings or null
  const handleLogin = async (codeToUse: any = null) => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      await loginUser(role, email, password, codeToUse);
      router.replace({ pathname: '/dashboard', params: { role: role } });
    } catch (error: any) {
      if (error.message === 'REQUIRE_2FA') {
        setShowOtpModal(true); 
      } else {
        Alert.alert('Login Failed', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = () => {
    if (otpCode.length !== 5) {
      Alert.alert('Error', 'Please enter the 5-digit code.');
      return;
    }
    setShowOtpModal(false);
    handleLogin(otpCode); 
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>SmartAttend</Text>
        <Text style={styles.subtitle}>Smart College Attendance System</Text>

        <Text style={styles.label}>Select Role</Text>
        <View style={styles.roleContainer}>
          {roles.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.roleButton, role === r.value && styles.roleButtonActive]}
              onPress={() => setRole(r.value)}
            >
              <Text style={[styles.roleText, role === r.value && styles.roleTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.loginButton} onPress={() => handleLogin()} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Login</Text>}
        </TouchableOpacity>
      </View>

      <Modal visible={showOtpModal} transparent={true} animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Device Verification</Text>
            <Text style={styles.modalText}>Enter the 5-digit code given by your College Admin.</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="12345"
              keyboardType="number-pad"
              maxLength={5}
              value={otpCode}
              onChangeText={setOtpCode}
            />

            <TouchableOpacity style={styles.modalBtn} onPress={submitOtp}>
              <Text style={styles.modalBtnText}>Verify & Login</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setShowOtpModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0f4f8', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1a365d', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#718096', textAlign: 'center', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 8, marginTop: 12 },
  roleContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  roleButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e0', backgroundColor: '#f7fafc' },
  roleButtonActive: { backgroundColor: '#3182ce', borderColor: '#3182ce' },
  roleText: { color: '#4a5568', fontSize: 12 },
  roleTextActive: { color: '#fff', fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#f7fafc' },
  loginButton: { backgroundColor: '#3182ce', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 24 },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: '#fff', padding: 24, borderRadius: 12, width: '85%', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a365d', marginBottom: 10 },
  modalText: { textAlign: 'center', color: '#718096', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e0', borderRadius: 8, padding: 12, fontSize: 24, width: '100%', textAlign: 'center', letterSpacing: 5 },
  modalBtn: { backgroundColor: '#38a169', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20, marginBottom: 10 },
  modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelText: { color: '#e53e3e', fontWeight: 'bold', marginTop: 10 }
});