import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { loginUser, saveToken } from '../api';

export default function LoginScreen({ navigation }) {
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    setLoading(true);
    const { ok, data } = await loginUser(role, email, password);
    setLoading(false);

    if (ok) {
      await saveToken(data.token);
      Alert.alert('Success', `Logged in as ${role}`);
      // Next step: navigate to Dashboard
    } else {
      Alert.alert('Login Failed', data.message || 'Invalid credentials');
    }
  };

  const roles = [
    { label: 'Student', value: 'student' },
    { label: 'Faculty', value: 'faculty' },
    { label: 'College Admin', value: 'college_admin' },
    { label: 'SA Admin', value: 'smartattend_admin' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SmartAttend</Text>
      
      <Text style={styles.label}>Select Role:</Text>
      <View style={styles.roleContainer}>
        {roles.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
            onPress={() => setRole(r.value)}
          >
            <Text style={[styles.roleText, role === r.value && styles.roleTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
        <Text style={styles.loginBtnText}>{loading ? 'Logging in...' : 'Login'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#007AFF' },
  label: { fontSize: 16, marginBottom: 10, fontWeight: '600' },
  roleContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  roleBtn: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  roleBtnActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  roleText: { color: '#333' },
  roleTextActive: { color: '#fff', fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  loginBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  loginBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});