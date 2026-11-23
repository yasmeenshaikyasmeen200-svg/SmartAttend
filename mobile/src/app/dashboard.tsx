import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { clearToken } from './api';

export default function Dashboard() {
  const router = useRouter();
  const { role } = useLocalSearchParams(); 
  
  // Cast to string to prevent TypeScript errors
  const userRole = (role as string) || 'student';

  const handleLogout = async () => {
    await clearToken();
    router.replace('/');
  };
  
  
      const navigateToFeature = (feature: string) => {
    if (feature === 'Attendance') {
      router.push('/student-attendance');
    } else if (feature === 'Start Session') {
      router.push('/faculty-start');
    } else if (feature === 'Confirm') {
      router.push('/faculty-confirm');
    } else if (feature === 'Timetable') {
      router.push('/student-timetable');
    } else if (feature === 'Report') {
      router.push('/student-report');
    } else if (feature === 'Manage Users') {
      router.push('/college-users');
    } else if (feature === 'Colleges') {
      router.push('/system-admin'); // <-- ADD THIS LINE
    } else {
      alert(`Navigation to ${feature} coming soon!`);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SmartAttend</Text>
        <Text style={styles.roleText}>Logged in as: {userRole.toUpperCase()}</Text>
      </View>

      <View style={styles.content}>
        {/* STUDENT VIEW */}
        {userRole === 'student' && (
          <>
            <Text style={styles.sectionTitle}>Student Menu</Text>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Attendance')}>
              <Text style={styles.buttonText}>Mark Attendance (GPS + Bio)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Timetable')}>
              <Text style={styles.buttonText}>View My Timetable</Text>
            </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Report')}>
              <Text style={styles.buttonText}>View My Attendance Report</Text>
            </TouchableOpacity>
          </>
        )}

        {/* FACULTY VIEW */}
        {userRole === 'faculty' && (
          <>
            <Text style={styles.sectionTitle}>Faculty Menu</Text>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Start Session')}>
              <Text style={styles.buttonText}>Start Attendance Session</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Confirm')}>
              <Text style={styles.buttonText}>Confirm Student Attendance</Text>
            </TouchableOpacity>
          </>
        )}

        {/* COLLEGE ADMIN VIEW */}
        {userRole === 'college_admin' && (
          <>
            <Text style={styles.sectionTitle}>College Admin Menu</Text>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Manage Users')}>
              <Text style={styles.buttonText}>Manage Faculty & Students</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Timetables')}>
              <Text style={styles.buttonText}>Manage Timetables</Text>
            </TouchableOpacity>
          </>
        )}

        {/* SMARTATTEND ADMIN VIEW */}
        {userRole === 'smartattend_admin' && (
          <>
            <Text style={styles.sectionTitle}>System Admin Menu</Text>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Colleges')}>
              <Text style={styles.buttonText}>Approve Colleges</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={() => navigateToFeature('Reports')}>
              <Text style={styles.buttonText}>System Reports</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f0f4f8', padding: 20 },
  header: { marginTop: 40, marginBottom: 30, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1a365d' },
  roleText: { fontSize: 16, color: '#3182ce', fontWeight: '600', marginTop: 5 },
  content: { flex: 1 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#4a5568', marginBottom: 15 },
  button: { backgroundColor: '#fff', padding: 18, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  buttonText: { fontSize: 16, color: '#2d3748', fontWeight: '500' },
  logoutBtn: { backgroundColor: '#fc8181', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 20, marginBottom: 20 },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});