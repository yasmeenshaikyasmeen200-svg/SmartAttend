import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as LocalAuthentication from 'expo-local-authentication';
import { getToken, BASE_URL } from './api';

export default function StudentAttendance() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready to mark attendance');

  const markAttendance = async () => {
    setLoading(true);
    setStatus('Checking GPS Location...');

    try {
      // 1. Ask for Location Permission
      let { status: locStatus } = await Location.requestForegroundPermissionsAsync();
      if (locStatus !== 'granted') {
        throw new Error('Location permission denied');
      }

      // 2. Get Current Location
      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      setStatus('Checking Biometrics...');

      // 3. Ask for Fingerprint/FaceID
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasHardware || !isEnrolled) {
        throw new Error('Biometrics not set up on this device');
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Scan fingerprint to mark attendance',
      });

      if (!authResult.success) {
        throw new Error('Biometric authentication failed');
      }

      setStatus('Sending to server...');

      // 4. Send to Backend (We hardcoded session_id=1 for now to test)
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/attendance/sessions/1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          latitude: latitude,
          longitude: longitude,
          biometric_claimed: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Server rejected attendance');
      }

      setStatus(`✅ Success! GPS Verified: ${data.gps_verified}`);
      Alert.alert('Success', 'Attendance submitted for faculty review!');

    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mark Attendance</Text>
      <Text style={styles.subtitle}>{status}</Text>

      <TouchableOpacity 
        style={styles.scanBtn} 
        onPress={markAttendance}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Text style={styles.scanText}>Verify GPS & Fingerprint</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8', padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a365d', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#4a5568', marginBottom: 40, textAlign: 'center' },
  scanBtn: { backgroundColor: '#3182ce', width: '100%', height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  scanText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  backBtn: { marginTop: 30, padding: 15 },
  backText: { color: '#718096', fontSize: 16 },
});