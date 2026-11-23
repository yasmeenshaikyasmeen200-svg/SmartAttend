import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken, BASE_URL } from './api';

export default function CollegeUsers() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'faculty' | 'student' | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rollNumber, setRollNumber] = useState(''); // Only for students

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const endpoint = mode === 'faculty' ? '/api/faculty/register' : '/api/students/register';
      
      // Note: We are hardcoding department_id: 1 and course_id: 1 for this demo
      const body: any = {
        full_name: fullName,
        email: email,
        password: password,
        department_id: 1,
      };

      if (mode === 'student') {
        body.roll_number = rollNumber;
        body.course_id = 1;
      }

      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Registration failed');

      // Show the 5-digit code returned by the backend!
      const code = mode === 'faculty' ? data.faculty.verification_code : data.student.verification_code;
      setGeneratedCode(code);
      
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setGeneratedCode(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setRollNumber('');
    setMode(null);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Manage Users</Text>

      {!mode ? (
        <View style={styles.menu}>
          <TouchableOpacity style={styles.btn} onPress={() => setMode('faculty')}>
            <Text style={styles.btnText}>Register Faculty</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => setMode('student')}>
            <Text style={styles.btnText}>Register Student</Text>
          </TouchableOpacity>
        </View>
      ) : generatedCode ? (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>User Registered!</Text>
          <Text style={styles.successText}>Give this 5-digit code to the {mode}:</Text>
          <Text style={styles.code}>{generatedCode}</Text>
          <TouchableOpacity style={styles.btn} onPress={resetForm}>
            <Text style={styles.btnText}>Register Another</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Register {mode === 'faculty' ? 'Faculty' : 'Student'}</Text>
          
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

          {mode === 'student' && (
            <>
              <Text style={styles.label}>Roll Number</Text>
              <TextInput style={styles.input} value={rollNumber} onChangeText={setRollNumber} />
            </>
          )}

          <Text style={styles.label}>Temporary Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />

          <TouchableOpacity style={styles.submitBtn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create User</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode(null)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0f4f8', padding: 20, paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a365d', marginBottom: 20, textAlign: 'center' },
  menu: { gap: 15 },
  btn: { backgroundColor: '#3182ce', padding: 20, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  form: { backgroundColor: '#fff', padding: 20, borderRadius: 12 },
  formTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#2d3748' },
  label: { fontSize: 14, color: '#4a5568', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, marginBottom: 15, backgroundColor: '#f7fafc' },
  submitBtn: { backgroundColor: '#38a169', padding: 15, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  cancelText: { color: '#e53e3e', fontWeight: 'bold' },
  successCard: { backgroundColor: '#c6f6d5', padding: 30, borderRadius: 12, alignItems: 'center' },
  successTitle: { fontSize: 22, fontWeight: 'bold', color: '#276749', marginBottom: 10 },
  successText: { fontSize: 16, color: '#2f855a', textAlign: 'center', marginBottom: 20 },
  code: { fontSize: 48, fontWeight: 'bold', color: '#22543d', letterSpacing: 5, marginBottom: 20 },
  backBtn: { marginTop: 30, padding: 15, alignItems: 'center' },
  backText: { color: '#718096', fontSize: 16 },
});