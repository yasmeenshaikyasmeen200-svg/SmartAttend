import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken, BASE_URL } from './api';

export default function FacultyStart() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activeSession, setActiveSession] = useState<any>(null);

  const startSession = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/attendance/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ timetable_id: 1 }) 
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to start session');
      setActiveSession(data.session);
      Alert.alert('Success', 'Attendance session started!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/attendance/sessions/${activeSession.session_id}/end`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to end session');
      
      setActiveSession(null); // Reset the screen
      Alert.alert('Success', 'Session ended! Reports are now updated.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Start / End Session</Text>
      
      {!activeSession ? (
        <>
          <Text style={styles.subtitle}>No active session. Click below to start.</Text>
          <TouchableOpacity style={styles.startBtn} onPress={startSession} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.startText}>Start Attendance Now</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.activeCard}>
          <Text style={styles.activeTitle}>🟢 Session Active!</Text>
          <Text style={styles.activeText}>Subject: {activeSession.subject_name}</Text>
          <Text style={styles.activeText}>Session ID: {activeSession.session_id}</Text>
          
          <TouchableOpacity style={styles.confirmBtn} onPress={() => router.push('/faculty-confirm')}>
            <Text style={styles.confirmText}>Go to Confirm Students</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endBtn} onPress={endSession} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.endText}>End Session</Text>}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a365d', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#4a5568', marginBottom: 30 },
  startBtn: { backgroundColor: '#3182ce', padding: 20, borderRadius: 12, width: '100%', alignItems: 'center' },
  startText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  activeCard: { backgroundColor: '#c6f6d5', padding: 20, borderRadius: 12, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#48bb78' },
  activeTitle: { fontSize: 20, fontWeight: 'bold', color: '#276749', marginBottom: 10 },
  activeText: { fontSize: 16, color: '#2f855a', marginBottom: 5 },
  confirmBtn: { backgroundColor: '#38a169', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center', marginTop: 15 },
  confirmText: { color: '#fff', fontWeight: 'bold' },
  endBtn: { backgroundColor: '#e53e3e', padding: 15, borderRadius: 8, width: '100%', alignItems: 'center', marginTop: 10 },
  endText: { color: '#fff', fontWeight: 'bold' },
  backBtn: { marginTop: 30, padding: 15 },
  backText: { color: '#718096', fontSize: 16 },
});