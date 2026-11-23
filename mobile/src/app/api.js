import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const BASE_URL = 'http://192.168.0.104:5000';

export const saveToken = async (token) => {
  try { await AsyncStorage.setItem('userToken', token); } catch (e) { console.error(e); }
};

export const getToken = async () => {
  try { return await AsyncStorage.getItem('userToken'); } catch (e) { return null; }
};

export const clearToken = async () => {
  try { await AsyncStorage.removeItem('userToken'); } catch (e) { console.error(e); }
};

// Unique device ID for device locking
const getDeviceId = () => {
  return Platform.OS === 'ios' ? 'iphone-demo-device' : 'android-demo-device'; 
};

export const loginUser = async (role, email, password, verification_code = null) => {
  let endpoint = '';
  if (role === 'college_admin') endpoint = '/api/college-admins/login';
  else if (role === 'faculty') endpoint = '/api/faculty/login';
  else if (role === 'student') endpoint = '/api/students/login';
  else if (role === 'smartattend_admin') endpoint = '/api/admin/login';

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      email, 
      password, 
      device_id: getDeviceId(),
      verification_code 
    }),
  });

  const data = await response.json();
  
  if (data.message === 'REQUIRE_2FA') {
    throw new Error('REQUIRE_2FA');
  }

  if (!response.ok) throw new Error(data.message || 'Login failed');
  if (data.token) await saveToken(data.token);
  return data;
};