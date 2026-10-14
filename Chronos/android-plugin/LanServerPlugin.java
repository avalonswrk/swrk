package com.chronos.survival3d;
import android.util.Base64;
import com.getcapacitor.JSObject; import com.getcapacitor.Plugin; import com.getcapacitor.PluginCall; import com.getcapacitor.PluginMethod; import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream; import java.io.OutputStream; import java.net.DatagramPacket; import java.net.DatagramSocket; import java.net.Inet4Address; import java.net.InetAddress; import java.net.NetworkInterface; import java.net.ServerSocket; import java.net.Socket; import java.nio.charset.StandardCharsets; import java.security.MessageDigest; import java.util.Collections; import java.util.List; import java.util.Scanner; import java.util.concurrent.CopyOnWriteArrayList; import java.util.regex.Matcher; import java.util.regex.Pattern;

@CapacitorPlugin(name = "LanServer")
public class LanServerPlugin extends Plugin {
    private ServerSocket serverSocket;
    private final List<OutputStream> clients = new CopyOnWriteArrayList<>();
    private volatile boolean running = false; private volatile boolean discovering = false;

    @PluginMethod
    public void startHost(PluginCall call) {
        int port = call.getInt("port", 7777); String gameName = call.getString("gameName", "CHRONOS");
        stopServerInternal(); running = true; String localIp = getLocalIpAddress();
        new Thread(() -> { try { serverSocket = new ServerSocket(port); while (running) { Socket client = serverSocket.accept(); new Thread(() -> handleClient(client)).start(); } } catch (Exception ignored) {} }).start();
        new Thread(() -> { try (DatagramSocket udp = new DatagramSocket()) { udp.setBroadcast(true); byte[] data = ("CHRONOS|" + gameName + "|" + localIp + "|" + port).getBytes(StandardCharsets.UTF_8); while (running) { udp.send(new DatagramPacket(data, data.length, InetAddress.getByName("255.255.255.255"), 7778)); Thread.sleep(1500); } } catch (Exception ignored) {} }).start();
        JSObject ret = new JSObject(); ret.put("ip", localIp); ret.put("port", port); call.resolve(ret);
    }

    @PluginMethod
    public void broadcastBinary(PluginCall call) {
        byte[] payload = Base64.decode(call.getString("base64", ""), Base64.NO_WRAP);
        int len = payload.length; int headLen = len <= 125 ? 2 : 4; byte[] frame = new byte[headLen + len];
        frame[0] = (byte) 0x82;
        if (len <= 125) { frame[1] = (byte) len; } else { frame[1] = 126; frame[2] = (byte) ((len >> 8) & 0xFF); frame[3] = (byte) (len & 0xFF); }
        System.arraycopy(payload, 0, frame, headLen, len);
        for (OutputStream out : clients) { try { synchronized (out) { out.write(frame); out.flush(); } } catch (Exception e) { clients.remove(out); } }
        call.resolve();
    }

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (discovering) { call.resolve(); return; } discovering = true;
        new Thread(() -> { try (DatagramSocket socket = new DatagramSocket(7778)) { byte[] buf = new byte[256]; while (discovering) { DatagramPacket packet = new DatagramPacket(buf, buf.length); socket.receive(packet); String text = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8); if (text.startsWith("CHRONOS|")) { String[] parts = text.split("\\|"); if (parts.length >= 4) { JSObject ev = new JSObject(); ev.put("name", parts[1]); ev.put("ip", parts[2]); ev.put("port", Integer.parseInt(parts[3])); notifyListeners("hostDiscovered", ev); } } } } catch (Exception ignored) {} }).start();
        call.resolve();
    }

    private void handleClient(Socket client) {
        OutputStream out = null;
        try {
            InputStream in = client.getInputStream(); out = client.getOutputStream();
            Scanner s = new Scanner(in, "UTF-8"); String data = s.useDelimiter("\\r\\n\\r\\n").next();
            if (Pattern.compile("^GET").matcher(data).find()) {
                Matcher match = Pattern.compile("Sec-WebSocket-Key: (.*)").matcher(data); match.find();
                String key = match.group(1).trim() + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
                byte[] response = ("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: " + Base64.encodeToString(MessageDigest.getInstance("SHA-1").digest(key.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP) + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
                out.write(response, 0, response.length); out.flush(); clients.add(out);
                JSObject evC = new JSObject(); evC.put("count", clients.size()); notifyListeners("peerCount", evC);

                while (running) {
                    int b1 = in.read(); if (b1 == -1) break;
                    int b2 = in.read(); boolean masked = (b2 & 0x80) != 0; int len = b2 & 0x7F;
                    if (len == 126) len = ((in.read() & 0xFF) << 8) | (in.read() & 0xFF);
                    byte[] mask = new byte[4]; if (masked) for (int i = 0; i < 4; i++) mask[i] = (byte) in.read();
                    byte[] payload = new byte[len]; int read = 0; while (read < len) { int r = in.read(payload, read, len - read); if (r == -1) break; read += r; }
                    if (masked) for (int i = 0; i < len; i++) payload[i] ^= mask[i % 4];
                    if ((b1 & 0x0F) == 0x02) { JSObject ev = new JSObject(); ev.put("base64", Base64.encodeToString(payload, Base64.NO_WRAP)); notifyListeners("clientBinaryPacket", ev); }
                }
            }
        } catch (Exception ignored) { } finally { if (out != null) clients.remove(out); JSObject evC = new JSObject(); evC.put("count", clients.size()); notifyListeners("peerCount", evC); try { client.close(); } catch (Exception ignored) {} }
    }

    private void stopServerInternal() { running = false; clients.clear(); try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) {} }
    private String getLocalIpAddress() { try { for (NetworkInterface intf : Collections.list(NetworkInterface.getNetworkInterfaces())) { for (InetAddress addr : Collections.list(intf.getInetAddresses())) { if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) return addr.getHostAddress(); } } } catch (Exception ignored) {} return "192.168.43.1"; }
}
