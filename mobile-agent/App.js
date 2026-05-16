import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, PermissionsAndroid, Platform } from 'react-native';
import io from 'socket.io-client';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';

const BACKEND_URL = 'https://ayush-eye-1.onrender.com';
const ADMIN_ID = '6a08156c659055093275400a'; // Default Admin

const MobileAgent = () => {
    const [status, setStatus] = useState('Disconnected');
    const [isStreaming, setIsStreaming] = useState(false);
    const socketRef = useRef(null);
    const pcRef = useRef(null);
    const [localStream, setLocalStream] = useState(null);

    useEffect(() => {
        // Initialize Socket
        socketRef.current = io(BACKEND_URL);

        socketRef.current.on('connect', () => {
            setStatus('Connected to Sentinel');
            socketRef.current.emit('identify', {
                role: 'employee',
                adminId: ADMIN_ID,
                name: 'Mobile User',
                platform: 'Android',
                status: 'online'
            });
        });

        socketRef.current.on('view_request', async () => {
            startStreaming();
        });

        socketRef.current.on('signal', async (data) => {
            if (data.type === 'answer') {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(data));
            } else if (data.candidate) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        return () => {
            socketRef.current.disconnect();
            if (pcRef.current) pcRef.current.close();
        };
    }, []);

    const startStreaming = async () => {
        try {
            // Get Screen Stream
            const stream = await mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

            setLocalStream(stream);
            setIsStreaming(true);

            // Setup WebRTC
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            pcRef.current = pc;

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socketRef.current.emit('signal', { target: 'ADMIN_SOCKET_ID', candidate: e.candidate });
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socketRef.current.emit('signal', { target: 'ADMIN_SOCKET_ID', type: 'offer', sdp: offer.sdp });

        } catch (err) {
            console.error('Streaming error:', err);
            Alert.alert('Error', 'Could not start screen capture');
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>SENTINEL MOBILE AGENT</Text>
                <View style={[styles.dot, { backgroundColor: status.includes('Connected') ? '#10b981' : '#ef4444' }]} />
            </View>

            <View style={styles.card}>
                <Text style={styles.statusText}>System Status: {status}</Text>
                <Text style={styles.subText}>Streaming: {isStreaming ? 'LIVE' : 'IDLE'}</Text>
            </View>

            <TouchableOpacity 
                style={[styles.button, isStreaming ? styles.btnActive : {}]}
                onPress={startStreaming}
            >
                <Text style={styles.btnText}>{isStreaming ? 'MONITORING ACTIVE' : 'START MONITORING'}</Text>
            </TouchableOpacity>

            <Text style={styles.info}>This device is being monitored by Sentinel Enterprise.</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f172a', padding: 20, justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
    title: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    dot: { width: 10, height: 10, borderRadius: 5, marginLeft: 10 },
    card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 20, borderLeftWidth: 4, borderLeftColor: '#3b82f6', marginBottom: 30 },
    statusText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    subText: { color: '#64748b', fontSize: 12, marginTop: 5 },
    button: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 15, alignItems: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
    btnActive: { backgroundColor: '#ef4444' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    info: { color: '#475569', fontSize: 10, textAlign: 'center', marginTop: 40 }
});

export default MobileAgent;
